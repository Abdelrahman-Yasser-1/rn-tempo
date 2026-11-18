//! Runs one engine process per open backend. The engine prints one JSON `ready` line on stdout with its
//! public port and its admin port and token. The token is kept in this struct only: it has no `Serialize`
//! impl, no accessor the UI can reach, and its `Debug` output hides it.

use std::collections::VecDeque;
use std::ffi::OsString;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Deserialize;

const READY_TIMEOUT: Duration = Duration::from_secs(30);
const STOP_GRACE: Duration = Duration::from_secs(5);
const TAIL_LINES: usize = 200;
const MAX_LINE: usize = 600;

/// How to start the engine: a program and the arguments that come before the engine's own command.
/// The program is the bundled single executable (`tempo-engine`); everything else (serve, create, trust...)
/// goes through `engine_launch`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Launch {
    pub program: PathBuf,
    pub args: Vec<OsString>,
    /// The login shell's `PATH`, so the engine finds `mkcert`, `xcrun` and `adb`.
    pub path_env: Option<String>,
}

/// The file name of the bundled engine. Tauri strips the target triple from `binaries/tempo-engine-<triple>`
/// when it puts the sidecar into the app (`Contents/MacOS` on macOS).
const SIDECAR_NAME: &str = if cfg!(windows) {
    "tempo-engine.exe"
} else {
    "tempo-engine"
};

/// Where the bundled engine is: next to this app's own executable. `tauri dev` copies it there too.
pub fn sidecar_path() -> Option<PathBuf> {
    Some(std::env::current_exe().ok()?.parent()?.join(SIDECAR_NAME))
}

/// The empty file `build.rs` leaves in a development build counts as missing.
fn is_built(path: &Path) -> bool {
    std::fs::metadata(path).is_ok_and(|meta| meta.is_file() && meta.len() > 0)
}

/// The engine script of this source tree. A development build only (`tauri dev` without `yarn build:sea`).
#[cfg(debug_assertions)]
pub fn dev_engine_script() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../engine/dist/cli.mjs")
}

/// Development only: `node <repo>/apps/local-backend/engine/dist/cli.mjs`, for when the sidecar is not built.
#[cfg(debug_assertions)]
fn dev_fallback(script: &Path, login_path: Option<String>) -> Result<Launch, String> {
    let node = crate::node::find_node()?;
    if !script.is_file() {
        return Err("The engine is not built. Run `yarn workspace @rn-tempo/local-backend-engine build:sea` (or `build` to use Node).".to_string());
    }
    Ok(Launch {
        program: PathBuf::from(node),
        args: vec![script.as_os_str().to_owned()],
        path_env: login_path,
    })
}

/// Decides how to start the engine from a sidecar path. Separate from `engine_launch` so it is tested with temp files.
pub(crate) fn launch_from(
    sidecar: Option<&Path>,
    login_path: Option<String>,
) -> Result<Launch, String> {
    if let Some(sidecar) = sidecar.filter(|path| is_built(path)) {
        return Ok(Launch {
            program: sidecar.to_path_buf(),
            args: Vec::new(),
            path_env: login_path,
        });
    }
    #[cfg(debug_assertions)]
    {
        dev_fallback(&dev_engine_script(), login_path)
    }
    #[cfg(not(debug_assertions))]
    {
        Err(
            "The bundled engine is missing from the app. Reinstall Tempo Local Backend."
                .to_string(),
        )
    }
}

/// The one place that decides how the engine is started. A release build needs no Node.js: it runs the bundled
/// single executable and nothing else.
pub fn engine_launch(login_path: Option<String>) -> Result<Launch, String> {
    launch_from(sidecar_path().as_deref(), login_path)
}

impl Launch {
    pub fn command(&self, engine_args: &[OsString]) -> Command {
        let mut command = Command::new(&self.program);
        command
            .args(&self.args)
            .args(engine_args)
            .env("NO_COLOR", "1");
        if let Some(path) = &self.path_env {
            command.env("PATH", path);
        }
        command
    }
}

