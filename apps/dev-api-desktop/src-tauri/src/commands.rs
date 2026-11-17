//! The commands the webview may call. Each one is listed in `build.rs` and in the capability file;
//! anything else is refused. Every project argument must be a folder the user opened.

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::http::{self, HttpReply, HttpRequest};
use crate::node::NodeInfo;
use crate::project::{self, ProjectKind};
use crate::recents::{self, Recent};
use crate::simulators::{self, Simulator};
use crate::state::{self, AppState};
use crate::tempo::{self, CliAction, CliOutput, Source};

type Res<T> = Result<T, String>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TempoApiInfo {
    pub source: Source,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub path: String,
    pub name: String,
    pub kind: ProjectKind,
    pub app_owned: bool,
    pub tempo_api: Option<TempoApiInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectState {
    pub running: bool,
    pub pid: Option<u32>,
    pub port: Option<u16>,
    pub scheme: Option<String>,
    /// True when this app started the server, so it stops it on quit.
    pub started_by_app: bool,
}

fn data_dir(app: &AppHandle) -> Res<PathBuf> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("No app data folder: {error}"))
}

fn workspaces_dir(app: &AppHandle) -> Res<PathBuf> {
    Ok(data_dir(app)?.join("workspaces"))
}

fn folder_name(path: &Path) -> String {
    path.file_name().map_or_else(
        || path.to_string_lossy().into_owned(),
        |name| name.to_string_lossy().into_owned(),
    )
}

fn describe(app: &AppHandle, path: &Path, app_owned: bool) -> Res<ProjectInfo> {
    let kind = project::detect_kind(path)
        .ok_or("This folder has no api/tempo-api.config.ts or tempo-api.json. Pick another folder or create a workspace.")?;
    let tempo_api = tempo::select(path, state::resource_dir(app).as_deref())
        .ok()
        .map(|selected| TempoApiInfo {
            version: tempo::project_version(&selected),
            source: selected.source,
        });
    Ok(ProjectInfo {
        path: path.to_string_lossy().into_owned(),
        name: folder_name(path),
        kind,
        app_owned,
        tempo_api,
    })
}

#[tauri::command]
pub async fn node_info(app: AppHandle, refresh: bool) -> Res<NodeInfo> {
    tauri::async_runtime::spawn_blocking(move || app.state::<AppState>().node(refresh))
        .await
        .map_err(|_| "The Node lookup failed.".to_string())
}

#[tauri::command]
pub fn list_recents(app: AppHandle, state: State<'_, AppState>) -> Res<Vec<Recent>> {
    let items = recents::load(&data_dir(&app)?);
    for item in &items {
        if let Ok(path) = std::fs::canonicalize(&item.path) {
            state.remember(&path);
        }
    }
    Ok(items)
}

#[tauri::command]
pub fn open_project(app: AppHandle, state: State<'_, AppState>, path: String) -> Res<ProjectInfo> {
    let canonical =
        std::fs::canonicalize(&path).map_err(|_| "That folder does not exist.".to_string())?;
    if !canonical.is_dir() {
        return Err("Pick a folder.".to_string());
    }
    let owned = canonical.starts_with(workspaces_dir(&app)?);
    let info = describe(&app, &canonical, owned)?;
    state.remember(&canonical);
    recents::add(
        &data_dir(&app)?,
        Recent {
            path: info.path.clone(),
            name: info.name.clone(),
            kind: recents::kind_name(info.kind).to_string(),
            app_owned: owned,
        },
    )?;
    Ok(info)
}

#[tauri::command]
pub fn remove_recent(app: AppHandle, path: String) -> Res<Vec<Recent>> {
    recents::remove(&data_dir(&app)?, &path)
}

