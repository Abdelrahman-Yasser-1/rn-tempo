//! The commands of the Tempo Local Backend UI. Each one is listed in `build.rs` and in the capability file;
//! anything else is refused. The UI never sends a program, an argument string, an admin token or (except for
//! backends it already holds) a path: files and folders are chosen in dialogs opened from this side.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::ipc::Response;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::cli::{self, CliAction, CliOutput, Preset};
use crate::engine::{self, Ready};
use crate::files::{self, Res};
use crate::fleet::{BackendStatus, RunState};
use crate::http::{describe_error, SseParser};
use crate::proxy::{self, HttpReply, HttpRequest};
use crate::state::AppState;
use crate::{registry, simulators};

const MAX_UPLOAD_BYTES: u64 = 512 * 1024 * 1024;
const CHUNK: usize = 256 * 1024;
const MAX_IMPORT_BYTES: u64 = 20 * 1024 * 1024;
const MAX_API_FILE_BYTES: u64 = 10 * 1024 * 1024;
const MAX_IMAGE_PREVIEW: usize = 25 * 1024 * 1024;
const MAX_STREAM_PREVIEW: usize = 60 * 1024 * 1024;

fn data_dir(app: &AppHandle) -> Res<PathBuf> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("No app data folder: {error}"))
}

/// A media id as the engine makes them: 32 lowercase hex digits.
pub fn valid_media_id(id: &str) -> bool {
    id.len() == 32
        && id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Whether a stored file may be shown in the webview, and how large it may be. Only images (not SVG),
/// video and audio: SVG and HTML can carry script, and everything else gets an icon.
pub fn preview_limit(mime: &str) -> Option<usize> {
    let essence = mime
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if essence.contains("svg") || essence.contains("html") || essence.contains("xml") {
        return None;
    }
    if essence.starts_with("image/") {
        Some(MAX_IMAGE_PREVIEW)
    } else if essence.starts_with("video/") || essence.starts_with("audio/") {
        Some(MAX_STREAM_PREVIEW)
    } else {
        None
    }
}

fn launch_for(state: &AppState) -> Res<engine::Launch> {
    engine::engine_launch(state.login_path())
}

async fn blocking<T: Send + 'static>(work: impl FnOnce() -> T + Send + 'static) -> Res<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| "The task stopped unexpectedly.".to_string())
}

fn pick_folder(app: &AppHandle, title: &str) -> Option<PathBuf> {
    app.dialog()
        .file()
        .set_title(title)
        .blocking_pick_folder()
        .and_then(|path| path.into_path().ok())
}

fn pick_file(app: &AppHandle, title: &str, name: &str, extensions: &[&str]) -> Option<PathBuf> {
    app.dialog()
        .file()
        .set_title(title)
        .add_filter(name, extensions)
        .blocking_pick_file()
        .and_then(|path| path.into_path().ok())
}

fn pick_save(app: &AppHandle, title: &str, file_name: &str, ext: &str) -> Option<PathBuf> {
    let path = app
        .dialog()
        .file()
        .set_title(title)
        .set_file_name(file_name)
        .add_filter(ext, &[ext])
        .blocking_save_file()
        .and_then(|path| path.into_path().ok())?;
    Some(path)
}

/// Adds a backend to the list the UI may act on and to the saved recents.
fn register(app: &AppHandle, state: &AppState, path: &Path) -> Res<()> {
    state.remember_backend(path);
    registry::add(&data_dir(app)?, &path.to_string_lossy())?;
    Ok(())
}

#[tauri::command]
pub async fn list_backends(app: AppHandle, state: State<'_, AppState>) -> Res<Vec<BackendStatus>> {
    let paths = registry::load(&data_dir(&app)?);
    let mut found = Vec::new();
    for path in paths {
        match std::fs::canonicalize(&path) {
            Ok(canonical) => {
                state.remember_backend(&canonical);
                found.push(state.fleet.status(&canonical));
            }
            Err(_) => found.push(BackendStatus {
                name: Path::new(&path)
                    .file_name()
                    .map_or_else(|| path.clone(), |n| n.to_string_lossy().into_owned()),
                path,
                state: RunState::Error,
                scheme: None,
                port: None,
                notice: None,
                error: Some(
                    "This folder was moved or deleted. Remove it from the list.".to_string(),
                ),
                log_tail: Vec::new(),
            }),
        }
    }
    Ok(found)
}

