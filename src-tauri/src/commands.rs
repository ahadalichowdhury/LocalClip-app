//! IPC commands — one per `window.electronAPI.*` method the React UI calls
//! (see `src/renderer/src/lib/nativeBridge.ts`).

use crate::state::AppState;
use crate::storage::{ClipboardEntry, HistoryOptions};
use crate::{classify, macos, window};
use base64::Engine;
use serde_json::Value;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

type Res<T> = Result<T, String>;

// ------------------------------------------------------------------ window

#[tauri::command]
pub fn window_show(app: AppHandle) {
    window::show(&app);
}

#[tauri::command]
pub fn window_hide(app: AppHandle) {
    window::hide(&app);
}

#[tauri::command]
pub fn window_toggle(app: AppHandle) {
    window::toggle(&app);
}

#[tauri::command]
pub fn window_close_about(app: AppHandle) {
    window::close_about(&app);
}

// ------------------------------------------------------------------ clipboard

#[tauri::command]
pub fn clipboard_get_history(state: State<AppState>, options: Option<HistoryOptions>) -> Vec<ClipboardEntry> {
    let mut opts = options.unwrap_or_default();
    if opts.limit.unwrap_or(0) == 0 {
        opts.limit = Some(state.settings.lock().unwrap().current.max_history_items);
    }
    state.storage.history(&opts)
}

#[tauri::command]
pub fn clipboard_delete(state: State<AppState>, id: u64) -> bool {
    state.storage.delete(id)
}

#[tauri::command]
pub fn clipboard_pin(state: State<AppState>, id: u64) -> Option<ClipboardEntry> {
    state.storage.toggle_pin(id)
}

#[tauri::command]
pub fn clipboard_update_note(state: State<AppState>, id: u64, note: String) -> Option<ClipboardEntry> {
    state.storage.update_note(id, note)
}

#[tauri::command]
pub fn clipboard_clear(state: State<AppState>) -> bool {
    state.storage.clear()
}

fn write_entry_to_pasteboard(entry: &ClipboardEntry) -> Res<()> {
    let c = &entry.content;
    if let Some(b64) = c.strip_prefix("data:image/").and_then(|r| r.split_once(',')).map(|(_, d)| d) {
        let png = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| format!("bad image data: {e}"))?;
        macos::write_png(&png);
    } else if entry.format == "html" {
        macos::write_text(&classify::html_to_text(c), Some(c), None);
    } else if entry.format == "rtf" {
        macos::write_text(&classify::rtf_to_text(c), None, Some(c));
    } else {
        macos::write_text(c, None, None);
    }
    Ok(())
}

/// Copy the entry, hide the popup and send Cmd+V to the app the user was in.
#[tauri::command]
pub async fn clipboard_paste(app: AppHandle, entry: ClipboardEntry) -> Res<bool> {
    let state = app.state::<AppState>();
    write_entry_to_pasteboard(&entry)?;
    state.ignore_change_count.store(macos::change_count(), Ordering::Release);

    if !hide_and_return_focus(&app).await {
        // Content is on the clipboard; user can press Cmd+V themselves.
        return Ok(false);
    }
    macos::send_cmd_v();
    Ok(true)
}

/// Hide the popup and make sure the app the user was typing in has focus
/// again. Returns false when synthetic key events aren't allowed yet
/// (Accessibility permission), after opening that settings pane.
async fn hide_and_return_focus(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    window::hide(app);
    tokio::time::sleep(Duration::from_millis(60)).await;

    // The panel never activates us, so normally the target app is still
    // frontmost. If something did activate us (About window, dock click…),
    // hand focus back first.
    let target = *state.target_pid.lock().unwrap();
    if macos::we_are_active() {
        if let Some(pid) = target {
            macos::activate_pid(pid);
            tokio::time::sleep(Duration::from_millis(150)).await;
        }
    }

    if !macos::accessibility_trusted() {
        macos::open_accessibility_settings();
        return false;
    }
    true
}

/// Type text (an emoji) into the app the user was in, like Windows' emoji
/// panel: sent as keyboard input, so the clipboard is left untouched.
#[tauri::command]
pub async fn insert_text(app: AppHandle, text: String) -> Res<bool> {
    if text.is_empty() {
        return Ok(false);
    }
    if !hide_and_return_focus(&app).await {
        return Ok(false);
    }
    macos::type_text(&text);
    Ok(true)
}

#[tauri::command]
pub async fn clipboard_smart_paste(app: AppHandle, entry: ClipboardEntry) -> Res<bool> {
    clipboard_paste(app, entry).await
}

// ------------------------------------------------------------------ settings

