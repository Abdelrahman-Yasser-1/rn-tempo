/// Tauri refuses to build when a `bundle.externalBin` file is missing. `yarn build:sea` makes the real engine; so
/// that `cargo check`, `cargo test` and `tauri dev` work without that 140 MB build, a development profile gets an
/// empty placeholder (the app treats an empty sidecar as missing and falls back to `node dist/cli.mjs`). A release
/// build never gets one: it stops with a clear message instead of bundling an empty engine.
fn ensure_sidecar() {
    let target = std::env::var("TARGET").expect("TARGET is set by cargo");
    let dir = std::path::Path::new(
        &std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set by cargo"),
    )
    .join("binaries");
    let file = dir.join(format!(
        "tempo-engine-{target}{}",
        if target.contains("windows") {
            ".exe"
        } else {
            ""
        }
    ));
    println!("cargo:rerun-if-changed={}", file.display());
    let release = std::env::var("PROFILE").is_ok_and(|profile| profile == "release");
    let empty = std::fs::metadata(&file).is_ok_and(|meta| meta.len() == 0);
    if release {
        assert!(
            file.is_file() && !empty,
            "The bundled engine is missing. Run `yarn workspace @rn-tempo/local-backend build:sea` first ({}).",
            file.display()
        );
    } else if !file.exists() {
        std::fs::create_dir_all(&dir).expect("create the binaries folder");
        std::fs::write(&file, b"").expect("write the sidecar placeholder");
    }
}

fn main() {
    ensure_sidecar();
    // Only these commands exist for the webview; the capability file grants each one by name.
    const COMMANDS: &[&str] = &[
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
