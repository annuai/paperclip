//! Ask Paperclip: one short question to Claude, answered in the balloon.
//!
//! Security shape (same idea as `files.rs`): the API key lives ONLY in the OS keychain and is read here, in Rust,
//! at the moment of a request. JS can set it, remove it and ask whether one exists; it can never read it back.
//! The HTTP call happens here too, so the key never touches the webview and the CSP stays unchanged.
//! Only the typed question and the in-memory history (sent by JS) go over the wire: no screen, clipboard or files.
//! The key is never logged and never part of an error message.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

const KEYCHAIN_SERVICE: &str = "app.paperclip.desktop";
const KEYCHAIN_ACCOUNT: &str = "anthropic-api-key";
const API_URL: &str = "https://api.anthropic.com/v1/messages";
const API_VERSION: &str = "2023-06-01";
/// Server-side refusal fallback (Sonnet 5.5 supports the `"default"` form; Haiku 5.5 has no server-side fallback).
const FALLBACK_BETA: &str = "server-side-fallback-2026-07-01";
const HAIKU: &str = "claude-haiku-5-5";
const SONNET: &str = "claude-sonnet-5-5";
const MAX_TOKENS: u32 = 200;
const TIMEOUT: Duration = Duration::from_secs(20);
/// Six exchanges (a question and its answer) of context at most.
const MAX_HISTORY_MESSAGES: usize = 12;
const MAX_TURN_CHARS: usize = 600;
/// Keep the balloon small: answers are cut to about this many characters.
const MAX_ANSWER_CHARS: usize = 220;
const MAX_KEY_LEN: usize = 512;

const SYSTEM_PROMPT: &str = "You are Paperclip, a cheerful, slightly dorky paperclip who lives on the user's desktop. \
Answer in 1 to 3 short sentences, under 220 characters in total, because your speech balloon is tiny. \
Use plain text only: no markdown, no lists, no code blocks, no emoji. \
Be warm and a little playful, but get the answer right. If a question needs a long answer, give the key point and say you are keeping it short.";

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Turn {
    pub role: String,
    pub text: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FailureKind {
    NoKey,
    Unauthorized,
    RateLimited,
    Overloaded,
    Offline,
    Timeout,
    Refused,
    Empty,
    Other,
}

/// What JS receives when asking fails: a `kind` to branch on and a `message` in his voice, ready for the balloon.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct AskFailure {
    pub kind: FailureKind,
    pub message: String,
}

fn failure(kind: FailureKind, message: &str) -> AskFailure {
    AskFailure { kind, message: message.to_string() }
}

fn no_key() -> AskFailure {
    failure(FailureKind::NoKey, "I need a Claude API key before I can answer questions. Want to add one?")
}

// ---------------------------------------------------------------------------------------------------------------
// Request building (pure)
// ---------------------------------------------------------------------------------------------------------------

/// Only the two supported models are ever sent, whatever JS says.
fn resolve_model(requested: Option<&str>) -> &'static str {
    if requested == Some(SONNET) {
        SONNET
    } else {
        HAIKU
    }
}

fn clip(text: &str, max: usize) -> String {
    text.trim().chars().take(max).collect()
}

/// The last six exchanges, cleaned up, starting with a user message, followed by the new question.
fn build_messages(history: &[Turn], question: &str) -> Vec<Value> {
    let mut msgs: Vec<(&str, String)> = history
        .iter()
        .filter_map(|t| {
            let role = match t.role.as_str() {
                "user" => "user",
                "assistant" => "assistant",
                _ => return None,
            };
            let text = clip(&t.text, MAX_TURN_CHARS);
            if text.is_empty() {
                None
            } else {
                Some((role, text))
            }
        })
        .collect();
    if msgs.len() > MAX_HISTORY_MESSAGES {
        msgs.drain(..msgs.len() - MAX_HISTORY_MESSAGES);
    }
    while msgs.first().is_some_and(|(r, _)| *r == "assistant") {
        msgs.remove(0);
    }
    msgs.push(("user", clip(question, MAX_TURN_CHARS)));
    msgs.into_iter().map(|(r, t)| json!({ "role": r, "content": t })).collect()
}

