//! Clipboard watcher. Polls NSPasteboard's `changeCount` (a single integer
//! read) and only reads the actual contents when it changes — the Electron
//! build read text + HTML + RTF + a full PNG encode every 500 ms.

use crate::classify;
use crate::macos;
use crate::state::AppState;
use crate::storage::ClipboardEntry;
use base64::Engine;
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
            let ignore = state.ignore_change_count.load(Ordering::Acquire) == count
                || !state.monitoring.load(Ordering::Acquire);

            let text = macos::read_string(macos::T_TEXT);
            if let Some(text) = text.filter(|t| !t.is_empty() && *t != last_text) {
                last_text = text.clone();
                if !ignore {
                    let (format, content) = rich_variant(&text);
                    save(&app, &state, format, content, None, Some(&text));
                }
                continue; // text copy; don't also store a rendered image of it
            }

            if let Some((hash, png)) = read_image() {
                if hash != last_image_hash {
                    last_image_hash = hash;
                    if !ignore {
                        if let Some(content) = store_image(&app, hash, &png) {
                            save(&app, &state, "image", content, None, None);
                        }
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
) {
    let (auto_categories, max_items, incognito) = {
        let s = state.settings.lock().unwrap();
        (s.current.auto_categories, s.current.max_history_items, s.current.incognito_mode)
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
        file_path: None,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
        is_pinned: false,
        is_favorite: false,
        tags: vec![],
        usage_count: 0,
        last_used_at: None,
        note: None,
    };
    let saved = state.storage.add(entry, max_items);
    let _ = app.emit_to("main", "clipboard:changed", saved);
}

pub(crate) fn fnv1a(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in bytes {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// Returns (content hash, PNG bytes) for an image on the pasteboard.
fn read_image() -> Option<(u64, Vec<u8>)> {
    if let Some(png) = macos::read_data(macos::T_PNG) {
        return Some((fnv1a(&png), png));
    }
    let tiff = macos::read_data(macos::T_TIFF)?;
    let hash = fnv1a(&tiff);
    let img = image::load_from_memory_with_format(&tiff, image::ImageFormat::Tiff).ok()?;
    let mut png = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png).ok()?;
    Some((hash, png))
}

/// Saves full image + 64x64 thumbnail like the Electron build, returns a data URL.
pub(crate) fn store_image(app: &AppHandle, hash: u64, png: &[u8]) -> Option<String> {
    let dir = app.path().app_data_dir().ok()?.join("images");
    std::fs::create_dir_all(&dir).ok()?;
    std::fs::write(dir.join(format!("{hash:x}.png")), png).ok()?;
    if let Ok(img) = image::load_from_memory_with_format(png, image::ImageFormat::Png) {
        let _ = img
            .thumbnail(64, 64)
            .save_with_format(dir.join(format!("{hash:x}_thumb.png")), image::ImageFormat::Png);
    }
    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png)
    ))
}