/// The arguments of `serve`. The folder is the one the user opened; `--parent-stdin` makes the engine stop
/// when this app dies.
pub fn serve_args(dir: &Path, port: Option<u16>) -> Vec<OsString> {
    let mut args: Vec<OsString> = vec!["serve".into(), dir.as_os_str().to_owned()];
    if let Some(port) = port {
        args.push("--port".into());
        args.push(port.to_string().into());
    }
    args.push("--parent-stdin".into());
    args
}

#[derive(Clone, PartialEq, Eq)]
pub struct Ready {
    pub name: String,
    pub scheme: String,
    pub port: u16,
    pub admin_port: u16,
    admin_token: String,
    pub notice: Option<String>,
}

impl Ready {
    /// Only the Rust proxies call this.
    pub fn token(&self) -> &str {
        &self.admin_token
    }
}

impl std::fmt::Debug for Ready {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Ready")
            .field("name", &self.name)
            .field("scheme", &self.scheme)
            .field("port", &self.port)
            .field("admin_port", &self.admin_port)
            .field("admin_token", &"<hidden>")
            .finish_non_exhaustive()
    }
}

#[derive(Deserialize)]
struct ReadyLine {
    event: String,
    name: String,
    scheme: String,
    port: u16,
    admin: AdminPart,
    #[serde(default)]
    notice: Option<String>,
}

#[derive(Deserialize)]
struct AdminPart {
    host: String,
    port: u16,
    token: String,
}

