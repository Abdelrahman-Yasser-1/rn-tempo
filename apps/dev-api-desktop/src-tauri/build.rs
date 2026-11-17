fn main() {
    // Only these commands exist for the webview; the capability file grants each one by name.
    const COMMANDS: &[&str] = &[
        "node_info",
        "list_recents",
        "open_project",
        "remove_recent",
        "create_workspace",
        "project_state",
        "cli",
        "control",
        "subscribe_events",
        "unsubscribe_events",
        "list_booted_simulators",
        "cert_status",
        "read_workspace",
        "write_workspace",
        "open_target",
    ];
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
