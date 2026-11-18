//! The fixed set of engine commands the app may run. The UI picks a variant of a typed enum; it never sends a
//! program or an argument string. Paths come from Rust-side dialogs or from the backend folder itself.

use std::ffi::OsString;
use std::path::Path;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::engine::Launch;

/// What a new backend starts with.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Preset {
    TempoTemplate,
    Empty,
}

impl Preset {
    pub fn arg(self) -> &'static str {
        match self {
            Self::TempoTemplate => "tempo-template",
            Self::Empty => "empty",
        }
    }
}

/// A simulator id is hex digits and dashes and starts with a hex digit, so it can never read as a flag.
pub fn valid_udid(value: &str) -> bool {
    value.len() <= 64
        && value.chars().next().is_some_and(|c| c.is_ascii_hexdigit())
        && value.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

/// An Android device serial.
pub fn valid_serial(value: &str) -> bool {
    value.len() <= 64
        && value
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphanumeric())
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ':' | '-'))
}

/// A backend name for `create`: what the folder is called, kept short and printable.
pub fn clean_name(name: &str) -> String {
    let cleaned: String = name.chars().filter(|c| !c.is_control()).take(100).collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "backend".to_string()
    } else {
        trimmed.to_string()
    }
}

/// One of the commands the Settings tab may run for a backend.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CliAction {
    /// `certs <dir>`: makes the certificate; never changes a trust store.
    Certs,
    /// `trust mac`: `mkcert -install`. The UI asks the user to confirm first.
    TrustMac,
    #[serde(rename_all = "camelCase")]
    TrustIos { device: String },
    #[serde(rename_all = "camelCase")]
    PushAndroid { serial: Option<String> },
}

fn os(parts: &[&str]) -> Vec<OsString> {
    parts.iter().map(OsString::from).collect()
}

impl CliAction {
    pub fn args(&self, dir: &Path) -> Result<Vec<OsString>, String> {
        Ok(match self {
            Self::Certs => {
                let mut args = os(&["certs"]);
                args.push(dir.as_os_str().to_owned());
                args
            }
            Self::TrustMac => os(&["trust", "mac"]),
            Self::TrustIos { device } => {
                if !valid_udid(device) {
                    return Err("That is not a simulator id.".to_string());
                }
                let mut args = os(&["trust", "ios", "--device"]);
                args.push(device.into());
                args
            }
            Self::PushAndroid { serial } => {
                let mut args = os(&["trust", "android"]);
                if let Some(serial) = serial {
                    if !valid_serial(serial) {
                        return Err("That is not a device serial.".to_string());
                    }
                    args.push("--serial".into());
                    args.push(serial.into());
                }
                args
            }
        })
    }

    /// `trust mac` may wait for a password prompt.
    pub fn timeout(&self) -> Duration {
        match self {
            Self::TrustMac => Duration::from_secs(300),
            _ => Duration::from_secs(60),
        }
    }
}

pub fn create_args(dir: &Path, name: &str, preset: Preset, port: Option<u16>) -> Vec<OsString> {
    let mut args = os(&["create"]);
    args.push(dir.as_os_str().to_owned());
    args.extend(os(&["--name"]));
    args.push(clean_name(name).into());
    args.extend(os(&["--preset", preset.arg()]));
    if let Some(port) = port {
        args.extend(os(&["--port"]));
        args.push(port.to_string().into());
    }
    args
}

pub fn snapshot_export_args(dir: &Path, file: &Path) -> Vec<OsString> {
    let mut args = os(&["snapshot", "export"]);
    args.push(dir.as_os_str().to_owned());
    args.push(file.as_os_str().to_owned());
    args
}

pub fn snapshot_import_args(zip: &Path, dir: &Path) -> Vec<OsString> {
    let mut args = os(&["snapshot", "import"]);
    args.push(zip.as_os_str().to_owned());
    args.push(dir.as_os_str().to_owned());
    args
}

