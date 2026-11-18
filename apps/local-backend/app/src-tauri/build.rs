fn main() {
    // Only these commands exist for the webview; the capability file grants each one by name.
    const COMMANDS: &[&str] = &[
        "node_info",
        "list_backends",
        "backend_status",
        "pick_new_folder",
        "create_backend",
        "open_backend",
        "remove_backend",
        "start_backend",
        "stop_backend",
        "admin",
        "try_it",
        "cert_info",
        "engine_cli",
        "check_openapi",
        "export_snapshot",
        "restore_snapshot",
        "list_simulators",
        "reveal",
        "open_docs",
        "create_handler",
        "engine_log",
        "pick_import_file",
        "save_export",
        "upload_media",
        "upload_dropped",
        "media_preview",
        "download_media",
        "subscribe_requests",
        "unsubscribe_requests",
    ];
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