/// Creates a standalone workspace: a folder with a starter `tempo-api.json`. Without `parent` it goes
/// in the app's own data folder.
#[tauri::command]
pub fn create_workspace(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    parent: Option<String>,
) -> Res<ProjectInfo> {
    let folder = project::safe_folder_name(&name).ok_or(
        "Use letters, digits, spaces, dots, dashes and underscores (64 characters at most).",
    )?;
    let base = match parent {
        Some(parent) => {
            std::fs::canonicalize(&parent).map_err(|_| "That folder does not exist.".to_string())?
        }
        None => {
            let dir = workspaces_dir(&app)?;
            std::fs::create_dir_all(&dir)
                .map_err(|error| format!("Could not create the workspaces folder: {error}"))?;
            std::fs::canonicalize(dir).map_err(|error| error.to_string())?
        }
    };
    let target = base.join(&folder);
    if target.join(project::WORKSPACE_FILE).exists() {
        return Err("A workspace with that name already exists there.".to_string());
    }
    std::fs::create_dir_all(&target)
        .map_err(|error| format!("Could not create the folder: {error}"))?;
    std::fs::write(
        target.join(project::WORKSPACE_FILE),
        project::starter_workspace(&folder),
    )
    .map_err(|error| format!("Could not write the workspace: {error}"))?;
    open_project(app, state, target.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn project_state(state: State<'_, AppState>, path: String) -> Res<ProjectState> {
    let project = state.known_project(&path)?;
    let started_by_app = state.is_tracked(&project);
    let Some(conn) = project::connection(&project) else {
        return Ok(ProjectState {
            running: false,
            pid: None,
            port: None,
            scheme: None,
            started_by_app,
        });
    };
    let running = http::is_dev_api(&conn).await;
    Ok(ProjectState {
        running,
        pid: running.then_some(conn.pid),
        port: running.then_some(conn.port),
        scheme: running.then(|| if conn.https { "https" } else { "http" }.to_string()),
        started_by_app,
    })
}

/// Runs one of the fixed CLI commands for a project.
#[tauri::command]
pub async fn cli(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    action: CliAction,
) -> Res<CliOutput> {
    let project = state.known_project(&path)?;
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<AppState>();
        state::run_action(&handle, &state, &project, &action)
    })
    .await
    .map_err(|_| "The command stopped unexpectedly.".to_string())?
}

/// One request to the project's running server, made from Rust so the project CA is trusted.
#[tauri::command]
pub async fn control(
    state: State<'_, AppState>,
    path: String,
    request: HttpRequest,
) -> Res<HttpReply> {
    let project = state.known_project(&path)?;
    let conn = project::connection(&project).ok_or("The dev API is not running.")?;
    http::send(&conn, request).await
}

async fn stream_once(
    app: &AppHandle,
    key: &str,
    conn: &project::Connection,
    last_id: &mut Option<String>,
) -> Res<()> {
    let client = http::client(conn, None)?;
    let mut request = client
        .get(format!("{}/__tempo/events", http::base_url(conn)))
        .header("accept", "text/event-stream");
    if let Some(token) = &conn.token {
        request = request.header(http::CONTROL_HEADER, token.as_str());
    }
    if let Some(id) = last_id.as_deref() {
        request = request.header("last-event-id", id);
    }
    let mut response = request.send().await.map_err(http::describe_error)?;
    if !response.status().is_success() {
        return Err(format!(
            "The server answered {}.",
            response.status().as_u16()
        ));
    }
    let _ = app.emit(
        "tempo://events-state",
        serde_json::json!({ "project": key, "connected": true }),
    );
    let mut parser = http::SseParser::default();
    while let Some(chunk) = response.chunk().await.map_err(http::describe_error)? {
        for message in parser.push(&chunk) {
            if message.event != "request" {
                continue;
            }
            if let Some(id) = &message.id {
                *last_id = Some(id.clone());
            }
            if let Ok(entry) = serde_json::from_str::<serde_json::Value>(&message.data) {
                let _ = app.emit(
                    "tempo://request",
                    serde_json::json!({ "project": key, "entry": entry }),
                );
            }
        }
    }
    Ok(())
}

