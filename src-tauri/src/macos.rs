//! Thin wrappers over AppKit / CoreGraphics. Replaces the `osascript` calls
//! the Electron build spawned on every hotkey press and paste (each of which
//! cost 100–300 ms).
#![allow(unused_unsafe)]

use objc2::rc::Retained;
use objc2_app_kit::{NSApplicationActivationOptions, NSPasteboard, NSRunningApplication, NSWorkspace};
use objc2_foundation::{NSData, NSString};

pub const T_TEXT: &str = "public.utf8-plain-text";
pub const T_HTML: &str = "public.html";
pub const T_RTF: &str = "public.rtf";
pub const T_PNG: &str = "public.png";
pub const T_TIFF: &str = "public.tiff";

fn pb() -> Retained<NSPasteboard> {
    unsafe { NSPasteboard::generalPasteboard() }
}

/// Cheap counter that increments whenever anyone writes to the pasteboard.
pub fn change_count() -> isize {
    unsafe { pb().changeCount() }
}

pub fn read_string(ty: &str) -> Option<String> {
    let s = unsafe { pb().stringForType(&NSString::from_str(ty)) }?;
    Some(s.to_string())
}

pub fn read_data(ty: &str) -> Option<Vec<u8>> {
    let d = unsafe { pb().dataForType(&NSString::from_str(ty)) }?;
    Some(d.to_vec())
}

/// Write text plus optional rich representations in one go.
pub fn write_text(text: &str, html: Option<&str>, rtf: Option<&str>) {
    let pb = pb();
    unsafe {
        pb.clearContents();
        pb.setString_forType(&NSString::from_str(text), &NSString::from_str(T_TEXT));
        if let Some(h) = html {
            pb.setString_forType(&NSString::from_str(h), &NSString::from_str(T_HTML));
        }
        if let Some(r) = rtf {
            // RTF is stored as data on the pasteboard
            let data = NSData::with_bytes(r.as_bytes());
            pb.setData_forType(Some(&data), &NSString::from_str(T_RTF));
        }
    }
}

pub fn write_png(png: &[u8]) {
    let pb = pb();
    unsafe {
        pb.clearContents();
        let data = NSData::with_bytes(png);
        pb.setData_forType(Some(&data), &NSString::from_str(T_PNG));
    }
}

#[derive(Debug, Clone)]
pub struct FrontApp {
    pub pid: i32,
    pub name: Option<String>,
}

pub fn frontmost_app() -> Option<FrontApp> {
    unsafe {
        let app = NSWorkspace::sharedWorkspace().frontmostApplication()?;
        Some(FrontApp {
            pid: app.processIdentifier(),
            name: app.localizedName().map(|n| n.to_string()),
        })
    }
}

pub fn our_pid() -> i32 {
    std::process::id() as i32
}

/// Bring LocalClip forward (needed for modal dialogs like Save).
#[allow(deprecated)]
pub fn activate_self() {
    unsafe {
        NSRunningApplication::currentApplication()
            .activateWithOptions(NSApplicationActivationOptions::ActivateIgnoringOtherApps);
    }
}

pub fn we_are_active() -> bool {
    unsafe { NSRunningApplication::currentApplication().isActive() }
}

#[allow(deprecated)]
pub fn activate_pid(pid: i32) {
    unsafe {
        if let Some(app) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid) {
            app.activateWithOptions(NSApplicationActivationOptions::ActivateIgnoringOtherApps);
        }
    }
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

/// Synthetic key events need the Accessibility permission.
pub fn accessibility_trusted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

pub fn open_accessibility_settings() {
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn();
}

/// Split text into chunks of at most `max` UTF-16 units without breaking a
/// character (CGEventKeyboardSetUnicodeString takes ~20 units per event).
pub fn utf16_chunks(text: &str, max: usize) -> Vec<Vec<u16>> {
    let mut chunks = vec![];
    let mut cur: Vec<u16> = vec![];
    for ch in text.chars() {
        let mut buf = [0u16; 2];
        let units = ch.encode_utf16(&mut buf);
        if cur.len() + units.len() > max && !cur.is_empty() {
            chunks.push(std::mem::take(&mut cur));
        }
        cur.extend_from_slice(units);
    }
    if !cur.is_empty() {
        chunks.push(cur);
    }
    chunks
}

/// Type `text` into the frontmost app as keyboard input (no clipboard).
pub fn type_text(text: &str) {
    use core_graphics::event::{CGEvent, CGEventTapLocation};
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

    let Ok(src) = CGEventSource::new(CGEventSourceStateID::HIDSystemState) else { return };
    for chunk in utf16_chunks(text, 20) {
        if let Ok(down) = CGEvent::new_keyboard_event(src.clone(), 0, true) {
            down.set_string_from_utf16_unchecked(&chunk);
            down.post(CGEventTapLocation::HID);
        }
        if let Ok(up) = CGEvent::new_keyboard_event(src.clone(), 0, false) {
            up.post(CGEventTapLocation::HID);
        }
    }
}

/// Post Cmd+V to whichever app is frontmost.
pub fn send_cmd_v() {
    use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
    const KEY_V: u16 = 9; // kVK_ANSI_V

    let Ok(src) = CGEventSource::new(CGEventSourceStateID::HIDSystemState) else { return };
    for down in [true, false] {
        if let Ok(ev) = CGEvent::new_keyboard_event(src.clone(), KEY_V, down) {
            ev.set_flags(CGEventFlags::CGEventFlagCommand);
            ev.post(CGEventTapLocation::HID);
        }
    }
}

/// Pasteboard type identifiers currently on the general pasteboard.
#[cfg(test)]
pub fn current_types() -> Vec<String> {
    unsafe {
        pb().types()
            .map(|t| t.iter().map(|s| s.to_string()).collect())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Compares what macOS puts on the clipboard for a screenshot with what
    /// LocalClip writes. Touches the real clipboard, so it is opt-in.
    #[test]
    fn chunks_never_split_a_character() {
        let family = "👨‍👩‍👧‍👦"; // 11 UTF-16 units
        let text = family.repeat(3);
        let chunks = utf16_chunks(&text, 20);
        assert!(chunks.iter().all(|c| c.len() <= 20));
        let joined: Vec<u16> = chunks.concat();
        assert_eq!(String::from_utf16(&joined).unwrap(), text);
        for c in &chunks {
            assert!(String::from_utf16(c).is_ok(), "chunk split a surrogate pair");
        }
        assert_eq!(utf16_chunks("😀", 20).len(), 1);
    }

    #[test]
    #[ignore]
    fn compare_screenshot_pasteboard_types() {
        let ok = std::process::Command::new("screencapture")
            .args(["-c", "-x", "-R0,0,40,40"])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        assert!(ok);
        eprintln!("macOS screenshot: {:?}", current_types());
        let png = read_data(T_PNG).or_else(|| read_data(T_TIFF)).unwrap();
        write_png(&png);
        eprintln!("LocalClip write:  {:?}", current_types());
    }
}
