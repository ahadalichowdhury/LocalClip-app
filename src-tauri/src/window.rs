//! Window management. The main window is converted into a non-activating
//! NSPanel so it opens *on top of* fullscreen apps on the current Space
//! instead of switching Spaces (the bug the Electron build had).

use crate::macos;
use crate::state::AppState;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};
use tauri_nspanel::{tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt};

pub const MAIN: &str = "main";
pub const ABOUT: &str = "about";

tauri_panel! {
    panel!(ClipPanel {
        config: {
            can_become_key_window: true,
            is_floating_panel: true
        }
    })

    panel_event!(ClipPanelEvents {
        window_did_resign_key(notification: &NSNotification) -> ()
    })
}

/// Must run on the main thread (called from `setup`).
pub fn init_panel(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let window = app.get_webview_window(MAIN).ok_or("main window missing")?;
    let panel = window.to_panel::<ClipPanel>()?;

    panel.set_level(PanelLevel::Floating.value());
    panel.add_style_mask(StyleMask::empty().nonactivating_panel().into())?;
    panel.set_collection_behavior(
        CollectionBehavior::new()
            .full_screen_auxiliary()
            .can_join_all_spaces()
            .into(),
    );
    panel.set_hides_on_deactivate(false);

    // Only the red close button: hide the (disabled) minimize and zoom buttons.
    {
        use objc2_app_kit::NSWindowButton;
        let ns = panel.as_panel();
        for kind in [NSWindowButton::MiniaturizeButton, NSWindowButton::ZoomButton] {
            if let Some(button) = ns.standardWindowButton(kind) {
                button.setHidden(true);
            }
        }
    }
    panel.set_has_shadow(true);

    // Like Win+V: clicking anywhere else dismisses the popup.
    let events = ClipPanelEvents::new();
    let handle = app.clone();
    events.window_did_resign_key(move |_| {
        if handle.state::<AppState>().dialog_open.load(std::sync::atomic::Ordering::Acquire) {
            return; // the Save dialog took focus; keep the popup
        }
        if let Ok(p) = handle.get_webview_panel(MAIN) {
            p.hide();
        }
    });
    panel.set_event_handler(Some(events.as_ref()));
    Ok(())
}

fn remember_target(app: &AppHandle) {
    if let Some(front) = macos::frontmost_app() {
        if front.pid != macos::our_pid() {
            *app.state::<AppState>().target_pid.lock().unwrap() = Some(front.pid);
        }
    }
}

fn center_on_cursor_monitor(app: &AppHandle) {
    let Some(win) = app.get_webview_window(MAIN) else { return };
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|c| app.monitor_from_point(c.x, c.y).ok().flatten())
        .or_else(|| win.current_monitor().ok().flatten());
    let (Some(m), Ok(size)) = (monitor, win.outer_size()) else { return };
    let (mp, ms) = (m.position(), m.size());
    let x = mp.x + (ms.width as i32 - size.width as i32) / 2;
    let y = mp.y + (ms.height as i32 - size.height as i32) / 2;
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

fn show_on_main(app: &AppHandle) {
    remember_target(app);
    center_on_cursor_monitor(app);
    if let Ok(panel) = app.get_webview_panel(MAIN) {
        panel.show_and_make_key();
    }
    let _ = app.emit_to(MAIN, "window:shown", ());
}

pub fn show(app: &AppHandle) {
    let h = app.clone();
    let _ = app.run_on_main_thread(move || show_on_main(&h));
}

pub fn hide(app: &AppHandle) {
    let h = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Ok(panel) = h.get_webview_panel(MAIN) {
            panel.hide();
        }
    });
}

pub fn toggle(app: &AppHandle) {
    let h = app.clone();
    let _ = app.run_on_main_thread(move || {
        let visible = h.get_webview_panel(MAIN).map(|p| p.is_visible()).unwrap_or(false);
        if visible {
            if let Ok(p) = h.get_webview_panel(MAIN) {
                p.hide();
            }
        } else {
            show_on_main(&h);
        }
    });
}

pub fn show_settings(app: &AppHandle) {
    show(app);
    let _ = app.emit_to(MAIN, "show-settings", ());
}

pub fn open_about(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(ABOUT) {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let built = WebviewWindowBuilder::new(app, ABOUT, WebviewUrl::App("index.html".into()))
        .title("About LocalClip")
        .inner_size(400.0, 500.0)
        .resizable(false)
        .maximizable(false)
        .center()
        .focused(true)
        .build();
    if let Err(e) = built {
        log::error!("could not open about window: {e}");
    }
}

pub fn close_about(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(ABOUT) {
        let _ = w.close();
    }
}
