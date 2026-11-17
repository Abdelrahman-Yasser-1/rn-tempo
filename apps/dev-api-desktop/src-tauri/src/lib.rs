/// Starts the app. The real shell is added in the next commit.
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running the desktop app");
}
