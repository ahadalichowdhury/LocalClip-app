//! Content classification — a port of the detection logic that used to live in
//! `src/main/clipboard.ts`. Regexes are compiled once (lazily) instead of on
//! every clipboard change, which is one of the reasons this is much faster.

use once_cell::sync::Lazy;
use regex::Regex;

/// JS `\w` / `\d` are ASCII-only; Rust's are Unicode. Rewrite them so that e.g.
/// Bangla text is classified exactly like it was in the Electron version.
fn js_re(pattern: &str) -> Regex {
    let p = pattern
        .replace(r"\w", "[0-9A-Za-z_]")
        .replace(r"\d", "[0-9]");
    Regex::new(&p).unwrap_or_else(|e| panic!("bad regex {pattern}: {e}"))
}

fn compile_all(patterns: &[&str]) -> Vec<Regex> {
    patterns.iter().map(|p| js_re(p)).collect()
}

pub fn truncate_chars(s: &str, max: usize) -> String {
    let mut it = s.chars();
    let head: String = it.by_ref().take(max).collect();
    if it.next().is_some() {
        format!("{head}...")
    } else {
        head
    }
}

// ---------------------------------------------------------------- previews

static RE_SCRIPT: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?is)<script[^>]*>.*?</script>").unwrap());
static RE_STYLE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?is)<style[^>]*>.*?</style>").unwrap());
static RE_COMMENT: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?s)<!--.*?-->").unwrap());
static RE_TAG: Lazy<Regex> = Lazy::new(|| Regex::new(r"<[^>]*>").unwrap());
static RE_WS: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+").unwrap());

pub fn html_to_text(html: &str) -> String {
    let t = RE_SCRIPT.replace_all(html, "");
    let t = RE_STYLE.replace_all(&t, "");
    let t = RE_COMMENT.replace_all(&t, "");
    let t = RE_TAG.replace_all(&t, "");
    let t = t
        .replace("&nbsp;", "  ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'");
    RE_WS.replace_all(&t, " ").trim().to_string()
}

/// Windows-1252 bytes 0x80–0x9F (the rest of 0xA0–0xFF is Latin-1).
const CP1252_HIGH: [char; 32] = [
    '€', '\u{81}', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u{8d}', 'Ž', '\u{8f}',
    '\u{90}', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', '\u{9d}', 'ž', 'Ÿ',
];

fn cp1252(b: u8) -> char {
    match b {
        0x80..=0x9F => CP1252_HIGH[(b - 0x80) as usize],
        _ => b as char,
    }
}

