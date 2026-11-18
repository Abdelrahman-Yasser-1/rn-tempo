//! Shared state: which backends the UI may act on, the engines this app runs, and the running event streams.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Mutex, OnceLock};

use tauri::async_runtime::JoinHandle;

use crate::fleet::Fleet;
use crate::login_env;

#[derive(Default)]
pub struct AppState {
    /// The login shell's `PATH`, asked for once.
    login_path: OnceLock<Option<String>>,
    /// The engines this app runs, one per open backend.
    pub fleet: Fleet,
    /// Backends the user opened or created. Commands refuse any other folder.
    backends: Mutex<HashSet<PathBuf>>,
    /// Folders the user just chose in a folder dialog, so `create` only writes where they pointed.
    picked: Mutex<HashSet<PathBuf>>,
    /// Files dropped on the window; the upload command takes them, so the webview never names a path.
    dropped: Mutex<Vec<PathBuf>>,
    pub event_streams: Mutex<HashMap<String, JoinHandle<()>>>,
    /// The backends behind the tray menu's items, in menu order.
    pub tray_projects: Mutex<Vec<PathBuf>>,
    pub quitting: AtomicBool,
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    // A panicked holder cannot leave these simple collections half-updated, so keep going.
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

impl AppState {
    /// The login shell's `PATH` (so the engine finds `mkcert`, `xcrun` and `adb`), looked up once.
    pub fn login_path(&self) -> Option<String> {
        self.login_path.get_or_init(login_env::login_path).clone()
    }

    pub fn remember_backend(&self, path: &Path) {
        lock(&self.backends).insert(path.to_path_buf());
    }

    pub fn forget_backend(&self, path: &Path) {
        lock(&self.backends).remove(path);
    }

    /// The canonical folder for a path the UI sent, when it is a backend the user opened or created.
    pub fn known_backend(&self, path: &str) -> Result<PathBuf, String> {
        let canonical =
            std::fs::canonicalize(path).map_err(|_| "That folder does not exist.".to_string())?;
        if lock(&self.backends).contains(&canonical) {
            Ok(canonical)
        } else {
            Err("Open the backend first.".to_string())
        }
    }

    pub fn remember_picked(&self, path: &Path) {
        lock(&self.picked).insert(path.to_path_buf());
    }

    /// A folder the user chose in the dialog (used once).
    pub fn take_picked(&self, path: &str) -> Result<PathBuf, String> {
        let canonical =
            std::fs::canonicalize(path).map_err(|_| "That folder does not exist.".to_string())?;
        if lock(&self.picked).remove(&canonical) {
            Ok(canonical)
        } else {
            Err("Choose the folder first.".to_string())
        }
    }

    pub fn set_dropped(&self, paths: Vec<PathBuf>) {
        *lock(&self.dropped) = paths;
    }

    pub fn take_dropped(&self) -> Vec<PathBuf> {
        std::mem::take(&mut *lock(&self.dropped))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn only_opened_backends_are_known() {
        let state = AppState::default();
        let dir = tempdir().unwrap();
        let path = dir.path().to_string_lossy().into_owned();
        assert!(state.known_backend(&path).is_err());
        state.remember_backend(&std::fs::canonicalize(dir.path()).unwrap());
        assert!(state.known_backend(&path).is_ok());
        state.forget_backend(&std::fs::canonicalize(dir.path()).unwrap());
        assert!(state.known_backend(&path).is_err());
        assert!(state.known_backend("/does/not/exist").is_err());
    }

    #[test]
    fn a_picked_folder_is_good_once() {
        let state = AppState::default();
        let dir = tempdir().unwrap();
        let path = dir.path().to_string_lossy().into_owned();
        assert!(state.take_picked(&path).is_err());
        state.remember_picked(&std::fs::canonicalize(dir.path()).unwrap());
        assert!(state.take_picked(&path).is_ok());
        assert!(state.take_picked(&path).is_err());
    }

    #[test]
    fn dropped_files_are_taken_once() {
        let state = AppState::default();
        state.set_dropped(vec!["/a".into(), "/b".into()]);
        assert_eq!(state.take_dropped().len(), 2);
        assert!(state.take_dropped().is_empty());
    }
}
