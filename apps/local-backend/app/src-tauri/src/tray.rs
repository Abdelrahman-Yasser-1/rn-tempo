//! The menu bar item: the projects with a start/stop entry each, plus "Open window" and "Quit".

use std::path::PathBuf;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Manager};

use crate::recents;
use crate::state::{self, AppState};
use crate::tempo::CliAction;

const TRAY_ID: &str = "main";
const MAX_ITEMS: usize = 12;
const REFRESH_EVERY: Duration = Duration::from_secs(3);

/// One tray entry: a project and whether its server runs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub path: PathBuf,
    pub name: String,
    pub running: bool,
}

pub fn label(entry: &Entry) -> String {
    format!(
        "{} {}  {}",
        if entry.running {
            "\u{25CF}"
        } else {
            "\u{25CB}"
        },
        entry.name,
        if entry.running { "Stop" } else { "Start" }
    )
}

pub fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn entries(app: &AppHandle) -> Vec<Entry> {
    let Ok(dir) = app.path().app_data_dir() else {
        return Vec::new();
    };
    recents::load(&dir)
        .into_iter()
        .take(MAX_ITEMS)
        .filter_map(|recent| {
            let path = std::fs::canonicalize(&recent.path).ok()?;
            Some(Entry {
                running: state::is_running(&path),
                path,
                name: recent.name,
            })
        })
        .collect()
}

fn build_menu(app: &AppHandle, entries: &[Entry]) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;
    if entries.is_empty() {
        menu.append(&MenuItem::with_id(
            app,
            "none",
            "No projects yet",
            false,
            None::<&str>,
        )?)?;
    }
    for (index, entry) in entries.iter().enumerate() {
        menu.append(&MenuItem::with_id(
            app,
            format!("toggle:{index}"),
            label(entry),
            true,
            None::<&str>,
        )?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(
        app,
        "open",
        "Open window",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?)?;
    Ok(menu)
}

fn apply(app: &AppHandle, entries: Vec<Entry>) {
    let state = app.state::<AppState>();
    if let Ok(mut projects) = state.tray_projects.lock() {
        *projects = entries.iter().map(|entry| entry.path.clone()).collect();
    }
    let handle = app.clone();
    // Menus are built on the main thread.
    let _ = app.run_on_main_thread(move || {
        if let (Some(tray), Ok(menu)) = (handle.tray_by_id(TRAY_ID), build_menu(&handle, &entries))
        {
            let _ = tray.set_menu(Some(menu));
        }
    });
}

fn toggle(app: &AppHandle, index: usize) {
    let state = app.state::<AppState>();
    let path = state
        .tray_projects
        .lock()
        .ok()
        .and_then(|projects| projects.get(index).cloned());
    let Some(path) = path else { return };
    let handle = app.clone();
    std::thread::spawn(move || {
        let state = handle.state::<AppState>();
        let action = if state::is_running(&path) {
            CliAction::Down
        } else {
            CliAction::Up {
                port: None,
                http: false,
            }
        };
        let _ = state::run_action(&handle, &state, &path, &action);
        apply(&handle, entries(&handle));
    });
}

pub fn build(app: &AppHandle) -> tauri::Result<TrayIcon> {
    let menu = build_menu(app, &[])?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("Tempo Local Backend")
        .on_menu_event(|app, event| {
            let id = event.id.as_ref();
            if let Some(index) = id
                .strip_prefix("toggle:")
                .and_then(|n| n.parse::<usize>().ok())
            {
                toggle(app, index);
            } else if id == "open" {
                show_window(app);
            } else if id == "quit" {
                app.exit(0);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let tray = builder.build(app)?;
    // Keep the menu current: servers can be started or stopped from the CLI too.
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut last: Vec<Entry> = Vec::new();
        loop {
            let worker = handle.clone();
            if let Ok(current) =
                tauri::async_runtime::spawn_blocking(move || entries(&worker)).await
            {
                if current != last {
                    apply(&handle, current.clone());
                    last = current;
                }
            }
            tokio::time::sleep(REFRESH_EVERY).await;
        }
    });
    Ok(tray)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_show_the_action() {
        let entry = |running| Entry {
            path: "/p".into(),
            name: "demo".into(),
            running,
        };
        assert!(label(&entry(true)).ends_with("Stop"));
        assert!(label(&entry(false)).ends_with("Start"));
    }
}
