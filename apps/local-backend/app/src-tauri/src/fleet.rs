//! The engines this app started: one process per open backend, all stopped when the app quits.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::Serialize;

use crate::engine::{self, Engine, Launch, Phase, Ready};
use crate::registry;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RunState {
    Stopped,
    Starting,
    Running,
    Error,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackendStatus {
    pub path: String,
    pub name: String,
    pub state: RunState,
    pub scheme: Option<String>,
    pub port: Option<u16>,
    pub notice: Option<String>,
    /// The engine's last words when it stopped on its own.
    pub error: Option<String>,
    pub log_tail: Vec<String>,
}

#[derive(Default)]
pub struct Fleet {
    engines: Mutex<HashMap<PathBuf, Arc<Engine>>>,
    starting: Mutex<HashSet<PathBuf>>,
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

impl Fleet {
    fn engine(&self, path: &Path) -> Option<Arc<Engine>> {
        lock(&self.engines).get(path).cloned()
    }

    pub fn status(&self, path: &Path) -> BackendStatus {
        let base = |state, name: String| BackendStatus {
            path: path.to_string_lossy().into_owned(),
            name,
            state,
            scheme: None,
            port: None,
            notice: None,
            error: None,
            log_tail: Vec::new(),
        };
        let name = registry::display_name(path);
        if lock(&self.starting).contains(path) {
            return base(RunState::Starting, name);
        }
        let Some(engine) = self.engine(path) else {
            return base(RunState::Stopped, name);
        };
        match engine.phase() {
            Phase::Running(ready) => BackendStatus {
                scheme: Some(ready.scheme.clone()),
                port: Some(ready.port),
                notice: ready.notice.clone(),
                log_tail: engine.tail(),
                ..base(RunState::Running, ready.name.clone())
            },
            Phase::Starting => base(RunState::Starting, name),
            Phase::Exited {
                requested: true, ..
            } => base(RunState::Stopped, name),
            Phase::Exited { code, .. } => BackendStatus {
                error: Some(format!(
                    "The engine stopped{}.\n{}",
                    code.map_or(String::new(), |code| format!(" (exit code {code})")),
                    engine.failure_message()
                )),
                log_tail: engine.tail(),
                ..base(RunState::Error, name)
            },
        }
    }

    /// The running engine's ready info, for the proxies. Never serialized.
    pub fn ready(&self, path: &Path) -> Result<Ready, String> {
        match self.engine(path).map(|engine| engine.phase()) {
            Some(Phase::Running(ready)) => Ok(ready),
            _ => Err("The backend is not running. Press Start first.".to_string()),
        }
    }

    pub fn log_tail(&self, path: &Path) -> Vec<String> {
        self.engine(path)
            .map(|engine| engine.tail())
            .unwrap_or_default()
    }

    /// Starts the engine for a backend (a no-op when it already runs). Blocks until it is ready or has failed.
    /// A failed start is not an error value here: it leaves the backend in the error state with the stderr lines.
    pub fn start(&self, launch: &Launch, path: &Path, port: Option<u16>) -> BackendStatus {
        if matches!(
            self.status(path).state,
            RunState::Running | RunState::Starting
        ) {
            return self.status(path);
        }
        lock(&self.starting).insert(path.to_path_buf());
        lock(&self.engines).remove(path);
        let result = Engine::start(launch, &engine::serve_args(path, port), path);
        lock(&self.starting).remove(path);
        match result {
            Ok(engine) => {
                lock(&self.engines).insert(path.to_path_buf(), Arc::new(engine));
                self.status(path)
            }
            Err(message) => BackendStatus {
                path: path.to_string_lossy().into_owned(),
                name: registry::display_name(path),
                state: RunState::Error,
                scheme: None,
                port: None,
                notice: None,
                error: Some(message.clone()),
                log_tail: message.lines().map(str::to_string).collect(),
            },
        }
    }

    pub fn stop(&self, path: &Path) {
        let engine = lock(&self.engines).remove(path);
        if let Some(engine) = engine {
            engine.stop();
        }
    }

    /// Stops every engine. Called when the app quits.
    pub fn stop_all(&self) {
        let all: Vec<Arc<Engine>> = lock(&self.engines)
            .drain()
            .map(|(_, engine)| engine)
            .collect();
        for engine in all {
            engine.stop();
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use tempfile::tempdir;

    const READY: &str = r#"{"event":"ready","name":"shop","scheme":"http","port":8556,"admin":{"host":"127.0.0.1","port":50123,"token":"fake-admin-token-for-tests"}}"#;

    fn shell(script: &str) -> Launch {
        Launch {
            program: "/bin/sh".into(),
            args: vec!["-c".into(), script.into()],
            path_env: None,
        }
    }

    #[test]
    fn start_status_stop_cycle() {
        let dir = tempdir().unwrap();
        let fleet = Fleet::default();
        assert_eq!(fleet.status(dir.path()).state, RunState::Stopped);
        assert!(fleet.ready(dir.path()).is_err());
        let launch = shell(&format!("echo '{READY}'; while true; do sleep 1; done"));
        let status = fleet.start(&launch, dir.path(), Some(8556));
        assert_eq!(
            (status.state, status.port, status.scheme.as_deref()),
            (RunState::Running, Some(8556), Some("http"))
        );
        assert_eq!(fleet.ready(dir.path()).unwrap().admin_port, 50123);
        // A second start changes nothing.
        assert_eq!(
            fleet.start(&launch, dir.path(), None).state,
            RunState::Running
        );
        fleet.stop_all();
        assert_eq!(fleet.status(dir.path()).state, RunState::Stopped);
    }

    #[test]
    fn a_failed_start_is_an_error_with_the_last_lines() {
        let dir = tempdir().unwrap();
        let fleet = Fleet::default();
        let status = fleet.start(
            &shell("echo 'port 8556 is already in use' >&2; exit 1"),
            dir.path(),
            None,
        );
        assert_eq!(status.state, RunState::Error);
        assert!(status.error.unwrap().contains("already in use"));
    }

    #[test]
    fn a_crash_while_running_shows_as_an_error_until_restarted() {
        let dir = tempdir().unwrap();
        let fleet = Fleet::default();
        let launch = shell(&format!(
            "echo '{READY}'; echo 'fatal: disk full' >&2; sleep 0.3; exit 4"
        ));
        fleet.start(&launch, dir.path(), None);
        std::thread::sleep(std::time::Duration::from_millis(900));
        let status = fleet.status(dir.path());
        assert_eq!(status.state, RunState::Error);
        let message = status.error.unwrap();
        assert!(
            message.contains("exit code 4") && message.contains("disk full"),
            "{message}"
        );
        assert!(fleet.ready(dir.path()).is_err());
    }
}
