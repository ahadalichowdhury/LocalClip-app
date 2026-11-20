//! JSON history storage — same file format as the Electron build
//! (`localclip-data.json`), so existing history migrates as-is.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

fn default_text() -> String {
    "text".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardEntry {
    #[serde(default)]
    pub id: u64,
    #[serde(default)]
    pub content: String,
    #[serde(default = "default_text")]
    pub content_type: String,
    #[serde(default = "default_text")]
    pub format: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app_name: Option<String>,
    #[serde(default = "Utc::now")]
    pub created_at: DateTime<Utc>,
    #[serde(default = "Utc::now")]
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub is_pinned: bool,
    #[serde(default)]
    pub is_favorite: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub usage_count: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_used_at: Option<DateTime<Utc>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    /// Text recognised in an image clip ("" = checked, none found)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ocr_text: Option<String>,
}

#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryOptions {
    pub limit: Option<usize>,
    pub offset: Option<usize>,
    pub category: Option<String>,
    pub content_type: Option<String>,
    pub search_query: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StorageData {
    #[serde(default)]
    entries: Vec<ClipboardEntry>,
    #[serde(default)]
    settings: serde_json::Map<String, serde_json::Value>,
    #[serde(default = "default_version")]
    version: String,
    #[serde(default = "Utc::now")]
    last_saved: DateTime<Utc>,
}

fn default_version() -> String {
    "1.0.0".into()
}

impl Default for StorageData {
    fn default() -> Self {
        Self {
            entries: vec![],
            settings: Default::default(),
            version: default_version(),
            last_saved: Utc::now(),
        }
    }
}

struct Inner {
    data: StorageData,
    next_id: u64,
}

/// What `Storage::add` did, so the UI can mirror it.
#[derive(Debug, Default)]
pub struct AddOutcome {
    /// The stored clip; None when it was a repeat of a pinned clip.
    pub added: Option<ClipboardEntry>,
    /// Clips removed as a result (the older copy of a repeat, or the oldest
    /// clips over the history limit).
    pub removed: Vec<u64>,
}

/// Same clip as far as the user is concerned.
fn same_clip(a: &ClipboardEntry, b: &ClipboardEntry) -> bool {
    a.format == b.format && a.content == b.content && a.file_path == b.file_path
}

#[derive(Clone)]
pub struct Storage {
    path: PathBuf,
    images_dir: PathBuf,
    inner: Arc<Mutex<Inner>>,
    dirty: Arc<AtomicBool>,
}

impl Storage {
    pub fn open(path: PathBuf) -> Self {
        let data: StorageData = fs::read_to_string(&path)
            .ok()
            .and_then(|s| match serde_json::from_str(&s) {
                Ok(d) => Some(d),
                Err(e) => {
                    log::error!("could not parse {}: {e}", path.display());
                    None
                }
            })
            .unwrap_or_default();
        let mut data = data;
        // Older builds extracted RTF previews badly (font-table junk such as
        // ";; ppleTypeServices…"); rebuild them with the current parser.
        for e in data.entries.iter_mut().filter(|e| e.format == "rtf") {
            e.preview = Some(crate::classify::generate_preview(&e.content, "rtf"));
        }
        // Older builds stored images base64-encoded in this file: move them
        // to image files so the history stays small and fast to save.
        let images_dir = crate::images::dir_for(&path);
        let mut migrated = false;
        for e in data.entries.iter_mut().filter(|e| e.content.starts_with("data:image/")) {
            if let Some(file) = crate::images::from_data_url(&images_dir, &e.content) {
                e.file_path = Some(file.display().to_string());
                e.content = String::new();
                migrated = true;
            }
        }
        let next_id = data.entries.iter().map(|e| e.id).max().unwrap_or(0) + 1;
        log::info!("loaded {} clipboard entries", data.entries.len());
        let me = Self {
            path,
            images_dir,
            inner: Arc::new(Mutex::new(Inner { data, next_id })),
            dirty: Arc::new(AtomicBool::new(false)),
        };
        if migrated {
            me.flush();
        }
        me
    }

    pub fn images_dir(&self) -> &Path {
        &self.images_dir
    }

    /// Delete image files no remaining clip points to.
    fn drop_orphans(&self, removed: &[ClipboardEntry], remaining: &[ClipboardEntry]) {
        for e in removed {
            if let Some(p) = &e.file_path {
                if !remaining.iter().any(|r| r.file_path.as_deref() == Some(p)) {
                    crate::images::remove(&self.images_dir, p);
                }
            }
        }
    }

    /// Remove entries matching `doomed`, then clean up their image files.
    fn remove_where(&self, doomed: impl Fn(&ClipboardEntry) -> bool) -> Vec<u64> {
        let (removed, remaining) = {
            let mut g = self.inner.lock().unwrap();
            let (gone, keep): (Vec<_>, Vec<_>) = std::mem::take(&mut g.data.entries)
                .into_iter()
                .partition(|e| doomed(e));
            g.data.entries = keep;
            (gone, g.data.entries.clone())
        };
        if !removed.is_empty() {
            self.drop_orphans(&removed, &remaining);
            self.touch();
        }
        removed.iter().map(|e| e.id).collect()
    }

    /// Debounced writer: flushes at most once per second, off the UI thread.
    pub fn spawn_saver(&self) {
        let me = self.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_secs(1));
            if me.dirty.swap(false, Ordering::AcqRel) {
                me.flush();
            }
        });
    }

    pub fn flush(&self) {
        let json = {
            let mut g = self.inner.lock().unwrap();
            g.data.last_saved = Utc::now();
            serde_json::to_string_pretty(&g.data)
        };
        match json {
            Ok(json) => {
                if let Err(e) = write_atomic(&self.path, json.as_bytes()) {
                    log::error!("save failed: {e}");
                }
            }
            Err(e) => log::error!("serialize failed: {e}"),
        }
    }

    fn touch(&self) {
        self.dirty.store(true, Ordering::Release);
    }

    pub fn history(&self, opts: &HistoryOptions) -> Vec<ClipboardEntry> {
        let g = self.inner.lock().unwrap();
        let category = opts.category.as_deref().filter(|c| *c != "all").map(str::to_lowercase);
        let query = opts.search_query.as_deref().filter(|q| !q.is_empty()).map(str::to_lowercase);

        let matches = |e: &&ClipboardEntry| {
            if let Some(c) = &category {
                if e.category.as_deref().map(str::to_lowercase).as_deref() != Some(c.as_str()) {
                    return false;
                }
            }
            if let Some(ct) = &opts.content_type {
                if &e.format != ct {
                    return false;
                }
            }
            if let Some(q) = &query {
                let has = |s: Option<&str>| s.map(|s| s.to_lowercase().contains(q.as_str())).unwrap_or(false);
                if !(has(Some(&e.content))
                    || has(e.preview.as_deref())
                    || has(e.category.as_deref())
                    || has(e.note.as_deref())
                    || has(e.ocr_text.as_deref()))
                {
                    return false;
                }
            }
            true
        };

        let mut pinned: Vec<_> = g.data.entries.iter().filter(matches).filter(|e| e.is_pinned).cloned().collect();
        let mut rest: Vec<_> = g.data.entries.iter().filter(matches).filter(|e| !e.is_pinned).cloned().collect();
        pinned.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        rest.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        let offset = opts.offset.unwrap_or(0);
        let limit = opts.limit.unwrap_or(100);
        pinned.extend(rest.into_iter().skip(offset).take(limit));
        pinned
    }

    /// Store a new clip at the top. With `dedupe`, copying something that is
    /// already in the history moves it to the top (keeping its note) instead
    /// of adding a second copy; a repeat of a pinned clip is left alone.
    pub fn add(&self, mut entry: ClipboardEntry, max_items: usize, dedupe: bool) -> AddOutcome {
        let mut outcome = AddOutcome::default();
        {
            let mut g = self.inner.lock().unwrap();
            if dedupe {
                if let Some(i) = g.data.entries.iter().position(|e| same_clip(e, &entry)) {
                    if g.data.entries[i].is_pinned {
                        return outcome;
                    }
                    let old = g.data.entries.remove(i);
                    entry.note = entry.note.or(old.note);
                    outcome.removed.push(old.id);
                }
            }
            entry.id = g.next_id;
            g.next_id += 1;
            entry.created_at = Utc::now();
            entry.updated_at = entry.created_at;
            g.data.entries.insert(0, entry.clone());
            outcome.added = Some(entry);
        }
        outcome.removed.extend(self.enforce_limit(max_items));
        self.touch();
        outcome
    }

    /// Keep at most `max_items` unpinned clips (20–100), dropping the oldest.
    pub fn enforce_limit(&self, max_items: usize) -> Vec<u64> {
        let doomed = {
            let g = self.inner.lock().unwrap();
            over_limit(&g.data.entries, max_items)
        };
        self.remove_where(|e| doomed.contains(&e.id))
    }

    pub fn update_note(&self, id: u64, note: String) -> Option<ClipboardEntry> {
        let r = {
            let mut g = self.inner.lock().unwrap();
            let e = g.data.entries.iter_mut().find(|e| e.id == id)?;
            e.note = if note.is_empty() { None } else { Some(note) };
            e.updated_at = Utc::now();
            e.clone()
        };
        self.touch();
        Some(r)
    }

    pub fn set_ocr_text(&self, id: u64, text: String) -> Option<ClipboardEntry> {
        let r = {
            let mut g = self.inner.lock().unwrap();
            let e = g.data.entries.iter_mut().find(|e| e.id == id)?;
            e.ocr_text = Some(text);
            e.clone()
        };
        self.touch();
        Some(r)
    }

    /// Image clips whose text hasn't been recognised yet.
    pub fn images_without_ocr(&self) -> Vec<ClipboardEntry> {
        let g = self.inner.lock().unwrap();
        g.data
            .entries
            .iter()
            .filter(|e| e.format == "image" && e.file_path.is_some() && e.ocr_text.is_none())
            .cloned()
            .collect()
    }

    pub fn toggle_pin(&self, id: u64) -> Option<ClipboardEntry> {
        let r = {
            let mut g = self.inner.lock().unwrap();
            let e = g.data.entries.iter_mut().find(|e| e.id == id)?;
            e.is_pinned = !e.is_pinned;
            e.updated_at = Utc::now();
            e.clone()
        };
        self.touch();
        Some(r)
    }

    pub fn delete(&self, id: u64) -> bool {
        !self.remove_where(|e| e.id == id).is_empty()
    }

    /// Removes every non-pinned entry.
    pub fn clear(&self) -> bool {
        !self.remove_where(|e| !e.is_pinned).is_empty()
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.inner.lock().unwrap().data.entries.len()
    }
}