/// Plain text from RTF (what macOS apps like Notes, TextEdit and Pages put on
/// the clipboard). A small tokenizer rather than regexes: it skips whole
/// destination groups (`{\*…}`, font/colour tables…), decodes `\uN` and
/// `\'hh` escapes and keeps line breaks.
pub fn rtf_to_text(rtf: &str) -> String {
    const SKIP_DESTS: &[&str] = &[
        "fonttbl", "colortbl", "expandedcolortbl", "stylesheet", "info", "pict", "header",
        "footer", "headerl", "headerr", "footerl", "footerr", "listtable", "listoverridetable",
        "generator", "themedata", "datastore", "xmlnstbl", "rsidtbl", "object", "fldinst",
    ];
    let b = rtf.as_bytes();
    let mut out = String::new();
    let mut stack: Vec<(bool, i32)> = Vec::new(); // (skip, \uc) per group
    let mut skip = false;
    let mut uc: i32 = 1; // chars to drop after a \u escape
    let mut drop_next: i32 = 0;
    let mut high_surrogate: Option<u32> = None; // \uN pairs for emoji
    let mut i = 0;

    while i < b.len() {
        match b[i] {
            b'{' => {
                stack.push((skip, uc));
                i += 1;
                if rtf[i..].starts_with("\\*") {
                    skip = true;
                }
            }
            b'}' => {
                (skip, uc) = stack.pop().unwrap_or((false, 1));
                i += 1;
            }
            b'\\' => {
                i += 1;
                let Some(&n) = b.get(i) else { break };
                if n.is_ascii_alphabetic() {
                    let start = i;
                    while i < b.len() && b[i].is_ascii_alphabetic() {
                        i += 1;
                    }
                    let word = &rtf[start..i];
                    let pstart = i;
                    if b.get(i) == Some(&b'-') {
                        i += 1;
                    }
                    while i < b.len() && b[i].is_ascii_digit() {
                        i += 1;
                    }
                    let param: Option<i32> = rtf[pstart..i].parse().ok();
                    if b.get(i) == Some(&b' ') {
                        i += 1; // delimiter space belongs to the control word
                    }
                    if SKIP_DESTS.contains(&word) {
                        skip = true;
                        continue;
                    }
                    if skip {
                        continue;
                    }
                    match word {
                        "par" | "line" | "sect" | "row" => out.push('\n'),
                        "tab" | "cell" => out.push('\t'),
                        "uc" => uc = param.unwrap_or(1),
                        "u" => {
                            if let Some(p) = param {
                                let cp = if p < 0 { p + 65536 } else { p } as u32;
                                match (cp, high_surrogate.take()) {
                                    (0xD800..=0xDBFF, _) => high_surrogate = Some(cp),
                                    (0xDC00..=0xDFFF, Some(hi)) => {
                                        let full = 0x10000 + ((hi - 0xD800) << 10) + (cp - 0xDC00);
                                        out.extend(char::from_u32(full));
                                    }
                                    _ => out.extend(char::from_u32(cp)),
                                }
                                drop_next = uc;
                            }
                        }
                        "emdash" => out.push('—'),
                        "endash" => out.push('–'),
                        "bullet" => out.push('•'),
                        "lquote" => out.push('‘'),
                        "rquote" => out.push('’'),
                        "ldblquote" => out.push('“'),
                        "rdblquote" => out.push('”'),
                        _ => {}
                    }
                } else if n == b'\'' {
                    let hex = rtf.get(i + 1..i + 3).unwrap_or("");
                    i += 3;
                    if drop_next > 0 {
                        drop_next -= 1;
                    } else if !skip {
                        if let Ok(v) = u8::from_str_radix(hex, 16) {
                            out.push(cp1252(v));
                        }
                    }
                } else {
                    i += 1;
                    if skip {
                        continue;
                    }
                    match n {
                        b'\\' | b'{' | b'}' => out.push(n as char),
                        b'\n' | b'\r' => out.push('\n'), // Cocoa writes "\<newline>" for line breaks
                        b'~' => out.push('\u{a0}'),
                        b'_' => out.push('-'),
                        _ => {}
                    }
                }
            }
            b'\r' | b'\n' => i += 1,
            _ => {
                let ch = rtf[i..].chars().next().unwrap_or(' ');
                i += ch.len_utf8();
                if drop_next > 0 {
                    drop_next -= 1;
                } else if !skip {
                    out.push(ch);
                }
            }
        }
    }
    out.lines().map(str::trim_end).collect::<Vec<_>>().join("\n").trim().to_string()
}

/// "report.pdf" / "report.pdf, photo.png" / "report.pdf, photo.png and 3 more"
pub fn file_preview(paths: &str) -> String {
    let names: Vec<&str> = paths
        .lines()
        .filter(|l| !l.is_empty())
        .map(|p| p.rsplit('/').find(|s| !s.is_empty()).unwrap_or(p))
        .collect();
    match names.len() {
        0 => "[File]".into(),
        1 | 2 => names.join(", "),
        n => format!("{}, {} and {} more", names[0], names[1], n - 2),
    }
}

pub fn generate_preview(content: &str, format: &str) -> String {
    match format {
        "image" => "[Image]".into(),
        "file" => file_preview(content),
        "html" => {
            let t = html_to_text(content);
            if t.is_empty() { "[Rich Text]".into() } else { truncate_chars(&t, 100) }
        }
        "rtf" => {
            let t = RE_WS.replace_all(&rtf_to_text(content), " ").trim().to_string();
            if t.is_empty() { "[Rich Text]".into() } else { truncate_chars(&t, 100) }
        }
        _ => truncate_chars(content, 100),
    }
}

