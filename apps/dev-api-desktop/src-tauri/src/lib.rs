//! Tempo Dev API: a small Tauri shell. The UI holds no API logic. This side runs the `tempo-api` CLI,
//! reads the files it writes, and proxies control-API calls so the project CA is trusted.

mod commands;
mod http;
mod node;
mod project;
mod recents;
mod simulators;
mod state;
mod tempo;
mod tray;

use tauri::{Manager, RunEvent, WindowEvent};

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::node_info,
            commands::list_recents,
            commands::open_project,
            commands::remove_recent,
            commands::create_workspace,
            commands::project_state,
            commands::cli,
            commands::control,
            commands::subscribe_events,
            commands::unsubscribe_events,
            commands::list_booted_simulators,
            commands::read_workspace,
            commands::write_workspace,
            commands::open_target,
        ])
        .setup(|app| {
            tray::build(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window keeps the app (and its tray item) running; Quit stops everything.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.app_handle().state::<state::AppState>();
                if !state.quitting.load(std::sync::atomic::Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building the desktop app");

    app.run(|handle, event| match event {
        RunEvent::Exit => {
            let state = handle.state::<state::AppState>();
            state
                .quitting
                .store(true, std::sync::atomic::Ordering::SeqCst);
            state::shutdown(handle, &state);
        }
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => tray::show_window(handle),
        _ => {}
    });
}
