//! Shared state: which projects the UI may act on, which servers this app started (so quitting stops
//! them), and the running event streams.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Manager};

use crate::fleet::Fleet;
use crate::node::{self, NodeInfo};
use crate::tempo::{self, CliAction, CliOutput, Selected};

#[derive(Default)]
pub struct AppState {
    node: Mutex<Option<NodeInfo>>,
    /// Projects the user opened or created. Commands refuse any other folder.
    known: Mutex<HashSet<PathBuf>>,
    /// Servers this app started, stopped again when the app quits.
    started: Mutex<Vec<PathBuf>>,
    pub streams: Mutex<HashMap<String, JoinHandle<()>>>,
    /// The projects behind the tray menu's items, in menu order.
    pub tray_projects: Mutex<Vec<PathBuf>>,
    pub quitting: AtomicBool,
    /// The engines this app runs, one per open backend.
    pub fleet: Fleet,
    /// Backends the user opened or created. Commands refuse any other folder.
    backends: Mutex<HashSet<PathBuf>>,
    /// Folders the user just chose in a folder dialog, so `create` only writes where they pointed.
    picked: Mutex<HashSet<PathBuf>>,
    /// Files dropped on the window; the upload command takes them, so the webview never names a path.
    dropped: Mutex<Vec<PathBuf>>,
    pub event_streams: Mutex<HashMap<String, JoinHandle<()>>>,
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    // A panicked holder cannot leave these simple collections half-updated, so keep going.
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

impl AppState {
    /// The cached Node lookup. A missing Node is looked up again each time, so installing it works
    /// without restarting the app.
    pub fn node(&self, refresh: bool) -> NodeInfo {
        let mut cached = lock(&self.node);
        if let Some(info) = cached.as_ref() {
            if info.ok && !refresh {
                return info.clone();
            }
        }
        let info = node::detect();
        *cached = Some(info.clone());
        info
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

    pub fn remember(&self, project: &Path) {
        lock(&self.known).insert(project.to_path_buf());
    }

    /// The canonical folder for a path the UI sent, when it is a project the user opened.
    pub fn known_project(&self, path: &str) -> Result<PathBuf, String> {
        let canonical =
            std::fs::canonicalize(path).map_err(|_| "That folder does not exist.".to_string())?;
        if lock(&self.known).contains(&canonical) {
            Ok(canonical)
        } else {
            Err("Open the project first.".to_string())
        }
    }

    pub fn track_started(&self, project: &Path) {
        let mut started = lock(&self.started);
        if !started.iter().any(|item| item == project) {
            started.push(project.to_path_buf());
        }
    }

    pub fn untrack(&self, project: &Path) {
        lock(&self.started).retain(|item| item != project);
    }

    pub fn is_tracked(&self, project: &Path) -> bool {
        lock(&self.started).iter().any(|item| item == project)
    }

    pub fn take_started(&self) -> Vec<PathBuf> {
        std::mem::take(&mut *lock(&self.started))
    }
}

/// Where the bundled standalone dev API lives. In a `tauri dev` run the resource folder is not
/// populated, so a debug build also looks in the source tree's `resources` folder.
pub fn resource_dir(app: &AppHandle) -> Option<PathBuf> {
    let bundled = app.path().resource_dir().ok();
    if bundled
        .as_ref()
        .is_some_and(|dir| dir.join("standalone/tempo-api.mjs").is_file())
    {
        return bundled;
    }
    if cfg!(debug_assertions) {
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
        if source.join("standalone/tempo-api.mjs").is_file() {
            return Some(source);
        }
    }
    bundled
}

pub fn select_cli(app: &AppHandle, project: &Path) -> Result<Selected, String> {
    tempo::select(project, resource_dir(app).as_deref())
}

/// Runs one CLI action for a project and keeps the "started by this app" list right. Blocks.
pub fn run_action(
    app: &AppHandle,
    state: &AppState,
    project: &Path,
    action: &CliAction,
) -> Result<CliOutput, String> {
    let node = state.node(false);
    if !node.ok {
        return Err(node
            .message
            .unwrap_or_else(|| "Node.js was not found.".to_string()));
    }
    let selected = select_cli(app, project)?;
    let was_running = matches!(action, CliAction::Up { .. }) && is_running(project);
    let output = tempo::run(&node, &selected, project, action)?;
    match action {
        CliAction::Up { .. } if output.code == 0 && !was_running => state.track_started(project),
        CliAction::Down if output.code == 0 => state.untrack(project),
        _ => {}
    }
    Ok(output)
}

/// True when the project's pid record names a live dev API. Blocks.
pub fn is_running(project: &Path) -> bool {
    crate::project::connection(project)
        .is_some_and(|conn| tauri::async_runtime::block_on(crate::http::is_dev_api(&conn)))
}

/// Stops every server this app started. Called when the app exits.
pub fn shutdown(app: &AppHandle, state: &AppState) {
    for project in state.take_started() {
        let _ = run_action(app, state, &project, &CliAction::Down);
    }
}