// ---------------------------------------------------------------- detectors

static URL_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    compile_all(&[
        r"(?i)^https?://[^\s]+$",
        r"(?i)^www\.[^\s]+\.[a-z]{2,}$",
        r"^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$",
        r"(?i)^https?://[^\s]+:[0-9]+",
        r"(?i)^ftp://[^\s]+$",
        r"(?i)^file://[^\s]+$",
    ])
});

pub fn is_url(text: &str) -> bool {
    let t = text.trim();
    // The Electron build used `new URL(text)`, which also accepted things like
    // "Note: buy milk" (scheme "note"). Requiring a host avoids that.
    if let Ok(u) = url::Url::parse(t) {
        if u.has_host() && !t.contains(char::is_whitespace) {
            return true;
        }
    }
    URL_PATTERNS.iter().any(|r| r.is_match(t))
}

static EMAIL_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    compile_all(&[
        r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$",
        r"^[a-zA-Z0-9._%+-]+\+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$",
        r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$",
    ])
});

pub fn is_email(text: &str) -> bool {
    let t = text.trim();
    EMAIL_PATTERNS.iter().any(|r| r.is_match(t))
}

static RE_NUM_CHARS: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[0-9+\s().-]+$").unwrap());
static RE_HTTP: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)https?://").unwrap());

/// Port of `src/shared/numeric-clipboard.ts`.
pub fn is_numbers(text: &str) -> bool {
    let t = text.trim();
    let len = t.encode_utf16().count();
    if !(7..=36).contains(&len) {
        return false;
    }
    if RE_HTTP.is_match(t) || t.contains('@') || !RE_NUM_CHARS.is_match(t) {
        return false;
    }
    let digits = t.chars().filter(|c| c.is_ascii_digit()).count();
    (7..=19).contains(&digits)
}

