//! Finds Node.js. A macOS GUI app does not get the shell's `PATH`, so the program asks the user's
//! login shell where `node` is, then checks its version. Nothing is bundled and nothing is downloaded.

use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

use serde::Serialize;

/// The dev API needs Node 22 or newer.
pub const MIN_NODE_MAJOR: u32 = 22;
const NODE_MARK: &str = "__TEMPO_NODE__";
const PATH_MARK: &str = "__TEMPO_PATH__";
const SHELL_TIMEOUT: Duration = Duration::from_secs(10);
pub const INSTALL_DOCS: &str = "https://nodejs.org/en/download";

/// What the UI shows about Node. `ok` is the only field it needs to decide whether to continue.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NodeInfo {
    pub ok: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    /// The login shell's `PATH`, handed to the CLI so it finds `mkcert`, `xcrun` and `adb`.
    pub login_path: Option<String>,
    /// A sentence for the user when `ok` is false.
    pub message: Option<String>,
    pub docs_url: String,
}

/// The two values the probe script prints, each behind a marker so shell start-up noise is ignored.
pub fn parse_probe_output(output: &str) -> (Option<String>, Option<String>) {
    let find = |mark: &str| {
        output
            .lines()
            .find_map(|line| line.strip_prefix(mark))
            .map(|rest| rest.trim().to_string())
            .filter(|rest| !rest.is_empty())
    };
    (find(NODE_MARK), find(PATH_MARK))
}

/// The major version of `v22.3.0` or `22.3.0`. `None` for anything else.
pub fn parse_node_major(text: &str) -> Option<u32> {
    let trimmed = text.trim().trim_start_matches('v');
    trimmed.split('.').next()?.parse().ok()
}

/// Runs a program with a time limit, so a login shell that waits for input cannot hang the app.
fn run_with_timeout(mut command: Command) -> Option<String> {
    command.stdin(Stdio::null()).stderr(Stdio::null());
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(command.output());
    });
    let output = rx.recv_timeout(SHELL_TIMEOUT).ok()?.ok()?;
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn probe_with_login_shell(shell: &str) -> Option<String> {
    let script =
        format!("printf '{NODE_MARK}%s\\n{PATH_MARK}%s\\n' \"$(command -v node)\" \"$PATH\"");
    let mut command = Command::new(shell);
    command.arg("-lc").arg(script);
    run_with_timeout(command)
}

fn node_version(node: &str) -> Option<String> {
    let mut command = Command::new(node);
    command.arg("--version");
    run_with_timeout(command).map(|text| text.trim().to_string())
}

fn missing(login_path: Option<String>, message: String) -> NodeInfo {
    NodeInfo {
        ok: false,
        path: None,
        version: None,
        login_path,
        message: Some(message),
        docs_url: INSTALL_DOCS.to_string(),
    }
}

/// Decides from the probe output and the version text. Pure, so it is tested without a shell.
pub fn evaluate(probe: Option<&str>, version_of: impl Fn(&str) -> Option<String>) -> NodeInfo {
    let (node, login_path) = probe.map(parse_probe_output).unwrap_or((None, None));
    let Some(node) = node else {
        return missing(
            login_path,
            format!(
                "Node.js was not found in your login shell. Install Node {MIN_NODE_MAJOR} or newer, then reopen the app."
            ),
        );
    };
    let Some(version) = version_of(&node) else {
        return missing(
            login_path,
            format!("Could not run `{node} --version`. Reinstall Node {MIN_NODE_MAJOR} or newer."),
        );
    };
    match parse_node_major(&version) {
        Some(major) if major >= MIN_NODE_MAJOR => NodeInfo {
            ok: true,
            path: Some(node),
            version: Some(version),
            login_path,
            message: None,
            docs_url: INSTALL_DOCS.to_string(),
        },
        _ => NodeInfo {
            ok: false,
            path: Some(node),
            message: Some(format!(
                "Node {version} is too old. The dev API needs Node {MIN_NODE_MAJOR} or newer."
            )),
            version: Some(version),
            login_path,
            docs_url: INSTALL_DOCS.to_string(),
        },
    }
}

/// Looks for Node using the user's login shell (`$SHELL`, else `/bin/zsh`).
pub fn detect() -> NodeInfo {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let probe = if cfg!(windows) {
        None
    } else {
        probe_with_login_shell(&shell)
    };
    // Windows has no login shell: the app inherits the user's PATH, so `node` is found directly.
    let probe = probe.or_else(|| cfg!(windows).then(|| format!("{NODE_MARK}node\n")));
    evaluate(probe.as_deref(), node_version)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_markers_and_ignores_shell_noise() {
        let out = "Last login: today\nnvm is loading\n__TEMPO_NODE__/opt/homebrew/bin/node\n__TEMPO_PATH__/usr/bin:/opt/homebrew/bin\n";
        let (node, path) = parse_probe_output(out);
        assert_eq!(node.as_deref(), Some("/opt/homebrew/bin/node"));
        assert_eq!(path.as_deref(), Some("/usr/bin:/opt/homebrew/bin"));
    }

    #[test]
    fn an_empty_node_marker_means_missing() {
        let (node, path) = parse_probe_output("__TEMPO_NODE__\n__TEMPO_PATH__/usr/bin\n");
        assert_eq!(node, None);
        assert_eq!(path.as_deref(), Some("/usr/bin"));
    }

    #[test]
    fn parses_versions() {
        assert_eq!(parse_node_major("v22.3.0\n"), Some(22));
        assert_eq!(parse_node_major("24.1.0"), Some(24));
        assert_eq!(parse_node_major("garbage"), None);
        assert_eq!(parse_node_major(""), None);
    }

    #[test]
    fn accepts_node_22_and_newer() {
        let info = evaluate(Some("__TEMPO_NODE__/n/node\n__TEMPO_PATH__/n\n"), |_| {
            Some("v22.0.0".into())
        });
        assert!(info.ok);
        assert_eq!(info.path.as_deref(), Some("/n/node"));
        assert_eq!(info.login_path.as_deref(), Some("/n"));
    }

    #[test]
    fn rejects_an_old_node_with_a_message() {
        let info = evaluate(Some("__TEMPO_NODE__/n/node\n"), |_| Some("v20.11.1".into()));
        assert!(!info.ok);
        assert!(info
            .message
            .is_some_and(|m| m.contains("too old") && m.contains("22")));
    }

    #[test]
    fn reports_a_missing_node_without_failing() {
        let info = evaluate(Some("__TEMPO_NODE__\n"), |_| None);
        assert!(!info.ok);
        assert!(info.message.is_some_and(|m| m.contains("not found")));
        let no_shell = evaluate(None, |_| None);
        assert!(!no_shell.ok);
        assert_eq!(no_shell.docs_url, INSTALL_DOCS);
    }

    #[test]
    fn reports_a_node_that_does_not_run() {
        let info = evaluate(Some("__TEMPO_NODE__/n/node\n"), |_| None);
        assert!(!info.ok);
        assert!(info.message.is_some_and(|m| m.contains("--version")));
    }
}
