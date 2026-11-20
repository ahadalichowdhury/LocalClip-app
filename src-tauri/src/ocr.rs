//! Text recognition for image clips (screenshots, copied pictures) with
//! Apple's Vision framework — on-device, no network. The recognised text is
//! stored on the clip so search finds images by the words in them.

use crate::state::AppState;
use crate::storage::ClipboardEntry;
use objc2::rc::Retained;
use objc2::AllocAnyThread;
use objc2_foundation::{NSArray, NSData, NSDictionary};
use objc2_vision::{
    VNImageRequestHandler, VNRecognizeTextRequest, VNRequest, VNRequestTextRecognitionLevel,
};
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};

/// Image bytes for Vision. Transparent pixels are put on white first:
/// Vision treats them as black, which hides dark text on a transparent
/// background (logos, PNGs copied from web pages).
fn opaque_image(path: &Path) -> Option<Vec<u8>> {
    let bytes = std::fs::read(path).ok()?;
    let img = image::load_from_memory(&bytes).ok()?;
    if !img.color().has_alpha() {
        return Some(bytes);
    }
    let rgba = img.to_rgba8();
    let mut rgb = image::RgbImage::new(rgba.width(), rgba.height());
    for (x, y, p) in rgba.enumerate_pixels() {
        let a = p[3] as u32;
        let mix = |c: u8| ((c as u32 * a + 255 * (255 - a)) / 255) as u8;
        rgb.put_pixel(x, y, image::Rgb([mix(p[0]), mix(p[1]), mix(p[2])]));
    }
    let mut out = Vec::new();
    image::DynamicImage::ImageRgb8(rgb)
        .write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
        .ok()?;
    Some(out)
}

/// Lines of text Vision finds in the image, or None if it couldn't run.
pub fn recognize(path: &Path) -> Option<String> {
    let data = NSData::with_bytes(&opaque_image(path)?);
    let handler = VNImageRequestHandler::initWithData_options(
        VNImageRequestHandler::alloc(),
        &data,
        &NSDictionary::new(),
    );
    let request = VNRecognizeTextRequest::new();
    request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
    request.setUsesLanguageCorrection(true);
    // Default is text at least 1/32 of the image height; ordinary text in a
    // full-screen screenshot is ~1/100, so allow much smaller text.
    request.setMinimumTextHeight(0.005);

    let as_request: Retained<VNRequest> = Retained::into_super(Retained::into_super(request.clone()));
    handler
        .performRequests_error(&NSArray::from_retained_slice(&[as_request]))
        .ok()?;

    let lines: Vec<String> = request
        .results()?
        .iter()
        .filter_map(|obs| obs.topCandidates(1).firstObject().map(|t| t.string().to_string()))
        .collect();
    Some(lines.join("\n"))
}

fn run_for(app: &AppHandle, entry: &ClipboardEntry) {
    let Some(path) = entry.file_path.as_deref() else { return };
    // "" marks "looked, no text" so it isn't tried again
    let text = recognize(Path::new(path)).unwrap_or_default();
    let state = app.state::<AppState>();
    if let Some(updated) = state.storage.set_ocr_text(entry.id, text) {
        let _ = app.emit_to(crate::window::MAIN, "clipboard:updated", updated);
    }
}

/// Recognise text in a newly added image clip, off the clipboard thread.
pub fn spawn_for(app: AppHandle, entry: ClipboardEntry) {
    std::thread::spawn(move || run_for(&app, &entry));
}

/// Fill in text for image clips saved before OCR existed.
pub fn spawn_backfill(app: AppHandle) {
    std::thread::spawn(move || {
        let pending = app.state::<AppState>().storage.images_without_ocr();
        for entry in pending {
            run_for(&app, &entry);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A crop of LocalClip's own UI (sample data) as Retina-resolution text.
    #[test]
    fn reads_text_from_a_screenshot() {
        let png = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/ocr-sample.png");
        let text = recognize(&png).expect("vision ran");
        assert!(text.contains("Visual Studio Code"), "got: {text:?}");
        assert!(text.contains("1712-345678"), "got: {text:?}");
    }

    /// Dark text on a transparent background (common for copied PNGs) is
    /// only readable after flattening onto white.
    #[test]
    fn transparent_images_are_flattened_onto_white() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("t.png");
        let mut img = image::RgbaImage::new(4, 4); // fully transparent
        img.put_pixel(0, 0, image::Rgba([0, 0, 0, 255]));
        img.save(&p).unwrap();
        let flat = image::load_from_memory(&opaque_image(&p).unwrap()).unwrap().to_rgb8();
        assert_eq!(flat.get_pixel(1, 1).0, [255, 255, 255]);
        assert_eq!(flat.get_pixel(0, 0).0, [0, 0, 0]);
    }
}
