//! The welcome guide window: a second webview that Paperclip moves into for first-run onboarding.
//!
//! Security shape: JS never supplies a URL. Key pages come from a fixed allowlist, the window may only load the app's
//! own pages, and each command checks which window is calling.

use serde::Deserialize;

pub const LABEL: &str = "welcome";

/// The stored model id of each provider; the guide uses the one for its current tab.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct GuideModels {
    pub openrouter: Option<String>,
    pub groq: Option<String>,
    pub claude: Option<String>,
}

pub(crate) struct GuideQuery<'a> {
    pub style: &'a str,
    pub provider: &'a str,
    pub start: &'a str,
    pub outfit: Option<&'a str>,
    pub models: &'a GuideModels,
    pub platform: &'static str,
}

const OUTFITS: [&str; 6] = ["none", "santa-hat", "party-hat", "heart", "pumpkin", "shamrock"];

pub(crate) fn key_page_url(provider: &str) -> Option<&'static str> {
    match provider {
        "openrouter" => Some("https://openrouter.ai/keys"),
        "groq" => Some("https://console.groq.com/keys"),
        "anthropic" => Some("https://platform.claude.com/settings/keys"),
        _ => None,
    }
}

/// The page to load, with the starting state in the query. Bad enums are an error; a bad model or outfit is dropped.
pub(crate) fn guide_url(q: &GuideQuery) -> Result<String, String> {
    if !matches!(q.style, "classic" | "flat") || key_page_url(q.provider).is_none() || !matches!(q.start, "hello" | "key") {
        return Err("invalid guide settings".to_string());
    }
    let mut url = format!("welcome.html?style={}&provider={}&start={}&platform={}", q.style, q.provider, q.start, q.platform);
    // Model ids are validated to URL-safe characters, so they need no encoding.
    let safe = |v: &str| !v.contains(['&', '=', '#']);
    let m = q.models;
    if let Some(id) = m.openrouter.as_deref().filter(|id| crate::ask::valid_model_id(id) && safe(id)) {
        url.push_str(&format!("&orModel={id}"));
    }
    if let Some(id) = m.groq.as_deref().filter(|id| crate::ask::valid_groq_model_id(id) && safe(id)) {
        url.push_str(&format!("&groqModel={id}"));
    }
    if let Some(id) = m.claude.as_deref().filter(|id| *id == crate::ask::HAIKU || *id == crate::ask::SONNET) {
        url.push_str(&format!("&claudeModel={id}"));
    }
    if let Some(outfit) = q.outfit.filter(|o| OUTFITS.contains(o)) {
        url.push_str(&format!("&outfit={outfit}"));
    }
    Ok(url)
}

/// Centre of the work area (`x, y, width, height`, physical px), never above or left of its origin.
pub(crate) fn place(work: (f64, f64, f64, f64), size: (f64, f64)) -> (f64, f64) {
    let (x, y, w, h) = work;
    (x + ((w - size.0) / 2.0).max(0.0).round(), y + ((h - size.1) / 2.0).max(0.0).round())
}

/// Only the app's own pages (and the dev server in debug builds).
pub(crate) fn nav_allowed(url: &str, debug: bool) -> bool {
    url.starts_with("tauri://localhost/")
        || url.starts_with("http://tauri.localhost/")
        || (debug && url.starts_with("http://localhost:1420/"))
}

pub(crate) fn platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query<'a>(style: &'a str, provider: &'a str, start: &'a str, outfit: Option<&'a str>, models: &'a GuideModels) -> GuideQuery<'a> {
        GuideQuery { style, provider, start, outfit, models, platform: "macos" }
    }

    #[test]
    fn key_pages_are_a_fixed_allowlist() {
        assert_eq!(key_page_url("openrouter"), Some("https://openrouter.ai/keys"));
        assert_eq!(key_page_url("groq"), Some("https://console.groq.com/keys"));
        assert_eq!(key_page_url("anthropic"), Some("https://platform.claude.com/settings/keys"));
        for bad in ["", "OPENROUTER", "https://evil"] {
            assert_eq!(key_page_url(bad), None);
        }
    }

    #[test]
    fn builds_the_page_url_and_rejects_bad_enums() {
        let none = GuideModels::default();
        assert_eq!(guide_url(&query("flat", "groq", "key", None, &none)).unwrap(), "welcome.html?style=flat&provider=groq&start=key&platform=macos");
        assert!(guide_url(&query("neon", "groq", "key", None, &none)).is_err());
        assert!(guide_url(&query("flat", "x", "key", None, &none)).is_err());
        assert!(guide_url(&query("flat", "groq", "ask", None, &none)).is_err());
    }

    #[test]
    fn each_model_is_checked_by_its_own_rule() {
        let good = GuideModels { openrouter: Some("openai/gpt-oss-120b".into()), groq: Some("llama-3.1".into()), claude: Some("claude-sonnet-5-5".into()) };
        let url = guide_url(&query("flat", "groq", "hello", Some("pumpkin"), &good)).unwrap();
        for part in ["&orModel=openai/gpt-oss-120b", "&groqModel=llama-3.1", "&claudeModel=claude-sonnet-5-5", "&outfit=pumpkin"] {
            assert!(url.contains(part), "{url}");
        }
        let bad = GuideModels { openrouter: Some("bad id".into()), groq: Some("a&b".into()), claude: Some("claude-opus".into()) };
        let url = guide_url(&query("flat", "groq", "hello", Some("crown"), &bad)).unwrap();
        assert!(!url.contains("Model=") && !url.contains("outfit"), "{url}");
    }

    #[test]
    fn centres_in_the_work_area() {
        assert_eq!(place((0.0, 0.0, 2880.0, 1800.0), (1280.0, 1040.0)), (800.0, 380.0));
        assert_eq!(place((100.0, 50.0, 800.0, 600.0), (1280.0, 1040.0)), (100.0, 50.0));
    }

    #[test]
    fn navigation_stays_inside_the_app() {
        assert!(nav_allowed("tauri://localhost/welcome.html", false));
        assert!(nav_allowed("http://tauri.localhost/x", false));
        assert!(nav_allowed("http://localhost:1420/welcome.html", true));
        assert!(!nav_allowed("http://localhost:1420/welcome.html", false));
        assert!(!nav_allowed("https://openrouter.ai/keys", true));
    }
}
