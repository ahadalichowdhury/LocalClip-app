use crate::settings::SettingsStore;
use crate::storage::Storage;
use std::sync::atomic::{AtomicBool, AtomicIsize};
use std::sync::Mutex;

pub struct AppState {
    pub storage: Storage,
    pub settings: Mutex<SettingsStore>,
    /// Mirrors the `monitorClipboard` setting.
    pub monitoring: AtomicBool,
    /// Pasteboard changeCount produced by our own write (so it isn't recorded).
    pub ignore_change_count: AtomicIsize,
    /// App that was frontmost when the hotkey was pressed (paste target).
    pub target_pid: Mutex<Option<i32>>,
    pub current_hotkey: Mutex<String>,
    /// A save dialog is open: keep the popup instead of hiding on focus loss.
    pub dialog_open: AtomicBool,
}