static CODE_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    compile_all(&[
        // JavaScript/TypeScript
        r"^(function|const|let|var|class|interface|type|enum|import|export|async|await|return)\s",
        r"^(if|else|for|while|switch|case|try|catch|finally)\s*[\(\{]",
        r"=>\s*[\{\(]",
        r"(?s)^//.*$|^/\*.*?\*/",
        r"console\.(log|error|warn|info)\s*\(",
        r"document\.(getElementById|querySelector|createElement)",
        r"window\.|localStorage\.|sessionStorage\.",
        // Python
        r"^(def|class|import|from|if|elif|else|for|while|try|except|finally|with|as)\s",
        r"^#.*$",
        r"print\s*\(",
        r"^@\w+",
        r"^\s*(def|class)\s+\w+.*:",
        // Java/C#/C++
        r"^(public|private|protected|static|final|abstract|class|interface|enum)\s",
        r"System\.(out\.print|err\.print)",
        r"Console\.(WriteLine|Write)",
        r"^#include\s*<.*>",
        r"^using\s+(namespace\s+)?[\w\.]+;",
        // Go
        r"^(package|import|func|var|const|type|struct|interface)\s",
        r"fmt\.(Print|Printf|Println)",
        r"^//.*$",
        // Rust
        r"^(fn|let|mut|const|struct|enum|impl|trait|use|mod|pub)\s",
        r"println!\s*\(",
        // PHP
        r"^<\?php",
        r"^\$\w+\s*=",
        r"echo\s+",
        r"function\s+\w+\s*\(",
        // Ruby
        r"^(def|class|module|require|include|if|elsif|else|unless|case|when)\s",
        r"puts\s+",
        // Swift / Kotlin / Scala
        r"^(func|var|let|class|struct|enum|protocol|import)\s",
        r"^(fun|val|var|class|interface|object|package|import)\s",
        r"println\s*\(",
        r"^(def|val|var|class|trait|object|package|import)\s",
        // HTML/XML/JSX
        r"(?s)^<[a-zA-Z][^>]*>.*</[a-zA-Z][^>]*>$",
        r"^<[a-zA-Z][^>]*/?>",
        r"(?i)^<!\s*DOCTYPE\s+html",
        r"(?i)^<\?xml\s+version",
        r#"className\s*=\s*["']"#,
        r"onClick\s*=\s*\{",
        // CSS/SCSS/LESS
        r"^[.#]?[\w-]+\s*\{",
        r"^@(import|media|keyframes|mixin|include|extend)",
        r":\s*[\w-]+\s*;",
        r"(?s)^/\*.*?\*/",
        r"\$[\w-]+\s*:",
        r"&:[\w-]+",
        // Markdown
        r"^#{1,6}\s+",
        r"^\*{1,2}[^*]+\*{1,2}",
        r"^\[.*\]\(.*\)",
        r"^```[\w]*$",
        r"^>\s+",
        r"^[-*+]\s+",
        // JSON
        r"(?s)^\s*\{.*\}\s*$",
        r"(?s)^\s*\[.*\]\s*$",
        r#""[\w-]+"\s*:\s*"#,
        // YAML
        r"^[\w-]+\s*:\s*",
        r"^-\s+[\w-]+",
        r"^---\s*$",
        // SQL
        r"(?i)^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\s+",
        r"(?i)\b(FROM|WHERE|JOIN|GROUP BY|ORDER BY|HAVING|LIMIT)\b",
        r"^--.*$",
        // Config files
        r"^\[[\w\s-]+\]$",
        r"^[\w-]+\s*=\s*",
        // Shell
        r"^#!",
        r"^\$\s*",
        r"^(echo|ls|cd|mkdir|rm|cp|mv|grep|find|awk|sed)\s+",
        r"\|\s*\w+",
        // PowerShell
        r"^(Get-|Set-|New-|Remove-)\w+",
        r"Write-Host\s+",
        // Docker
        r"^(FROM|RUN|COPY|ADD|WORKDIR|EXPOSE|CMD|ENTRYPOINT)\s+",
        // Git
        r"^(git\s+(add|commit|push|pull|clone|checkout|branch|merge|rebase))",
        // HTTP
        r"^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+",
        r"^HTTP/[0-9]\.[0-9]\s+[0-9]{3}",
        r"Content-Type\s*:\s*",
        r"Authorization\s*:\s*",
        // Testing
        r"^(describe|it|test|expect|assert)\s*\(",
        r"beforeEach\s*\(|afterEach\s*\(",
        r"jest\.|mocha\.|chai\.",
        // Async
        r"async\s+function|\basync\s*\(",
        r"await\s+\w+",
        r"Promise\.(resolve|reject|all|race)",
        r"\.then\s*\(|\.catch\s*\(",
        // Errors
        r"(?s)try\s*\{.*\}\s*catch",
        r"throw\s+new\s+\w+Error",
        r"except\s+\w+Error:",
        // Loops and conditionals
        r"^(for|while|do)\s*[\(\{]",
        r"^(if|else\s+if|elif|unless)\s*[\(\{]",
        r"switch\s*\([^)]*\)\s*\{",
        // Generic
        r"\w+\s*\([^)]*\)\s*\{",
        r"\w+\s*=\s*function",
        r"new\s+\w+\s*\(",
        r"\w+\.\w+\s*\(",
        r"\w+\[\w*\]\s*=",
        r"(?s)/\*.*?\*/|//.*$",
    ])
});

pub fn is_code(text: &str) -> bool {
    CODE_PATTERNS.iter().any(|r| r.is_match(text))
}

/// Text that only names an image — its URL, a file path or a file name —
/// which browsers and Finder put on the clipboard next to the picture.
pub fn is_image_source_text(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() || t.contains('\n') {
        return false;
    }
    let lower = t.to_lowercase();
    const EXT: &[&str] = &[".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".tif", ".tiff", ".bmp", ".svg", ".avif"];
    let names_image_file = !t.contains(' ') && EXT.iter().any(|e| lower.split(['?', '#']).next().unwrap_or("").ends_with(e));
    is_url(t) || t.starts_with("data:image/") || names_image_file
}

pub fn detect_content_type(content: &str, format: &str) -> &'static str {
    match format {
        "image" => "image",
        "file" => "file",
        "html" | "rtf" => "rich-text",
        _ if is_url(content) => "url",
        _ if is_email(content) => "email",
        _ if is_numbers(content) => "number",
        _ if is_code(content) => "code",
        _ => "text",
    }
}

