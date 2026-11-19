#[cfg(not(target_os = "macos"))]
compile_error!("The Tauri build of LocalClip currently targets macOS only.");

mod classify;
mod commands;
mod export;
mod macos;
mod monitor;
mod screenshots;
mod settings;
mod state;
mod storage;
mod window;

use settings::SettingsStore;
use state::AppState;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicIsize};
use std::sync::Mutex;
use storage::Storage;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tauri_plugin_global_shortcut::ShortcutState;

const DATA_FILE: &str = "localclip-data.json";
const SETTINGS_FILE: &str = "localclip-settings.json";
const DEFAULT_HOTKEY: &str = "CommandOrControl+Shift+V";

/// First launch of the Tauri build: copy history + settings from the
/// Electron build's folder (~/Library/Application Support/LocalClip).
fn migrate_from_electron(new_dir: &Path) {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else { return };
    let old_dir = home.join("Library/Application Support/LocalClip");
    for name in [DATA_FILE, SETTINGS_FILE] {
        let (old, new) = (old_dir.join(name), new_dir.join(name));
        if old.exists() && !new.exists() {
            let _ = std::fs::create_dir_all(new_dir);
            match std::fs::copy(&old, &new) {
                Ok(_) => log::info!("migrated {name} from Electron build"),
                Err(e) => log::warn!("could not migrate {name}: {e}"),
            }
        }
    }
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "show", "Show LocalClip", true, None::<&str>)?,
            &MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "about", "About", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", "Quit LocalClip", true, None::<&str>)?,
        ],
    )?;
    let hotkey = app.state::<AppState>().current_hotkey.lock().unwrap().clone();
    TrayIconBuilder::with_id("tray")
        .icon(Image::from_bytes(include_bytes!("../../assets/tray-icon-template.png"))?)
        .icon_as_template(true)
        .tooltip(format!("LocalClip ({hotkey})"))
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => window::show(app),
            "settings" => window::show_settings(app),
            "about" => window::open_about(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_nspanel::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        window::toggle(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::window_show,
            commands::window_hide,
            commands::window_toggle,
            commands::window_close_about,
            commands::clipboard_get_history,
            commands::clipboard_delete,
            commands::clipboard_pin,
            commands::clipboard_update_note,
            commands::clipboard_clear,
            commands::clipboard_paste,
            commands::clipboard_smart_paste,
            commands::insert_text,
            commands::save_clip,
            commands::reveal_in_finder,
            commands::settings_get,
            commands::settings_get_all,
            commands::settings_set,
            commands::hotkey_register,
            commands::hotkey_get_current,
            commands::app_version,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let data_dir = app.path().app_data_dir()?;
            migrate_from_electron(&data_dir);

            let storage = Storage::open(data_dir.join(DATA_FILE));
            storage.spawn_saver();
            let settings = SettingsStore::open(data_dir.join(SETTINGS_FILE));
            let cfg = settings.current.clone();

            app.manage(AppState {
                storage,
                settings: Mutex::new(settings),
                monitoring: AtomicBool::new(cfg.monitor_clipboard),
                ignore_change_count: AtomicIsize::new(-1),
                target_pid: Mutex::new(None),
                current_hotkey: Mutex::new(String::new()),
                dialog_open: AtomicBool::new(false),
            });

            commands::set_dock_hidden(&handle, cfg.hide_from_dock);
            if !cfg!(debug_assertions) {
                // Don't register the dev binary as a login item.
                commands::set_autostart(&handle, cfg.auto_start);
            }

            if !commands::register_hotkey(&handle, &cfg.global_hotkey)
                && commands::register_hotkey(&handle, DEFAULT_HOTKEY)
            {
                let state = handle.state::<AppState>();
                let _ = state
                    .settings
                    .lock()
                    .unwrap()
                    .set("globalHotkey", DEFAULT_HOTKEY.into());
            }

            window::init_panel(&handle)?;
            setup_tray(&handle)?;
            monitor::spawn(handle.clone());
            screenshots::ensure_instant();
            screenshots::spawn(handle.clone());
            window::open_about(&handle);
            commands::apply_theme(&handle, &cfg.theme);
            Ok(())
        })
        .on_window_event(|win, event| {
            // The red close button on the popup just hides it.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if win.label() == window::MAIN {
                    api.prevent_close();
                    window::hide(win.app_handle());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building LocalClip");

    app.run(|handle, event| match event {
        RunEvent::Reopen { .. } => window::show(handle),
        RunEvent::ExitRequested { code: None, api, .. } => api.prevent_exit(),
        RunEvent::Exit => handle.state::<AppState>().storage.flush(),
        _ => {}
    });
}