/// Ids of the oldest unpinned clips beyond the limit.
fn over_limit(entries: &[ClipboardEntry], max_items: usize) -> std::collections::HashSet<u64> {
    let limit = max_items.clamp(20, 100);
    let mut non_pinned: Vec<(DateTime<Utc>, u64)> =
        entries.iter().filter(|e| !e.is_pinned).map(|e| (e.created_at, e.id)).collect();
    if non_pinned.len() <= limit {
        return Default::default();
    }
    non_pinned.sort();
    let excess = non_pinned.len() - limit;
    non_pinned.iter().take(excess).map(|(_, id)| *id).collect()
}

pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(content: &str) -> ClipboardEntry {
        serde_json::from_value(serde_json::json!({ "content": content })).unwrap()
    }

    #[test]
    fn fifo_keeps_pinned() {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(dir.path().join("d.json"));
        let first = s.add(entry("first"), 20, true).added.unwrap();
        s.toggle_pin(first.id);
        for i in 0..30 {
            s.add(entry(&format!("e{i}")), 20, true);
        }
        assert_eq!(s.len(), 21); // 20 non-pinned + 1 pinned
        let h = s.history(&HistoryOptions::default());
        assert_eq!(h[0].content, "first");
        assert_eq!(h[1].content, "e29");
    }

    #[test]
    fn search_and_clear() {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(dir.path().join("d.json"));
        s.add(entry("Hello World"), 40, true);
        s.add(entry("other"), 40, true);
        let opts = HistoryOptions { search_query: Some("hello".into()), ..Default::default() };
        assert_eq!(s.history(&opts).len(), 1);
        assert!(s.clear());
        assert_eq!(s.len(), 0);
    }

    #[test]
    fn reads_electron_format_and_roundtrips() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("d.json");
        fs::write(
            &p,
            r#"{"entries":[{"id":7,"content":"hi","contentType":"text","format":"text",
              "createdAt":"2024-05-01T10:00:00.000Z","updatedAt":"2024-05-01T10:00:00.000Z",
              "isPinned":true,"isFavorite":false,"tags":[],"usageCount":0}],
              "settings":{},"version":"1.0.0","lastSaved":"2024-05-01T10:00:00.000Z"}"#,
        )
        .unwrap();
        let s = Storage::open(p.clone());
        assert_eq!(s.add(entry("x"), 40, true).added.unwrap().id, 8);
        s.flush();
        let s2 = Storage::open(p);
        assert_eq!(s2.len(), 2);
    }

    #[test]
    fn repeated_copy_moves_to_top_and_keeps_note() {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(dir.path().join("d.json"));
        let a = s.add(entry("alpha"), 40, true).added.unwrap();
        s.update_note(a.id, "remember".into());
        s.add(entry("beta"), 40, true);

        let again = s.add(entry("alpha"), 40, true);
        assert_eq!(again.removed, vec![a.id]);
        let h = s.history(&HistoryOptions::default());
        assert_eq!(h.iter().map(|e| e.content.as_str()).collect::<Vec<_>>(), ["alpha", "beta"]);
        assert_eq!(h[0].note.as_deref(), Some("remember"));

        // without dedupe a second copy is kept
        s.add(entry("beta"), 40, false);
        assert_eq!(s.len(), 3);
    }

    #[test]
    fn repeat_of_a_pinned_clip_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(dir.path().join("d.json"));
        let a = s.add(entry("pinned one"), 40, true).added.unwrap();
        s.toggle_pin(a.id);
        let again = s.add(entry("pinned one"), 40, true);
        assert!(again.added.is_none() && again.removed.is_empty());
        assert_eq!(s.len(), 1);
    }

    fn image_entry(path: &Path) -> ClipboardEntry {
        serde_json::from_value(serde_json::json!({
            "content": "", "format": "image", "filePath": path.display().to_string()
        }))
        .unwrap()
    }

    #[test]
    fn image_files_go_when_their_last_clip_goes() {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(dir.path().join("d.json"));
        let img = crate::images::save(s.images_dir(), &crate::images::sample_png(10, 10)).unwrap();
        let first = s.add(image_entry(&img), 40, false).added.unwrap();
        let second = s.add(image_entry(&img), 40, false).added.unwrap();

        s.delete(first.id);
        assert!(img.exists(), "still used by the second clip");
        s.delete(second.id);
        assert!(!img.exists());
        assert!(!crate::images::thumb_path(&img).exists());
    }

    #[test]
    fn migrates_inline_images_out_of_the_history_file() {
        use base64::Engine;
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("d.json");
        let png = crate::images::sample_png(6, 6);
        let url = format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(&png));
        fs::write(&p, serde_json::json!({ "entries": [{ "id": 1, "content": url, "format": "image" }] }).to_string()).unwrap();

        let s = Storage::open(p.clone());
        let e = &s.history(&HistoryOptions::default())[0];
        assert_eq!(e.content, "");
        assert_eq!(fs::read(e.file_path.as_ref().unwrap()).unwrap(), png);
        // the migrated history was written back without the base64 data
        assert!(!fs::read_to_string(&p).unwrap().contains("base64"));
    }
}