pub fn categorize(content: &str, format: &str, auto_categories: bool) -> &'static str {
    match format {
        "html" | "rtf" => return "Rich Text",
        "image" => return "Images",
        "file" => return "Files",
        _ => {}
    }
    if !auto_categories {
        return "Uncategorized";
    }
    match detect_content_type(content, format) {
        "rich-text" => "Rich Text",
        "url" => "URLs",
        "email" => "Email Addresses",
        "number" => "Numbers",
        "code" => "Code",
        _ => "Text",
    }
}

// ---------------------------------------------------------------- rich html

static RE_HTML_WRAP: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?is)</?html[^>]*>|<head[^>]*>.*?</head>|</?body[^>]*>|<meta[^>]*>|<!--.*?-->").unwrap());
static RE_STYLE_ATTR: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)style\s*=").unwrap());
static RE_STYLE_ATTR_FULL: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(?i)style\s*=\s*["'][^"']*["']"#).unwrap());
static RE_STRONG_TAGS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)<\s*(a|b|strong|i|em|u|font|h[1-6]|table|tr|td|th|ul|ol|li|img|script|style)\b").unwrap()
});
static RE_FORMAT_TAGS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)<(b|strong|i|em|u|strike|del|s|h1|h2|h3|h4|h5|h6|p|div|span|br|ul|ol|li|a|img|table|tr|td|th|font|color|size)[^>]*>").unwrap()
});

