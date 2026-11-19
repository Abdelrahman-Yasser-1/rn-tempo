//! DEVELOPMENT ONLY (`cfg(debug_assertions)`): finds Node.js so `tauri dev` can run `node dist/cli.mjs` when the
//! bundled engine has not been built. A release build has no Node lookup at all: the engine is a single executable.

use crate::login_env::{login_shell_output, mark_value};

/// The engine uses `node:sqlite`, which needs Node 24 or newer.
pub const MIN_NODE_MAJOR: u32 = 24;
const NODE_MARK: &str = "__TEMPO_NODE__";

/// The major version of `v22.3.0` or `22.3.0`. `None` for anything else.
pub fn parse_node_major(text: &str) -> Option<u32> {
    let trimmed = text.trim().trim_start_matches('v');
    trimmed.split('.').next()?.parse().ok()
}

fn node_version(node: &str) -> Option<String> {
    let mut command = std::process::Command::new(node);
    command.arg("--version");
    crate::login_env::run_with_timeout(command).map(|text| text.trim().to_string())
}

/// Decides from the probe output and the version text. Pure, so it is tested without a shell.
/// `Ok` is the path of a good `node`; `Err` is a sentence for the user.
pub fn evaluate(
    probe: Option<&str>,
    version_of: impl Fn(&str) -> Option<String>,
) -> Result<String, String> {
    let Some(node) = probe.and_then(|text| mark_value(text, NODE_MARK)) else {
        return Err(format!(
            "Node.js was not found in your login shell. Install Node {MIN_NODE_MAJOR} or newer, or build the bundled engine with `yarn workspace @rn-tempo/local-backend build:sea`."
        ));
    };
    let Some(version) = version_of(&node) else {
        return Err(format!(
            "Could not run `{node} --version`. Reinstall Node {MIN_NODE_MAJOR} or newer."
        ));
    };
    match parse_node_major(&version) {
        Some(major) if major >= MIN_NODE_MAJOR => Ok(node),
        _ => Err(format!(
            "Node {version} is too old. The development engine needs Node {MIN_NODE_MAJOR} or newer."
        )),
    }
}

/// Looks for Node using the user's login shell.
pub fn find_node() -> Result<String, String> {
    let probe = login_shell_output(&format!("printf '{NODE_MARK}%s\\n' \"$(command -v node)\""));
    evaluate(probe.as_deref(), node_version)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_versions() {
        assert_eq!(parse_node_major("v22.3.0\n"), Some(22));
        assert_eq!(parse_node_major("24.1.0"), Some(24));
        assert_eq!(parse_node_major("garbage"), None);
        assert_eq!(parse_node_major(""), None);
    }

    #[test]
    fn accepts_node_24_and_newer() {
        let found = evaluate(Some("__TEMPO_NODE__/n/node\n"), |_| Some("v24.3.0".into()));
        assert_eq!(found.as_deref(), Ok("/n/node"));
    }

    #[test]
    fn rejects_an_old_node_with_a_message() {
        let error =
            evaluate(Some("__TEMPO_NODE__/n/node\n"), |_| Some("v22.11.1".into())).unwrap_err();
        assert!(error.contains("too old") && error.contains("24"));
    }

    #[test]
    fn reports_a_missing_node_or_one_that_does_not_run() {
        assert!(evaluate(Some("__TEMPO_NODE__\n"), |_| None)
            .unwrap_err()
            .contains("not found"));
        assert!(evaluate(None, |_| None).unwrap_err().contains("not found"));
        assert!(evaluate(Some("__TEMPO_NODE__/n/node\n"), |_| None)
            .unwrap_err()
            .contains("--version"));
    }
}
