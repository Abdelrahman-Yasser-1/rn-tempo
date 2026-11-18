//! Tempo Local Backend: a small Tauri shell. The UI holds no API logic. This side runs the engine (one process
//! per open backend), keeps its admin token, proxies the UI's calls to it and opens every file dialog.

mod backends;
mod cli;
#[cfg(test)]
mod e2e;
mod engine;
mod files;
mod fleet;
mod http;
mod node;
mod proxy;
mod registry;
mod simulators;
mod state;
mod tray;

use tauri::{Emitter, Manager, RunEvent, WindowEvent};

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            backends::node_info,
            backends::list_backends,
            backends::backend_status,
            backends::pick_new_folder,
            backends::create_backend,
            backends::open_backend,
            backends::remove_backend,
            backends::start_backend,
            backends::stop_backend,
            backends::admin,
            backends::try_it,
            backends::cert_info,
            backends::engine_cli,
            backends::check_openapi,
            backends::export_snapshot,
            backends::restore_snapshot,
            backends::list_simulators,
            backends::reveal,
            backends::open_docs,
            backends::create_handler,
            backends::engine_log,
            backends::pick_import_file,
            backends::save_export,
            backends::upload_media,
            backends::upload_dropped,
            backends::media_preview,
            backends::download_media,
            backends::subscribe_requests,
            backends::unsubscribe_requests,
        ])
        .setup(|app| {
            tray::build(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                // The paths stay on this side; the UI only learns how many files arrived.
                let handle = window.app_handle();
                handle.state::<state::AppState>().set_dropped(paths.clone());
                let _ = handle.emit("lb://dropped", paths.len());
            }
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
            // Every engine this app started stops with it.
            state.fleet.stop_all();
        }
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => tray::show_window(handle),
        _ => {}
    });
}