/// The JSON body, and whether the request needs the server-side-fallback beta header.
///
/// Thinking is switched off and effort is low so the 200 output tokens are all answer: Haiku 5.5 takes
/// `disabled`, Sonnet 5.5 rejects it and takes `between_tools` (no tools are sent, so it never thinks).
/// No sampling parameters (they are rejected on these models) and no assistant prefill.
pub fn build_request(model: Option<&str>, history: &[Turn], question: &str) -> (Value, bool) {
    let model = resolve_model(model);
    let sonnet = model == SONNET;
    let mut body = json!({
        "model": model,
        "max_tokens": MAX_TOKENS,
        "system": SYSTEM_PROMPT,
        "messages": build_messages(history, question),
        "thinking": { "type": if sonnet { "between_tools" } else { "disabled" } },
        "output_config": { "effort": "low" },
    });
    if sonnet {
        body["fallbacks"] = json!("default");
    }
    (body, sonnet)
}

// ---------------------------------------------------------------------------------------------------------------
// Response handling (pure)
// ---------------------------------------------------------------------------------------------------------------

/// Turns the model's text into something that fits a tiny plain-text balloon.
pub fn tidy_answer(raw: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    for line in raw.lines() {
        let mut l = line.trim();
        if l.starts_with("```") {
            continue; // a code fence marker line
        }
        l = l.trim_start_matches('#').trim_start();
        l = l.strip_prefix('>').unwrap_or(l).trim_start();
        for bullet in ["- ", "* ", "+ ", "• "] {
            if let Some(rest) = l.strip_prefix(bullet) {
                l = rest;
                break;
            }
        }
        let digits = l.chars().take_while(char::is_ascii_digit).count();
        if digits > 0 && digits <= 2 {
            if let Some(rest) = l[digits..].strip_prefix(". ") {
                l = rest;
            }
        }
        if !l.is_empty() {
            lines.push(l.to_string());
        }
    }
    let text = strip_inline_markdown(&lines.join(" "));
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    shorten(&text, MAX_ANSWER_CHARS)
}

/// `[text](url)` becomes `text`, emphasis and code markers disappear. Underscores inside words (snake_case) stay.
fn strip_inline_markdown(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        // [label](target) and ![alt](target)
        if c == '[' || (c == '!' && chars.get(i + 1) == Some(&'[')) {
            let open = if c == '!' { i + 1 } else { i };
            if let Some(close) = chars[open..].iter().position(|&x| x == ']').map(|p| p + open) {
                if chars.get(close + 1) == Some(&'(') {
                    if let Some(end) = chars[close..].iter().position(|&x| x == ')').map(|p| p + close) {
                        out.extend(&chars[open + 1..close]);
                        i = end + 1;
                        continue;
                    }
                }
            }
        }
        match c {
            '*' | '`' | '~' => {}
            '_' => {
                let prev_word = i > 0 && chars[i - 1].is_alphanumeric();
                let next_word = chars.get(i + 1).is_some_and(|n| n.is_alphanumeric());
                if prev_word && next_word {
                    out.push('_'); // inside a word
                }
            }
            _ => out.push(c),
        }
        i += 1;
    }
    out
}

/// Cut to `max` characters, preferably after a full sentence, otherwise at a word with an ellipsis.
fn shorten(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let head: String = text.chars().take(max).collect();
    if let Some(pos) = head.rfind(['.', '!', '?']) {
        if head[..pos].chars().count() >= 60 {
            return head[..=pos].to_string();
        }
    }
    let cut = head.rfind(' ').map_or(head.as_str(), |p| &head[..p]);
    format!("{}…", cut.trim_end_matches([',', ';', ':', '-', ' ']))
}

fn http_failure(status: u16) -> AskFailure {
    match status {
        401 | 403 => failure(FailureKind::Unauthorized, "Claude didn't accept my API key. It may be mistyped or revoked. Want to enter it again?"),
        429 => failure(FailureKind::RateLimited, "Whoa, I've asked Claude a lot of questions very quickly. Give it a minute, then ask me again."),
        500..=599 => failure(FailureKind::Overloaded, "Claude is a bit overwhelmed right now. Ask me again in a moment."),
        _ => AskFailure {
            kind: FailureKind::Other,
            message: format!("Something went wrong when I asked Claude (error {status}). Try again later."),
        },
    }
}

