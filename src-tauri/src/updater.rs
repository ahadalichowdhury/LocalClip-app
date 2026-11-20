//! Auto-update from GitHub Releases (tauri-plugin-updater). The release CI
//! publishes `latest.json` plus a signed `.app.tar.gz`; the app checks it
//! at launch and every few hours, tells the popup when a newer version is
//! ready, and installs it when the user clicks "Restart to update".
//! Updates are verified with the public key in tauri.conf.json.

use crate::state::AppState;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

const FIRST_CHECK: Duration = Duration::from_secs(15);
const EVERY: Duration = Duration::from_secs(6 * 60 * 60);

/// Ask GitHub for a newer version. Returns it (and tells the popup) if any.
pub async fn check(app: &AppHandle) -> Result<Option<String>, String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    let version = update.map(|u| u.version);
    *app.state::<AppState>().pending_update.lock().unwrap() = version.clone();
    if let Some(v) = &version {
        let _ = app.emit_to(crate::window::MAIN, "update:available", v);
    }
    Ok(version)
}

/// Background checks (release builds only; dev builds have nothing to update).
pub fn spawn_checks(app: AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK).await;
        loop {
            if let Err(e) = check(&app).await {
                log::warn!("update check failed: {e}");
            }
            tokio::time::sleep(EVERY).await;
        }
    });
}

/// Tray menu "Check for Updates…": shows the result either way.
pub fn check_from_menu(app: AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
    tauri::async_runtime::spawn(async move {
        match check(&app).await {
            Ok(Some(_)) => crate::window::show(&app),
            Ok(None) => {
                let v = app.package_info().version.to_string();
                app.dialog()
                    .message(format!("LocalClip {v} is the latest version."))
                    .title("You're up to date")
                    .show(|_| {});
            }
            Err(e) => {
                app.dialog()
                    .message(format!("Couldn't check for updates.\n\n{e}"))
                    .title("Update check failed")
                    .kind(MessageDialogKind::Warning)
                    .show(|_| {});
            }
        }
    });
}

/// Version waiting to be installed, if a check found one.
#[tauri::command]
pub fn pending_update(app: AppHandle) -> Option<String> {
    app.state::<AppState>().pending_update.lock().unwrap().clone()
}

/// Download, verify and install the update, then restart LocalClip.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("LocalClip is already up to date")?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| format!("update failed: {e}"))?;
    app.state::<AppState>().storage.flush();
    app.restart();
}
