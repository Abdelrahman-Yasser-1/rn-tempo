//! File rules shared by the commands. Every write refuses symlinks and never follows one, and every reveal
//! stays inside the backend folder.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub type Res<T> = Result<T, String>;

/// Writes `bytes` to `target` through a temp file made with `create_new` in the same folder (which fails on
/// anything that already exists, a symlink included), then renames it over the target. Refuses a target that
/// is a symlink or is not a regular file.
pub fn safe_write(target: &Path, bytes: &[u8]) -> Res<()> {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let dir = target.parent().ok_or("That is not a file path.")?;
    let name = target
        .file_name()
        .ok_or("That is not a file path.")?
        .to_string_lossy()
        .into_owned();
    if let Ok(meta) = std::fs::symlink_metadata(target) {
        if meta.file_type().is_symlink() || !meta.is_file() {
            return Err("That is a link or not a plain file, so it was not changed.".to_string());
        }
    }
    let dir_meta = std::fs::symlink_metadata(dir).map_err(|_| "That folder does not exist.")?;
    if dir_meta.file_type().is_symlink() || !dir_meta.is_dir() {
        return Err("That folder is a link, so nothing was written there.".to_string());
    }
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_nanos());
    for _ in 0..8 {
        let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
        let temp = dir.join(format!(
            ".{name}.{}.{nanos:x}.{unique}.tmp",
            std::process::id()
        ));
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
        {
            Ok(mut file) => {
                let written = file.write_all(bytes).and_then(|()| file.sync_all());
                drop(file);
                let result = written.and_then(|()| std::fs::rename(&temp, target));
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

/// Creates a new file and fails when anything (a symlink too) is already there.
pub fn create_new_file(target: &Path, bytes: &[u8]) -> Res<()> {
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                "A file with that name already exists, so it was not changed.".to_string()
            } else {
                format!("Could not create the file: {error}")
            }
        })?;
    file.write_all(bytes)
        .and_then(|()| file.sync_all())
        .map_err(|error| format!("Could not write the file: {error}"))
}

/// A file or folder that is safe to show: not a symlink, and still inside `root` after resolving.
pub fn safe_item_in(root: &Path, item: &Path) -> Res<PathBuf> {
    let meta = std::fs::symlink_metadata(item).map_err(|_| "That does not exist yet.")?;
    if meta.file_type().is_symlink() || !(meta.is_dir() || meta.is_file()) {
        return Err("That is a link or a special file, so it was not opened.".to_string());
    }
    let canonical = std::fs::canonicalize(item).map_err(|_| "That does not exist yet.")?;
    let base = std::fs::canonicalize(root).map_err(|_| "The backend folder does not exist.")?;
    if canonical.starts_with(&base) {
        Ok(canonical)
    } else {
        Err("That is outside the backend folder, so it was not opened.".to_string())
    }
}

/// The program and arguments that show a verified item. On macOS it is a Finder reveal (`open -R`), which
/// selects the item and never launches it, even when the name ends in `.app`.
pub fn reveal_command(item: &str) -> (&'static str, Vec<String>) {
    if cfg!(target_os = "macos") {
        ("open", vec!["-R".to_string(), item.to_string()])
    } else if cfg!(windows) {
        ("explorer", vec![item.to_string()])
    } else {
        ("xdg-open", vec![item.to_string()])
    }
}

pub fn reveal(item: &Path) -> Res<()> {
    let (program, args) = reveal_command(&item.to_string_lossy());
    std::process::Command::new(program)
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(|_| "Could not open that.".to_string())
}

pub fn open_url(url: &str) -> Res<()> {
    let program = if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(windows) {
        "explorer"
    } else {
        "xdg-open"
    };
    std::process::Command::new(program)
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|_| "Could not open that.".to_string())
}

/// True for a folder that is empty (a lone `.DS_Store` does not count).
pub fn is_empty_folder(dir: &Path) -> bool {
    std::fs::read_dir(dir).is_ok_and(|entries| {
        entries
            .filter_map(Result::ok)
            .all(|entry| entry.file_name() == ".DS_Store")
    })
}