#[tauri::command]
pub fn backend_status(state: State<'_, AppState>, path: String) -> Res<BackendStatus> {
    Ok(state.fleet.status(&state.known_backend(&path)?))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderPick {
    pub path: String,
    pub empty: bool,
    pub has_backend: bool,
}

/// Step 1 of "New backend": a folder dialog. The folder is remembered so `create_backend` only writes there.
#[tauri::command]
pub async fn pick_new_folder(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Res<Option<FolderPick>> {
    let handle = app.clone();
    let Some(folder) =
        blocking(move || pick_folder(&handle, "Choose an empty folder for the new backend"))
            .await?
    else {
        return Ok(None);
    };
    let canonical =
        std::fs::canonicalize(&folder).map_err(|_| "That folder does not exist.".to_string())?;
    state.remember_picked(&canonical);
    Ok(Some(FolderPick {
        path: canonical.to_string_lossy().into_owned(),
        empty: files::is_empty_folder(&canonical),
        has_backend: canonical.join("backend.json").exists(),
    }))
}

#[tauri::command]
pub async fn create_backend(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    name: String,
    preset: Preset,
    port: Option<u16>,
) -> Res<BackendStatus> {
    let dir = state.take_picked(&path)?;
    if !files::is_empty_folder(&dir) {
        return Err("That folder is not empty. Choose an empty or new folder.".to_string());
    }
    let launch = launch_for(&state)?;
    let run_dir = dir.clone();
    let output = blocking(move || {
        cli::run(
            &launch,
            &cli::create_args(&run_dir, &name, preset, port),
            &run_dir,
            Duration::from_secs(60),
        )
    })
    .await??;
    if output.code != 0 {
        return Err(first_line(
            &output.stderr,
            "The backend could not be created.",
        ));
    }
    register(&app, &state, &dir)?;
    Ok(state.fleet.status(&dir))
}

/// Percent-encodes everything but unreserved characters, so a file name is one safe query value.
fn percent_encode(text: &str) -> String {
    let mut out = String::new();
    for byte in text.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            out.push(char::from(byte));
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

fn first_line(text: &str, fallback: &str) -> String {
    text.lines()
        .map(|line| line.trim_start_matches("local-backend-engine: ").trim())
        .find(|line| !line.is_empty())
        .map_or_else(|| fallback.to_string(), str::to_string)
}

/// "Open backend…": a folder dialog, then a check that it holds a `backend.json`.
#[tauri::command]
pub async fn open_backend(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Res<Option<BackendStatus>> {
    let handle = app.clone();
    let Some(folder) = blocking(move || pick_folder(&handle, "Open a backend folder")).await?
    else {
        return Ok(None);
    };
    let canonical =
        std::fs::canonicalize(&folder).map_err(|_| "That folder does not exist.".to_string())?;
    let definition = std::fs::symlink_metadata(canonical.join("backend.json"));
    if !definition.is_ok_and(|meta| meta.is_file()) {
        return Err(
            "This folder has no backend.json. Pick a backend folder, or make a new one."
                .to_string(),
        );
    }
    register(&app, &state, &canonical)?;
    Ok(Some(state.fleet.status(&canonical)))
}

#[tauri::command]
pub async fn remove_backend(app: AppHandle, state: State<'_, AppState>, path: String) -> Res<()> {
    let dir = state.known_backend(&path)?;
    stop_streams(&state, &dir);
    let handle = app.clone();
    let target = dir.clone();
    blocking(move || handle.state::<AppState>().fleet.stop(&target)).await?;
    state.forget_backend(&dir);
    registry::remove(&data_dir(&app)?, &path)?;
    registry::remove(&data_dir(&app)?, &dir.to_string_lossy())?;
    Ok(())
}

#[tauri::command]
pub async fn start_backend(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    port: Option<u16>,
) -> Res<BackendStatus> {
    let dir = state.known_backend(&path)?;
    let launch = match launch_for(&state) {
        Ok(launch) => launch,
        Err(message) => {
            return Ok(BackendStatus {
                state: RunState::Error,
                error: Some(message),
                ..state.fleet.status(&dir)
            })
        }
    };
    let handle = app.clone();
    blocking(move || handle.state::<AppState>().fleet.start(&launch, &dir, port)).await
}

#[tauri::command]
pub async fn stop_backend(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Res<BackendStatus> {
    let dir = state.known_backend(&path)?;
    let handle = app.clone();
    let target = dir.clone();
    blocking(move || handle.state::<AppState>().fleet.stop(&target)).await?;
    Ok(state.fleet.status(&dir))
}

/// One admin call, with the token added here.
#[tauri::command]
pub async fn admin(
    state: State<'_, AppState>,
    path: String,
    request: HttpRequest,
) -> Res<HttpReply> {
    let dir = state.known_backend(&path)?;
    let ready = state.fleet.ready(&dir)?;
    proxy::admin_send(&ready, request).await
}

/// "Try it": one call to the public API, trusting only this backend's CA.
#[tauri::command]
pub async fn try_it(
    state: State<'_, AppState>,
    path: String,
    request: HttpRequest,
) -> Res<HttpReply> {
    let dir = state.known_backend(&path)?;
    let ready = state.fleet.ready(&dir)?;
    proxy::public_send(&ready, &ca_file(&dir), request).await
}

fn ca_file(dir: &Path) -> PathBuf {
    dir.join(".data/certs/rootCA.pem")
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertInfo {
    pub has_cert: bool,
    pub has_ca: bool,
    /// This Mac's address on the local network, for a phone on Wi-Fi.
    pub lan: Option<String>,
}

/// This machine's LAN address: the source address the OS would use to reach the internet. Nothing is sent.
pub fn lan_address() -> Option<String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("192.0.2.1:9").ok()?;
    let address = socket.local_addr().ok()?.ip();
    (!address.is_loopback() && !address.is_unspecified()).then(|| address.to_string())
}

#[tauri::command]
pub fn cert_info(state: State<'_, AppState>, path: String) -> Res<CertInfo> {
    let dir = state.known_backend(&path)?;
    let plain = |name: &str| {
        std::fs::symlink_metadata(dir.join(".data/certs").join(name))
            .is_ok_and(|meta| meta.is_file())
    };
    Ok(CertInfo {
        has_cert: plain("cert.pem") && plain("key.pem"),
        has_ca: plain("rootCA.pem"),
        lan: lan_address(),
    })
}

#[tauri::command]
pub async fn engine_cli(
    state: State<'_, AppState>,
    path: String,
    action: CliAction,
) -> Res<CliOutput> {
    let dir = state.known_backend(&path)?;
    let launch = launch_for(&state)?;
    let args = action.args(&dir)?;
    let timeout = action.timeout();
    blocking(move || cli::run(&launch, &args, &dir, timeout)).await?
}

/// "Check against OpenAPI file…": a file dialog, then `check --json`. `None` when the dialog is cancelled.
#[tauri::command]
pub async fn check_openapi(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Res<Option<CliOutput>> {
    let dir = state.known_backend(&path)?;
    let launch = launch_for(&state)?;
    blocking(move || {
        let Some(file) = pick_file(&app, "Choose an OpenAPI file", "OpenAPI", &["json"]) else {
            return Ok(None);
        };
        cli::run(
            &launch,
            &cli::check_args(&dir, &file),
            &dir,
            Duration::from_secs(60),
        )
        .map(Some)
    })
    .await?
}

/// "Export backup…": a save dialog, then `snapshot export`. Returns the saved path, or `None` when cancelled.
#[tauri::command]
pub async fn export_snapshot(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Res<Option<String>> {
    let dir = state.known_backend(&path)?;
    let launch = launch_for(&state)?;
    let suggested = format!(
        "{}.zip",
        registry::display_name(&dir).replace(['/', '\\'], "-")
    );
    blocking(move || {
        let Some(file) = pick_save(&app, "Save the backup", &suggested, "zip") else {
            return Ok(None);
        };
        if let Ok(meta) = std::fs::symlink_metadata(&file) {
            if meta.file_type().is_symlink() || !meta.is_file() {
                return Err(
                    "That is a link or not a plain file, so it was not changed.".to_string()
                );
            }
        }
        let output = cli::run(
            &launch,
            &cli::snapshot_export_args(&dir, &file),
            &dir,
            Duration::from_secs(300),
        )?;
        if output.code == 0 {
            Ok(Some(file.to_string_lossy().into_owned()))
        } else {
            Err(first_line(&output.stderr, "The backup failed."))
        }
    })
    .await?
}

/// "Restore into new folder…": pick a backup, pick an empty folder, import, and add the backend.
#[tauri::command]
pub async fn restore_snapshot(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Res<Option<BackendStatus>> {
    let launch = launch_for(&state)?;
    let handle = app.clone();
    let picked = blocking(move || {
        let zip = pick_file(&handle, "Choose a backup", "Backup", &["zip"])?;
        let folder = pick_folder(&handle, "Choose an empty folder to restore into")?;
        Some((zip, folder))
    })
    .await?;
    let Some((zip, folder)) = picked else {
        return Ok(None);
    };
    let target =
        std::fs::canonicalize(&folder).map_err(|_| "That folder does not exist.".to_string())?;
    if !files::is_empty_folder(&target) {
        return Err("That folder is not empty. Restore into an empty or new folder.".to_string());
    }
    let run_target = target.clone();
    let output = blocking(move || {
        cli::run(
            &launch,
            &cli::snapshot_import_args(&zip, &run_target),
            &run_target,
            Duration::from_secs(300),
        )
    })
    .await??;
    if output.code != 0 {
        return Err(first_line(
            &output.stderr,
            "The backup could not be restored.",
        ));
    }
    register(&app, &state, &target)?;
    Ok(Some(state.fleet.status(&target)))
}

#[tauri::command]
pub async fn list_simulators(state: State<'_, AppState>) -> Res<Vec<simulators::Simulator>> {
    let login_path = state.login_path();
    blocking(move || simulators::list_booted(login_path.as_deref())).await?
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RevealTarget {
    Folder,
    Database,
}

/// "Open folder" / "Show database file": `open -R` on a verified, plain item inside the backend.
#[tauri::command]
pub fn reveal(state: State<'_, AppState>, path: String, target: RevealTarget) -> Res<()> {
    let dir = state.known_backend(&path)?;
    let item = match target {
        RevealTarget::Folder => dir.clone(),
        RevealTarget::Database => dir.join(".data/db.sqlite"),
    };
    files::reveal(&files::safe_item_in(&dir, &item).map_err(|message| {
        if matches!(target, RevealTarget::Database) {
            "The database file appears after the backend has started once.".to_string()
        } else {
            message
        }
    })?)
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum UrlTarget {
    Swagger,
    OpenApi,
}

/// Opens the backend's own docs in the browser. The URL is built here from the running engine, never from the UI.
#[tauri::command]
pub fn open_docs(state: State<'_, AppState>, path: String, target: UrlTarget) -> Res<()> {
    let dir = state.known_backend(&path)?;
    let ready = state.fleet.ready(&dir)?;
    let route = match target {
        UrlTarget::Swagger => "/__docs",
        UrlTarget::OpenApi => "/__docs/openapi.json",
    };
    files::open_url(&format!(
        "{}://localhost:{}{route}",
        ready.scheme, ready.port
    ))
}

#[tauri::command]
pub async fn create_handler(state: State<'_, AppState>, path: String, name: String) -> Res<String> {
    let dir = state.known_backend(&path)?;
    files::create_handler_file(&dir, &name)
}

/// The engine's log, newest last: the log file when there is one, else what the process printed.
#[tauri::command]
pub fn engine_log(state: State<'_, AppState>, path: String) -> Res<Vec<String>> {
    let dir = state.known_backend(&path)?;
    let from_file = files::tail_file(&dir.join(".data/logs/engine.log"), 200);
    Ok(if from_file.is_empty() {
        state.fleet.log_tail(&dir)
    } else {
        from_file
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFile {
    pub name: String,
    pub text: String,
}

/// A file dialog for importing rows (JSON or CSV). The text comes back; the path never does.
#[tauri::command]
pub async fn pick_import_file(app: AppHandle) -> Res<Option<ImportFile>> {
    blocking(move || {
        let Some(file) = pick_file(&app, "Choose a JSON or CSV file", "Rows", &["json", "csv"])
        else {
            return Ok(None);
        };
        let text = files::read_text_limited(&file, MAX_IMPORT_BYTES)?;
        let name = file
            .file_name()
            .map_or_else(String::new, |n| n.to_string_lossy().into_owned());
        Ok(Some(ImportFile { name, text }))
    })
    .await?
}

/// A file dialog for importing an API description (OpenAPI 3.x or Swagger 2.0, JSON or YAML). The text comes back;
/// the path never does. Files over 10 MB are refused here, before the engine sees them.
#[tauri::command]
pub async fn pick_api_file(app: AppHandle) -> Res<Option<ImportFile>> {
    blocking(move || {
        let Some(file) = pick_file(
            &app,
            "Choose an OpenAPI or Swagger file",
            "API description",
            &["json", "yaml", "yml"],
        ) else {
            return Ok(None);
        };
        let text = files::read_text_limited(&file, MAX_API_FILE_BYTES)?;
        let name = file
            .file_name()
            .map_or_else(String::new, |n| n.to_string_lossy().into_owned());
        Ok(Some(ImportFile { name, text }))
    })
    .await?
}

/// Saves text the UI built (an export of rows or logs) where the user chooses. Returns the path, or `None`.
#[tauri::command]
pub async fn save_export(
    app: AppHandle,
    file_name: String,
    extension: String,
    text: String,
) -> Res<Option<String>> {
    if !matches!(extension.as_str(), "json" | "csv") || text.len() > 64 * 1024 * 1024 {
        return Err("That export is not allowed.".to_string());
    }
    let safe_name: String = file_name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') {
                c
            } else {
                '-'
            }
        })
        .take(80)
        .collect();
    blocking(move || {
        let Some(target) = pick_save(
            &app,
            "Save the export",
            &format!("{safe_name}.{extension}"),
            &extension,
        ) else {
            return Ok(None);
        };
        files::safe_write(&target, text.as_bytes())?;
        Ok(Some(target.to_string_lossy().into_owned()))
    })
    .await?
}

// ---- media

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadSummary {
    pub uploaded: usize,
    pub failed: Vec<String>,
}

async fn upload_files(app: &AppHandle, ready: &Ready, paths: Vec<PathBuf>) -> UploadSummary {
    let mut summary = UploadSummary {
        uploaded: 0,
        failed: Vec::new(),
    };
    let count = paths.len();
    for (index, path) in paths.into_iter().enumerate() {
        let name = path
            .file_name()
            .map_or_else(|| "file".to_string(), |n| n.to_string_lossy().into_owned());
        let progress_app = app.clone();
        let progress_name = name.clone();
        let progress = move |sent: u64, total: u64| {
            let _ = progress_app.emit(
                "lb://upload",
                serde_json::json!({ "name": progress_name, "sent": sent, "total": total, "index": index, "count": count }),
            );
        };
        match upload_one(ready, &path, &name, progress).await {
            Ok(()) => summary.uploaded += 1,
            Err(message) => summary.failed.push(format!("{name}: {message}")),
        }
    }
    summary
}

/// Sends one file to the engine's admin `POST /media`, calling `progress(sent, total)` as chunks go out.
pub async fn upload_one(
    ready: &Ready,
    path: &Path,
    name: &str,
    progress: impl Fn(u64, u64) + Send + Sync + 'static,
) -> Res<()> {
    let meta = std::fs::symlink_metadata(path).map_err(|_| "it does not exist".to_string())?;
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Err("it is a link or a folder".to_string());
    }
    if meta.len() > MAX_UPLOAD_BYTES {
        return Err("it is larger than 512 MB".to_string());
    }
    let data =
        bytes::Bytes::from(std::fs::read(path).map_err(|_| "it could not be read".to_string())?);
    let total = data.len();
    let sent = Arc::new(AtomicU64::new(0));
    let chunks: Vec<bytes::Bytes> = (0..total)
        .step_by(CHUNK)
        .map(|start| data.slice(start..(start + CHUNK).min(total)))
        .collect();
    let stream = futures_util::stream::iter(chunks).map(move |chunk| {
        let done = sent.fetch_add(chunk.len() as u64, Ordering::SeqCst) + chunk.len() as u64;
        progress(done, total as u64);
        Ok::<_, std::io::Error>(chunk)
    });
    let response = proxy::admin_client(Some(Duration::from_secs(600)))?
        .post(format!(
            "{}{}/media?name={}",
            proxy::admin_base(ready),
            proxy::ADMIN_PREFIX,
            percent_encode(name)
        ))
        .header("x-tempo-token", ready.token())
        .header("content-type", "application/octet-stream")
        .header("content-length", total)
        .body(reqwest::Body::wrap_stream(stream))
        .send()
        .await
        .map_err(describe_error)?;
    if response.status().is_success() {
        return Ok(());
    }
    let status = response.status().as_u16();
    let body = response.text().await.unwrap_or_default();
    Err(proxy::engine_message(&HttpReply {
        status,
        body,
        ms: 0,
        content_type: None,
    }))
}

/// "Upload" button: a file dialog (several files), then each file goes to the engine.
#[tauri::command]
pub async fn upload_media(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Res<Option<UploadSummary>> {
    let dir = state.known_backend(&path)?;
    let ready = state.fleet.ready(&dir)?;
    let handle = app.clone();
    let picked = blocking(move || {
        handle
            .dialog()
            .file()
            .set_title("Choose files to upload")
            .blocking_pick_files()
            .map(|files| {
                files
                    .into_iter()
                    .filter_map(|f| f.into_path().ok())
                    .collect::<Vec<_>>()
            })
    })
    .await?;
    match picked {
        Some(paths) if !paths.is_empty() => Ok(Some(upload_files(&app, &ready, paths).await)),
        _ => Ok(None),
    }
}

/// Uploads the files that were just dropped on the window. The paths were recorded by this side.
#[tauri::command]
pub async fn upload_dropped(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Res<UploadSummary> {
    let dir = state.known_backend(&path)?;
    let ready = state.fleet.ready(&dir)?;
    let paths = state.take_dropped();
    Ok(upload_files(&app, &ready, paths).await)
}

async fn media_meta(ready: &Ready, id: &str) -> Res<(String, String)> {
    if !valid_media_id(id) {
        return Err("That is not a media id.".to_string());
    }
    let reply = proxy::admin_send(
        ready,
        HttpRequest {
            method: "GET".into(),
            path: format!("/media/{id}"),
            headers: vec![],
            body: None,
        },
    )
    .await?;
    if reply.status != 200 {
        return Err(proxy::engine_message(&reply));
    }
    let value: serde_json::Value = serde_json::from_str(&reply.body)
        .map_err(|_| "The engine sent something unexpected.".to_string())?;
    let text = |key: &str| {
        value
            .get(key)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };
    Ok((text("mime"), text("originalName")))
}

/// The bytes of an image, video or audio file, for a `blob:` URL. Anything else is refused here, whatever the UI asks.
#[tauri::command]
pub async fn media_preview(state: State<'_, AppState>, path: String, id: String) -> Res<Response> {
    let dir = state.known_backend(&path)?;
    let ready = state.fleet.ready(&dir)?;
    let (mime, _name) = media_meta(&ready, &id).await?;
    let limit =
        preview_limit(&mime).ok_or_else(|| "This type of file is not previewed.".to_string())?;
    let (status, content_type, bytes) =
        proxy::admin_bytes(&ready, &format!("/media/{id}/file"), limit).await?;
    if status != 200 {
        return Err("The file could not be loaded.".to_string());
    }
    // The answer must agree with the stored type; a mismatch is never shown.
    if content_type.as_deref().and_then(preview_limit).is_none() {
        return Err("This type of file is not previewed.".to_string());
    }
    Ok(Response::new(bytes.to_vec()))
}

/// "Download": a save dialog, then the file is written safely. Returns the saved path, or `None`.
#[tauri::command]
pub async fn download_media(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    id: String,
) -> Res<Option<String>> {
    let dir = state.known_backend(&path)?;
    let ready = state.fleet.ready(&dir)?;
    let (_mime, name) = media_meta(&ready, &id).await?;
    let suggested: String = if name.is_empty() {
        id.clone()
    } else {
        name.replace(['/', '\\'], "-")
    };
    let handle = app.clone();
    let target = blocking(move || {
        handle
            .dialog()
            .file()
            .set_title("Save the file")
            .set_file_name(suggested)
            .blocking_save_file()
            .and_then(|p| p.into_path().ok())
    })
    .await?;
    let Some(target) = target else {
        return Ok(None);
    };
    let (status, _type, bytes) =
        proxy::admin_bytes(&ready, &format!("/media/{id}/file"), 2 * 1024 * 1024 * 1024).await?;
    if status != 200 {
        return Err("The file could not be loaded.".to_string());
    }
    blocking(move || {
        files::safe_write(&target, &bytes).map(|()| Some(target.to_string_lossy().into_owned()))
    })
    .await?
}

// ---- live request log

async fn stream_once(
    app: &AppHandle,
    key: &str,
    ready: &Ready,
    last_id: &mut Option<String>,
) -> Res<()> {
    let client = proxy::admin_client(None)?;
    let mut request = client
        .get(format!(
            "{}{}/events",
            proxy::admin_base(ready),
            proxy::ADMIN_PREFIX
        ))
        .header("accept", "text/event-stream")
        .header("x-tempo-token", ready.token());
    if let Some(id) = last_id.as_deref() {
        request = request.header("last-event-id", id);
    }
    let mut response = request.send().await.map_err(describe_error)?;
    if !response.status().is_success() {
        return Err(format!(
            "The engine answered {}.",
            response.status().as_u16()
        ));
    }
    let _ = app.emit(
        "lb://events-state",
        serde_json::json!({ "backend": key, "connected": true }),
    );
    let mut parser = SseParser::default();
    while let Some(chunk) = response.chunk().await.map_err(describe_error)? {
        for message in parser.push(&chunk) {
            if message.event != "request" {
                continue;
            }
            if let Some(id) = &message.id {
                *last_id = Some(id.clone());
            }
            if let Ok(entry) = serde_json::from_str::<serde_json::Value>(&message.data) {
                let _ = app.emit(
                    "lb://request",
                    serde_json::json!({ "backend": key, "entry": entry }),
                );
            }
        }
    }
    Ok(())
}

fn stop_streams(state: &AppState, dir: &Path) {
    if let Ok(mut streams) = state.event_streams.lock() {
        if let Some(task) = streams.remove(dir.to_string_lossy().as_ref()) {
            task.abort();
        }
    }
}

/// Streams the engine's request log to the UI as `lb://request` events until `unsubscribe_requests`.
#[tauri::command]
pub fn subscribe_requests(app: AppHandle, state: State<'_, AppState>, path: String) -> Res<()> {
    let dir = state.known_backend(&path)?;
    stop_streams(&state, &dir);
    let key = dir.to_string_lossy().into_owned();
    let handle = app.clone();
    let task_key = key.clone();
    let task = tauri::async_runtime::spawn(async move {
        let mut last_id: Option<String> = None;
        let mut last_ready: Option<Ready> = None;
        loop {
            let ready = handle.state::<AppState>().fleet.ready(&dir).ok();
            if let Some(ready) = &ready {
                if last_ready.as_ref() != Some(ready) {
                    // A new engine numbers its entries from 1 again.
                    last_id = None;
                    last_ready = Some(ready.clone());
                }
                let _ = stream_once(&handle, &task_key, ready, &mut last_id).await;
            }
            let _ = handle.emit(
                "lb://events-state",
                serde_json::json!({ "backend": task_key, "connected": false }),
            );
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });
    state
        .event_streams
        .lock()
        .map_err(|_| "Internal error.".to_string())?
        .insert(key, task);
    Ok(())
}

#[tauri::command]
pub fn unsubscribe_requests(state: State<'_, AppState>, path: String) -> Res<()> {
    stop_streams(&state, &state.known_backend(&path)?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn media_ids_are_32_lowercase_hex_digits() {
        assert!(valid_media_id("0123456789abcdef0123456789abcdef"));
        for bad in [
            "",
            "../etc/passwd",
            "0123456789ABCDEF0123456789ABCDEF",
            "0123456789abcdef0123456789abcde",
            "0123456789abcdef0123456789abcdeg",
        ] {
            assert!(!valid_media_id(bad), "{bad}");
        }
    }

    #[test]
    fn only_images_video_and_audio_are_previewed() {
        for ok in [
            "image/png",
            "image/jpeg",
            "IMAGE/WEBP",
            "video/mp4",
            "audio/mpeg",
            "image/gif; charset=x",
        ] {
            assert!(preview_limit(ok).is_some(), "{ok}");
        }
        for bad in [
            "image/svg+xml",
            "image/SVG+XML",
            "text/html",
            "application/xhtml+xml",
            "application/pdf",
            "application/zip",
            "text/plain",
            "application/json",
            "",
            "application/octet-stream",
            "image/svg",
            "text/xml",
        ] {
            assert!(preview_limit(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn file_names_become_one_safe_query_value() {
        assert_eq!(
            percent_encode("a b&c=d/é.png"),
            "a%20b%26c%3Dd%2F%C3%A9.png"
        );
        assert_eq!(percent_encode("photo-1_2.JPG"), "photo-1_2.JPG");
    }

    #[test]
    fn first_line_reads_the_engines_message() {
        assert_eq!(
            first_line("\nlocal-backend-engine: bad preset\nmore", "x"),
            "bad preset"
        );
        assert_eq!(first_line("", "fallback"), "fallback");
    }

    #[test]
    fn the_lan_address_is_never_loopback() {
        if let Some(address) = lan_address() {
            assert!(!address.starts_with("127."));
        }
    }
}
