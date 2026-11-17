//! What the app reads from a project folder: the files the `tempo-api` CLI writes (pid record,
//! control token, CA certificate) and what kind of project the folder is.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub const CONFIG_FILE: &str = "api/tempo-api.config.ts";
pub const WORKSPACE_FILE: &str = "tempo-api.json";
const DATA_DIR: &str = ".tempo-api";

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProjectKind {
    /// A folder with `api/tempo-api.config.ts`.
    Code,
    /// A folder with `tempo-api.json` and no code config.
    Workspace,
}

pub fn detect_kind(dir: &Path) -> Option<ProjectKind> {
    if dir.join(CONFIG_FILE).is_file() {
        Some(ProjectKind::Code)
    } else if dir.join(WORKSPACE_FILE).is_file() {
        Some(ProjectKind::Workspace)
    } else {
        None
    }
}

/// The record `tempo-api up` writes to `.tempo-api/server.pid`.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct PidRecord {
    pub pid: u32,
    pub port: u16,
    #[serde(default)]
    pub host: Option<String>,
    #[serde(default)]
    pub scheme: Option<String>,
}

impl PidRecord {
    /// Records written before HTTPS existed have no scheme and mean `http`.
    pub fn is_https(&self) -> bool {
        self.scheme.as_deref() == Some("https")
    }
}

pub fn data_dir(project: &Path) -> PathBuf {
    project.join(DATA_DIR)
}

pub fn ca_file(project: &Path) -> PathBuf {
    data_dir(project).join("certs").join("rootCA.pem")
}

/// `None` when there is no pid file or it cannot be read (the CLI treats that as stale too).
pub fn read_pid(project: &Path) -> Option<PidRecord> {
    let text = fs::read_to_string(data_dir(project).join("server.pid")).ok()?;
    serde_json::from_str(&text).ok()
}

/// The control token the CLI keeps in `.tempo-api/control-token`. `None` when missing or empty.
pub fn read_token(project: &Path) -> Option<String> {
    let text = fs::read_to_string(data_dir(project).join("control-token")).ok()?;
    let token = text.trim();
    (!token.is_empty()).then(|| token.to_string())
}

/// Everything needed to talk to a running server on this machine.
#[derive(Debug, Clone)]
pub struct Connection {
    pub port: u16,
    pub https: bool,
    pub token: Option<String>,
    pub ca: PathBuf,
    pub pid: u32,
}

pub fn connection(project: &Path) -> Option<Connection> {
    let record = read_pid(project)?;
    Some(Connection {
        port: record.port,
        https: record.is_https(),
        token: read_token(project),
        ca: ca_file(project),
        pid: record.pid,
    })
}

/// A name that is safe as a folder name: letters, digits, space, dot, dash and underscore.
pub fn safe_folder_name(name: &str) -> Option<String> {
    let trimmed = name.trim();
    let valid = !trimmed.is_empty()
        && trimmed.len() <= 64
        && !trimmed.starts_with('.')
        && trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, ' ' | '.' | '-' | '_'));
    valid.then(|| trimmed.to_string())
}

/// The starter workspace: one endpoint, so a new workspace serves something straight away.
pub fn starter_workspace(name: &str) -> String {
    let value = serde_json::json!({
        "name": name,
        "endpoints": [{
            "id": "get.ping",
            "method": "GET",
            "path": "/ping",
            "summary": "Health check",
            "response": { "status": 200, "example": { "ok": true } }
        }]
    });
    format!(
        "{}\n",
        serde_json::to_string_pretty(&value).unwrap_or_default()
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write(dir: &Path, rel: &str, text: &str) {
        let file = dir.join(rel);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, text).unwrap();
    }

    #[test]
    fn detects_code_projects_and_workspaces() {
        let dir = tempdir().unwrap();
        assert_eq!(detect_kind(dir.path()), None);
        write(dir.path(), "tempo-api.json", "{}");
        assert_eq!(detect_kind(dir.path()), Some(ProjectKind::Workspace));
        write(dir.path(), "api/tempo-api.config.ts", "export default {}");
        assert_eq!(detect_kind(dir.path()), Some(ProjectKind::Code));
    }

    #[test]
    fn reads_the_pid_record_with_and_without_a_scheme() {
        let dir = tempdir().unwrap();
        write(
            dir.path(),
            ".tempo-api/server.pid",
            r#"{"pid":42,"port":8555,"host":"0.0.0.0","scheme":"https"}"#,
        );
        let record = read_pid(dir.path()).unwrap();
        assert_eq!((record.pid, record.port), (42, 8555));
        assert!(record.is_https());
        write(
            dir.path(),
            ".tempo-api/server.pid",
            r#"{"pid":7,"port":8443}"#,
        );
        assert!(!read_pid(dir.path()).unwrap().is_https());
    }

    #[test]
    fn a_broken_or_missing_pid_file_is_none() {
        let dir = tempdir().unwrap();
        assert!(read_pid(dir.path()).is_none());
        write(dir.path(), ".tempo-api/server.pid", "not json");
        assert!(read_pid(dir.path()).is_none());
        write(dir.path(), ".tempo-api/server.pid", r#"{"pid":"x"}"#);
        assert!(read_pid(dir.path()).is_none());
    }

    #[test]
    fn reads_and_trims_the_token() {
        let dir = tempdir().unwrap();
        assert!(read_token(dir.path()).is_none());
        write(dir.path(), ".tempo-api/control-token", "abc123\n");
        assert_eq!(read_token(dir.path()).as_deref(), Some("abc123"));
        write(dir.path(), ".tempo-api/control-token", "  \n");
        assert!(read_token(dir.path()).is_none());
    }

    #[test]
    fn builds_a_connection_from_the_files() {
        let dir = tempdir().unwrap();
        assert!(connection(dir.path()).is_none());
        write(
            dir.path(),
            ".tempo-api/server.pid",
            r#"{"pid":1,"port":9000,"scheme":"https"}"#,
        );
        write(dir.path(), ".tempo-api/control-token", "tok");
        let conn = connection(dir.path()).unwrap();
        assert_eq!(conn.port, 9000);
        assert!(conn.https);
        assert_eq!(conn.token.as_deref(), Some("tok"));
        assert!(conn.ca.ends_with(".tempo-api/certs/rootCA.pem"));
    }

    #[test]
    fn folder_names_are_restricted() {
        assert_eq!(safe_folder_name("  My API 2 ").as_deref(), Some("My API 2"));
        for bad in ["", "..", ".hidden", "a/b", "a\\b", "x\0", &"a".repeat(65)] {
            assert!(safe_folder_name(bad).is_none(), "{bad:?}");
        }
    }

    #[test]
    fn the_starter_workspace_is_json() {
        let parsed: serde_json::Value = serde_json::from_str(&starter_workspace("Demo")).unwrap();
        assert_eq!(parsed["name"], "Demo");
        assert_eq!(parsed["endpoints"][0]["path"], "/ping");
    }
}