/// Streams the server's request log to the UI as `tempo://request` events until `unsubscribe_events`.
/// Rust reads the stream, so over HTTPS it is the project CA that is trusted.
#[tauri::command]
pub fn subscribe_events(app: AppHandle, state: State<'_, AppState>, path: String) -> Res<()> {
    let project = state.known_project(&path)?;
    let key = project.to_string_lossy().into_owned();
    let mut streams = state
        .streams
        .lock()
        .map_err(|_| "Internal error.".to_string())?;
    if let Some(old) = streams.remove(&key) {
        old.abort();
    }
    let handle = app.clone();
    let task_key = key.clone();
    streams.insert(
        key,
        tauri::async_runtime::spawn(async move {
            let mut last_id: Option<String> = None;
            let mut last_pid: Option<u32> = None;
            loop {
                if let Some(conn) = project::connection(&project) {
                    if last_pid != Some(conn.pid) {
                        // A new server numbers its entries from 1 again.
                        last_id = None;
                        last_pid = Some(conn.pid);
                    }
                    let _ = stream_once(&handle, &task_key, &conn, &mut last_id).await;
                }
                let _ = handle.emit(
                    "tempo://events-state",
                    serde_json::json!({ "project": task_key, "connected": false }),
                );
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }),
    );
    Ok(())
}

#[tauri::command]
pub fn unsubscribe_events(state: State<'_, AppState>, path: String) -> Res<()> {
    let project = state.known_project(&path)?;
    let mut streams = state
        .streams
        .lock()
        .map_err(|_| "Internal error.".to_string())?;
    if let Some(task) = streams.remove(project.to_string_lossy().as_ref()) {
        task.abort();
    }
    Ok(())
}

#[tauri::command]
pub async fn list_booted_simulators(state: State<'_, AppState>) -> Res<Vec<Simulator>> {
    let login_path = state.node(false).login_path;
    tauri::async_runtime::spawn_blocking(move || simulators::list_booted(login_path.as_deref()))
        .await
        .map_err(|_| "The simulator lookup stopped unexpectedly.".to_string())?
}

#[tauri::command]
pub fn read_workspace(state: State<'_, AppState>, path: String) -> Res<String> {
    let project = state.known_project(&path)?;
    std::fs::read_to_string(project.join(project::WORKSPACE_FILE))
        .map_err(|_| "This project has no tempo-api.json.".to_string())
}

/// Writes `tempo-api.json` in `dir` through a temp file with a fresh random-ish name, created with
/// `create_new` (which fails on anything that already exists, a symlink included), then renamed over
/// the target. Refuses when the target itself is a symlink.
pub fn write_workspace_file(dir: &Path, text: &str) -> Res<()> {
    use std::io::Write;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let target = dir.join(project::WORKSPACE_FILE);
    let meta = std::fs::symlink_metadata(&target)
        .map_err(|_| "This project has no tempo-api.json.".to_string())?;
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Err("tempo-api.json is not a regular file, so it was not changed.".to_string());
    }
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_nanos());
    for _ in 0..8 {
        let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
        let temp = dir.join(format!(
            ".tempo-api.{}.{nanos:x}.{unique}.tmp",
            std::process::id()
        ));
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
        {
            Ok(mut file) => {
                let written = file
                    .write_all(text.as_bytes())
                    .and_then(|()| file.sync_all());
                drop(file);
                let result = written.and_then(|()| std::fs::rename(&temp, &target));
                if result.is_err() {
                    let _ = std::fs::remove_file(&temp);
                }
                return result.map_err(|error| format!("Could not save: {error}"));
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(format!("Could not save: {error}")),
        }
    }
    Err("Could not save: no free temp file name.".to_string())
}

/// Saves `tempo-api.json`. The UI validates it against the dev API's schema first; this only checks
/// that it is JSON.
#[tauri::command]
pub fn write_workspace(state: State<'_, AppState>, path: String, text: String) -> Res<()> {
    let project = state.known_project(&path)?;
    serde_json::from_str::<serde_json::Value>(&text)
        .map_err(|_| "That is not valid JSON.".to_string())?;
    write_workspace_file(&project, &text)
}

#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OpenTarget {
    Swagger,
    OpenApi,
    Folder,
    GeneratedFolder,
}

/// A folder inside the project that is safe to show: not a symlink, and still inside the project
/// after resolving. A project could otherwise point `api/generated` anywhere, or at a bundle.
pub fn safe_folder_in(project: &Path, folder: &Path) -> Res<PathBuf> {
    let meta =
        std::fs::symlink_metadata(folder).map_err(|_| "That folder does not exist.".to_string())?;
    if meta.file_type().is_symlink() || !meta.is_dir() {
        return Err("That is not a plain folder, so it was not opened.".to_string());
    }
    let canonical =
        std::fs::canonicalize(folder).map_err(|_| "That folder does not exist.".to_string())?;
    let root =
        std::fs::canonicalize(project).map_err(|_| "That folder does not exist.".to_string())?;
    if canonical.starts_with(&root) {
        Ok(canonical)
    } else {
        Err("That folder is outside the project, so it was not opened.".to_string())
    }
}

/// The program and arguments that show a verified folder. On macOS it is a Finder reveal (`open -R`),
/// which selects the item and never launches it, even when the name ends in `.app`.
pub fn reveal_command(folder: &str) -> (&'static str, Vec<String>) {
    if cfg!(target_os = "macos") {
        ("open", vec!["-R".to_string(), folder.to_string()])
    } else if cfg!(windows) {
        ("explorer", vec![folder.to_string()])
    } else {
        ("xdg-open", vec![folder.to_string()])
    }
}

fn reveal_folder(folder: &Path) -> Res<()> {
    let (program, args) = reveal_command(&folder.to_string_lossy());
    std::process::Command::new(program)
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(|_| "Could not open that.".to_string())
}

fn open_url(url: &str) -> Res<()> {
    let (program, args): (&str, Vec<&str>) = if cfg!(target_os = "macos") {
        ("open", vec![url])
    } else if cfg!(windows) {
        ("explorer", vec![url])
    } else {
        ("xdg-open", vec![url])
    };
    std::process::Command::new(program)
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(|_| "Could not open that.".to_string())
}

