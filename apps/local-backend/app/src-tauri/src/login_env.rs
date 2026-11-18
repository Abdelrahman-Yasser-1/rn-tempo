//! The user's login-shell `PATH`. A macOS GUI app does not get the shell's `PATH`, so the engine would not find
//! `mkcert`, `xcrun` or `adb`. This only asks the shell for `$PATH`; it does not look for any program.

use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

const PATH_MARK: &str = "__TEMPO_PATH__";
const SHELL_TIMEOUT: Duration = Duration::from_secs(10);

/// The text after `mark` on the first line that starts with it, so shell start-up noise is ignored.
pub fn mark_value(output: &str, mark: &str) -> Option<String> {
    output
        .lines()
        .find_map(|line| line.strip_prefix(mark))
        .map(|rest| rest.trim().to_string())
        .filter(|rest| !rest.is_empty())
}

/// Runs a program with a time limit, so a login shell that waits for input cannot hang the app.
pub fn run_with_timeout(mut command: Command) -> Option<String> {
    command.stdin(Stdio::null()).stderr(Stdio::null());
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(command.output());
    });
    let output = rx.recv_timeout(SHELL_TIMEOUT).ok()?.ok()?;
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Runs a script in the user's login shell (`$SHELL`, else `/bin/zsh`).
#[cfg(not(windows))]
pub fn login_shell_output(script: &str) -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut command = Command::new(shell);
    command.arg("-lc").arg(script);
    run_with_timeout(command)
}

/// The login shell's `PATH`. Windows has no login shell: the app inherits the user's `PATH`.
pub fn login_path() -> Option<String> {
    #[cfg(windows)]
    {
        None
    }
    #[cfg(not(windows))]
    {
        let output = login_shell_output(&format!("printf '{PATH_MARK}%s\\n' \"$PATH\""))?;
        mark_value(&output, PATH_MARK)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_marked_value_and_ignores_noise() {
        let out = "Last login: today\nnvm is loading\n__TEMPO_PATH__/usr/bin:/opt/homebrew/bin\n";
        assert_eq!(
            mark_value(out, PATH_MARK).as_deref(),
            Some("/usr/bin:/opt/homebrew/bin")
        );
    }

    #[test]
    fn an_empty_value_is_none() {
        assert_eq!(mark_value("__TEMPO_PATH__\n", PATH_MARK), None);
        assert_eq!(mark_value("", PATH_MARK), None);
    }
}