/// `name.js`, `name.mjs` or `name.cjs` with a plain name: what a new handler file may be called.
pub fn handler_file_ok(name: &str) -> bool {
    let Some((stem, ext)) = name.rsplit_once('.') else {
        return false;
    };
    matches!(ext, "js" | "mjs" | "cjs")
        && !stem.is_empty()
        && stem.len() <= 64
        && stem
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
        && stem
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphanumeric() || c == '_')
        && !stem.contains("..")
}

pub const HANDLER_EXAMPLE: &str = "// A handler answers requests with your own code. It is trusted code, not a sandbox.\n\
export default async function (ctx) {\n  ctx.log.info('handler called', { method: ctx.req.method });\n  return { status: 200, body: { ok: true, path: ctx.req.path } };\n}\n";

/// Creates `handlers/<name>` in a backend from the example. The folder must be a real folder.
pub fn create_handler_file(backend: &Path, name: &str) -> Res<String> {
    if !handler_file_ok(name) {
        return Err(
            "Use a plain name such as hello.js (letters, digits, dash, underscore).".to_string(),
        );
    }
    let dir = backend.join("handlers");
    match std::fs::symlink_metadata(&dir) {
        Ok(meta) if meta.file_type().is_symlink() || !meta.is_dir() => {
            return Err("The handlers folder is a link, so nothing was written there.".to_string())
        }
        Ok(_) => {}
        Err(_) => std::fs::create_dir(&dir)
            .map_err(|error| format!("Could not create the handlers folder: {error}"))?,
    }
    create_new_file(&dir.join(name), HANDLER_EXAMPLE.as_bytes())?;
    Ok(format!("handlers/{name}"))
}

/// Reads a regular file (never a link) as text, up to `max` bytes.
pub fn read_text_limited(path: &Path, max: u64) -> Res<String> {
    let meta = std::fs::symlink_metadata(path).map_err(|_| "That file does not exist.")?;
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Err("Pick a plain file.".to_string());
    }
    if meta.len() > max {
        return Err("That file is too large.".to_string());
    }
    String::from_utf8(std::fs::read(path).map_err(|_| "Could not read that file.")?)
        .map_err(|_| "That file is not text.".to_string())
}

