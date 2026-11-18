//! The recent-projects list, kept as JSON in the app data folder.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::project::ProjectKind;

const MAX_RECENTS: usize = 20;
pub const FILE_NAME: &str = "recents.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Recent {
    pub path: String,
    pub name: String,
    /// `code` or `workspace`.
    pub kind: String,
    /// Whether the app created the folder as a standalone workspace in its own data folder.
    #[serde(default)]
    pub app_owned: bool,
}

pub fn kind_name(kind: ProjectKind) -> &'static str {
    match kind {
        ProjectKind::Code => "code",
        ProjectKind::Workspace => "workspace",
    }
}

/// Reads the list. A missing or broken file is an empty list, never an error.
pub fn load(dir: &Path) -> Vec<Recent> {
    fs::read_to_string(dir.join(FILE_NAME))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save(dir: &Path, items: &[Recent]) -> Result<(), String> {
    fs::create_dir_all(dir)
        .map_err(|error| format!("Could not save the recent projects: {error}"))?;
    let text = serde_json::to_string_pretty(items).map_err(|error| error.to_string())?;
    let file: PathBuf = dir.join(FILE_NAME);
    let temp = dir.join(format!("{FILE_NAME}.tmp"));
    fs::write(&temp, text)
        .map_err(|error| format!("Could not save the recent projects: {error}"))?;
    fs::rename(&temp, file).map_err(|error| format!("Could not save the recent projects: {error}"))
}

/// Puts a project first (moving it up when it is already there) and keeps the newest 20.
pub fn add(dir: &Path, recent: Recent) -> Result<Vec<Recent>, String> {
    let mut items = load(dir);
    items.retain(|item| item.path != recent.path);
    items.insert(0, recent);
    items.truncate(MAX_RECENTS);
    save(dir, &items)?;
    Ok(items)
}

pub fn remove(dir: &Path, path: &str) -> Result<Vec<Recent>, String> {
    let mut items = load(dir);
    items.retain(|item| item.path != path);
    save(dir, &items)?;
    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn recent(path: &str) -> Recent {
        Recent {
            path: path.into(),
            name: path.into(),
            kind: "code".into(),
            app_owned: false,
        }
    }

    #[test]
    fn missing_or_broken_files_are_empty() {
        let dir = tempdir().unwrap();
        assert!(load(dir.path()).is_empty());
        fs::write(dir.path().join(FILE_NAME), "{oops").unwrap();
        assert!(load(dir.path()).is_empty());
    }

    #[test]
    fn newest_first_without_duplicates() {
        let dir = tempdir().unwrap();
        add(dir.path(), recent("/a")).unwrap();
        add(dir.path(), recent("/b")).unwrap();
        let items = add(dir.path(), recent("/a")).unwrap();
        let paths: Vec<_> = items.iter().map(|i| i.path.as_str()).collect();
        assert_eq!(paths, ["/a", "/b"]);
        assert_eq!(load(dir.path()), items);
    }

    #[test]
    fn keeps_twenty() {
        let dir = tempdir().unwrap();
        for index in 0..25 {
            add(dir.path(), recent(&format!("/p{index}"))).unwrap();
        }
        let items = load(dir.path());
        assert_eq!(items.len(), 20);
        assert_eq!(items[0].path, "/p24");
    }

    #[test]
    fn removes_one() {
        let dir = tempdir().unwrap();
        add(dir.path(), recent("/a")).unwrap();
        add(dir.path(), recent("/b")).unwrap();
        let items = remove(dir.path(), "/a").unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].path, "/b");
    }
}
