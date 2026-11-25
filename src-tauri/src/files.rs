//! File drop: describe what was dropped on Paperclip and zip it on request.
//!
//! Security shape: the paths come ONLY from the OS drag-drop event (`handle_drag_drop`), are validated there and
//! kept in Rust state. The frontend never sends a path back: `zip_dropped` zips whatever was last dropped and
//! `reveal_zip` reveals the zip this module itself wrote. JS only ever sees names, sizes and kinds.

use serde::Serialize;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{DragDropEvent, Emitter, Manager, State, Window};

/// Most items one drop may carry; more is almost certainly not something to zip from a paperclip.
const MAX_ITEMS: usize = 200;
/// Directory walks stop counting size after this many entries (the label is only an estimate then).
const MAX_WALK: usize = 20_000;

#[derive(Default)]
pub struct DropState {
    paths: Mutex<Vec<PathBuf>>,
    last_zip: Mutex<Option<PathBuf>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DragPayload {
    phase: &'static str, // "enter" | "over" | "leave"
    x: f64,              // logical px relative to the window
    y: f64,
}

#[derive(Clone, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DropInfo {
    pub count: usize,
    pub name: String,
    pub kind: String,
    pub bytes: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DroppedPayload {
    #[serde(flatten)]
    info: DropInfo,
    x: f64,
    y: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZipDone {
    pub name: String,
}

/// Called from the window event handler for every OS drag event over the window.
pub fn handle_drag_drop(window: &Window, event: &DragDropEvent) {
    let scale = window.scale_factor().unwrap_or(1.0);
    let logical = |p: &tauri::PhysicalPosition<f64>| (p.x / scale, p.y / scale);
    let app = window.app_handle();
    match event {
        DragDropEvent::Enter { position, .. } => {
            let (x, y) = logical(position);
            let _ = app.emit_to("main", "file-drag", DragPayload { phase: "enter", x, y });
        }
        DragDropEvent::Over { position } => {
            let (x, y) = logical(position);
            let _ = app.emit_to("main", "file-drag", DragPayload { phase: "over", x, y });
        }
        DragDropEvent::Leave => {
            let _ = app.emit_to("main", "file-drag", DragPayload { phase: "leave", x: 0.0, y: 0.0 });
        }
        DragDropEvent::Drop { paths, position } => {
            let (x, y) = logical(position);
            let valid = validate(paths);
            let info = describe(&valid);
            if let Some(state) = app.try_state::<DropState>() {
                if let Ok(mut g) = state.paths.lock() {
                    *g = valid;
                }
            }
            match info {
                Some(info) => {
                    let _ = app.emit_to("main", "files-dropped", DroppedPayload { info, x, y });
                }
                None => {
                    let _ = app.emit_to("main", "file-drag", DragPayload { phase: "leave", x: 0.0, y: 0.0 });
                }
            }
        }
        _ => {}
    }
}

/// Keeps absolute paths that exist and are not symlinks at the top level; canonicalises them.
fn validate(paths: &[PathBuf]) -> Vec<PathBuf> {
    paths
        .iter()
        .take(MAX_ITEMS)
        .filter(|p| p.is_absolute())
        .filter(|p| fs::symlink_metadata(p).map(|m| !m.file_type().is_symlink()).unwrap_or(false))
        .filter_map(|p| fs::canonicalize(p).ok())
        .collect()
}

fn describe(paths: &[PathBuf]) -> Option<DropInfo> {
    let first = paths.first()?;
    let meta = fs::metadata(first).ok()?;
    let name = first.file_name()?.to_string_lossy().into_owned();
    let kind = if meta.is_dir() {
        "folder".to_string()
    } else {
        first.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
    };
    let mut budget = MAX_WALK;
    let bytes = paths.iter().map(|p| size_of(p, &mut budget)).sum();
    Some(DropInfo { count: paths.len(), name, kind, bytes })
}

fn size_of(p: &Path, budget: &mut usize) -> u64 {
    let Ok(meta) = fs::symlink_metadata(p) else { return 0 };
    if meta.file_type().is_symlink() {
        return 0;
    }
    if meta.is_file() {
        return meta.len();
    }
    if !meta.is_dir() || *budget == 0 {
        return 0;
    }
    let Ok(rd) = fs::read_dir(p) else { return 0 };
    let mut total = 0;
    for e in rd.flatten() {
        if *budget == 0 {
            break;
        }
        *budget -= 1;
        total += size_of(&e.path(), budget);
    }
    total
}

/// Opens `<dir>/<base>`, or `<dir>/<stem> 2.zip`, `<stem> 3.zip`... Never overwrites (create_new is atomic).
fn create_unique(dir: &Path, base: &str) -> io::Result<(File, PathBuf)> {
    let stem = base.strip_suffix(".zip").unwrap_or(base);
    for n in 1..10_000u32 {
        let name = if n == 1 { base.to_string() } else { format!("{stem} {n}.zip") };
        let path = dir.join(name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(f) => return Ok((f, path)),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(io::Error::new(io::ErrorKind::AlreadyExists, "too many zips with that name"))
}

fn file_options(meta: &fs::Metadata) -> zip::write::SimpleFileOptions {
    let o = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        o.unix_permissions(meta.permissions().mode() & 0o7777)
    }
    #[cfg(not(unix))]
    {
        let _ = meta;
        o
    }
}

fn add_tree<W: Write + io::Seek>(zw: &mut zip::ZipWriter<W>, path: &Path, name: &str, skip: &Path) -> io::Result<()> {
    let meta = fs::symlink_metadata(path)?;
    if meta.file_type().is_symlink() || path == skip {
        return Ok(()); // links could point anywhere (or loop); the zip itself must not contain itself
    }
    if meta.is_dir() {
        zw.add_directory(format!("{name}/"), file_options(&meta)).map_err(io::Error::other)?;
        let mut kids: Vec<_> = fs::read_dir(path)?.flatten().map(|e| e.path()).collect();
        kids.sort();
        for k in kids {
            let kn = k.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            add_tree(zw, &k, &format!("{name}/{kn}"), skip)?;
        }
    } else if meta.is_file() {
        zw.start_file(name, file_options(&meta)).map_err(io::Error::other)?;
        io::copy(&mut File::open(path)?, zw)?;
    }
    Ok(())
}

/// Zips `paths` next to the first one: `<name>.zip` for one item, `Archive.zip` for several. Returns the zip's path.
pub fn zip_paths(paths: &[PathBuf]) -> io::Result<PathBuf> {
    let first = paths.first().ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "nothing to zip"))?;
    let dir = first.parent().ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "no parent folder"))?;
    let base = if paths.len() == 1 {
        format!("{}.zip", first.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "Archive".into()))
    } else {
        "Archive.zip".to_string()
    };
    let (file, out) = create_unique(dir, &base)?;
    let result = (|| {
        let mut zw = zip::ZipWriter::new(file);
        let mut used: Vec<String> = Vec::new();
        for p in paths {
            let mut name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            let mut n = 2;
            while used.contains(&name) {
                let orig = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                name = format!("{orig} {n}");
                n += 1;
            }
            used.push(name.clone());
            add_tree(&mut zw, p, &name, &out)?;
        }
        zw.finish().map_err(io::Error::other)?;
        Ok(())
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&out); // only the file we just created
        return Err(e);
    }
    Ok(out)
}

