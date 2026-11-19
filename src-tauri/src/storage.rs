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

#[derive(Clone)]
pub struct Storage {
    path: PathBuf,
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
        let next_id = data.entries.iter().map(|e| e.id).max().unwrap_or(0) + 1;
        log::info!("loaded {} clipboard entries", data.entries.len());
        Self {
            path,
            inner: Arc::new(Mutex::new(Inner { data, next_id })),
            dirty: Arc::new(AtomicBool::new(false)),
        }
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
                if !(has(Some(&e.content)) || has(e.preview.as_deref()) || has(e.category.as_deref()) || has(e.note.as_deref())) {
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

    pub fn add(&self, mut entry: ClipboardEntry, max_items: usize) -> ClipboardEntry {
        let saved = {
            let mut g = self.inner.lock().unwrap();
            entry.id = g.next_id;
            g.next_id += 1;
            entry.created_at = Utc::now();
            entry.updated_at = entry.created_at;
            g.data.entries.insert(0, entry.clone());
            if !entry.is_pinned {
                enforce_limit(&mut g.data.entries, max_items);
            }
            entry
        };
        self.touch();
        saved
    }

    pub fn enforce_limit(&self, max_items: usize) {
        enforce_limit(&mut self.inner.lock().unwrap().data.entries, max_items);
        self.touch();
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
        let mut g = self.inner.lock().unwrap();
        let before = g.data.entries.len();
        g.data.entries.retain(|e| e.id != id);
        let changed = g.data.entries.len() < before;
        drop(g);
        if changed {
            self.touch();
        }
        changed
    }

    /// Removes every non-pinned entry.
    pub fn clear(&self) -> bool {
        let mut g = self.inner.lock().unwrap();
        let before = g.data.entries.len();
        g.data.entries.retain(|e| e.is_pinned);
        let changed = g.data.entries.len() < before;
        drop(g);
        if changed {
            self.touch();
        }
        changed
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.inner.lock().unwrap().data.entries.len()
    }
}

fn enforce_limit(entries: &mut Vec<ClipboardEntry>, max_items: usize) {
    let limit = max_items.clamp(20, 100);
    let mut non_pinned: Vec<(DateTime<Utc>, u64)> =
        entries.iter().filter(|e| !e.is_pinned).map(|e| (e.created_at, e.id)).collect();
    if non_pinned.len() <= limit {
        return;
    }
    non_pinned.sort();
    let excess = non_pinned.len() - limit;
    let doomed: std::collections::HashSet<u64> = non_pinned.iter().take(excess).map(|(_, id)| *id).collect();
    entries.retain(|e| !doomed.contains(&e.id));
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
        let first = s.add(entry("first"), 20);
        s.toggle_pin(first.id);
        for i in 0..30 {
            s.add(entry(&format!("e{i}")), 20);
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
        s.add(entry("Hello World"), 40);
        s.add(entry("other"), 40);
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
        assert_eq!(s.add(entry("x"), 40).id, 8);
        s.flush();
        let s2 = Storage::open(p);
        assert_eq!(s2.len(), 2);
    }
}