/// Opens a fixed target in the system browser or file manager. The URL is built here from the
/// server's own pid record, never taken from the UI.
#[tauri::command]
pub fn open_target(state: State<'_, AppState>, path: String, target: OpenTarget) -> Res<()> {
    let project = state.known_project(&path)?;
    match target {
        OpenTarget::Folder => reveal_folder(&safe_folder_in(&project, &project)?),
        OpenTarget::GeneratedFolder => {
            let folder = project.join("api").join("generated");
            let folder = if folder.exists() {
                folder
            } else {
                project.join("generated")
            };
            if !folder.exists() {
                return Err("Nothing has been generated yet.".to_string());
            }
            reveal_folder(&safe_folder_in(&project, &folder)?)
        }
        OpenTarget::Swagger | OpenTarget::OpenApi => {
            let conn = project::connection(&project).ok_or("The dev API is not running.")?;
            let route = if matches!(target, OpenTarget::Swagger) {
                "/docs"
            } else {
                "/docs/openapi.json"
            };
            open_url(&format!(
                "{}://localhost:{}{route}",
                if conn.https { "https" } else { "http" },
                conn.port
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[cfg(unix)]
    use std::os::unix::fs::symlink;

    #[test]
    fn accepts_a_plain_folder_inside_the_project() {
        let project = tempdir().unwrap();
        let inner = project.path().join("api/generated");
        fs::create_dir_all(&inner).unwrap();
        let safe = safe_folder_in(project.path(), &inner).unwrap();
        assert!(safe.starts_with(fs::canonicalize(project.path()).unwrap()));
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlinked_folder() {
        let project = tempdir().unwrap();
        let elsewhere = tempdir().unwrap();
        fs::create_dir_all(project.path().join("api")).unwrap();
        let link = project.path().join("api/generated");
        symlink(elsewhere.path(), &link).unwrap();
        assert!(safe_folder_in(project.path(), &link).is_err());
    }

    #[test]
    fn refuses_a_folder_outside_the_project_and_plain_files() {
        let project = tempdir().unwrap();
        let outside = tempdir().unwrap();
        assert!(safe_folder_in(project.path(), outside.path()).is_err());
        let file = project.path().join("a.txt");
        fs::write(&file, "x").unwrap();
        assert!(safe_folder_in(project.path(), &file).is_err());
        assert!(safe_folder_in(project.path(), &project.path().join("missing")).is_err());
    }

    #[test]
    fn a_bundle_named_folder_is_only_revealed_on_macos() {
        let (program, args) = reveal_command("/p/Evil.app");
        if cfg!(target_os = "macos") {
            assert_eq!(
                (program, args.as_slice()),
                (
                    "open",
                    ["-R".to_string(), "/p/Evil.app".to_string()].as_slice()
                )
            );
        } else {
            assert!(!args.is_empty());
        }
    }

    fn workspace(dir: &Path) {
        fs::write(dir.join(project::WORKSPACE_FILE), "{}").unwrap();
    }

    #[test]
    fn saves_through_a_temp_file_and_leaves_none_behind() {
        let dir = tempdir().unwrap();
        workspace(dir.path());
        write_workspace_file(dir.path(), "{\"name\":\"x\"}").unwrap();
        assert_eq!(
            fs::read_to_string(dir.path().join("tempo-api.json")).unwrap(),
            "{\"name\":\"x\"}"
        );
        let names: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert_eq!(names.len(), 1);
    }

    #[test]
    fn refuses_when_there_is_no_workspace_file() {
        let dir = tempdir().unwrap();
        assert!(write_workspace_file(dir.path(), "{}").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlinked_workspace_file() {
        let dir = tempdir().unwrap();
        let victim = tempdir().unwrap();
        let target = victim.path().join("victim.txt");
        fs::write(&target, "keep").unwrap();
        symlink(&target, dir.path().join("tempo-api.json")).unwrap();
        assert!(write_workspace_file(dir.path(), "{}").is_err());
        assert_eq!(fs::read_to_string(&target).unwrap(), "keep");
    }

    #[cfg(unix)]
    #[test]
    fn a_planted_tmp_symlink_cannot_redirect_the_write() {
        let dir = tempdir().unwrap();
        let victim = tempdir().unwrap();
        let target = victim.path().join("victim.txt");
        fs::write(&target, "keep").unwrap();
        workspace(dir.path());
        // The old fixed name, and a guess at others.
        symlink(&target, dir.path().join("tempo-api.json.tmp")).unwrap();
        write_workspace_file(dir.path(), "{\"a\":1}").unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "keep");
        assert_eq!(
            fs::read_to_string(dir.path().join("tempo-api.json")).unwrap(),
            "{\"a\":1}"
        );
    }
}