#[tauri::command]
pub async fn zip_dropped(state: State<'_, DropState>) -> Result<ZipDone, String> {
    let paths = state.paths.lock().map(|g| g.clone()).map_err(|e| e.to_string())?;
    if paths.is_empty() {
        return Err("nothing was dropped".into());
    }
    let out = tauri::async_runtime::spawn_blocking(move || zip_paths(&paths))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    let name = out.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    if let Ok(mut g) = state.last_zip.lock() {
        *g = Some(out);
    }
    Ok(ZipDone { name })
}

/// Forget the dropped paths (he was told no, or the offer timed out).
#[tauri::command]
pub fn clear_dropped(state: State<'_, DropState>) {
    if let Ok(mut g) = state.paths.lock() {
        g.clear();
    }
}

/// Show the zip this module wrote in the file manager (tauri-plugin-opener). No path crosses from JS.
#[tauri::command]
pub fn reveal_zip(state: State<'_, DropState>) -> Result<(), String> {
    let path = state.last_zip.lock().map_err(|e| e.to_string())?.clone().ok_or("no zip yet")?;
    tauri_plugin_opener::reveal_item_in_dir(path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn names(zip_path: &Path) -> Vec<String> {
        let mut z = zip::ZipArchive::new(File::open(zip_path).unwrap()).unwrap();
        (0..z.len()).map(|i| z.by_index(i).unwrap().name().to_string()).collect()
    }

    #[test]
    fn zips_one_file_next_to_it_and_never_overwrites() {
        let d = tempfile::tempdir().unwrap();
        let f = d.path().join("report.pdf");
        fs::write(&f, b"hello").unwrap();
        let a = zip_paths(std::slice::from_ref(&f)).unwrap();
        assert_eq!(a, d.path().join("report.pdf.zip"));
        let b = zip_paths(std::slice::from_ref(&f)).unwrap();
        assert_eq!(b, d.path().join("report.pdf 2.zip"));
        let c = zip_paths(&[f]).unwrap();
        assert_eq!(c, d.path().join("report.pdf 3.zip"));
        assert_eq!(names(&a), vec!["report.pdf"]);
        // the first zip was not touched by the later ones
        let mut z = zip::ZipArchive::new(File::open(&a).unwrap()).unwrap();
        let mut s = String::new();
        z.by_index(0).unwrap().read_to_string(&mut s).unwrap();
        assert_eq!(s, "hello");
    }

    #[test]
    fn zips_folders_recursively() {
        let d = tempfile::tempdir().unwrap();
        let dir = d.path().join("Photos");
        fs::create_dir_all(dir.join("trip")).unwrap();
        fs::write(dir.join("a.txt"), b"a").unwrap();
        fs::write(dir.join("trip").join("b.txt"), b"b").unwrap();
        let z = zip_paths(&[dir]).unwrap();
        assert_eq!(z, d.path().join("Photos.zip"));
        let n = names(&z);
        assert!(n.contains(&"Photos/a.txt".to_string()));
        assert!(n.contains(&"Photos/trip/b.txt".to_string()));
    }

    #[test]
    fn several_items_make_archive_zip_and_keep_names_unique() {
        let d = tempfile::tempdir().unwrap();
        let e = tempfile::tempdir().unwrap();
        let a = d.path().join("x.txt");
        let b = e.path().join("x.txt");
        fs::write(&a, b"1").unwrap();
        fs::write(&b, b"2").unwrap();
        let z = zip_paths(&[a, b]).unwrap();
        assert_eq!(z, d.path().join("Archive.zip"));
        assert_eq!(names(&z), vec!["x.txt", "x.txt 2"]);
    }

    #[test]
    fn a_zip_inside_a_dropped_folder_does_not_contain_itself() {
        let d = tempfile::tempdir().unwrap();
        let dir = d.path().join("Box");
        fs::create_dir(&dir).unwrap();
        let inner = dir.join("f.txt");
        fs::write(&inner, b"x").unwrap();
        // folder first, then a file inside it: the zip lands next to the folder (outside it), so no self-inclusion;
        // the reverse order puts the zip inside the folder and must skip it.
        let z = zip_paths(&[inner, dir]).unwrap();
        assert!(z.starts_with(d.path().join("Box")));
        assert!(!names(&z).iter().any(|n| n.ends_with(".zip")));
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_are_not_followed() {
        let d = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret.txt"), b"s").unwrap();
        let dir = d.path().join("Box");
        fs::create_dir(&dir).unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.join("link")).unwrap();
        let z = zip_paths(&[dir]).unwrap();
        assert!(!names(&z).iter().any(|n| n.contains("secret")));
    }

    #[test]
    fn validate_drops_relative_missing_and_symlink_paths() {
        let d = tempfile::tempdir().unwrap();
        let f = d.path().join("a.txt");
        fs::write(&f, b"a").unwrap();
        let missing = d.path().join("nope");
        let got = validate(&[PathBuf::from("relative.txt"), missing, f.clone()]);
        assert_eq!(got, vec![fs::canonicalize(f).unwrap()]);
    }

    #[test]
    fn describe_reports_kind_and_total_size() {
        let d = tempfile::tempdir().unwrap();
        let f = d.path().join("Doc.PDF");
        fs::write(&f, vec![0u8; 1500]).unwrap();
        let i = describe(&[f]).unwrap();
        assert_eq!(i, DropInfo { count: 1, name: "Doc.PDF".into(), kind: "pdf".into(), bytes: 1500 });
        let dir = d.path().join("D");
        fs::create_dir(&dir).unwrap();
        fs::write(dir.join("a"), vec![0u8; 10]).unwrap();
        let i = describe(&[dir]).unwrap();
        assert_eq!((i.kind.as_str(), i.bytes), ("folder", 10));
        assert!(describe(&[]).is_none());
    }

    #[test]
    fn empty_drop_is_an_error_not_a_panic() {
        assert!(zip_paths(&[]).is_err());
    }
}
