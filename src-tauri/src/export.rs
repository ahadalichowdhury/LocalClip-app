//! "Save to file" for a clip: turns a stored clip into file bytes in the
//! format the user picked (PNG/JPG for images; text, HTML, RTF, JSON for
//! text clips). The save dialog itself lives in `commands::save_clip`.

use crate::classify;
use crate::storage::ClipboardEntry;
use base64::Engine;

#[derive(Debug, PartialEq)]
pub struct Export {
    pub bytes: Vec<u8>,
    pub extension: &'static str,
    /// Name shown in the save dialog's format filter
    pub label: &'static str,
}

fn image_bytes(entry: &ClipboardEntry) -> Result<Vec<u8>, String> {
    let b64 = entry
        .content
        .strip_prefix("data:image/")
        .and_then(|r| r.split_once(','))
        .map(|(_, d)| d)
        .ok_or("this clip is not an image")?;
    base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("image data is damaged: {e}"))
}

/// The clip as plain text, whatever it was copied as.
pub fn plain_text(entry: &ClipboardEntry) -> String {
    match entry.format.as_str() {
        "html" => classify::html_to_text(&entry.content),
        "rtf" => classify::rtf_to_text(&entry.content),
        _ => entry.content.clone(),
    }
}

/// Minimal RTF document for plain text (opens in Word, Pages, TextEdit).
pub fn text_to_rtf(text: &str) -> String {
    let mut out = String::from("{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs24\\uc1 ");
    for ch in text.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '{' => out.push_str("\\{"),
            '}' => out.push_str("\\}"),
            '\n' => out.push_str("\\par\n"),
            '\r' => {}
            '\t' => out.push_str("\\tab "),
            c if c.is_ascii() => out.push(c),
            c => {
                // \uN takes a signed 16-bit value per UTF-16 unit, then a fallback char
                let mut buf = [0u16; 2];
                for unit in c.encode_utf16(&mut buf) {
                    out.push_str(&format!("\\u{}?", *unit as i16));
                }
            }
        }
    }
    out.push('}');
    out
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// `kind`: png | jpg | txt | html | link | rtf | json
pub fn build(entry: &ClipboardEntry, kind: &str) -> Result<Export, String> {
    let text = |bytes: String, extension, label| Export { bytes: bytes.into_bytes(), extension, label };
    Ok(match kind {
        "png" => {
            let raw = image_bytes(entry)?;
            let png = if raw.starts_with(b"\x89PNG") {
                raw
            } else {
                let img = image::load_from_memory(&raw).map_err(|e| e.to_string())?;
                let mut out = Vec::new();
                img.write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
                    .map_err(|e| e.to_string())?;
                out
            };
            Export { bytes: png, extension: "png", label: "PNG image" }
        }
        "jpg" => {
            let img = image::load_from_memory(&image_bytes(entry)?).map_err(|e| e.to_string())?;
            // JPEG has no transparency: flatten onto white
            let rgba = img.to_rgba8();
            let mut rgb = image::RgbImage::new(rgba.width(), rgba.height());
            for (x, y, p) in rgba.enumerate_pixels() {
                let a = p[3] as u32;
                let mix = |c: u8| ((c as u32 * a + 255 * (255 - a)) / 255) as u8;
                rgb.put_pixel(x, y, image::Rgb([mix(p[0]), mix(p[1]), mix(p[2])]));
            }
            let mut out = Vec::new();
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 92)
                .encode_image(&rgb)
                .map_err(|e| e.to_string())?;
            Export { bytes: out, extension: "jpg", label: "JPEG image" }
        }
        "txt" => text(plain_text(entry), "txt", "Plain text"),
        "html" => {
            let html = if entry.format == "html" {
                entry.content.clone()
            } else {
                format!(
                    "<!doctype html>\n<meta charset=\"utf-8\">\n<pre>{}</pre>\n",
                    html_escape(&plain_text(entry))
                )
            };
            text(html, "html", "Web page")
        }
        "link" => {
            let url = html_escape(entry.content.trim());
            text(
                format!("<!doctype html>\n<meta charset=\"utf-8\">\n<a href=\"{url}\">{url}</a>\n"),
                "html",
                "Web page",
            )
        }
        "rtf" => {
            let rtf = if entry.format == "rtf" {
                entry.content.clone()
            } else {
                text_to_rtf(&plain_text(entry))
            };
            text(rtf, "rtf", "Rich Text document")
        }
        "json" => {
            let value: serde_json::Value =
                serde_json::from_str(entry.content.trim()).map_err(|_| "this clip is not valid JSON")?;
            text(
                serde_json::to_string_pretty(&value).unwrap_or_else(|_| entry.content.clone()),
                "json",
                "JSON",
            )
        }
        other => return Err(format!("unknown file type: {other}")),
    })
}