/// The last `lines` lines of a log file, or nothing when it is missing or a link.
pub fn tail_file(path: &Path, lines: usize) -> Vec<String> {
    let Ok(meta) = std::fs::symlink_metadata(path) else {
        return Vec::new();
    };
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Vec::new();
    }
    use std::io::{Read, Seek, SeekFrom};
    let Ok(mut file) = std::fs::File::open(path) else {
        return Vec::new();
    };
    let start = meta.len().saturating_sub(256 * 1024);
    if file.seek(SeekFrom::Start(start)).is_err() {
        return Vec::new();
    }
    let mut text = String::new();
    let _ = file.take(256 * 1024).read_to_string(&mut text);
    let all: Vec<&str> = text.lines().collect();
    let skip = all.len().saturating_sub(lines);
    all.into_iter()
        .skip(skip)
        .map(|line| line.chars().take(600).collect())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[cfg(unix)]
    use std::os::unix::fs::symlink;

    #[test]
    fn writes_through_a_temp_file_and_leaves_none_behind() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("out.json");
        safe_write(&target, b"one").unwrap();
        safe_write(&target, b"two").unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "two");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlinked_target_and_a_planted_temp_link() {
        let dir = tempdir().unwrap();
        let victim = tempdir().unwrap();
        let secret = victim.path().join("victim.txt");
        fs::write(&secret, "keep").unwrap();
        symlink(&secret, dir.path().join("out.json")).unwrap();
        assert!(safe_write(&dir.path().join("out.json"), b"x").is_err());
        let other = dir.path().join("fresh.json");
        symlink(&secret, dir.path().join(".fresh.json.tmp")).unwrap();
        safe_write(&other, b"ok").unwrap();
        assert_eq!(fs::read_to_string(&secret).unwrap(), "keep");
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlinked_folder() {
        let real = tempdir().unwrap();
        let holder = tempdir().unwrap();
        symlink(real.path(), holder.path().join("link")).unwrap();
        assert!(safe_write(&holder.path().join("link/a.txt"), b"x").is_err());
        assert_eq!(fs::read_dir(real.path()).unwrap().count(), 0);
    }

    #[test]
    fn create_new_never_overwrites() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("a.js");
        create_new_file(&file, b"1").unwrap();
        assert!(create_new_file(&file, b"2")
            .unwrap_err()
            .contains("already exists"));
        assert_eq!(fs::read_to_string(&file).unwrap(), "1");
    }

    #[test]
    fn reveals_only_plain_items_inside_the_backend() {
        let backend = tempdir().unwrap();
        let outside = tempdir().unwrap();
        fs::create_dir_all(backend.path().join(".data")).unwrap();
        let db = backend.path().join(".data/db.sqlite");
        fs::write(&db, "x").unwrap();
        assert!(safe_item_in(backend.path(), &db)
            .unwrap()
            .ends_with("db.sqlite"));
        assert!(safe_item_in(backend.path(), outside.path()).is_err());
        assert!(safe_item_in(backend.path(), &backend.path().join("missing")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn refuses_to_reveal_a_symlink() {
        let backend = tempdir().unwrap();
        let outside = tempdir().unwrap();
        fs::write(outside.path().join("db"), "x").unwrap();
        symlink(outside.path().join("db"), backend.path().join("db.sqlite")).unwrap();
        assert!(safe_item_in(backend.path(), &backend.path().join("db.sqlite")).is_err());
    }

    #[test]
    fn a_bundle_named_item_is_only_revealed_on_macos() {
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

    #[test]
    fn handler_names_are_plain() {
        for ok in ["hello.js", "a-b_c.mjs", "x.cjs", "v1.2.js"] {
            assert!(handler_file_ok(ok), "{ok}");
        }
        for bad in [
            "", ".js", "a/b.js", "../a.js", "a.ts", "a b.js", "..js", "a..b.js", "-a.js", "x.js\n",
        ] {
            assert!(!handler_file_ok(bad), "{bad:?}");
        }
    }

    #[test]
    fn creates_a_handler_from_the_example() {
        let backend = tempdir().unwrap();
        assert_eq!(
            create_handler_file(backend.path(), "hello.js").unwrap(),
            "handlers/hello.js"
        );
        assert!(fs::read_to_string(backend.path().join("handlers/hello.js"))
            .unwrap()
            .contains("export default"));
        assert!(create_handler_file(backend.path(), "hello.js").is_err());
        assert!(create_handler_file(backend.path(), "../x.js").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn a_symlinked_handlers_folder_is_refused() {
        let backend = tempdir().unwrap();
        let elsewhere = tempdir().unwrap();
        symlink(elsewhere.path(), backend.path().join("handlers")).unwrap();
        assert!(create_handler_file(backend.path(), "a.js").is_err());
        assert_eq!(fs::read_dir(elsewhere.path()).unwrap().count(), 0);
    }

    #[test]
    fn folder_emptiness_and_limited_reads() {
        let dir = tempdir().unwrap();
        assert!(is_empty_folder(dir.path()));
        fs::write(dir.path().join(".DS_Store"), "").unwrap();
        assert!(is_empty_folder(dir.path()));
        fs::write(dir.path().join("a.csv"), "a,b\n1,2\n").unwrap();
        assert!(!is_empty_folder(dir.path()));
        assert_eq!(
            read_text_limited(&dir.path().join("a.csv"), 100).unwrap(),
            "a,b\n1,2\n"
        );
        assert!(read_text_limited(&dir.path().join("a.csv"), 3).is_err());
        assert!(read_text_limited(dir.path(), 100).is_err());
    }

    #[test]
    fn tails_the_last_lines() {
        let dir = tempdir().unwrap();
        let log = dir.path().join("engine.log");
        fs::write(&log, (0..10).map(|n| format!("l{n}\n")).collect::<String>()).unwrap();
        assert_eq!(tail_file(&log, 3), ["l7", "l8", "l9"]);
        assert!(tail_file(&dir.path().join("none"), 3).is_empty());
    }
}
