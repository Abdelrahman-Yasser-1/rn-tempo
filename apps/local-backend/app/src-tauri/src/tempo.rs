//! Picks which `tempo-api` to run and builds its command line. Only the fixed commands below exist,
//! so the webview can never hand the CLI an arbitrary argument list.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};

use crate::node::NodeInfo;

const PROJECT_SCRIPT: &str = "node_modules/@rn-tempo/dev-api/dist/tempo-api.mjs";
const BUNDLED_SCRIPT: &str = "standalone/tempo-api.mjs";

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    /// The project's own `node_modules/@rn-tempo/dev-api`.
    Project,
    /// The standalone build shipped inside the app.
    Bundled,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Selected {
    pub script: PathBuf,
    pub source: Source,
}

/// The project's own dev API when it is installed, otherwise the bundled one.
pub fn select(project: &Path, resource_dir: Option<&Path>) -> Result<Selected, String> {
    let own = project.join(PROJECT_SCRIPT);
    if own.is_file() {
        return Ok(Selected {
            script: own,
            source: Source::Project,
        });
    }
    if let Some(dir) = resource_dir {
        let bundled = dir.join(BUNDLED_SCRIPT);
        if bundled.is_file() {
            return Ok(Selected {
                script: bundled,
                source: Source::Bundled,
            });
        }
    }
    Err("The dev API is not installed in this project and the app has no bundled copy.".to_string())
}

/// The version in the dev API's `package.json`, found next to `dist/` for a project install.
/// The standalone build carries no package file, so it reports `None`.
pub fn project_version(selected: &Selected) -> Option<String> {
    if selected.source != Source::Project {
        return None;
    }
    let package = selected.script.parent()?.parent()?.join("package.json");
    let value: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(package).ok()?).ok()?;
    value.get("version")?.as_str().map(str::to_string)
}

/// One of the commands the app may run.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CliAction {
    #[serde(rename_all = "camelCase")]
    Up {
        port: Option<u16>,
        http: bool,
    },
    Down,
    Status,
    Reset,
    #[serde(rename_all = "camelCase")]
    Certs {
        install: bool,
    },
    #[serde(rename_all = "camelCase")]
    TrustIos {
        device: String,
    },
    #[serde(rename_all = "camelCase")]
    TrustAndroid {
        push: bool,
    },
    #[serde(rename_all = "camelCase")]
    Logs {
        lines: u32,
    },
    Collections,
    #[serde(rename_all = "camelCase")]
    ImportOpenapi {
        file: String,
    },
    #[serde(rename_all = "camelCase")]
    ExportCode {
        out: String,
        force: bool,
    },
}

