//! Screenshots → clipboard history.
//!
//! macOS saves ⌘⇧3 / ⌘⇧4 / ⌘⇧5 screenshots as files (Desktop by default)
//! instead of putting them on the clipboard. This watches the screenshot
//! folder and, for each new screenshot, adds it to history *and* puts it on
//! the system clipboard so ⌘V pastes it right away.
//!
//! Screenshots are recognised by the `kMDItemIsScreenCapture` extended
//! attribute macOS writes on them, so it works whatever the file is called
//! (the name is localised) and ignores other images saved to the Desktop.
//!
//! The folder is watched with FSEvents (via `notify`, latency 0), so a
//! screenshot is picked up the moment macOS writes it. With the floating
//! thumbnail on, macOS itself only writes the file when the thumbnail goes
//! away (~5 s), so `ensure_instant` turns that preview off at launch.

use crate::monitor;
use crate::state::AppState;
use crate::macos;
use std::collections::HashSet;
use std::ffi::CString;
use std::os::unix::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant, SystemTime};
use tauri::{AppHandle, Manager};

const RECHECK_FOLDER: Duration = Duration::from_secs(30);
const RETRY_STEP: Duration = Duration::from_millis(20);
const SCREEN_CAPTURE_XATTR: &str = "com.apple.metadata:kMDItemIsScreenCapture";

extern "C" {
    fn getxattr(
        path: *const libc_char,
        name: *const libc_char,
        value: *mut std::ffi::c_void,
        size: usize,
        position: u32,
        options: i32,
    ) -> isize;
}
#[allow(non_camel_case_types)]
type libc_char = std::os::raw::c_char;

fn is_screen_capture(path: &Path) -> bool {
    let (Ok(p), Ok(n)) = (
        CString::new(path.as_os_str().as_bytes()),
        CString::new(SCREEN_CAPTURE_XATTR),
    ) else {
        return false;
    };
    // size query: >= 0 means the attribute exists
    unsafe { getxattr(p.as_ptr(), n.as_ptr(), std::ptr::null_mut(), 0, 0, 0) >= 0 }
}

/// `defaults read com.apple.screencapture location`, else ~/Desktop.
fn screenshot_folder() -> Option<PathBuf> {
    let home = PathBuf::from(std::env::var_os("HOME")?);
    let custom = std::process::Command::new("defaults")
        .args(["read", "com.apple.screencapture", "location"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .map(|s| match s.strip_prefix("~/") {
            Some(rest) => home.join(rest),
            None => PathBuf::from(s),
        })
        .filter(|p| p.is_dir());
    Some(custom.unwrap_or_else(|| home.join("Desktop")))
}

fn is_image_name(path: &Path) -> bool {
    let hidden = path
        .file_name()
        .map(|n| n.as_bytes().first() == Some(&b'.'))
        .unwrap_or(true);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase);
    !hidden && matches!(ext.as_deref(), Some("png" | "jpg" | "jpeg" | "tiff" | "tif"))
}

/// True once the encoder has written the end of the image (PNG `IEND`
/// chunk / JPEG end-of-image marker); other formats are taken as-is.
fn is_complete(bytes: &[u8], path: &Path) -> bool {
    let ext = path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase);
    match ext.as_deref() {
        Some("png") => bytes.len() > 12 && &bytes[bytes.len() - 8..bytes.len() - 4] == b"IEND",
        Some("jpg" | "jpeg") => bytes.ends_with(&[0xFF, 0xD9]),
        _ => !bytes.is_empty(),
    }
}

/// Read the file as soon as it is fully written (polls in 20 ms steps,
/// gives up after ~2 s).
fn read_when_complete(path: &Path) -> Option<Vec<u8>> {
    for _ in 0..100 {
        if let Ok(bytes) = std::fs::read(path) {
            if is_complete(&bytes, path) {
                return Some(bytes);
            }
        }
        std::thread::sleep(RETRY_STEP);
    }
    None
}

/// macOS sets the screenshot marker right after creating the file.
fn wait_for_marker(path: &Path) -> bool {
    for _ in 0..25 {
        if is_screen_capture(path) {
            return true;
        }
        if !path.exists() {
            return false;
        }
        std::thread::sleep(RETRY_STEP);
    }
    false
}

fn to_png(bytes: Vec<u8>, path: &Path) -> Option<Vec<u8>> {
    if path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("png")) == Some(true) {
        return Some(bytes);
    }
    let img = image::load_from_memory(&bytes).ok()?;
    let mut png = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png).ok()?;
    Some(png)
}

/// Returns the image hash when something was imported.
fn import(app: &AppHandle, state: &AppState, path: &Path, done: &HashSet<u64>) -> Option<u64> {
    let Some(png) = read_when_complete(path).and_then(|b| to_png(b, path)) else {
        log::warn!("could not read screenshot {}", path.display());
        return None;
    };
    let hash = monitor::fnv1a(&png);
    if done.contains(&hash) {
        return None; // same screenshot, e.g. renamed/moved
    }

    // Put it on the clipboard so ⌘V works immediately; the clipboard watcher
    // is told to skip this change so the screenshot isn't stored twice.
    state.ignore_change_count.store(macos::change_count() + 1, Ordering::Release);
    macos::write_png(&png);
    state.ignore_change_count.store(macos::change_count(), Ordering::Release);

    if let Some(content) = monitor::store_image(app, hash, &png) {
        monitor::save(app, state, "image", content, Some("Screenshot"), None);
    }
    Some(hash)
}

/// Screenshots follow the same switches as copying: paused monitoring or
/// incognito mode stop them too.
fn enabled(state: &AppState) -> bool {
    let s = state.settings.lock().unwrap();
    !s.current.incognito_mode && state.monitoring.load(Ordering::Acquire)
}

