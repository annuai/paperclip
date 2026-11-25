//! Ask Paperclip: one short question to a model on OpenRouter (default), on Groq, or to Claude via the Anthropic API,
//! answered in the balloon.
//!
//! Security shape (same idea as `files.rs`): each provider's API key lives ONLY in the OS keychain (one account per provider) and is read here, in Rust,
//! at the moment of a request. JS can set it, remove it and ask whether one exists; it can never read it back.
//! The HTTP call happens here too, so the key never touches the webview and the CSP stays unchanged.
//! Only the typed question and the in-memory history (sent by JS) go over the wire: no screen, clipboard or files.
//! The key is never logged and never part of an error message.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

const KEYCHAIN_SERVICE: &str = "app.paperclip.desktop";
const OPENROUTER_ACCOUNT: &str = "openrouter-api-key";
const ANTHROPIC_ACCOUNT: &str = "anthropic-api-key";
const GROQ_ACCOUNT: &str = "groq-api-key";
const API_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
const GROQ_URL: &str = "https://api.groq.com/openai/v1/chat/completions";
/// Groq production models (console.groq.com/docs/models). The default is a fast non-reasoning chat model, so no
/// reasoning params are needed; the menu's "smarter" choice, `openai/gpt-oss-120b`, is a reasoning model and gets
/// minimal, hidden reasoning (see `build_groq_request`).
const GROQ_DEFAULT_MODEL: &str = "llama-3.3-70b-versatile";
/// Tight cap on purpose: the balloon holds ~220 characters (about 60 tokens).
const GROQ_MAX_TOKENS: u32 = 120;
/// A reasoning model spends part of `max_tokens` on its (hidden) reasoning, so it gets headroom.
const GROQ_REASONING_MAX_TOKENS: u32 = 600;
const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
/// Server-side refusal fallback (Sonnet 5.5 supports the `"default"` form; Haiku 5.5 has no server-side fallback).
const FALLBACK_BETA: &str = "server-side-fallback-2026-07-01";
const HAIKU: &str = "claude-haiku-5-5";
const SONNET: &str = "claude-sonnet-5-5";
const ANTHROPIC_MAX_TOKENS: u32 = 200;
const REFERER: &str = "https://github.com/annuai/paperclip";
const APP_TITLE: &str = "Paperclip";
/// The free default, and the free router OpenRouter falls back to when it is busy.
const DEFAULT_MODEL: &str = "google/gemma-4-31b-it:free";
const FREE_ROUTER: &str = "openrouter/free";
const MAX_MODEL_ID_LEN: usize = 100;
/// Room for a short hidden think plus the answer: some free models (picked by the `openrouter/free` fallback)
/// must reason, and a tight cap left them with an empty reply. The answer itself is still trimmed to ~220 chars.
const MAX_TOKENS: u32 = 1000;
const TIMEOUT: Duration = Duration::from_secs(20);
/// Six exchanges (a question and its answer) of context at most.
const MAX_HISTORY_MESSAGES: usize = 12;
const MAX_TURN_CHARS: usize = 600;
/// Keep the balloon small: answers are cut to about this many characters.
const MAX_ANSWER_CHARS: usize = 220;
const MAX_KEY_LEN_OPENROUTER: usize = 400;
const MAX_KEY_LEN_ANTHROPIC: usize = 512;
const MAX_KEY_LEN_GROQ: usize = 512;

const SYSTEM_PROMPT: &str = "You are Paperclip, a cheerful, slightly dorky paperclip who lives on the user's desktop. \
Answer in 1 to 3 short sentences, under 220 characters in total, because your speech balloon is tiny. \
Use plain text only: no markdown, no lists, no code blocks, no emoji. \
Be warm and a little playful, but get the answer right. If a question needs a long answer, give the key point and say you are keeping it short.";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    OpenRouter,
    Groq,
    Anthropic,
}

impl Provider {
    /// Anything but "anthropic" or "groq" is OpenRouter (the default).
    fn parse(s: Option<&str>) -> Self {
        match s {
            Some("anthropic") => Provider::Anthropic,
            Some("groq") => Provider::Groq,
            _ => Provider::OpenRouter,
        }
    }
    fn account(self) -> &'static str {
        match self {
            Provider::OpenRouter => OPENROUTER_ACCOUNT,
            Provider::Groq => GROQ_ACCOUNT,
            Provider::Anthropic => ANTHROPIC_ACCOUNT,
        }
    }
    fn name(self) -> &'static str {
        match self {
            Provider::OpenRouter => "OpenRouter",
            Provider::Groq => "Groq",
            Provider::Anthropic => "Claude",
        }
    }
    fn max_key_len(self) -> usize {
        match self {
            Provider::OpenRouter => MAX_KEY_LEN_OPENROUTER,
            Provider::Groq => MAX_KEY_LEN_GROQ,
            Provider::Anthropic => MAX_KEY_LEN_ANTHROPIC,
        }
    }
}

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
    OutOfCredits,
    BadModel,
    RateLimited,
    Overloaded,
    Offline,
    Timeout,
    TooLong,
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

fn no_key(provider: Provider) -> AskFailure {
    failure(FailureKind::NoKey, &format!("I need a {} API key before I can answer questions. Want to add one?", provider.name()))
}

// ---------------------------------------------------------------------------------------------------------------
// Request building (pure)
// ---------------------------------------------------------------------------------------------------------------

/// `vendor/model-name`: `^[A-Za-z0-9._~-]+/[A-Za-z0-9._:~-]+$`, at most 100 characters.
pub fn valid_model_id(id: &str) -> bool {
    if id.is_empty() || id.len() > MAX_MODEL_ID_LEN {
        return false;
    }
    let Some((vendor, name)) = id.split_once('/') else { return false };
    let vendor_ok = !vendor.is_empty() && vendor.bytes().all(|b| b.is_ascii_alphanumeric() || b"._~-".contains(&b));
    let name_ok = !name.is_empty() && name.bytes().all(|b| b.is_ascii_alphanumeric() || b"._:~-".contains(&b));
    vendor_ok && name_ok
}

/// A Groq model id: `llama-3.3-70b-versatile`, or with a vendor prefix such as `openai/gpt-oss-20b`.
/// `^[A-Za-z0-9][A-Za-z0-9._~-]*(/[A-Za-z0-9._:~-]+)?$`, at most 100 characters.
pub fn valid_groq_model_id(id: &str) -> bool {
    if id.is_empty() || id.len() > MAX_MODEL_ID_LEN {
        return false;
    }
    let (head, tail) = match id.split_once('/') {
        Some((h, t)) => (h, Some(t)),
        None => (id, None),
    };
    let head_ok = head.bytes().next().is_some_and(|b| b.is_ascii_alphanumeric()) && head.bytes().all(|b| b.is_ascii_alphanumeric() || b"._~-".contains(&b));
    let tail_ok = tail.is_none_or(|t| !t.is_empty() && t.bytes().all(|b| b.is_ascii_alphanumeric() || b"._:~-".contains(&b)));
    head_ok && tail_ok
}