#[tauri::command]
pub fn settings_get(state: State<AppState>, key: Option<String>) -> Value {
    let s = state.settings.lock().unwrap();
    match key {
        Some(k) => s.get(&k),
        None => s.all(),
    }
}

#[tauri::command]
pub fn settings_get_all(state: State<AppState>) -> Value {
    state.settings.lock().unwrap().all()
}

#[tauri::command]
pub fn settings_set(app: AppHandle, state: State<AppState>, key: String, value: Value) -> Res<bool> {
    state.settings.lock().unwrap().set(&key, value.clone())?;
    match key.as_str() {
        "autoStart" => set_autostart(&app, value.as_bool().unwrap_or(false)),
        "monitorClipboard" => state.monitoring.store(value.as_bool().unwrap_or(true), Ordering::Release),
        "hideFromDock" => set_dock_hidden(&app, value.as_bool().unwrap_or(false)),
        "theme" => apply_theme(&app, value.as_str().unwrap_or("auto")),
        "maxHistoryItems" => {
            if let Some(n) = value.as_u64() {
                state.storage.enforce_limit(n as usize);
            }
        }
        _ => {}
    }
    Ok(true)
}

pub fn set_autostart(app: &AppHandle, enabled: bool) {
    let al = app.autolaunch();
    let r = if enabled { al.enable() } else { al.disable() };
    if let Err(e) = r {
        log::warn!("autostart: {e}");
    }
}

/// Match the native window chrome and the glass material to the app theme
/// (it can differ from the system appearance).
pub fn apply_theme(app: &AppHandle, theme: &str) {
    let t = match theme {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        _ => None,
    };
    for win in app.webview_windows().values() {
        let _ = win.set_theme(t);
    }
}

pub fn set_dock_hidden(app: &AppHandle, hidden: bool) {
    let policy = if hidden {
        tauri::ActivationPolicy::Accessory
    } else {
        tauri::ActivationPolicy::Regular
    };
    let _ = app.set_activation_policy(policy);
}

// ------------------------------------------------------------------ hotkey

pub fn register_hotkey(app: &AppHandle, hotkey: &str) -> bool {
    let state = app.state::<AppState>();
    let gs = app.global_shortcut();
    let previous = state.current_hotkey.lock().unwrap().clone();
    if !previous.is_empty() {
        let _ = gs.unregister(previous.as_str());
    }
    match gs.register(hotkey) {
        Ok(()) => {
            *state.current_hotkey.lock().unwrap() = hotkey.to_string();
            true
        }
        Err(e) => {
            log::warn!("could not register hotkey {hotkey}: {e}");
            if !previous.is_empty() {
                let _ = gs.register(previous.as_str());
            }
            false
        }
    }
}

#[tauri::command]
pub fn hotkey_register(app: AppHandle, state: State<AppState>, hotkey: String) -> bool {
    let ok = register_hotkey(&app, &hotkey);
    if ok {
        let _ = state.settings.lock().unwrap().set("globalHotkey", Value::String(hotkey));
    }
    ok
}

#[tauri::command]
pub fn hotkey_get_current(state: State<AppState>) -> String {
    state.current_hotkey.lock().unwrap().clone()
}

#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

// ------------------------------------------------------------------ export

/// "Save to file" from a clip's menu: asks where to save with the native
/// Save dialog, then writes the clip in the chosen format. Returns the saved
/// path, or None when the user cancelled.
#[tauri::command]
pub async fn save_clip(app: AppHandle, entry: ClipboardEntry, kind: String) -> Res<Option<String>> {
    use tauri_plugin_dialog::DialogExt;

    let export = crate::export::build(&entry, &kind)?;
    let state = app.state::<AppState>();
    state.dialog_open.store(true, Ordering::Release);
    macos::activate_self();

    let mut dialog = app
        .dialog()
        .file()
        .set_title("Save clip")
        .set_file_name(crate::export::default_name(export.extension))
        .add_filter(export.label, &[export.extension])
        .set_can_create_directories(true);
    if let Ok(dir) = app.path().download_dir() {
        dialog = dialog.set_directory(dir);
    }
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_save_file()).await;

    // always undo the dialog state, even if the dialog thread failed
    state.dialog_open.store(false, Ordering::Release);
    window::show(&app);
    let picked = picked.map_err(|e| e.to_string())?;

    let Some(picked) = picked else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, &export.bytes).map_err(|e| format!("could not save: {e}"))?;
    Ok(Some(path.display().to_string()))
}

/// Select a saved file in Finder.
#[tauri::command]
pub fn reveal_in_finder(path: String) {
    let _ = std::process::Command::new("open").arg("-R").arg(path).spawn();
}
