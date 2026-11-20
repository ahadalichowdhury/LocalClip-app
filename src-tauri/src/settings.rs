//! Settings — same keys/defaults as `src/shared/types.ts` DEFAULT_SETTINGS and
//! the same file name electron-store used (`localclip-settings.json`).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub max_history_items: usize,
    pub auto_start: bool,
    pub minimize_to_tray: bool,
    pub theme: String,
    pub accent_color: String,
    pub highlight_color: String,
    /// Frosted, see-through popup background
    pub glass_effect: bool,
    /// Popup background opacity in percent when glass is on (0–100)
    pub glass_opacity: u32,
    pub font_size: String,
    pub global_hotkey: String,
    pub monitor_clipboard: bool,
    pub auto_categories: bool,
    pub excluded_apps: Vec<String>,
    pub incognito_mode: bool,
    pub encrypt_data: bool,
    pub hide_from_dock: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            max_history_items: 40,
            auto_start: true,
            minimize_to_tray: true,
            theme: "auto".into(),
            accent_color: "#0078d4".into(),
            highlight_color: "yellow".into(),
            glass_effect: false,
            glass_opacity: 70,
            font_size: "medium".into(),
            global_hotkey: "CommandOrControl+Shift+V".into(),
            monitor_clipboard: true,
            auto_categories: true,
            excluded_apps: vec![],
            incognito_mode: false,
            encrypt_data: false,
            hide_from_dock: false,
        }
    }
}

pub struct SettingsStore {
    path: PathBuf,
    pub current: Settings,
}

impl SettingsStore {
    pub fn open(path: PathBuf) -> Self {
        let current = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        Self { path, current }
    }

    pub fn all(&self) -> Value {
        serde_json::to_value(&self.current).unwrap_or(Value::Null)
    }

    pub fn get(&self, key: &str) -> Value {
        self.all().get(key).cloned().unwrap_or(Value::Null)
    }

    pub fn set(&mut self, key: &str, value: Value) -> Result<(), String> {
        let mut all = self.all();
        all[key] = value;
        self.current = serde_json::from_value(all).map_err(|e| format!("invalid value for {key}: {e}"))?;
        let json = serde_json::to_string_pretty(&self.current).map_err(|e| e.to_string())?;
        crate::storage::write_atomic(&self.path, json.as_bytes()).map_err(|e| e.to_string())
    }
}