/// Maps an HTTP status and body to a tidy answer or a friendly failure.
pub fn parse_response(status: u16, body: &str) -> Result<String, AskFailure> {
    if !(200..300).contains(&status) {
        return Err(http_failure(status));
    }
    let v: Value = serde_json::from_str(body)
        .map_err(|_| failure(FailureKind::Other, "Claude sent me something I couldn't read. Try again?"))?;
    if v.get("stop_reason").and_then(Value::as_str) == Some("refusal") {
        return Err(failure(FailureKind::Refused, "Claude would rather not answer that one. Try asking me something else?"));
    }
    let text: String = v
        .get("content")
        .and_then(Value::as_array)
        .map(|blocks| {
            blocks
                .iter()
                .filter(|b| b.get("type").and_then(Value::as_str) == Some("text"))
                .filter_map(|b| b.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default();
    let answer = tidy_answer(&text);
    if answer.is_empty() {
        return Err(failure(FailureKind::Empty, "Claude sent back a blank reply. Try asking a different way?"));
    }
    Ok(answer)
}

fn transport_failure(e: &reqwest::Error) -> AskFailure {
    if e.is_timeout() {
        failure(FailureKind::Timeout, "Claude took too long to answer, so I gave up waiting. Try again?")
    } else if e.is_connect() {
        failure(FailureKind::Offline, "It looks like you're offline. I can't reach Claude from here.")
    } else {
        failure(FailureKind::Other, "Something went wrong reaching Claude. Try again later.")
    }
}

// ---------------------------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------------------------

async fn send(url: &str, key: &str, body: &Value, fallback_beta: bool) -> Result<String, AskFailure> {
    let mut key_header = reqwest::header::HeaderValue::from_str(key)
        .map_err(|_| failure(FailureKind::Unauthorized, "The stored API key looks damaged. Want to enter it again?"))?;
    key_header.set_sensitive(true); // never shown by Debug
    let client = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .map_err(|_| failure(FailureKind::Other, "Something went wrong reaching Claude. Try again later."))?;
    let mut req = client
        .post(url)
        .header("x-api-key", key_header)
        .header("anthropic-version", API_VERSION)
        .json(body);
    if fallback_beta {
        req = req.header("anthropic-beta", FALLBACK_BETA);
    }
    let resp = req.send().await.map_err(|e| transport_failure(&e))?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| transport_failure(&e))?;
    parse_response(status, &text)
}

// ---------------------------------------------------------------------------------------------------------------
// Keychain
// ---------------------------------------------------------------------------------------------------------------

fn entry() -> keyring::Result<keyring::Entry> {
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
}

fn read_key() -> Option<String> {
    entry().ok()?.get_password().ok().filter(|k| !k.is_empty())
}

fn validate_key(raw: &str) -> Result<String, &'static str> {
    let key = raw.trim();
    if key.is_empty() {
        return Err("That key is empty.");
    }
    if key.len() > MAX_KEY_LEN || !key.bytes().all(|b| b.is_ascii_graphic()) {
        return Err("That doesn't look like an API key.");
    }
    Ok(key.to_string())
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Option<T> {
    tauri::async_runtime::spawn_blocking(f).await.ok()
}

/// True when a key is stored. The key itself is never returned.
#[tauri::command]
pub async fn ask_key_status() -> bool {
    blocking(|| read_key().is_some()).await.unwrap_or(false)
}

#[tauri::command]
pub async fn ask_set_key(key: String) -> Result<(), String> {
    let key = validate_key(&key).map_err(str::to_string)?;
    blocking(move || entry().and_then(|e| e.set_password(&key)))
        .await
        .ok_or_else(|| "The keychain didn't answer.".to_string())?
        .map_err(|_| "I couldn't save the key to your keychain.".to_string())
}

#[tauri::command]
pub async fn ask_remove_key() -> Result<(), String> {
    let res = blocking(|| entry().and_then(|e| e.delete_credential()))
        .await
        .ok_or_else(|| "The keychain didn't answer.".to_string())?;
    match res {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("I couldn't remove the key from your keychain.".to_string()),
    }
}

/// Sends one question (plus the in-memory history JS holds) to Claude and returns the tidy answer.
#[tauri::command]
pub async fn ask(question: String, history: Vec<Turn>, model: Option<String>) -> Result<String, AskFailure> {
    let question = question.trim().to_string();
    if question.is_empty() {
        return Err(failure(FailureKind::Empty, "I didn't catch a question. What would you like to know?"));
    }
    let key = blocking(read_key).await.flatten().ok_or_else(no_key)?;
    let (body, beta) = build_request(model.as_deref(), &history, &question);
    send(API_URL, &key, &body, beta).await
}

// ---------------------------------------------------------------------------------------------------------------
// Keyboard focus
// ---------------------------------------------------------------------------------------------------------------

/// The window is `focus: false`, so typing needs an explicit grab. `on = false` hands the keyboard back afterwards.
/// Click-through itself is restored by the frontend dropping the balloon hit rect (see `clickthrough.rs`).
#[tauri::command]
pub fn ask_focus(app: tauri::AppHandle, window: tauri::WebviewWindow, on: bool) {
    if on {
        let _ = window.set_focus();
    } else {
        release_focus(&app);
    }
}

/// macOS: `[NSApp deactivate]` (14+) so the previously active app gets the keyboard back. Elsewhere there is nothing
/// to do: the window is click-through again, and the next click in another app moves focus there.
#[cfg(target_os = "macos")]
fn release_focus(app: &tauri::AppHandle) {
    let _ = app.run_on_main_thread(|| {
        use objc2::runtime::{AnyObject, Sel};
        use objc2::{class, msg_send, sel};
        // SAFETY: plain Objective-C messages to the shared NSApplication, on the main thread.
        unsafe {
            let ns_app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
            if ns_app.is_null() {
                return;
            }
            let selector: Sel = sel!(deactivate);
            let responds: bool = msg_send![ns_app, respondsToSelector: selector];
            if responds {
                let _: () = msg_send![ns_app, deactivate];
            }
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn release_focus(_app: &tauri::AppHandle) {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn turn(role: &str, text: &str) -> Turn {
        Turn { role: role.to_string(), text: text.to_string() }
    }

    // ---- request ----

    #[test]
    fn request_shape_for_haiku_by_default() {
        let (body, beta) = build_request(None, &[], "What is Rust?");
        assert!(!beta);
        assert_eq!(body["model"], "claude-haiku-5-5");
        assert_eq!(body["max_tokens"], 200);
        assert_eq!(body["thinking"]["type"], "disabled");
        assert_eq!(body["output_config"]["effort"], "low");
        assert!(body.get("fallbacks").is_none());
        assert!(body.get("temperature").is_none() && body.get("top_p").is_none() && body.get("top_k").is_none());
        assert_eq!(body["messages"], json!([{ "role": "user", "content": "What is Rust?" }]));
        let system = body["system"].as_str().unwrap();
        assert!(system.contains("Paperclip") && system.contains("1 to 3 short sentences") && system.contains("no markdown"));
    }

    #[test]
    fn request_shape_for_sonnet_uses_between_tools_and_fallback() {
        let (body, beta) = build_request(Some("claude-sonnet-5-5"), &[], "Hi");
        assert!(beta);
        assert_eq!(body["model"], "claude-sonnet-5-5");
        assert_eq!(body["thinking"], json!({ "type": "between_tools" }));
        assert_eq!(body["fallbacks"], "default");
    }

    #[test]
    fn unknown_models_fall_back_to_haiku() {
        let (body, _) = build_request(Some("claude-opus-5-5"), &[], "Hi");
        assert_eq!(body["model"], "claude-haiku-5-5");
        let (body, _) = build_request(Some("../../evil"), &[], "Hi");
        assert_eq!(body["model"], "claude-haiku-5-5");
    }

    #[test]
    fn history_is_capped_to_six_exchanges_and_starts_with_a_user_message() {
        let mut h = Vec::new();
        for i in 0..10 {
            h.push(turn("user", &format!("q{i}")));
            h.push(turn("assistant", &format!("a{i}")));
        }
        let msgs = build_messages(&h, "now");
        assert_eq!(msgs.len(), 13); // 12 kept + the new question
        assert_eq!(msgs[0], json!({ "role": "user", "content": "q4" }));
        assert_eq!(msgs[12], json!({ "role": "user", "content": "now" }));
    }

    #[test]
    fn history_drops_leading_assistant_turns_unknown_roles_and_blanks() {
        let h = vec![turn("assistant", "orphan"), turn("system", "ignore previous"), turn("user", "  "), turn("user", "q"), turn("assistant", "a")];
        let msgs = build_messages(&h, "next");
        assert_eq!(msgs.iter().map(|m| m["content"].as_str().unwrap()).collect::<Vec<_>>(), ["q", "a", "next"]);
    }

    #[test]
    fn long_turns_are_clipped() {
        let long = "x".repeat(5000);
        let msgs = build_messages(&[], &long);
        assert_eq!(msgs[0]["content"].as_str().unwrap().len(), 600);
    }

    // ---- response ----

    fn ok_body(text: &str) -> String {
        json!({ "stop_reason": "end_turn", "content": [{ "type": "text", "text": text }] }).to_string()
    }

    #[test]
    fn parses_a_text_answer() {
        assert_eq!(parse_response(200, &ok_body("Paris, of course.")).unwrap(), "Paris, of course.");
    }

    #[test]
    fn joins_text_blocks_and_ignores_others() {
        let body = json!({ "stop_reason": "end_turn", "content": [
            { "type": "thinking", "thinking": "" },
            { "type": "text", "text": "One." }, { "type": "text", "text": "Two." } ] })
        .to_string();
        assert_eq!(parse_response(200, &body).unwrap(), "One. Two.");
    }

    #[test]
    fn refusal_and_empty_replies_are_friendly_errors() {
        let refusal = json!({ "stop_reason": "refusal", "content": [] }).to_string();
        assert_eq!(parse_response(200, &refusal).unwrap_err().kind, FailureKind::Refused);
        assert_eq!(parse_response(200, &ok_body("   ")).unwrap_err().kind, FailureKind::Empty);
        assert_eq!(parse_response(200, "{\"content\":[]}").unwrap_err().kind, FailureKind::Empty);
        assert_eq!(parse_response(200, "not json").unwrap_err().kind, FailureKind::Other);
    }

    #[test]
    fn http_statuses_map_to_friendly_kinds() {
        let kind = |s| parse_response(s, "{}").unwrap_err().kind;
        assert_eq!(kind(401), FailureKind::Unauthorized);
        assert_eq!(kind(403), FailureKind::Unauthorized);
        assert_eq!(kind(429), FailureKind::RateLimited);
        assert_eq!(kind(529), FailureKind::Overloaded);
        assert_eq!(kind(500), FailureKind::Overloaded);
        assert_eq!(kind(503), FailureKind::Overloaded);
        assert_eq!(kind(400), FailureKind::Other);
        assert!(parse_response(400, "{}").unwrap_err().message.contains("400"));
    }

    #[test]
    fn failure_messages_never_echo_the_response_body() {
        let e = parse_response(401, "{\"error\":{\"message\":\"invalid x-api-key sk-ant-SECRET\"}}").unwrap_err();
        assert!(!e.message.contains("SECRET"));
    }

    #[test]
    fn failures_serialize_with_camel_case_kinds() {
        let v = serde_json::to_value(no_key()).unwrap();
        assert_eq!(v["kind"], "noKey");
        assert!(v["message"].as_str().unwrap().contains("API key"));
        assert_eq!(serde_json::to_value(FailureKind::RateLimited).unwrap(), "rateLimited");
    }

    // ---- markdown stripping ----

    #[test]
    fn strips_markdown() {
        assert_eq!(tidy_answer("**Bold** and *italic* and `code`."), "Bold and italic and code.");
        assert_eq!(tidy_answer("# Title\n- one\n- two\n3. three"), "Title one two three");
        assert_eq!(tidy_answer("See [the docs](https://example.com/x) now."), "See the docs now.");
        assert_eq!(tidy_answer("```rust\nlet x = 1;\n```"), "let x = 1;");
        assert_eq!(tidy_answer("> quoted\n\nline   two"), "quoted line two");
        assert_eq!(tidy_answer("use snake_case and _emphasis_ here"), "use snake_case and emphasis here");
        assert_eq!(tidy_answer("~~gone~~ text"), "gone text");
    }

    #[test]
    fn long_answers_end_at_a_sentence_or_a_word() {
        let sentence = "This is a fairly long sentence that keeps going. ";
        let long = sentence.repeat(10);
        let out = tidy_answer(&long);
        assert!(out.chars().count() <= 220, "{}", out.chars().count());
        assert!(out.ends_with('.'));
        let no_stops = "word ".repeat(100);
        let out = tidy_answer(&no_stops);
        assert!(out.chars().count() <= 221);
        assert!(out.ends_with('…'));
        assert_eq!(tidy_answer("Short and sweet."), "Short and sweet.");
    }

    #[test]
    fn shortening_is_char_safe() {
        let s = "é".repeat(300);
        let out = tidy_answer(&s);
        assert!(out.chars().count() <= 221);
    }

    // ---- key validation ----

    #[test]
    fn key_validation() {
        assert_eq!(validate_key("  sk-ant-abc123  ").unwrap(), "sk-ant-abc123");
        assert!(validate_key("   ").is_err());
        assert!(validate_key("sk ant").is_err());
        assert!(validate_key("sk-ant\nabc").is_err());
        assert!(validate_key(&"k".repeat(600)).is_err());
    }

    // ---- the HTTP path against a local stub (no network, fake key) ----

    fn stub(status_line: &'static str, body: String) -> (String, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/v1/messages", listener.local_addr().unwrap());
        let handle = std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            let mut buf = vec![0u8; 16384];
            let mut got = Vec::new();
            // read until the whole request (headers + JSON body) has arrived
            loop {
                let n = s.read(&mut buf).unwrap();
                got.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&got).to_string();
                if let Some(h) = text.find("\r\n\r\n") {
                    let len = text[..h]
                        .lines()
                        .find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().unwrap()))
                        .unwrap_or(0);
                    if got.len() >= h + 4 + len || n == 0 {
                        break;
                    }
                }
                if n == 0 {
                    break;
                }
            }
            let resp = format!("HTTP/1.1 {status_line}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
            s.write_all(resp.as_bytes()).unwrap();
            String::from_utf8_lossy(&got).to_string()
        });
        (url, handle)
    }

    #[test]
    fn sends_the_documented_headers_and_body() {
        let (url, seen) = stub("200 OK", ok_body("Hello there."));
        let (body, beta) = build_request(Some("claude-sonnet-5-5"), &[], "Hi");
        let out = tauri::async_runtime::block_on(send(&url, "test-key-123", &body, beta));
        assert_eq!(out.unwrap(), "Hello there.");
        let req = seen.join().unwrap().to_ascii_lowercase();
        assert!(req.starts_with("post /v1/messages"));
        assert!(req.contains("x-api-key: test-key-123"));
        assert!(req.contains("anthropic-version: 2023-06-01"));
        assert!(req.contains("anthropic-beta: server-side-fallback-2026-07-01"));
        assert!(req.contains("\"model\":\"claude-sonnet-5-5\""));
        assert!(req.contains("\"max_tokens\":200"));
    }

    #[test]
    fn haiku_sends_no_beta_header() {
        let (url, seen) = stub("200 OK", ok_body("Hi."));
        let (body, beta) = build_request(None, &[], "Hi");
        tauri::async_runtime::block_on(send(&url, "k", &body, beta)).unwrap();
        assert!(!seen.join().unwrap().to_ascii_lowercase().contains("anthropic-beta"));
    }

    #[test]
    fn a_401_from_the_server_is_a_friendly_unauthorized() {
        let (url, _h) = stub("401 Unauthorized", "{\"type\":\"error\"}".to_string());
        let (body, beta) = build_request(None, &[], "Hi");
        let e = tauri::async_runtime::block_on(send(&url, "k", &body, beta)).unwrap_err();
        assert_eq!(e.kind, FailureKind::Unauthorized);
    }

    #[test]
    fn nothing_listening_means_offline() {
        let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port(); // freed again on drop
        let (body, beta) = build_request(None, &[], "Hi");
        let e = tauri::async_runtime::block_on(send(&format!("http://127.0.0.1:{port}/v1/messages"), "k", &body, beta)).unwrap_err();
        assert_eq!(e.kind, FailureKind::Offline);
    }

    #[test]
    fn a_key_with_header_breaking_bytes_never_reaches_the_wire() {
        let (body, beta) = build_request(None, &[], "Hi");
        let e = tauri::async_runtime::block_on(send("http://127.0.0.1:9/", "bad\nkey", &body, beta)).unwrap_err();
        assert_eq!(e.kind, FailureKind::Unauthorized);
    }
}