fn created_at(path: &Path) -> Option<SystemTime> {
    let m = std::fs::metadata(path).ok()?;
    m.created().or_else(|_| m.modified()).ok()
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        use notify::{EventKind, RecursiveMode, Watcher};

        let state = app.state::<AppState>();
        let started = SystemTime::now();
        let mut seen: HashSet<PathBuf> = HashSet::new();
        let mut done: HashSet<u64> = HashSet::new();

        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = match notify::recommended_watcher(tx) {
            Ok(w) => w,
            Err(e) => {
                log::error!("screenshot watcher unavailable: {e}");
                return;
            }
        };
        let mut folder: Option<PathBuf> = None;
        let mut folder_checked = Instant::now() - RECHECK_FOLDER;

        loop {
            // The user can move the screenshot folder in the Screenshot app.
            if folder_checked.elapsed() >= RECHECK_FOLDER {
                let now = screenshot_folder();
                if now != folder {
                    if let Some(old) = &folder {
                        let _ = watcher.unwatch(old);
                    }
                    if let Some(new) = &now {
                        if let Err(e) = watcher.watch(new, RecursiveMode::NonRecursive) {
                            log::error!("cannot watch {}: {e}", new.display());
                        }
                    }
                    folder = now;
                }
                folder_checked = Instant::now();
            }

            let event = match rx.recv_timeout(RECHECK_FOLDER) {
                Ok(Ok(ev)) => ev,
                Ok(Err(_)) | Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
            };
            if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) || !enabled(&state) {
                continue;
            }
            for path in event.paths {
                if seen.contains(&path) || !is_image_name(&path) {
                    continue;
                }
                // Only screenshots taken while LocalClip is running.
                match created_at(&path) {
                    Some(t) if t >= started => {}
                    Some(_) => {
                        seen.insert(path);
                        continue;
                    }
                    None => continue, // already gone (temp file renamed)
                }
                if wait_for_marker(&path) {
                    seen.insert(path.clone());
                    if let Some(hash) = import(&app, &state, &path, &done) {
                        done.insert(hash);
                    }
                }
            }
        }
    });
}

/// Make screenshots save instantly: macOS's floating thumbnail delays
/// writing the file by ~5 s, so LocalClip turns it off (once, at launch).
pub fn ensure_instant() {
    if is_instant() {
        return;
    }
    let _ = std::process::Command::new("defaults")
        .args(["write", "com.apple.screencapture", "show-thumbnail", "-bool", "false"])
        .status();
}

/// Whether the floating thumbnail is currently off.
pub fn is_instant() -> bool {
    std::process::Command::new("defaults")
        .args(["read", "com.apple.screencapture", "show-thumbnail"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim() == "0")
        .unwrap_or(false) // not set = thumbnail on (macOS default)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_image_names() {
        assert!(is_image_name(Path::new("/x/Screenshot 2026-11-19 at 6.23.24 PM.png")));
        assert!(is_image_name(Path::new("/x/Bildschirmfoto.JPG")));
        assert!(!is_image_name(Path::new("/x/.Screenshot-temp.png")));
        assert!(!is_image_name(Path::new("/x/notes.txt")));
    }

    /// Uses the real `screencapture` tool; skipped where it isn't available.
    #[test]
    fn real_screenshot_is_recognised() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("shot.png");
        let ok = std::process::Command::new("screencapture")
            .args(["-x", "-R0,0,8,8"])
            .arg(&p)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !ok || !p.exists() {
            eprintln!("screencapture unavailable, skipping");
            return;
        }
        assert!(is_screen_capture(&p));
        let bytes = std::fs::read(&p).unwrap();
        assert!(is_complete(&bytes, &p));
        assert!(!is_complete(&bytes[..bytes.len() - 10], &p));
        assert!(to_png(bytes, &p).is_some());
    }

    /// End-to-end timing of the detection path: FSEvents → marker → read.
    #[test]
    fn detects_new_screenshot_quickly() {
        use notify::{EventKind, RecursiveMode, Watcher};
        let dir = tempfile::tempdir().unwrap();
        // FSEvents reports real paths (/var → /private/var)
        let root = dir.path().canonicalize().unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        let mut w = notify::recommended_watcher(tx).unwrap();
        w.watch(&root, RecursiveMode::NonRecursive).unwrap();
        std::thread::sleep(Duration::from_millis(200)); // let the stream start

        let target = root.join("Screenshot test.png");
        let t0 = Instant::now();
        let ok = std::process::Command::new("screencapture")
            .args(["-x", "-R0,0,400,300"])
            .arg(&target)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !ok {
            eprintln!("screencapture unavailable, skipping");
            return;
        }
        let deadline = Instant::now() + Duration::from_secs(3);
        let mut got = None;
        while Instant::now() < deadline {
            if let Ok(Ok(ev)) = rx.recv_timeout(Duration::from_millis(100)) {
                if matches!(ev.kind, EventKind::Create(_) | EventKind::Modify(_))
                    && ev.paths.iter().any(|p| p == &target)
                    && wait_for_marker(&target)
                {
                    got = read_when_complete(&target);
                    if got.is_some() {
                        break;
                    }
                }
            }
        }
        let elapsed = t0.elapsed();
        eprintln!("screenshot detected + read in {elapsed:?} (includes screencapture itself)");
        assert!(got.is_some(), "screenshot was not detected");
        assert!(elapsed < Duration::from_secs(2));
    }

    #[test]
    fn plain_files_are_not_screenshots() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.png");
        std::fs::write(&p, b"x").unwrap();
        assert!(!is_screen_capture(&p));
    }
}
