//! The list of backends, kept as JSON in the app data folder. It holds folder paths only.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::files;

pub const FILE_NAME: &str = "backends.json";
const MAX_BACKENDS: usize = 50;

#[derive(Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
struct Stored {
    paths: Vec<String>,
}

/// Reads the list. A missing or broken file is an empty list, never an error.
pub fn load(dir: &Path) -> Vec<String> {
    std::fs::read_to_string(dir.join(FILE_NAME))
        .ok()
        .and_then(|text| serde_json::from_str::<Stored>(&text).ok())
        .map(|stored| stored.paths)
        .unwrap_or_default()
}

fn save(dir: &Path, paths: &[String]) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|error| format!("Could not save the list: {error}"))?;
    let text = serde_json::to_string_pretty(&Stored {
        paths: paths.to_vec(),
    })
    .map_err(|error| error.to_string())?;
    files::safe_write(&dir.join(FILE_NAME), text.as_bytes())
}

/// Puts a backend first (moving it up when it is already there).
pub fn add(dir: &Path, path: &str) -> Result<Vec<String>, String> {
    let mut paths = load(dir);
    paths.retain(|item| item != path);
    paths.insert(0, path.to_string());
    paths.truncate(MAX_BACKENDS);
    save(dir, &paths)?;
    Ok(paths)
}

pub fn remove(dir: &Path, path: &str) -> Result<Vec<String>, String> {
    let mut paths = load(dir);
    paths.retain(|item| item != path);
    save(dir, &paths)?;
    Ok(paths)
}

/// The name in a backend's `backend.json`, or the folder name. Reads at most 4 MB and never follows a link.
pub fn display_name(folder: &Path) -> String {
    let fallback = || {
        folder.file_name().map_or_else(
            || folder.to_string_lossy().into_owned(),
            |name| name.to_string_lossy().into_owned(),
        )
    };
    let file = folder.join("backend.json");
    let Ok(text) = files::read_text_limited(&file, 4 * 1024 * 1024) else {
        return fallback();
    };
    serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|value| value.get("name")?.as_str().map(str::to_string))
        .filter(|name| !name.is_empty())
        .map_or_else(fallback, |name| name.chars().take(100).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn missing_or_broken_files_are_empty() {
        let dir = tempdir().unwrap();
        assert!(load(dir.path()).is_empty());
        std::fs::write(dir.path().join(FILE_NAME), "{oops").unwrap();
        assert!(load(dir.path()).is_empty());
    }

    #[test]
    fn newest_first_without_duplicates_and_removable() {
        let dir = tempdir().unwrap();
        add(dir.path(), "/a").unwrap();
        add(dir.path(), "/b").unwrap();
        assert_eq!(add(dir.path(), "/a").unwrap(), ["/a", "/b"]);
        assert_eq!(remove(dir.path(), "/a").unwrap(), ["/b"]);
        assert_eq!(load(dir.path()), ["/b"]);
    }

    #[test]
    fn keeps_fifty() {
        let dir = tempdir().unwrap();
        for index in 0..60 {
            add(dir.path(), &format!("/p{index}")).unwrap();
        }
        assert_eq!(load(dir.path()).len(), 50);
    }

    #[test]
    fn names_come_from_the_definition_or_the_folder() {
        let dir = tempdir().unwrap();
        let backend = dir.path().join("shop-folder");
        std::fs::create_dir(&backend).unwrap();
        assert_eq!(display_name(&backend), "shop-folder");
        std::fs::write(backend.join("backend.json"), r#"{"name":"Shop"}"#).unwrap();
        assert_eq!(display_name(&backend), "Shop");
        std::fs::write(backend.join("backend.json"), "not json").unwrap();
        assert_eq!(display_name(&backend), "shop-folder");
    }
}