fn resolve_groq_model(requested: Option<&str>) -> &str {
    match requested {
        Some(m) if valid_groq_model_id(m) => m,
        _ => GROQ_DEFAULT_MODEL,
    }
}

/// The gpt-oss models are Groq's reasoning models; the only ones that get (and accept) the reasoning params.
fn is_groq_reasoning_model(model: &str) -> bool {
    model.starts_with("openai/gpt-oss-")
}

/// The two Claude models of the Anthropic path; anything else becomes Haiku.
fn resolve_claude_model(requested: Option<&str>) -> &'static str {
    if requested == Some(SONNET) {
        SONNET
    } else {
        HAIKU
    }
}

/// Any well-formed OpenRouter model id is sent as is; anything else falls back to the default.
fn resolve_model(requested: Option<&str>) -> &str {
    match requested {
        Some(m) if valid_model_id(m) => m,
        _ => DEFAULT_MODEL,
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

/// The OpenAI-style JSON body. The system prompt is the first message.
///
/// Reasoning is kept to `effort: "low"` and `exclude: true` (never shown, never returned). `"none"` is not used:
/// OpenRouter rejects it with a 400 ("Reasoning is mandatory for this endpoint") whenever the free fallback router
/// lands on a reasoning-only model. No sampling parameters.
///
/// Only the free default carries a fallback list: `models` goes next to `model`, so a busy free model falls back
/// to OpenRouter's free router instead of failing. Paid and custom models never get a fallback (no surprise bills).
pub fn build_openrouter_request(model: Option<&str>, history: &[Turn], question: &str) -> Value {
    let mut messages = vec![json!({ "role": "system", "content": SYSTEM_PROMPT })];
    messages.extend(build_messages(history, question));
    let model = resolve_model(model);
    let mut body = json!({
        "model": model,
        "messages": messages,
        "max_tokens": MAX_TOKENS,
        "reasoning": { "effort": "low", "exclude": true },
    });
    if model == DEFAULT_MODEL {
        body["models"] = json!([DEFAULT_MODEL, FREE_ROUTER]);
    }
    body
}

/// The Groq (OpenAI-compatible) JSON body. The system prompt is the first message.
///
/// Non-reasoning models (the default Llama) get only `max_tokens: 120`. The gpt-oss reasoning models get
/// `reasoning_effort: "low"` and `include_reasoning: false` (Groq: gpt-oss rejects `reasoning_format`, and the two
/// are mutually exclusive) plus more token headroom, because reasoning tokens count against `max_tokens`.
/// Other models never get reasoning params (they may reject them). No sampling params, no `n`, no `logprobs`.
pub fn build_groq_request(model: Option<&str>, history: &[Turn], question: &str) -> Value {
    let mut messages = vec![json!({ "role": "system", "content": SYSTEM_PROMPT })];
    messages.extend(build_messages(history, question));
    let model = resolve_groq_model(model);
    let reasoning = is_groq_reasoning_model(model);
    let mut body = json!({
        "model": model,
        "messages": messages,
        "max_tokens": if reasoning { GROQ_REASONING_MAX_TOKENS } else { GROQ_MAX_TOKENS },
    });
    if reasoning {
        body["reasoning_effort"] = json!("low");
        body["include_reasoning"] = json!(false);
    }
    body
}

/// The Anthropic Messages API body, and whether the request needs the server-side-fallback beta header.
///
/// Thinking is switched off and effort is low so the 200 output tokens are all answer: Haiku 5.5 takes
/// `disabled`, Sonnet 5.5 rejects it and takes `between_tools` (no tools are sent, so it never thinks).
/// No sampling parameters (they are rejected on these models) and no assistant prefill.
pub fn build_anthropic_request(model: Option<&str>, history: &[Turn], question: &str) -> (Value, bool) {
    let model = resolve_claude_model(model);
    let sonnet = model == SONNET;
    let mut body = json!({
        "model": model,
        "max_tokens": ANTHROPIC_MAX_TOKENS,
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

fn is_free(model: &str) -> bool {
    model.ends_with(":free") || model == FREE_ROUTER
}

fn http_failure(status: u16, model: &str) -> AskFailure {
    match status {
        401 => failure(FailureKind::Unauthorized, "OpenRouter didn't accept my API key. It may be mistyped or revoked. Want to enter it again?"),
        402 => failure(FailureKind::OutOfCredits, "Your OpenRouter account is out of credits. Top it up at openrouter.ai, then ask me again."),
        403 => failure(FailureKind::Refused, "OpenRouter flagged that question and wouldn't pass it on. Try asking me something else?"),
        408 => failure(FailureKind::Timeout, "OpenRouter took too long to answer, so I gave up waiting. Try again?"),
        429 if is_free(model) => failure(FailureKind::RateLimited, "The free model is getting a lot of questions right now. Try again in a bit, or pick another model."),
        429 => failure(FailureKind::RateLimited, "Whoa, I've asked OpenRouter a lot of questions very quickly. Give it a minute, then ask me again."),
        502 | 503 => failure(FailureKind::Overloaded, "That model is busy or unavailable right now, try again or pick another."),
        400 | 404 => failure(FailureKind::BadModel, "OpenRouter doesn't know that model, or won't take my question. Check the model in the menu."),
        500..=599 => failure(FailureKind::Overloaded, "OpenRouter is a bit overwhelmed right now. Ask me again in a moment."),
        _ => AskFailure {
            kind: FailureKind::Other,
            message: format!("Something went wrong when I asked OpenRouter (error {status}). Try again later."),
        },
    }
}

/// Groq's statuses (console.groq.com/docs/errors). `retry_after` is the 429 header in seconds, when present.
fn groq_http_failure(status: u16, retry_after: Option<u64>) -> AskFailure {
    match status {
        401 => failure(FailureKind::Unauthorized, "Groq didn't accept my API key. It may be mistyped or revoked. Want to enter it again?"),
        403 => failure(FailureKind::Refused, "Groq wouldn't let that key do this. Check your Groq account, or try another model."),
        408 => failure(FailureKind::Timeout, "Groq took too long to answer, so I gave up waiting. Try again?"),
        413 => failure(FailureKind::TooLong, "That question is too long for Groq. Try a shorter one?"),
        429 => {
            let wait = match retry_after {
                Some(1) => "1 second".to_string(),
                Some(n) => format!("{n} seconds"),
                None => "a minute".to_string(),
            };
            failure(FailureKind::RateLimited, &format!("Groq's free tier needs a breather. Try again in {wait}."))
        }
        400 | 404 => failure(FailureKind::BadModel, "Groq doesn't know that model, or won't take my question. Check the model in the menu."),
        498 | 500..=599 => failure(FailureKind::Overloaded, "Groq is busy right now. Ask me again in a moment."),
        _ => AskFailure {
            kind: FailureKind::Other,
            message: format!("Something went wrong when I asked Groq (error {status}). Try again later."),
        },
    }
}

fn anthropic_http_failure(status: u16) -> AskFailure {
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

/// Maps an Anthropic HTTP status and body to a tidy answer or a friendly failure.
pub fn parse_anthropic(status: u16, body: &str) -> Result<String, AskFailure> {
    if !(200..300).contains(&status) {
        return Err(anthropic_http_failure(status));
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

/// `message.content` is a string, or (some providers) an array of `{ "type": "text", "text": ... }` parts.
fn content_text(content: &Value) -> String {
    match content {
        Value::String(s) => s.clone(),
        Value::Array(parts) => parts
            .iter()
            .filter(|p| p.get("type").and_then(Value::as_str).is_none_or(|t| t == "text"))
            .filter_map(|p| p.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join(" "),
        _ => String::new(),
    }
}

/// Maps an HTTP status and body to a tidy answer or a friendly failure. The body is never echoed.
pub fn parse_openrouter(status: u16, body: &str, model: &str) -> Result<String, AskFailure> {
    if !(200..300).contains(&status) {
        return Err(http_failure(status, model));
    }
    let v: Value = serde_json::from_str(body)
        .map_err(|_| failure(FailureKind::Other, "OpenRouter sent me something I couldn't read. Try again?"))?;
    let choice = v.get("choices").and_then(Value::as_array).and_then(|c| c.first());
    // OpenRouter can answer 200 with an `error` object (e.g. the provider failed): use its numeric code.
    if choice.is_none() {
        let code = v.get("error").and_then(|e| e.get("code")).and_then(Value::as_u64).and_then(|c| u16::try_from(c).ok());
        if let Some(code) = code.filter(|c| !(200..300).contains(c)) {
            return Err(http_failure(code, model));
        }
    }
    let text = choice
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .map(content_text)
        .unwrap_or_default();
    let answer = tidy_answer(&text);
    if answer.is_empty() {
        return Err(failure(FailureKind::Empty, "OpenRouter sent back a blank reply. Try asking a different way?"));
    }
    Ok(answer)
}

/// Maps a Groq HTTP status, its `retry-after` seconds and body to a tidy answer or a friendly failure.
/// The body is never echoed.
pub fn parse_groq(status: u16, retry_after: Option<u64>, body: &str) -> Result<String, AskFailure> {
    if !(200..300).contains(&status) {
        return Err(groq_http_failure(status, retry_after));
    }
    let v: Value = serde_json::from_str(body)
        .map_err(|_| failure(FailureKind::Other, "Groq sent me something I couldn't read. Try again?"))?;
    let text = v
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|c| c.first())
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .map(content_text)
        .unwrap_or_default();
    let answer = tidy_answer(&text);
    if answer.is_empty() {
        return Err(failure(FailureKind::Empty, "Groq sent back a blank reply. Try asking a different way?"));
    }
    Ok(answer)
}

fn transport_failure(provider: Provider, e: &reqwest::Error) -> AskFailure {
    let name = provider.name();
    if e.is_timeout() {
        failure(FailureKind::Timeout, &format!("{name} took too long to answer, so I gave up waiting. Try again?"))
    } else if e.is_connect() {
        failure(FailureKind::Offline, &format!("It looks like you're offline. I can't reach {name} from here."))
    } else {
        failure(FailureKind::Other, &format!("Something went wrong reaching {name}. Try again later."))
    }
}

// ---------------------------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------------------------

fn build_client(provider: Provider) -> Result<reqwest::Client, AskFailure> {
    reqwest::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .map_err(|_| failure(FailureKind::Other, &format!("Something went wrong reaching {}. Try again later.", provider.name())))
}

fn damaged_key() -> AskFailure {
    failure(FailureKind::Unauthorized, "The stored API key looks damaged. Want to enter it again?")
}

async fn send_openrouter(url: &str, key: &str, body: &Value) -> Result<String, AskFailure> {
    let mut auth = reqwest::header::HeaderValue::from_str(&format!("Bearer {key}")).map_err(|_| damaged_key())?;
    auth.set_sensitive(true); // never shown by Debug
    let resp = build_client(Provider::OpenRouter)?
        .post(url)
        .header(reqwest::header::AUTHORIZATION, auth)
        .header("HTTP-Referer", REFERER)
        .header("X-Title", APP_TITLE)
        .json(body)
        .send()
        .await
        .map_err(|e| transport_failure(Provider::OpenRouter, &e))?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| transport_failure(Provider::OpenRouter, &e))?;
    parse_openrouter(status, &text, body["model"].as_str().unwrap_or(DEFAULT_MODEL))
}

async fn send_groq(url: &str, key: &str, body: &Value) -> Result<String, AskFailure> {
    let mut auth = reqwest::header::HeaderValue::from_str(&format!("Bearer {key}")).map_err(|_| damaged_key())?;
    auth.set_sensitive(true); // never shown by Debug
    let resp = build_client(Provider::Groq)?
        .post(url)
        .header(reqwest::header::AUTHORIZATION, auth)
        .json(body)
        .send()
        .await
        .map_err(|e| transport_failure(Provider::Groq, &e))?;
    let status = resp.status().as_u16();
    let retry_after = resp
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.trim().parse::<f64>().ok())
        .filter(|s| s.is_finite() && *s >= 0.0)
        .map(|s| s.ceil() as u64);
    let text = resp.text().await.map_err(|e| transport_failure(Provider::Groq, &e))?;
    parse_groq(status, retry_after, &text)
}

async fn send_anthropic(url: &str, key: &str, body: &Value, fallback_beta: bool) -> Result<String, AskFailure> {
    let mut key_header = reqwest::header::HeaderValue::from_str(key).map_err(|_| damaged_key())?;
    key_header.set_sensitive(true); // never shown by Debug
    let mut req = build_client(Provider::Anthropic)?
        .post(url)
        .header("x-api-key", key_header)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .json(body);
    if fallback_beta {
        req = req.header("anthropic-beta", FALLBACK_BETA);
    }
    let resp = req.send().await.map_err(|e| transport_failure(Provider::Anthropic, &e))?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| transport_failure(Provider::Anthropic, &e))?;
    parse_anthropic(status, &text)
}

// ---------------------------------------------------------------------------------------------------------------
// Keychain (one account per provider; the active provider's key is the one set, removed and checked)
// ---------------------------------------------------------------------------------------------------------------

fn entry(provider: Provider) -> keyring::Result<keyring::Entry> {
    keyring::Entry::new(KEYCHAIN_SERVICE, provider.account())
}

fn read_key(provider: Provider) -> Option<String> {
    entry(provider).ok()?.get_password().ok().filter(|k| !k.is_empty())
}

/// Trimmed, non-empty, no whitespace or control characters, bounded. Any prefix is accepted (an OpenRouter key
/// normally starts with `sk-or-`, but nothing relies on it).
fn validate_key(provider: Provider, raw: &str) -> Result<String, &'static str> {
    let key = raw.trim();
    if key.is_empty() {
        return Err("That key is empty.");
    }
    if key.len() > provider.max_key_len() || !key.bytes().all(|b| b.is_ascii_graphic()) {
        return Err("That doesn't look like an API key.");
    }
    Ok(key.to_string())
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Option<T> {
    tauri::async_runtime::spawn_blocking(f).await.ok()
}

/// True when the provider has a key stored. The key itself is never returned.
#[tauri::command]
pub async fn ask_key_status(provider: Option<String>) -> bool {
    let p = Provider::parse(provider.as_deref());
    blocking(move || read_key(p).is_some()).await.unwrap_or(false)
}

#[tauri::command]
pub async fn ask_set_key(key: String, provider: Option<String>) -> Result<(), String> {
    let p = Provider::parse(provider.as_deref());
    let key = validate_key(p, &key).map_err(str::to_string)?;
    blocking(move || entry(p).and_then(|e| e.set_password(&key)))
        .await
        .ok_or_else(|| "The keychain didn't answer.".to_string())?
        .map_err(|_| "I couldn't save the key to your keychain.".to_string())
}

#[tauri::command]
pub async fn ask_remove_key(provider: Option<String>) -> Result<(), String> {
    let p = Provider::parse(provider.as_deref());
    let res = blocking(move || entry(p).and_then(|e| e.delete_credential()))
        .await
        .ok_or_else(|| "The keychain didn't answer.".to_string())?;
    match res {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("I couldn't remove the key from your keychain.".to_string()),
    }
}

/// Sends one question (plus the in-memory history JS holds) to the active provider and returns the tidy answer.
/// `model` is an OpenRouter or Groq model id, or one of the two Claude ids when the provider is Anthropic.
#[tauri::command]
pub async fn ask(question: String, history: Vec<Turn>, model: Option<String>, provider: Option<String>) -> Result<String, AskFailure> {
    let question = question.trim().to_string();
    if question.is_empty() {
        return Err(failure(FailureKind::Empty, "I didn't catch a question. What would you like to know?"));
    }
    let p = Provider::parse(provider.as_deref());
    let key = blocking(move || read_key(p)).await.flatten().ok_or_else(|| no_key(p))?;
    match p {
        Provider::OpenRouter => {
            let body = build_openrouter_request(model.as_deref(), &history, &question);
            send_openrouter(API_URL, &key, &body).await
        }
        Provider::Groq => {
            let body = build_groq_request(model.as_deref(), &history, &question);
            send_groq(GROQ_URL, &key, &body).await
        }
        Provider::Anthropic => {
            let (body, beta) = build_anthropic_request(model.as_deref(), &history, &question);
            send_anthropic(ANTHROPIC_URL, &key, &body, beta).await
        }
    }
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

    // OpenRouter is the default provider: the shorter names below mean its path in these tests.
    fn build_request(model: Option<&str>, history: &[Turn], question: &str) -> Value {
        build_openrouter_request(model, history, question)
    }
    fn parse_response(status: u16, body: &str) -> Result<String, AskFailure> {
        parse_openrouter(status, body, "vendor/model")
    }
    async fn send(url: &str, key: &str, body: &Value) -> Result<String, AskFailure> {
        send_openrouter(url, key, body).await
    }

    fn turn(role: &str, text: &str) -> Turn {
        Turn { role: role.to_string(), text: text.to_string() }
    }

    // ---- request ----

    #[test]
    fn request_shape_defaults_to_the_free_model_with_low_hidden_reasoning() {
        let body = build_request(None, &[], "What is Rust?");
        assert_eq!(body["model"], "google/gemma-4-31b-it:free");
        assert_eq!(body["max_tokens"], 1000);
        // Never "none": the free router can pick a model whose reasoning is mandatory, which 400s on "none".
        assert_eq!(body["reasoning"], json!({ "effort": "low", "exclude": true }));
        for k in ["temperature", "top_p", "top_k", "system", "thinking", "stream"] {
            assert!(body.get(k).is_none(), "{k}");
        }
        let msgs = body["messages"].as_array().unwrap();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0]["role"], "system");
        let system = msgs[0]["content"].as_str().unwrap();
        assert!(system.contains("Paperclip") && system.contains("1 to 3 short sentences") && system.contains("no markdown"));
        assert_eq!(msgs[1], json!({ "role": "user", "content": "What is Rust?" }));
    }

    #[test]
    fn any_valid_model_id_is_sent_as_is() {
        for id in ["anthropic/claude-sonnet-5.5", "openai/gpt-5-mini", "meta-llama/llama-3.3-70b-instruct:free", "x~y/z_1"] {
            assert_eq!(build_request(Some(id), &[], "Hi")["model"], id);
        }
    }

    #[test]
    fn invalid_model_ids_fall_back_to_the_default() {
        for id in ["", "gpt", "a/b/c", "a b/c", "a/b c", "/b", "a/", "evil\"/x", "a/b\nc", "a/ü"] {
            assert_eq!(build_request(Some(id), &[], "Hi")["model"], DEFAULT_MODEL, "{id:?}");
        }
        assert_eq!(build_request(Some(&format!("a/{}", "b".repeat(99))), &[], "Hi")["model"], DEFAULT_MODEL);
    }

    #[test]
    fn model_id_validation() {
        assert!(valid_model_id("anthropic/claude-haiku-5.5"));
        assert!(valid_model_id("a/b:free"));
        assert!(valid_model_id(&format!("a/{}", "b".repeat(98)))); // exactly 100
        assert!(!valid_model_id(&format!("a/{}", "b".repeat(99)))); // 101
        assert!(!valid_model_id("a:b/c")); // ':' is only allowed after the slash
        assert!(!valid_model_id("nothing"));
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
        json!({ "choices": [{ "finish_reason": "stop", "message": { "role": "assistant", "content": text } }] }).to_string()
    }

    #[test]
    fn parses_a_text_answer() {
        assert_eq!(parse_response(200, &ok_body("Paris, of course.")).unwrap(), "Paris, of course.");
    }

    #[test]
    fn parses_array_content_parts() {
        let body = json!({ "choices": [{ "message": { "content": [
            { "type": "text", "text": "One." }, { "type": "image_url", "image_url": {} }, { "type": "text", "text": "Two." } ] } }] })
        .to_string();
        assert_eq!(parse_response(200, &body).unwrap(), "One. Two.");
    }

    #[test]
    fn reasoning_text_is_never_shown() {
        let body = json!({ "choices": [{ "message": { "content": "Answer.", "reasoning": "secret thoughts" } }] }).to_string();
        assert_eq!(parse_response(200, &body).unwrap(), "Answer.");
    }

    #[test]
    fn empty_and_unreadable_replies_are_friendly_errors() {
        assert_eq!(parse_response(200, &ok_body("   ")).unwrap_err().kind, FailureKind::Empty);
        assert_eq!(parse_response(200, "{\"choices\":[]}").unwrap_err().kind, FailureKind::Empty);
        assert_eq!(parse_response(200, "{\"choices\":[{\"message\":{\"content\":null}}]}").unwrap_err().kind, FailureKind::Empty);
        assert_eq!(parse_response(200, "{\"choices\":[{\"message\":{\"content\":[]}}]}").unwrap_err().kind, FailureKind::Empty);
        assert_eq!(parse_response(200, "not json").unwrap_err().kind, FailureKind::Other);
    }

    #[test]
    fn a_200_carrying_an_error_object_uses_its_code() {
        let e = parse_response(200, "{\"error\":{\"code\":402,\"message\":\"x\"}}").unwrap_err();
        assert_eq!(e.kind, FailureKind::OutOfCredits);
        let e = parse_response(200, "{\"error\":{\"code\":502,\"message\":\"x\"}}").unwrap_err();
        assert_eq!(e.kind, FailureKind::Overloaded);
    }

    #[test]
    fn http_statuses_map_to_friendly_kinds() {
        let kind = |s| parse_response(s, "{}").unwrap_err().kind;
        assert_eq!(kind(401), FailureKind::Unauthorized);
        assert_eq!(kind(402), FailureKind::OutOfCredits);
        assert_eq!(kind(403), FailureKind::Refused);
        assert_eq!(kind(408), FailureKind::Timeout);
        assert_eq!(kind(429), FailureKind::RateLimited);
        assert_eq!(kind(502), FailureKind::Overloaded);
        assert_eq!(kind(503), FailureKind::Overloaded);
        assert_eq!(kind(500), FailureKind::Overloaded);
        assert_eq!(kind(529), FailureKind::Overloaded);
        assert_eq!(kind(400), FailureKind::BadModel);
        assert_eq!(kind(404), FailureKind::BadModel);
        assert_eq!(kind(418), FailureKind::Other);
        assert!(parse_response(418, "{}").unwrap_err().message.contains("418"));
    }

    #[test]
    fn failure_messages_mention_openrouter_and_never_the_old_provider() {
        for s in [401, 402, 403, 408, 429, 502, 400, 500, 418] {
            let m = parse_response(s, "{}").unwrap_err().message;
            assert!(!m.contains("Claude") && !m.contains("Anthropic"), "{s}: {m}");
        }
        assert!(parse_response(402, "{}").unwrap_err().message.starts_with("Your OpenRouter account is out of credits"));
        assert!(parse_response(400, "{}").unwrap_err().message.starts_with("OpenRouter doesn't know that model"));
        assert!(parse_response(503, "{}").unwrap_err().message.starts_with("That model is busy or unavailable right now, try again or pick another"));
    }

    #[test]
    fn failure_messages_never_echo_the_response_body() {
        for s in [400, 401, 402, 403, 429, 502] {
            let e = parse_response(s, "{\"error\":{\"message\":\"bad key sk-or-v1-SECRET\"}}").unwrap_err();
            assert!(!e.message.contains("SECRET"));
        }
    }

    #[test]
    fn failures_serialize_with_camel_case_kinds() {
        let v = serde_json::to_value(no_key(Provider::OpenRouter)).unwrap();
        assert_eq!(v["kind"], "noKey");
        assert!(v["message"].as_str().unwrap().contains("OpenRouter API key"));
        assert_eq!(serde_json::to_value(FailureKind::RateLimited).unwrap(), "rateLimited");
        assert_eq!(serde_json::to_value(FailureKind::OutOfCredits).unwrap(), "outOfCredits");
        assert_eq!(serde_json::to_value(FailureKind::BadModel).unwrap(), "badModel");
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
        use Provider::{Anthropic, OpenRouter};
        assert_eq!(validate_key(OpenRouter, "  sk-or-v1-abc123  ").unwrap(), "sk-or-v1-abc123");
        assert_eq!(validate_key(OpenRouter, "not-an-openrouter-prefix").unwrap(), "not-an-openrouter-prefix"); // still accepted
        assert_eq!(validate_key(Anthropic, "  sk-ant-abc123  ").unwrap(), "sk-ant-abc123");
        for p in [OpenRouter, Anthropic] {
            assert!(validate_key(p, "   ").is_err());
            assert!(validate_key(p, "sk or").is_err());
            assert!(validate_key(p, "sk-or\nabc").is_err());
        }
        assert!(validate_key(OpenRouter, &"k".repeat(400)).is_ok());
        assert!(validate_key(OpenRouter, &"k".repeat(401)).is_err());
        assert!(validate_key(Anthropic, &"k".repeat(512)).is_ok());
        assert!(validate_key(Anthropic, &"k".repeat(513)).is_err());
    }

    #[test]
    fn providers_have_separate_keychain_accounts_and_default_to_openrouter() {
        assert_eq!(Provider::parse(None), Provider::OpenRouter);
        assert_eq!(Provider::parse(Some("nonsense")), Provider::OpenRouter);
        assert_eq!(Provider::parse(Some("anthropic")), Provider::Anthropic);
        assert_eq!(Provider::OpenRouter.account(), "openrouter-api-key");
        assert_eq!(Provider::Anthropic.account(), "anthropic-api-key");
        assert!(no_key(Provider::Anthropic).message.contains("Claude API key"));
    }

    #[test]
    fn free_default_gets_a_fallback_list_and_nothing_else_does() {
        let b = build_request(None, &[], "Hi");
        assert_eq!(b["model"], "google/gemma-4-31b-it:free");
        assert_eq!(b["models"], json!(["google/gemma-4-31b-it:free", "openrouter/free"]));
        for id in ["anthropic/claude-haiku-5.5", "openrouter/free", "google/gemma-4-26b-a4b-it:free", "openai/gpt-5"] {
            assert!(build_request(Some(id), &[], "Hi").get("models").is_none(), "{id}");
        }
    }

    #[test]
    fn a_429_on_a_free_model_has_its_own_line() {
        let free = parse_openrouter(429, "{}", "google/gemma-4-31b-it:free").unwrap_err();
        assert_eq!(free.kind, FailureKind::RateLimited);
        assert!(free.message.starts_with("The free model is getting a lot of questions right now"));
        assert_eq!(parse_openrouter(429, "{}", "openrouter/free").unwrap_err().message, free.message);
        let paid = parse_openrouter(429, "{}", "anthropic/claude-haiku-5.5").unwrap_err();
        assert!(paid.message.contains("OpenRouter") && !paid.message.contains("free model"));
    }

    // ---- Anthropic path (kept as the optional second provider) ----

    #[test]
    fn anthropic_request_shape_for_haiku_by_default() {
        let (body, beta) = build_anthropic_request(None, &[], "What is Rust?");
        assert!(!beta);
        assert_eq!(body["model"], "claude-haiku-5-5");
        assert_eq!(body["max_tokens"], 200);
        assert_eq!(body["thinking"]["type"], "disabled");
        assert_eq!(body["output_config"]["effort"], "low");
        assert!(body.get("fallbacks").is_none() && body.get("reasoning").is_none());
        assert!(body.get("temperature").is_none() && body.get("top_p").is_none() && body.get("top_k").is_none());
        assert_eq!(body["messages"], json!([{ "role": "user", "content": "What is Rust?" }]));
        let system = body["system"].as_str().unwrap();
        assert!(system.contains("Paperclip") && system.contains("1 to 3 short sentences") && system.contains("no markdown"));
    }

    #[test]
    fn anthropic_request_shape_for_sonnet_uses_between_tools_and_fallback() {
        let (body, beta) = build_anthropic_request(Some("claude-sonnet-5-5"), &[], "Hi");
        assert!(beta);
        assert_eq!(body["model"], "claude-sonnet-5-5");
        assert_eq!(body["thinking"], json!({ "type": "between_tools" }));
        assert_eq!(body["fallbacks"], "default");
    }

    #[test]
    fn anthropic_unknown_models_fall_back_to_haiku() {
        assert_eq!(build_anthropic_request(Some("claude-opus-5-5"), &[], "Hi").0["model"], "claude-haiku-5-5");
        assert_eq!(build_anthropic_request(Some("../../evil"), &[], "Hi").0["model"], "claude-haiku-5-5");
        assert_eq!(build_anthropic_request(Some("anthropic/claude-haiku-5.5"), &[], "Hi").0["model"], "claude-haiku-5-5");
    }

    fn anthropic_ok(text: &str) -> String {
        json!({ "stop_reason": "end_turn", "content": [{ "type": "text", "text": text }] }).to_string()
    }

    #[test]
    fn anthropic_responses_parse() {
        assert_eq!(parse_anthropic(200, &anthropic_ok("Paris, of course.")).unwrap(), "Paris, of course.");
        let body = json!({ "stop_reason": "end_turn", "content": [
            { "type": "thinking", "thinking": "" }, { "type": "text", "text": "One." }, { "type": "text", "text": "Two." } ] })
        .to_string();
        assert_eq!(parse_anthropic(200, &body).unwrap(), "One. Two.");
        let refusal = json!({ "stop_reason": "refusal", "content": [] }).to_string();
        assert_eq!(parse_anthropic(200, &refusal).unwrap_err().kind, FailureKind::Refused);
        assert_eq!(parse_anthropic(200, &anthropic_ok("   ")).unwrap_err().kind, FailureKind::Empty);
        assert_eq!(parse_anthropic(200, "not json").unwrap_err().kind, FailureKind::Other);
    }

    #[test]
    fn anthropic_statuses_map_and_never_echo_the_body() {
        let kind = |s| parse_anthropic(s, "{}").unwrap_err().kind;
        assert_eq!(kind(401), FailureKind::Unauthorized);
        assert_eq!(kind(403), FailureKind::Unauthorized);
        assert_eq!(kind(429), FailureKind::RateLimited);
        assert_eq!(kind(529), FailureKind::Overloaded);
        assert_eq!(kind(400), FailureKind::Other);
        let e = parse_anthropic(401, "{\"error\":{\"message\":\"invalid x-api-key sk-ant-SECRET\"}}").unwrap_err();
        assert!(!e.message.contains("SECRET") && e.message.starts_with("Claude didn't accept my API key"));
    }

    #[test]
    fn anthropic_sends_its_own_headers_and_never_openrouter_ones() {
        let (url, seen) = stub("200 OK", anthropic_ok("Hello there."));
        let (body, beta) = build_anthropic_request(Some("claude-sonnet-5-5"), &[], "Hi");
        assert_eq!(tauri::async_runtime::block_on(send_anthropic(&url, "test-key-123", &body, beta)).unwrap(), "Hello there.");
        let req = seen.join().unwrap().to_ascii_lowercase();
        assert!(req.starts_with("post /api/v1/chat/completions")); // the stub's path, not the real one
        assert!(req.contains("x-api-key: test-key-123"));
        assert!(req.contains("anthropic-version: 2023-06-01"));
        assert!(req.contains("anthropic-beta: server-side-fallback-2026-07-01"));
        assert!(!req.contains("authorization") && !req.contains("http-referer") && !req.contains("x-title"));
        assert!(req.contains("\"max_tokens\":200"));
        let (url, seen) = stub("200 OK", anthropic_ok("Hi."));
        let (body, beta) = build_anthropic_request(None, &[], "Hi");
        tauri::async_runtime::block_on(send_anthropic(&url, "k", &body, beta)).unwrap();
        assert!(!seen.join().unwrap().to_ascii_lowercase().contains("anthropic-beta"));
    }

    #[test]
    fn anthropic_failures_over_the_wire() {
        let (url, _h) = stub("401 Unauthorized", "{\"type\":\"error\"}".to_string());
        let (body, beta) = build_anthropic_request(None, &[], "Hi");
        assert_eq!(tauri::async_runtime::block_on(send_anthropic(&url, "k", &body, beta)).unwrap_err().kind, FailureKind::Unauthorized);
        let e = tauri::async_runtime::block_on(send_anthropic("http://127.0.0.1:9/", "bad\nkey", &body, beta)).unwrap_err();
        assert_eq!(e.kind, FailureKind::Unauthorized);
    }

    // ---- the HTTP path against a local stub (no network, fake key) ----

    fn stub(status_line: &'static str, body: String) -> (String, std::thread::JoinHandle<String>) {
        stub_with_headers(status_line, "", body)
    }

    /// `extra` is raw header lines, each ending in `\r\n` (e.g. `Retry-After: 7\r\n`).
    fn stub_with_headers(status_line: &'static str, extra: &'static str, body: String) -> (String, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/api/v1/chat/completions", listener.local_addr().unwrap());
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
            let resp = format!("HTTP/1.1 {status_line}\r\nContent-Type: application/json\r\n{extra}Content-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
            s.write_all(resp.as_bytes()).unwrap();
            String::from_utf8_lossy(&got).to_string()
        });
        (url, handle)
    }

    #[test]
    fn sends_the_documented_headers_and_body() {
        let (url, seen) = stub("200 OK", ok_body("Hello there."));
        let body = build_request(Some("openai/gpt-5-mini"), &[turn("user", "earlier"), turn("assistant", "reply")], "Hi");
        let out = tauri::async_runtime::block_on(send(&url, "test-key-123", &body));
        assert_eq!(out.unwrap(), "Hello there.");
        let raw = seen.join().unwrap();
        let req = raw.to_ascii_lowercase();
        assert!(req.starts_with("post /api/v1/chat/completions"));
        assert!(req.contains("authorization: bearer test-key-123"));
        assert!(req.contains("http-referer: https://github.com/annuai/paperclip"));
        assert!(req.contains("x-title: paperclip"));
        assert!(!req.contains("x-api-key") && !req.contains("anthropic"));
        let json_start = raw.find("\r\n\r\n").unwrap() + 4;
        let sent: Value = serde_json::from_str(&raw[json_start..]).unwrap();
        assert_eq!(sent, body);
        assert_eq!(sent["model"], "openai/gpt-5-mini");
        assert_eq!(sent["max_tokens"], 1000);
        assert_eq!(sent["reasoning"], serde_json::json!({ "effort": "low", "exclude": true }));
        assert_eq!(sent["messages"][0]["role"], "system");
        assert_eq!(sent["messages"][3], json!({ "role": "user", "content": "Hi" }));
    }

    #[test]
    fn server_errors_map_through_the_http_path() {
        for (line, kind) in [("401 Unauthorized", FailureKind::Unauthorized), ("402 Payment Required", FailureKind::OutOfCredits), ("503 Service Unavailable", FailureKind::Overloaded)] {
            let (url, _h) = stub(line, "{\"error\":{\"code\":0,\"message\":\"x\"}}".to_string());
            let e = tauri::async_runtime::block_on(send(&url, "k", &build_request(None, &[], "Hi"))).unwrap_err();
            assert_eq!(e.kind, kind, "{line}");
        }
    }

    #[test]
    fn nothing_listening_means_offline() {
        let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port(); // freed again on drop
        let e = tauri::async_runtime::block_on(send(&format!("http://127.0.0.1:{port}/"), "k", &build_request(None, &[], "Hi"))).unwrap_err();
        assert_eq!(e.kind, FailureKind::Offline);
    }

    #[test]
    fn a_key_with_header_breaking_bytes_never_reaches_the_wire() {
        let e = tauri::async_runtime::block_on(send("http://127.0.0.1:9/", "bad\nkey", &build_request(None, &[], "Hi"))).unwrap_err();
        assert_eq!(e.kind, FailureKind::Unauthorized);
    }

    // ---- Groq path ----

    fn groq_ok(text: &str) -> String {
        json!({ "id": "x", "object": "chat.completion", "choices": [{ "index": 0, "finish_reason": "stop", "message": { "role": "assistant", "content": text } }] }).to_string()
    }

    #[test]
    fn groq_default_request_is_tight_and_has_no_reasoning_params() {
        let body = build_groq_request(None, &[], "What is Rust?");
        assert_eq!(body["model"], "llama-3.3-70b-versatile");
        assert_eq!(body["max_tokens"], 120);
        for k in ["reasoning_effort", "reasoning_format", "include_reasoning", "reasoning", "temperature", "top_p", "n", "stream", "logprobs", "models", "system"] {
            assert!(body.get(k).is_none(), "{k}");
        }
        let msgs = body["messages"].as_array().unwrap();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0]["role"], "system");
        assert!(msgs[0]["content"].as_str().unwrap().contains("1 to 3 short sentences"));
        assert_eq!(msgs[1], json!({ "role": "user", "content": "What is Rust?" }));
    }

    #[test]
    fn groq_gpt_oss_gets_low_hidden_reasoning_and_more_headroom_but_never_reasoning_format() {
        for id in ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] {
            let body = build_groq_request(Some(id), &[], "Hi");
            assert_eq!(body["model"], id);
            assert_eq!(body["max_tokens"], 600);
            assert_eq!(body["reasoning_effort"], "low");
            assert_eq!(body["include_reasoning"], false);
            assert!(body.get("reasoning_format").is_none() && body.get("reasoning").is_none(), "{id}");
        }
    }

    #[test]
    fn groq_other_models_never_get_reasoning_params() {
        for id in ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "meta-llama/llama-4-scout-17b-16e-instruct", "qwen/qwen3-32b"] {
            let body = build_groq_request(Some(id), &[], "Hi");
            assert_eq!(body["model"], id);
            assert_eq!(body["max_tokens"], 120);
            assert!(body.get("reasoning_effort").is_none() && body.get("include_reasoning").is_none() && body.get("reasoning_format").is_none(), "{id}");
        }
    }

    #[test]
    fn groq_invalid_model_ids_fall_back_to_the_default() {
        for id in ["", "a b", "a/b/c", "/b", "a/", "-x", "evil\"x", "a/b\nc", "ü", "a/ü"] {
            assert_eq!(build_groq_request(Some(id), &[], "Hi")["model"], "llama-3.3-70b-versatile", "{id:?}");
        }
        assert_eq!(build_groq_request(Some(&"b".repeat(101)), &[], "Hi")["model"], "llama-3.3-70b-versatile");
    }

    #[test]
    fn groq_model_id_validation() {
        for ok in ["llama-3.3-70b-versatile", "openai/gpt-oss-20b", "llama-3.1-8b-instant", "a", "meta-llama/llama-4-scout-17b-16e-instruct", "x~y/z_1:free"] {
            assert!(valid_groq_model_id(ok), "{ok}");
        }
        assert!(valid_groq_model_id(&"b".repeat(100)));
        assert!(!valid_groq_model_id(&"b".repeat(101)));
        for bad in ["", "a b", "a/b/c", "/b", "a/", ".x", "a:b/c", "a/b c", "a\n"] {
            assert!(!valid_groq_model_id(bad), "{bad:?}");
        }
    }

    #[test]
    fn groq_responses_parse_and_hidden_reasoning_never_shows() {
        assert_eq!(parse_groq(200, None, &groq_ok("Paris, of course.")).unwrap(), "Paris, of course.");
        let body = json!({ "choices": [{ "message": { "content": "Answer.", "reasoning": "secret thoughts" } }] }).to_string();
        assert_eq!(parse_groq(200, None, &body).unwrap(), "Answer.");
        assert_eq!(parse_groq(200, None, &groq_ok("  ")).unwrap_err().kind, FailureKind::Empty);
        assert_eq!(parse_groq(200, None, "{\"choices\":[]}").unwrap_err().kind, FailureKind::Empty);
        assert_eq!(parse_groq(200, None, "not json").unwrap_err().kind, FailureKind::Other);
        assert!(parse_groq(200, None, "not json").unwrap_err().message.starts_with("Groq"));
    }

    #[test]
    fn groq_statuses_map_to_friendly_kinds() {
        let kind = |s| parse_groq(s, None, "{}").unwrap_err().kind;
        assert_eq!(kind(401), FailureKind::Unauthorized);
        assert_eq!(kind(403), FailureKind::Refused);
        assert_eq!(kind(408), FailureKind::Timeout);
        assert_eq!(kind(413), FailureKind::TooLong);
        assert_eq!(kind(429), FailureKind::RateLimited);
        assert_eq!(kind(400), FailureKind::BadModel);
        assert_eq!(kind(404), FailureKind::BadModel);
        assert_eq!(kind(498), FailureKind::Overloaded);
        assert_eq!(kind(500), FailureKind::Overloaded);
        assert_eq!(kind(502), FailureKind::Overloaded);
        assert_eq!(kind(503), FailureKind::Overloaded);
        assert_eq!(kind(422), FailureKind::Other);
        assert!(parse_groq(422, None, "{}").unwrap_err().message.contains("422"));
        assert!(parse_groq(401, None, "{}").unwrap_err().message.starts_with("Groq didn't accept my API key"));
        assert!(parse_groq(413, None, "{}").unwrap_err().message.contains("too long"));
        assert!(parse_groq(498, None, "{}").unwrap_err().message.contains("busy"));
        assert!(parse_groq(400, None, "{}").unwrap_err().message.contains("model"));
    }

    #[test]
    fn groq_429_mentions_retry_after_in_seconds_when_present() {
        assert_eq!(parse_groq(429, None, "{}").unwrap_err().message, "Groq's free tier needs a breather. Try again in a minute.");
        assert_eq!(parse_groq(429, Some(17), "{}").unwrap_err().message, "Groq's free tier needs a breather. Try again in 17 seconds.");
        assert_eq!(parse_groq(429, Some(1), "{}").unwrap_err().message, "Groq's free tier needs a breather. Try again in 1 second.");
    }

    #[test]
    fn groq_failures_never_echo_the_body_or_mention_other_providers() {
        for s in [400, 401, 403, 413, 429, 498, 500, 503, 418] {
            let m = parse_groq(s, None, "{\"error\":{\"message\":\"bad key gsk_SECRET\"}}").unwrap_err().message;
            assert!(!m.contains("SECRET") && !m.contains("OpenRouter") && !m.contains("Claude"), "{s}: {m}");
            assert!(m.contains("Groq"), "{s}: {m}");
        }
    }

    #[test]
    fn groq_sends_bearer_auth_and_the_documented_body_and_nothing_provider_specific() {
        let (url, seen) = stub("200 OK", groq_ok("Hello there."));
        let body = build_groq_request(Some("openai/gpt-oss-120b"), &[turn("user", "earlier"), turn("assistant", "reply")], "Hi");
        assert_eq!(tauri::async_runtime::block_on(send_groq(&url, "gsk_test-key-123", &body)).unwrap(), "Hello there.");
        let raw = seen.join().unwrap();
        let req = raw.to_ascii_lowercase();
        assert!(req.starts_with("post /api/v1/chat/completions")); // the stub's path, not the real one
        assert!(req.contains("authorization: bearer gsk_test-key-123"));
        assert!(req.contains("content-type: application/json"));
        assert!(!req.contains("x-api-key") && !req.contains("anthropic") && !req.contains("http-referer") && !req.contains("x-title"));
        let json_start = raw.find("\r\n\r\n").unwrap() + 4;
        let sent: Value = serde_json::from_str(&raw[json_start..]).unwrap();
        assert_eq!(sent, body);
        assert_eq!(sent["max_tokens"], 600);
        assert_eq!(sent["reasoning_effort"], "low");
        assert_eq!(sent["include_reasoning"], false);
        assert_eq!(sent["messages"][3], json!({ "role": "user", "content": "Hi" }));
    }

    #[test]
    fn groq_failures_over_the_wire() {
        let body = build_groq_request(None, &[], "Hi");
        for (line, kind) in [
            ("401 Unauthorized", FailureKind::Unauthorized),
            ("413 Payload Too Large", FailureKind::TooLong),
            ("498 Flex Capacity", FailureKind::Overloaded),
            ("503 Service Unavailable", FailureKind::Overloaded),
            ("404 Not Found", FailureKind::BadModel),
        ] {
            let (url, _h) = stub(line, "{\"error\":{\"message\":\"x\",\"type\":\"invalid_request_error\"}}".to_string());
            assert_eq!(tauri::async_runtime::block_on(send_groq(&url, "k", &body)).unwrap_err().kind, kind, "{line}");
        }
    }

    #[test]
    fn groq_429_over_the_wire_reads_the_retry_after_header() {
        let body = build_groq_request(None, &[], "Hi");
        let (url, _h) = stub_with_headers("429 Too Many Requests", "Retry-After: 7\r\n", "{\"error\":{\"message\":\"x\"}}".to_string());
        let e = tauri::async_runtime::block_on(send_groq(&url, "k", &body)).unwrap_err();
        assert_eq!(e.kind, FailureKind::RateLimited);
        assert!(e.message.contains("7 seconds"), "{}", e.message);
        let (url, _h) = stub("429 Too Many Requests", "{}".to_string());
        assert!(tauri::async_runtime::block_on(send_groq(&url, "k", &body)).unwrap_err().message.contains("a minute"));
    }

    #[test]
    fn groq_offline_and_damaged_key() {
        let body = build_groq_request(None, &[], "Hi");
        let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let e = tauri::async_runtime::block_on(send_groq(&format!("http://127.0.0.1:{port}/"), "k", &body)).unwrap_err();
        assert_eq!(e.kind, FailureKind::Offline);
        assert!(e.message.contains("Groq"));
        let e = tauri::async_runtime::block_on(send_groq("http://127.0.0.1:9/", "bad\nkey", &body)).unwrap_err();
        assert_eq!(e.kind, FailureKind::Unauthorized);
    }

    #[test]
    fn groq_provider_account_name_and_keys() {
        assert_eq!(Provider::parse(Some("groq")), Provider::Groq);
        assert_eq!(Provider::Groq.account(), "groq-api-key");
        assert_eq!(Provider::Groq.name(), "Groq");
        assert!(no_key(Provider::Groq).message.contains("Groq API key"));
        assert_eq!(validate_key(Provider::Groq, "  gsk_abc123  ").unwrap(), "gsk_abc123");
        assert!(validate_key(Provider::Groq, "gsk abc").is_err());
        assert!(validate_key(Provider::Groq, &"k".repeat(512)).is_ok());
        assert!(validate_key(Provider::Groq, &"k".repeat(513)).is_err());
        assert_eq!(serde_json::to_value(FailureKind::TooLong).unwrap(), "tooLong");
        let accounts = [Provider::OpenRouter.account(), Provider::Groq.account(), Provider::Anthropic.account()];
        assert_eq!(accounts.iter().collect::<std::collections::HashSet<_>>().len(), 3);
    }

    /// Live smoke test (run by hand): a deliberately invalid key must give a 401 from the real Groq API,
    /// mapped to the bad-key message. `cargo test --lib live_groq_invalid_key -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn live_groq_invalid_key_is_a_401_unauthorized() {
        let body = build_groq_request(None, &[], "Say hi.");
        let fake = &format!("gsk_{}", "0".repeat(52));
        let client = reqwest::Client::new();
        let (status, text) = tauri::async_runtime::block_on(async {
            let r = client.post(GROQ_URL).header("Authorization", format!("Bearer {fake}")).json(&body).send().await.unwrap();
            (r.status().as_u16(), r.text().await.unwrap())
        });
        println!("LIVE GROQ status={status} body={text}");
        assert_eq!(status, 401);
        let e = parse_groq(status, None, &text).unwrap_err();
        assert_eq!(e.kind, FailureKind::Unauthorized);
        assert!(e.message.starts_with("Groq didn't accept my API key"));
        // and through the real send_groq() path
        let e2 = tauri::async_runtime::block_on(send_groq(GROQ_URL, fake, &body)).unwrap_err();
        assert_eq!(e2.kind, FailureKind::Unauthorized);
        assert!(e2.message.starts_with("Groq didn't accept my API key"));
    }

    /// Live smoke test (run by hand): a deliberately invalid key must give a 401 from the real OpenRouter,
    /// mapped to the bad-key message. `cargo test --lib live_invalid_key -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn live_invalid_key_is_a_401_unauthorized() {
        let body = build_request(None, &[], "Say hi.");
        let client = reqwest::Client::new();
        let (status, text) = tauri::async_runtime::block_on(async {
            let r = client
                .post(API_URL)
                .header("Authorization", format!("Bearer sk-or-v1-{}", "0".repeat(64)))
                .header("HTTP-Referer", REFERER)
                .header("X-Title", APP_TITLE)
                .json(&body)
                .send()
                .await
                .unwrap();
            (r.status().as_u16(), r.text().await.unwrap())
        });
        println!("LIVE status={status} body={text}");
        assert_eq!(status, 401);
        let e = parse_response(status, &text).unwrap_err();
        assert_eq!(e.kind, FailureKind::Unauthorized);
        assert!(e.message.starts_with("OpenRouter didn't accept my API key"));
        // and through the real send() path
        let e2 = tauri::async_runtime::block_on(send(API_URL, &format!("sk-or-v1-{}", "0".repeat(64)), &body)).unwrap_err();
        assert_eq!(e2.kind, FailureKind::Unauthorized);
    }
}