/// Reads the engine's `ready` line. Anything else (log text, a line that is not ours) is `None`.
pub fn parse_ready_line(line: &str) -> Option<Ready> {
    let parsed: ReadyLine = serde_json::from_str(line.trim()).ok()?;
    if parsed.event != "ready"
        || parsed.admin.host != "127.0.0.1"
        || !matches!(parsed.scheme.as_str(), "http" | "https")
        || parsed.admin.token.len() < 16
    {
        return None;
    }
    Some(Ready {
        name: parsed.name,
        scheme: parsed.scheme,
        port: parsed.port,
        admin_port: parsed.admin.port,
        admin_token: parsed.admin.token,
        notice: parsed.notice,
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Phase {
    Starting,
    Running(Ready),
    Exited { code: Option<i32>, requested: bool },
}

struct Shared {
    phase: Mutex<Phase>,
    tail: Mutex<VecDeque<String>>,
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn push_line(shared: &Shared, line: &str) {
    let mut tail = lock(&shared.tail);
    if tail.len() >= TAIL_LINES {
        tail.pop_front();
    }
    tail.push_back(line.chars().take(MAX_LINE).collect());
}

pub struct Engine {
    child: Mutex<Child>,
    /// Held so the pipe stays open; the engine stops when it closes.
    _stdin: Option<ChildStdin>,
    shared: Arc<Shared>,
    stopping: Arc<AtomicBool>,
}

impl Engine {
    /// Starts the engine and waits for its `ready` line. On a failure the error carries the last stderr lines.
    pub fn start(launch: &Launch, args: &[OsString], dir: &Path) -> Result<Self, String> {
        let mut command = launch.command(args);
        command
            .current_dir(dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = command
            .spawn()
            .map_err(|error| format!("Could not start the engine: {error}"))?;
        let stdin = child.stdin.take();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let shared = Arc::new(Shared {
            phase: Mutex::new(Phase::Starting),
            tail: Mutex::new(VecDeque::new()),
        });
        let stopping = Arc::new(AtomicBool::new(false));
        if let Some(out) = stdout {
            let shared = Arc::clone(&shared);
            std::thread::spawn(move || {
                for line in BufReader::new(out).lines().map_while(Result::ok) {
                    if let Some(ready) = parse_ready_line(&line) {
                        *lock(&shared.phase) = Phase::Running(ready);
                    } else {
                        push_line(&shared, &line);
                    }
                }
            });
        }
        if let Some(err) = stderr {
            let shared = Arc::clone(&shared);
            std::thread::spawn(move || {
                for line in BufReader::new(err).lines().map_while(Result::ok) {
                    push_line(&shared, &line);
                }
            });
        }
        let engine = Self {
            child: Mutex::new(child),
            _stdin: stdin,
            shared,
            stopping,
        };
        engine.wait_until_ready()?;
        Ok(engine)
    }

    fn poll_exit(&self) {
        let mut child = lock(&self.child);
        if let Ok(Some(status)) = child.try_wait() {
            drop(child);
            let mut phase = lock(&self.shared.phase);
            if !matches!(*phase, Phase::Exited { .. }) {
                *phase = Phase::Exited {
                    code: status.code(),
                    requested: self.stopping.load(Ordering::SeqCst),
                };
            }
        }
    }

    fn wait_until_ready(&self) -> Result<(), String> {
        let started = Instant::now();
        loop {
            self.poll_exit();
            match self.phase() {
                Phase::Running(_) => return Ok(()),
                Phase::Exited { .. } => {
                    // Give the reader threads a moment to deliver the last lines.
                    std::thread::sleep(Duration::from_millis(100));
                    return Err(self.failure_message());
                }
                Phase::Starting if started.elapsed() > READY_TIMEOUT => {
                    self.kill();
                    return Err("The engine did not become ready in 30 seconds.".to_string());
                }
                Phase::Starting => std::thread::sleep(Duration::from_millis(40)),
            }
        }
    }

    /// The phase, noticing an exit that nobody has looked at yet.
    pub fn phase(&self) -> Phase {
        self.poll_exit();
        lock(&self.shared.phase).clone()
    }

    pub fn tail(&self) -> Vec<String> {
        lock(&self.shared.tail).iter().cloned().collect()
    }

    /// The last few lines the engine printed, as one message.
    pub fn failure_message(&self) -> String {
        let tail = self.tail();
        let last: Vec<&str> = tail
            .iter()
            .rev()
            .take(6)
            .rev()
            .map(String::as_str)
            .collect();
        if last.is_empty() {
            "The engine stopped without a message.".to_string()
        } else {
            last.join("\n")
        }
    }

    fn kill(&self) {
        let _ = lock(&self.child).kill();
    }

    /// Asks the engine to stop (SIGTERM, so it closes its database), then kills it after a short grace.
    pub fn stop(&self) {
        self.stopping.store(true, Ordering::SeqCst);
        let pid = lock(&self.child).id();
        #[cfg(unix)]
        {
            let _ = Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
        #[cfg(not(unix))]
        {
            let _ = pid;
            self.kill();
        }
        let started = Instant::now();
        while started.elapsed() < STOP_GRACE {
            if matches!(self.phase(), Phase::Exited { .. }) {
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        self.kill();
        let _ = lock(&self.child).wait();
        *lock(&self.shared.phase) = Phase::Exited {
            code: None,
            requested: true,
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    const READY: &str = r#"{"event":"ready","name":"shop","scheme":"https","port":8556,"admin":{"host":"127.0.0.1","port":50123,"token":"fake-admin-token-for-tests"}}"#;

    #[test]
    fn parses_the_ready_line() {
        let ready = parse_ready_line(READY).unwrap();
        assert_eq!(
            (
                ready.name.as_str(),
                ready.scheme.as_str(),
                ready.port,
                ready.admin_port
            ),
            ("shop", "https", 8556, 50123)
        );
        assert_eq!(ready.token(), "fake-admin-token-for-tests");
        assert!(format!("{ready:?}").contains("<hidden>"));
        assert!(!format!("{ready:?}").contains("fake-admin"));
    }

    #[test]
    fn ignores_everything_that_is_not_a_good_ready_line() {
        for bad in [
            "",
            "shop: https://localhost:8556",
            r#"{"event":"log"}"#,
            r#"{"event":"ready","name":"x","scheme":"ftp","port":1,"admin":{"host":"127.0.0.1","port":2,"token":"fake-admin-token-for-tests"}}"#,
            // An admin address that is not loopback is refused, so the token is never sent anywhere else.
            r#"{"event":"ready","name":"x","scheme":"http","port":1,"admin":{"host":"10.0.0.5","port":2,"token":"fake-admin-token-for-tests"}}"#,
            r#"{"event":"ready","name":"x","scheme":"http","port":1,"admin":{"host":"127.0.0.1","port":2,"token":"short"}}"#,
            r#"{"event":"ready","name":"x","scheme":"http","port":99999,"admin":{"host":"127.0.0.1","port":2,"token":"fake-admin-token-for-tests"}}"#,
        ] {
            assert!(parse_ready_line(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn the_start_function_runs_the_sidecar_with_no_node() {
        let dir = tempdir().unwrap();
        let sidecar = dir.path().join("tempo-engine");
        std::fs::write(&sidecar, "binary").unwrap();
        let launch = launch_from(Some(&sidecar), Some("/opt/bin:/usr/bin".into())).unwrap();
        assert_eq!(launch.program, sidecar);
        assert!(launch.args.is_empty());
        assert_eq!(launch.path_env.as_deref(), Some("/opt/bin:/usr/bin"));
        let command = launch.command(&serve_args(Path::new("/work/shop"), Some(8556)));
        assert_eq!(command.get_program(), sidecar.as_os_str());
        let args: Vec<_> = command
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            args,
            ["serve", "/work/shop", "--port", "8556", "--parent-stdin"]
        );
    }

    #[test]
    fn an_empty_or_missing_sidecar_is_not_used() {
        let dir = tempdir().unwrap();
        let empty = dir.path().join("tempo-engine");
        std::fs::write(&empty, "").unwrap();
        assert!(!is_built(&empty));
        assert!(!is_built(&dir.path().join("nothing")));
        let real = dir.path().join("real");
        std::fs::write(&real, "x").unwrap();
        assert!(is_built(&real));
        // A development build falls back to Node (which may or may not be installed here); it never panics.
        // A release build says the engine is missing.
        let result = launch_from(Some(&empty), None);
        #[cfg(not(debug_assertions))]
        assert!(result.unwrap_err().contains("bundled engine is missing"));
        #[cfg(debug_assertions)]
        drop(result);
    }

    #[test]
    fn serve_args_without_a_port() {
        let args = serve_args(Path::new("/b"), None);
        assert_eq!(args, ["serve", "/b", "--parent-stdin"].map(OsString::from));
    }

    fn shell(script: &str) -> Launch {
        Launch {
            program: PathBuf::from("/bin/sh"),
            args: vec!["-c".into(), script.into()],
            path_env: None,
        }
    }

    #[cfg(unix)]
    #[test]
    fn starts_reads_ready_and_stops_a_child() {
        let dir = tempdir().unwrap();
        let script = format!("echo 'booting' >&2; echo '{READY}'; while true; do sleep 1; done");
        let engine = Engine::start(&shell(&script), &[], dir.path()).unwrap();
        assert!(matches!(engine.phase(), Phase::Running(_)));
        engine.stop();
        assert!(matches!(
            engine.phase(),
            Phase::Exited {
                requested: true,
                ..
            }
        ));
    }

    #[cfg(unix)]
    #[test]
    fn a_crash_before_ready_reports_the_last_stderr_lines() {
        let dir = tempdir().unwrap();
        let error = Engine::start(
            &shell("echo 'EADDRINUSE: port 8556 is busy' >&2; exit 1"),
            &[],
            dir.path(),
        )
        .map(|_| ())
        .unwrap_err();
        assert!(error.contains("EADDRINUSE"), "{error}");
    }

    #[cfg(unix)]
    #[test]
    fn a_crash_after_ready_is_noticed() {
        let dir = tempdir().unwrap();
        let script = format!("echo '{READY}'; echo 'boom' >&2; sleep 0.3; exit 3");
        let engine = Engine::start(&shell(&script), &[], dir.path()).unwrap();
        std::thread::sleep(Duration::from_millis(900));
        assert!(matches!(
            engine.phase(),
            Phase::Exited {
                code: Some(3),
                requested: false
            }
        ));
        assert!(engine.failure_message().contains("boom"));
    }

    #[test]
    fn the_tail_keeps_only_the_newest_lines() {
        let shared = Shared {
            phase: Mutex::new(Phase::Starting),
            tail: Mutex::new(VecDeque::new()),
        };
        for index in 0..300 {
            push_line(&shared, &format!("line {index}"));
        }
        let tail = lock(&shared.tail);
        assert_eq!(tail.len(), TAIL_LINES);
        assert_eq!(tail.back().map(String::as_str), Some("line 299"));
    }
}