/// "clip-2026-11-19-1845.png"
pub fn default_name(extension: &str) -> String {
    format!("clip-{}.{extension}", chrono::Local::now().format("%Y-%m-%d-%H%M%S"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(content: &str, format: &str) -> ClipboardEntry {
        serde_json::from_value(serde_json::json!({ "content": content, "format": format })).unwrap()
    }

    fn png_data_url() -> String {
        let mut img = image::RgbaImage::new(3, 2);
        img.put_pixel(0, 0, image::Rgba([255, 0, 0, 255]));
        img.put_pixel(1, 0, image::Rgba([0, 0, 0, 0])); // transparent
        let mut png = Vec::new();
        image::DynamicImage::ImageRgba8(img)
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png))
    }

    #[test]
    fn images_export_as_real_png_and_jpg() {
        let e = entry(&png_data_url(), "image");
        let png = build(&e, "png").unwrap();
        assert!(png.bytes.starts_with(b"\x89PNG"));
        let jpg = build(&e, "jpg").unwrap();
        assert!(jpg.bytes.starts_with(&[0xFF, 0xD8]) && jpg.bytes.ends_with(&[0xFF, 0xD9]));
        let back = image::load_from_memory(&jpg.bytes).unwrap();
        assert_eq!((back.width(), back.height()), (3, 2));
        // transparent pixel became white, not black
        assert!(back.to_rgb8().get_pixel(1, 0)[0] > 240);
    }

    #[test]
    fn text_exports() {
        let rtf = "{\\rtf1\\ansi{\\fonttbl\\f0 Helvetica;}\\f0 Hello\\\nworld}";
        assert_eq!(build(&entry(rtf, "rtf"), "txt").unwrap().bytes, b"Hello\nworld");
        assert_eq!(build(&entry(rtf, "rtf"), "rtf").unwrap().bytes, rtf.as_bytes());
        assert_eq!(build(&entry("<b>Hi</b> there", "html"), "txt").unwrap().bytes, b"Hi there");

        let link = String::from_utf8(build(&entry("https://a.com/?x=1&y=2", "text"), "link").unwrap().bytes).unwrap();
        assert!(link.contains("href=\"https://a.com/?x=1&amp;y=2\""));

        assert!(build(&entry("not json", "text"), "json").is_err());
        let json = String::from_utf8(build(&entry("{\"a\":1}", "text"), "json").unwrap().bytes).unwrap();
        assert_eq!(json, "{\n  \"a\": 1\n}");
    }

    #[test]
    fn plain_text_to_rtf_round_trips() {
        let original = "Line one {braces} \\ slash\nআমার নাম 😀";
        let rtf = text_to_rtf(original);
        assert_eq!(classify::rtf_to_text(&rtf), original);
    }

    #[test]
    fn rejects_wrong_kind() {
        assert!(build(&entry("hello", "text"), "png").is_err());
        assert!(build(&entry("hello", "text"), "exe").is_err());
    }
}
