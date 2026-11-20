//! Image clips live as files in `<app data>/images/<hash>.png` (+ a small
//! `<hash>_thumb.png` for the list), and the history only stores the path.
//! Older builds kept every image base64-encoded inside the history JSON,
//! which made the file huge and every save slow; `Storage::open` migrates
//! those entries with `from_data_url`.

use crate::storage::ClipboardEntry;
use base64::Engine;
use std::path::{Path, PathBuf};

/// Longest side of the list thumbnail, in pixels (rows show ~75 pt tall at 2x).
const THUMB_MAX: u32 = 480;

pub fn fnv1a(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in bytes {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// `images/` next to the history file.
pub fn dir_for(data_file: &Path) -> PathBuf {
    data_file.parent().unwrap_or_else(|| Path::new(".")).join("images")
}

pub fn thumb_path(image: &Path) -> PathBuf {
    let stem = image.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
    image.with_file_name(format!("{stem}_thumb.png"))
}

/// Store PNG bytes (deduplicated by content hash) and return the file path.
pub fn save(dir: &Path, png: &[u8]) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join(format!("{:x}.png", fnv1a(png)));
    if !path.exists() {
        std::fs::write(&path, png)?;
    }
    let thumb = thumb_path(&path);
    // older builds left 64 px thumbnails under the same name; replace those
    let usable = image::image_dimensions(&thumb).map(|(w, h)| w.max(h) >= 128).unwrap_or(false);
    if !usable {
        if let Ok(img) = image::load_from_memory_with_format(png, image::ImageFormat::Png) {
            let small = if img.width().max(img.height()) > THUMB_MAX {
                img.thumbnail(THUMB_MAX, THUMB_MAX)
            } else {
                img
            };
            let _ = small.save_with_format(&thumb, image::ImageFormat::Png);
        }
    }
    Ok(path)
}

/// Decode a legacy `data:image/...;base64,` clip and store it as a file.
pub fn from_data_url(dir: &Path, data_url: &str) -> Option<PathBuf> {
    let b64 = data_url.strip_prefix("data:image/")?.split_once(',')?.1;
    let raw = base64::engine::general_purpose::STANDARD.decode(b64).ok()?;
    let png = if raw.starts_with(b"\x89PNG") {
        raw
    } else {
        let img = image::load_from_memory(&raw).ok()?;
        let mut out = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png).ok()?;
        out
    };
    save(dir, &png).ok()
}

/// The PNG bytes of an image clip. Paths are only read from inside `dir`,
/// since entries arrive from the web view.
pub fn read(dir: &Path, entry: &ClipboardEntry) -> Result<Vec<u8>, String> {
    if let Some(p) = &entry.file_path {
        let file = Path::new(p).canonicalize().map_err(|_| "the image file is missing")?;
        let root = dir.canonicalize().map_err(|_| "the image folder is missing")?;
        if !file.starts_with(&root) {
            return Err("refusing to read an image outside LocalClip's folder".into());
        }
        return std::fs::read(&file).map_err(|e| format!("could not read the image: {e}"));
    }
    let b64 = entry
        .content
        .strip_prefix("data:image/")
        .and_then(|r| r.split_once(','))
        .map(|(_, d)| d)
        .ok_or("this clip is not an image")?;
    base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("image data is damaged: {e}"))
}

/// Delete an image and its thumbnail (only inside `dir`).
pub fn remove(dir: &Path, path: &str) {
    let p = Path::new(path);
    if p.parent() != Some(dir) {
        return;
    }
    let _ = std::fs::remove_file(thumb_path(p));
    let _ = std::fs::remove_file(p);
}

#[cfg(test)]
pub fn sample_png(w: u32, h: u32) -> Vec<u8> {
    let img = image::RgbaImage::from_pixel(w, h, image::Rgba([10, 120, 200, 255]));
    let mut png = Vec::new();
    image::DynamicImage::ImageRgba8(img)
        .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
        .unwrap();
    png
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry_with(path: Option<String>, content: &str) -> ClipboardEntry {
        serde_json::from_value(serde_json::json!({
            "content": content, "format": "image", "filePath": path
        }))
        .unwrap()
    }

    #[test]
    fn saves_once_with_small_thumbnail() {
        let dir = tempfile::tempdir().unwrap();
        let png = sample_png(1200, 600);
        let a = save(dir.path(), &png).unwrap();
        let b = save(dir.path(), &png).unwrap();
        assert_eq!(a, b);
        let thumb = image::open(thumb_path(&a)).unwrap();
        assert_eq!((thumb.width(), thumb.height()), (480, 240));
        assert_eq!(read(dir.path(), &entry_with(Some(a.display().to_string()), "")).unwrap(), png);
    }

    #[test]
    fn refuses_paths_outside_the_folder() {
        let dir = tempfile::tempdir().unwrap();
        let other = tempfile::NamedTempFile::new().unwrap();
        let e = entry_with(Some(other.path().display().to_string()), "");
        assert!(read(dir.path(), &e).is_err());
        // remove() also ignores foreign paths
        remove(dir.path(), &other.path().display().to_string());
        assert!(other.path().exists());
    }

    #[test]
    fn migrates_data_urls() {
        let dir = tempfile::tempdir().unwrap();
        let png = sample_png(4, 4);
        let url = format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(&png));
        let path = from_data_url(dir.path(), &url).unwrap();
        assert_eq!(std::fs::read(path).unwrap(), png);
        // legacy entries without a file still read from their data URL
        assert_eq!(read(dir.path(), &entry_with(None, &url)).unwrap(), png);
    }
}