/// A simulator UDID is hex digits and dashes. Anything else could be a flag.
pub fn valid_udid(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

impl CliAction {
    /// The arguments after the script path. `--cwd <project>` is added by the caller.
    pub fn args(&self) -> Result<Vec<String>, String> {
        let text = |parts: &[&str]| {
            parts
                .iter()
                .map(|part| part.to_string())
                .collect::<Vec<_>>()
        };
        Ok(match self {
            Self::Up { port, http } => {
                let mut args = text(&["up"]);
                if let Some(port) = port {
                    args.extend(text(&["--port"]));
                    args.push(port.to_string());
                }
                if *http {
                    args.extend(text(&["--http"]));
                }
                args
            }
            Self::Down => text(&["down"]),
            Self::Status => text(&["status"]),
            Self::Reset => text(&["reset"]),
            Self::Certs { install } => {
                let mut args = text(&["certs"]);
                if *install {
                    args.extend(text(&["--install"]));
                }
                args
            }
            Self::TrustIos { device } => {
                if !valid_udid(device) {
                    return Err("That is not a simulator id.".to_string());
                }
                let mut args = text(&["trust", "ios", "--device"]);
                args.push(device.clone());
                args
            }
            Self::TrustAndroid { push } => {
                let mut args = text(&["trust", "android"]);
                if *push {
                    args.extend(text(&["--push"]));
                }
                args
            }
            Self::Logs { lines } => {
                let mut args = text(&["logs", "-n"]);
                args.push((*lines).clamp(1, 2000).to_string());
                args
            }
            Self::Collections => text(&["collections"]),
            Self::ImportOpenapi { file } => {
                if !Path::new(file).is_absolute() || !Path::new(file).is_file() {
                    return Err("Pick an existing OpenAPI file.".to_string());
                }
                let mut args = text(&["import", "openapi"]);
                args.push(file.clone());
                args.extend(text(&["--force"]));
                args
            }
            Self::ExportCode { out, force } => {
                if !Path::new(out).is_absolute() || !Path::new(out).is_dir() {
                    return Err("Pick an existing project folder to export into.".to_string());
                }
                let mut args = text(&["export", "code", "--out"]);
                args.push(out.clone());
                if *force {
                    args.extend(text(&["--force"]));
                }
                args
            }
        })
    }

    /// `up` starts a server; `certs --install` may wait for a password prompt. Both can be slow.
    pub fn timeout_secs(&self) -> u64 {
        match self {
            Self::Certs { install: true } => 300,
            Self::Up { .. } | Self::Certs { .. } | Self::Down => 60,
            _ => 30,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CliOutput {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// Runs `node <script> <args> --cwd <project>` and waits for it. The CLI's own `up` returns after the
/// server is healthy; the server keeps running in the background.
pub fn run(
    node: &NodeInfo,
    selected: &Selected,
    project: &Path,
    action: &CliAction,
) -> Result<CliOutput, String> {
    let node_path = node.path.as_deref().ok_or("Node.js was not found.")?;
    let mut command = Command::new(node_path);
    command
        .arg(&selected.script)
        .args(action.args()?)
        .arg("--cwd")
        .arg(project)
        .current_dir(project)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("NO_COLOR", "1");
    if let Some(path) = &node.login_path {
        command.env("PATH", path);
    }
    let child = command
        .spawn()
        .map_err(|error| format!("Could not start Node: {error}"))?;
    let timeout = std::time::Duration::from_secs(action.timeout_secs());
    let (tx, rx) = std::sync::mpsc::channel();
    let pid = child.id();
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
    use std::fs;
    use tempfile::tempdir;

    fn touch(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, "// script").unwrap();
    }

    #[test]
    fn prefers_the_project_install() {
        let project = tempdir().unwrap();
        let resources = tempdir().unwrap();
        touch(&project.path().join(PROJECT_SCRIPT));
        touch(&resources.path().join(BUNDLED_SCRIPT));
        let chosen = select(project.path(), Some(resources.path())).unwrap();
        assert_eq!(chosen.source, Source::Project);
        assert!(chosen.script.ends_with("dist/tempo-api.mjs"));
    }

    #[test]
    fn falls_back_to_the_bundled_build() {
        let project = tempdir().unwrap();
        let resources = tempdir().unwrap();
        touch(&resources.path().join(BUNDLED_SCRIPT));
        let chosen = select(project.path(), Some(resources.path())).unwrap();
        assert_eq!(chosen.source, Source::Bundled);
        assert_eq!(project_version(&chosen), None);
    }

    #[test]
    fn fails_with_a_message_when_neither_exists() {
        let project = tempdir().unwrap();
        assert!(select(project.path(), None).is_err());
        assert!(select(project.path(), Some(project.path())).is_err());
    }

    #[test]
    fn reads_the_project_dev_api_version() {
        let project = tempdir().unwrap();
        touch(&project.path().join(PROJECT_SCRIPT));
        let package = project
            .path()
            .join("node_modules/@rn-tempo/dev-api/package.json");
        fs::write(package, r#"{"name":"@rn-tempo/dev-api","version":"1.4.2"}"#).unwrap();
        let chosen = select(project.path(), None).unwrap();
        assert_eq!(project_version(&chosen).as_deref(), Some("1.4.2"));
    }

    #[test]
    fn builds_fixed_command_lines() {
        assert_eq!(
            CliAction::Up {
                port: Some(8555),
                http: false
            }
            .args()
            .unwrap(),
            ["up", "--port", "8555"]
        );
        assert_eq!(
            CliAction::Up {
                port: None,
                http: true
            }
            .args()
            .unwrap(),
            ["up", "--http"]
        );
        assert_eq!(
            CliAction::Certs { install: true }.args().unwrap(),
            ["certs", "--install"]
        );
        assert_eq!(CliAction::Down.args().unwrap(), ["down"]);
        assert_eq!(
            CliAction::Logs { lines: 99_999 }.args().unwrap(),
            ["logs", "-n", "2000"]
        );
        assert_eq!(
            CliAction::TrustIos {
                device: "AB12-34CD".into()
            }
            .args()
            .unwrap(),
            ["trust", "ios", "--device", "AB12-34CD"]
        );
    }

    #[test]
    fn refuses_a_device_id_that_could_be_a_flag() {
        for bad in ["--help", "a b", "", "booted; rm", "zz"] {
            assert!(
                CliAction::TrustIos { device: bad.into() }.args().is_err(),
                "{bad}"
            );
        }
    }

    #[test]
    fn import_and_export_need_real_absolute_paths() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("spec.yaml");
        fs::write(&file, "openapi: 3.0.0").unwrap();
        let import = CliAction::ImportOpenapi {
            file: file.to_string_lossy().into(),
        };
        assert_eq!(
            import.args().unwrap()[..3],
            ["import", "openapi", &*file.to_string_lossy()]
        );
        assert!(CliAction::ImportOpenapi {
            file: "relative.yaml".into()
        }
        .args()
        .is_err());
        assert!(CliAction::ImportOpenapi {
            file: "/does/not/exist.yaml".into()
        }
        .args()
        .is_err());
        let export = CliAction::ExportCode {
            out: dir.path().to_string_lossy().into(),
            force: true,
        };
        assert!(export.args().unwrap().contains(&"--force".to_string()));
        assert!(CliAction::ExportCode {
            out: "/does/not/exist".into(),
            force: false
        }
        .args()
        .is_err());
    }

    #[test]
    fn reads_actions_from_the_ui_json() {
        let action: CliAction =
            serde_json::from_str(r#"{"kind":"up","port":8555,"http":false}"#).unwrap();
        assert_eq!(
            action,
            CliAction::Up {
                port: Some(8555),
                http: false
            }
        );
        assert!(serde_json::from_str::<CliAction>(r#"{"kind":"rm","path":"/"}"#).is_err());
    }
}
