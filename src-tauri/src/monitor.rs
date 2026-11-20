//! Clipboard watcher. Polls NSPasteboard's `changeCount` (a single integer
//! read) and only reads the actual contents when it changes — the Electron
//! build read text + HTML + RTF + a full PNG encode every 500 ms.

use crate::classify;
use crate::macos;
use crate::state::AppState;
use crate::storage::ClipboardEntry;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const POLL: Duration = Duration::from_millis(250);

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let mut last_count = macos::change_count();
        let mut last_text = macos::read_string(macos::T_TEXT).unwrap_or_default();
        let mut last_image_hash = 0u64;

        loop {
            std::thread::sleep(POLL);
            let count = macos::change_count();
            if count == last_count {
                continue;
            }
            last_count = count;

            // Our own writes (paste) and paused monitoring are ignored, but we
            // still advance `last_*` so they don't show up later.
            // Passwords and other content marked private by the copying app
            // (password managers, Keychain) are never stored.
            let types = macos::current_types();
            let ignore = state.ignore_change_count.load(Ordering::Acquire) == count
                || !state.monitoring.load(Ordering::Acquire)
                || macos::is_private(&types);
            let has_image = types.iter().any(|t| t == macos::T_PNG || t == macos::T_TIFF);

            let text = macos::read_string(macos::T_TEXT);

            // Files copied in Finder come with their names as text and the
            // file icon as an image; keep them as one "files" clip instead.
            if types.iter().any(|t| t == macos::T_FILE_URL) {
                let files = macos::read_files();
                if !files.is_empty() {
                    last_text = text.unwrap_or_default();
                    if !ignore {
                        let content: Vec<String> = files.iter().map(|p| p.display().to_string()).collect();
                        save(&app, &state, "file", content.join("\n"), None, None, None);
                    }
                    continue;
                }
            }

            if let Some(text) = text.filter(|t| !t.is_empty() && *t != last_text) {
                last_text = text.clone();
                // "Copy Image" in a browser puts the picture *and* its URL (or
                // file name) on the clipboard: keep the picture. Real text
                // that comes with a rendered image (Numbers, Word) stays text.
                if has_image && classify::is_image_source_text(&text) {
                    // fall through to the image branch below
                } else {
                    if !ignore {
                    let (format, content) = rich_variant(&text);
                    save(&app, &state, format, content, None, Some(&text), None);
                    }
                    continue; // text copy; don't also store a rendered image of it
                }
            }

            if let Some((hash, png)) = read_image() {
                if hash != last_image_hash {
                    last_image_hash = hash;
                    if !ignore {
                        save_image(&app, &state, &png, None);
                    }
                }
            }
        }
    });
}

fn rich_variant(text: &str) -> (&'static str, String) {
    if let Some(html) = macos::read_string(macos::T_HTML) {
        if !html.trim().is_empty() && classify::is_rich_html(&html, text) {
            return ("html", html);
        }
    }
    if let Some(rtf) = macos::read_data(macos::T_RTF).and_then(|d| String::from_utf8(d).ok()) {
        if !rtf.trim().is_empty() && rtf != text {
            return ("rtf", rtf);
        }
    }
    ("text", text.to_string())
}

/// Store a clip and tell the popup. `source` overrides the app name
/// (otherwise the frontmost app is used). `plain` is the plain-text version
/// the copying app put next to rich content; it makes the best preview.
pub(crate) fn save(
    app: &AppHandle,
    state: &AppState,
    format: &str,
    content: String,
    source: Option<&str>,
    plain: Option<&str>,
    file_path: Option<String>,
) {
    let (auto_categories, max_items, incognito) = {
        let s = state.settings.lock().unwrap();
        let c = &s.current;
        (c.auto_categories, c.max_history_items, c.incognito_mode)
    };
    if incognito {
        return;
    }
    let entry = ClipboardEntry {
        id: 0,
        content_type: classify::detect_content_type(&content, format).into(),
        preview: Some(match plain {
            Some(p) if matches!(format, "html" | "rtf") && !p.trim().is_empty() => {
                classify::generate_preview(p.trim(), "text")
            }
            _ => classify::generate_preview(&content, format),
        }),
        category: Some(classify::categorize(&content, format, auto_categories).into()),
        format: format.into(),
        app_name: source
            .map(str::to_string)
            .or_else(|| macos::frontmost_app().and_then(|a| a.name))
            .or(Some("Unknown App".into())),
        content,
        file_path,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
        is_pinned: false,
        is_favorite: false,
        tags: vec![],
        usage_count: 0,
        last_used_at: None,
        note: None,
        ocr_text: None,
    };
    // Copying something already in the list moves it to the top.
    let outcome = state.storage.add(entry, max_items, true);
    if !outcome.removed.is_empty() {
        let _ = app.emit_to("main", "clipboard:removed", &outcome.removed);
    }
    if let Some(saved) = outcome.added {
        let _ = app.emit_to("main", "clipboard:changed", &saved);
        if saved.format == "image" && saved.ocr_text.is_none() {
            crate::ocr::spawn_for(app.clone(), saved);
        }
    }
}

/// Store an image clip as a file (see `images`) and add it to history.
pub(crate) fn save_image(app: &AppHandle, state: &AppState, png: &[u8], source: Option<&str>) {
    match crate::images::save(state.storage.images_dir(), png) {
        Ok(path) => save(app, state, "image", String::new(), source, None, Some(path.display().to_string())),
        Err(e) => log::error!("could not store image: {e}"),
    }
}

/// Returns (content hash, PNG bytes) for an image on the pasteboard.
fn read_image() -> Option<(u64, Vec<u8>)> {
    if let Some(png) = macos::read_data(macos::T_PNG) {
        return Some((crate::images::fnv1a(&png), png));
    }
    let tiff = macos::read_data(macos::T_TIFF)?;
    let hash = crate::images::fnv1a(&tiff);
    let img = image::load_from_memory_with_format(&tiff, image::ImageFormat::Tiff).ok()?;
    let mut png = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png).ok()?;
    Some((hash, png))
}