/// Whether HTML on the pasteboard is "real" rich text, or just a wrapper
/// around the same plain string (VS Code / Chromium do this a lot).
pub fn is_rich_html(html: &str, plain: &str) -> bool {
    let normalized_plain = RE_WS.replace_all(plain, " ").trim().to_string();
    let clean = RE_HTML_WRAP.replace_all(html, "").trim().to_string();
    let html_text = RE_WS.replace_all(&RE_TAG.replace_all(&clean, ""), " ").trim().to_string();

    if html_text == normalized_plain && !RE_STYLE_ATTR.is_match(html) && !RE_STRONG_TAGS.is_match(html) {
        return false;
    }
    RE_FORMAT_TAGS.is_match(&clean) || RE_STYLE_ATTR_FULL.is_match(&clean) || html_text != normalized_plain
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_regexes_compile() {
        Lazy::force(&URL_PATTERNS);
        Lazy::force(&EMAIL_PATTERNS);
        Lazy::force(&CODE_PATTERNS);
    }

    #[test]
    fn detects_types() {
        assert_eq!(detect_content_type("https://example.com", "text"), "url");
        assert_eq!(detect_content_type("ftp://files.example.com", "text"), "url");
        assert_eq!(detect_content_type("www.google.com", "text"), "url");
        assert_eq!(detect_content_type("github.io", "text"), "url");
        assert_eq!(detect_content_type("user@example.com", "text"), "email");
        assert_eq!(detect_content_type("+880 1712-345678", "text"), "number");
        assert_eq!(detect_content_type("const x = 5;", "text"), "code");
        assert_eq!(detect_content_type("def foo():", "text"), "code");
        assert_eq!(detect_content_type("hello world", "text"), "text");
        assert_eq!(detect_content_type("আমার নাম আহাদ", "text"), "text");
        assert_eq!(detect_content_type("<b>x</b>", "html"), "rich-text");
    }

    #[test]
    fn not_url_for_colon_text() {
        assert!(!is_url("Note: buy milk"));
    }

    #[test]
    fn numbers_rules() {
        assert!(is_numbers("4111 1111 1111 1111"));
        assert!(!is_numbers("123"));
        assert!(!is_numbers("call 01712345678"));
    }

    #[test]
    fn previews() {
        assert_eq!(generate_preview(&"a".repeat(150), "text").chars().count(), 103);
        assert_eq!(generate_preview("short", "text"), "short");
        assert_eq!(generate_preview("x", "image"), "[Image]");
        assert_eq!(generate_preview("<p>Hello <b>World</b></p>", "html"), "Hello World");
    }

    /// Real RTF from macOS (textutil / Notes), including the case from the bug.
    #[test]
    fn rtf_from_macos_apps() {
        let textedit = "{\\rtf1\\ansi\\ansicpg1252\\cocoartf2761\n\\cocoatextscaling0\\cocoaplatform0{\\fonttbl\\f0\\fswiss\\fcharset0 Helvetica-Light;}\n{\\colortbl;\\red255\\green255\\blue255;}\n{\\*\\expandedcolortbl;;}\n\\pard\\tx560\\pardirnatural\\partightenfactor0\n\n\\f0\\fs24 \\cf0 Hello world\\\n\\uc0\\u2438 \\u2478 \\u2494 \\u2480  \\u2472 \\u2494 \\u2478  \\'97 \\'93quote\\'94 caf\\'e9\\\nsdfsdf}";
        assert_eq!(rtf_to_text(textedit), "Hello world\nআমার নাম — “quote” café\nsdfsdf");

        let notes = "{\\rtf1\\ansi\\ansicpg1252\\cocoartf2761\n\\cocoatextscaling0\\cocoaplatform0{\\fonttbl\\f0\\fnil\\fcharset0 AppleSystemUIFont;}\n{\\colortbl;\\red255\\green255\\blue255;}\n{\\*\\expandedcolortbl;;}\n\\deftab560\n\\pard\\pardeftab560\\slleading20\\partightenfactor0\n\n\\f0\\fs26 \\AppleTypeServices\\AppleTypeServicesF2293774 \\cf0 sdfsdfsfsdfsdfsd}";
        assert_eq!(rtf_to_text(notes), "sdfsdfsfsdfsdfsd");
        assert_eq!(generate_preview(notes, "rtf"), "sdfsdfsfsdfsdfsd");

        // \u with the default \uc1 drops the ANSI fallback char
        assert_eq!(rtf_to_text("{\\rtf1 a\\u8212?b}"), "a—b");
        assert_eq!(rtf_to_text("{\\rtf1 x\\{y\\}\\\\z}"), "x{y}\\z");
    }

    #[test]
    fn file_previews() {
        assert_eq!(generate_preview("/Users/me/report.pdf", "file"), "report.pdf");
        assert_eq!(generate_preview("/a/x.png\n/a/Folder/", "file"), "x.png, Folder");
        assert_eq!(generate_preview("/a/1\n/a/2\n/a/3\n/a/4", "file"), "1, 2 and 2 more");
        assert_eq!(categorize("/a/x", "file", true), "Files");
    }

    #[test]
    fn image_source_text() {
        assert!(is_image_source_text("https://images.example.com/cat.jpg?w=800"));
        assert!(is_image_source_text("https://www.google.com/imgres?imgurl=x"));
        assert!(is_image_source_text("Screenshot.png"));
        assert!(is_image_source_text("/Users/me/Pictures/photo.HEIC"));
        assert!(!is_image_source_text("Revenue 2024\t1200\nCosts\t800")); // Numbers cells
        assert!(!is_image_source_text("Meeting notes for Monday"));
        assert!(!is_image_source_text(""));
    }

    #[test]
    fn rich_html() {
        assert!(!is_rich_html("<span>hello</span>", "hello"));
        assert!(is_rich_html("<b>hello</b>", "hello"));
    }

    #[test]
    fn categories() {
        assert_eq!(categorize("https://x.com", "text", true), "URLs");
        assert_eq!(categorize("https://x.com", "text", false), "Uncategorized");
        assert_eq!(categorize("x", "rtf", false), "Rich Text");
    }
}