pub fn check_args(dir: &Path, openapi: &Path) -> Vec<OsString> {
    let mut args = os(&["check"]);
    args.push(dir.as_os_str().to_owned());
    args.extend(os(&["--openapi"]));
    args.push(openapi.as_os_str().to_owned());
    args.extend(os(&["--json"]));
    args
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CliOutput {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// Runs the engine with `args` and waits. Blocks.
pub fn run(
    launch: &Launch,
    args: &[OsString],
    cwd: &Path,
    timeout: Duration,
) -> Result<CliOutput, String> {
    let mut command = launch.command(args);
    command
        .current_dir(cwd)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    let child = command
        .spawn()
        .map_err(|error| format!("Could not start the engine: {error}"))?;
    let pid = child.id();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });
    let output = match rx.recv_timeout(timeout) {
        Ok(result) => result.map_err(|error| format!("The command failed: {error}"))?,
        Err(_) => {
            return Err(format!(
                "The command did not finish in {} seconds (process {pid} may still run).",
                timeout.as_secs()
            ))
        }
    };
    Ok(CliOutput {
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strings(args: Vec<OsString>) -> Vec<String> {
        args.into_iter()
            .map(|a| a.to_string_lossy().into_owned())
            .collect()
    }

    #[test]
    fn builds_fixed_command_lines() {
        let dir = Path::new("/work/shop");
        assert_eq!(
            strings(CliAction::Certs.args(dir).unwrap()),
            ["certs", "/work/shop"]
        );
        assert_eq!(
            strings(CliAction::TrustMac.args(dir).unwrap()),
            ["trust", "mac"]
        );
        assert_eq!(
            strings(
                CliAction::TrustIos {
                    device: "AB12-34CD".into()
                }
                .args(dir)
                .unwrap()
            ),
            ["trust", "ios", "--device", "AB12-34CD"]
        );
        assert_eq!(
            strings(
                CliAction::PushAndroid {
                    serial: Some("emulator-5554".into())
                }
                .args(dir)
                .unwrap()
            ),
            ["trust", "android", "--serial", "emulator-5554"]
        );
        assert_eq!(
            strings(CliAction::PushAndroid { serial: None }.args(dir).unwrap()),
            ["trust", "android"]
        );
    }

    #[test]
    fn ids_that_could_be_flags_are_refused() {
        for bad in ["--help", "-a", "--", "a b", "", "booted; rm", "zz"] {
            assert!(
                CliAction::TrustIos { device: bad.into() }
                    .args(Path::new("/"))
                    .is_err(),
                "{bad}"
            );
        }
        for bad in ["--evil", "-s", "", "a b", "a;b"] {
            assert!(
                CliAction::PushAndroid {
                    serial: Some(bad.into())
                }
                .args(Path::new("/"))
                .is_err(),
                "{bad}"
            );
        }
    }

    #[test]
    fn only_known_actions_come_from_the_ui() {
        let action: CliAction =
            serde_json::from_str(r#"{"kind":"trustIos","device":"AB-12"}"#).unwrap();
        assert_eq!(
            action,
            CliAction::TrustIos {
                device: "AB-12".into()
            }
        );
        assert!(serde_json::from_str::<CliAction>(r#"{"kind":"rm","path":"/"}"#).is_err());
        assert!(serde_json::from_str::<CliAction>(r#"{"kind":"serve"}"#).is_err());
        assert_eq!(
            serde_json::from_str::<Preset>(r#""tempo-template""#).unwrap(),
            Preset::TempoTemplate
        );
        assert!(serde_json::from_str::<Preset>(r#""--evil""#).is_err());
    }

    #[test]
    fn create_snapshot_and_check_lines() {
        let args = strings(create_args(
            Path::new("/b"),
            "  Shop\n",
            Preset::TempoTemplate,
            Some(8556),
        ));
        assert_eq!(
            args,
            [
                "create",
                "/b",
                "--name",
                "Shop",
                "--preset",
                "tempo-template",
                "--port",
                "8556"
            ]
        );
        assert_eq!(
            strings(create_args(Path::new("/b"), "", Preset::Empty, None))[3],
            "backend"
        );
        assert_eq!(
            strings(snapshot_export_args(Path::new("/b"), Path::new("/s.zip"))),
            ["snapshot", "export", "/b", "/s.zip"]
        );
        assert_eq!(
            strings(snapshot_import_args(Path::new("/s.zip"), Path::new("/n"))),
            ["snapshot", "import", "/s.zip", "/n"]
        );
        assert_eq!(
            strings(check_args(Path::new("/b"), Path::new("/o.json"))),
            ["check", "/b", "--openapi", "/o.json", "--json"]
        );
    }

    #[cfg(unix)]
    #[test]
    fn runs_a_command_and_reports_the_output() {
        let launch = Launch {
            program: "/bin/sh".into(),
            args: vec!["-c".into(), "echo out; echo err >&2; exit 2".into()],
            path_env: None,
        };
        let output = run(&launch, &[], Path::new("/"), Duration::from_secs(5)).unwrap();
        assert_eq!(
            (output.code, output.stdout.trim(), output.stderr.trim()),
            (2, "out", "err")
        );
    }
}
