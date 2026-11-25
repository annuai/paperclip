//! Meeting heads-up (macOS only, opt-in).
//!
//! Nothing here touches the calendar until the user turns "Meeting heads-up" on: only
//! `calendar_request_access` asks macOS for EventKit full access (that is what shows the system prompt),
//! and the poller thread stays idle while `enabled` is false. Once on, it looks every 60 s for events
//! that start within the next 6 minutes and emits them to the main window as `meeting-events`. The
//! frontend (`src/agent/meeting.ts`) decides what deserves a heads-up and makes sure each one fires once.
//!
//! Other platforms: `calendar_supported` is false, every command is a harmless no-op and no thread
//! is started. Event titles leave this process only through that event; nothing is logged.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

/// How far ahead the poller looks.
pub const LOOKAHEAD_SECS: i64 = 6 * 60;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalEvent {
    pub id: String,
    pub title: String,
    /// Start time, epoch milliseconds.
    pub start_ms: i64,
    pub all_day: bool,
}

#[derive(Default)]
pub struct CalendarState {
    enabled: AtomicBool,
}

/// Does an event starting at `start_ms` belong in the poll result for `now_ms`? All-day events never do.
pub fn in_window(start_ms: i64, all_day: bool, now_ms: i64) -> bool {
    !all_day && start_ms > now_ms && start_ms <= now_ms + LOOKAHEAD_SECS * 1000
}

/// Authorization as the frontend sees it: "granted" | "denied" | "notDetermined" | "unsupported".
/// Reading the status never shows a prompt.
#[tauri::command]
pub fn calendar_status() -> &'static str {
    platform::status()
}

#[tauri::command]
pub fn calendar_supported() -> bool {
    cfg!(target_os = "macos")
}

/// Asks macOS for calendar access (shows the system prompt the first time). Resolves to "granted",
/// "denied" or "unsupported". Only ever called when the user turns the toggle on.
#[tauri::command]
pub async fn calendar_request_access() -> &'static str {
    tauri::async_runtime::spawn_blocking(platform::request_access).await.unwrap_or("denied")
}

#[tauri::command]
pub fn calendar_set_enabled(state: State<'_, Arc<CalendarState>>, enabled: bool) {
    state.enabled.store(enabled, Ordering::Relaxed);
}

pub fn start(app: &AppHandle) {
    let state = Arc::new(CalendarState::default());
    app.manage(state.clone());
    #[cfg(target_os = "macos")]
    {
        let app = app.clone();
        let spawned = std::thread::Builder::new().name("paperclip-calendar".into()).spawn(move || run(&app, &state));
        if let Err(e) = spawned {
            eprintln!("paperclip: calendar poller unavailable: {e}");
        }
    }
}

#[cfg(target_os = "macos")]
fn run(app: &AppHandle, state: &CalendarState) {
    use std::time::{Duration, Instant};
    use tauri::Emitter;
    const POLL_EVERY: Duration = Duration::from_secs(60);
    // The thread wakes this often only to check the switch (cheap, and the toggle feels instant).
    const IDLE_WAKE: Duration = Duration::from_secs(5);
    let mut last: Option<Instant> = None;
    loop {
        std::thread::sleep(IDLE_WAKE);
        if !state.enabled.load(Ordering::Relaxed) {
            last = None; // the next switch-on polls straight away
            continue;
        }
        if last.is_some_and(|t| t.elapsed() < POLL_EVERY) {
            continue;
        }
        last = Some(Instant::now());
        if let Some(events) = platform::upcoming() {
            if !events.is_empty() {
                let _ = app.emit_to("main", "meeting-events", events);
            }
        }
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{in_window, CalEvent, LOOKAHEAD_SECS};
    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::{Bool, NSObjectProtocol};
    use objc2::{sel, AllocAnyThread};
    use objc2_event_kit::{EKAuthorizationStatus, EKEntityType, EKEventStore};
    use objc2_foundation::{NSDate, NSError};
    use std::time::Duration;

    fn store() -> Retained<EKEventStore> {
        // SAFETY: plain `[[EKEventStore alloc] init]`.
        unsafe { EKEventStore::init(EKEventStore::alloc()) }
    }

    pub fn status() -> &'static str {
        // SAFETY: class method with no preconditions.
        let s = unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Event) };
        if s == EKAuthorizationStatus::FullAccess {
            "granted"
        } else if s == EKAuthorizationStatus::NotDetermined {
            "notDetermined"
        } else {
            "denied" // restricted, denied, or write-only (cannot read events)
        }
    }

    pub fn request_access() -> &'static str {
        match status() {
            "granted" => return "granted",
            "denied" => return "denied", // macOS never asks twice; the user has to flip it in System Settings
            _ => {}
        }
        let store = store();
        let (tx, rx) = std::sync::mpsc::channel::<bool>();
        let block = RcBlock::new(move |granted: Bool, _err: *mut NSError| {
            let _ = tx.send(granted.as_bool());
        });
        // SAFETY: `block` outlives the call (we wait for its answer) and has the handler's signature.
        unsafe {
            if store.respondsToSelector(sel!(requestFullAccessToEventsWithCompletion:)) {
                store.requestFullAccessToEventsWithCompletion(RcBlock::as_ptr(&block));
            } else {
                // macOS 13 and older only have the original call.
                #[allow(deprecated)]
                store.requestAccessToEntityType_completion(EKEntityType::Event, RcBlock::as_ptr(&block));
            }
        }
        // The prompt waits for the user: allow plenty of time, but never hang the thread forever.
        match rx.recv_timeout(Duration::from_secs(300)) {
            Ok(true) => "granted",
            _ => "denied",
        }
    }

    pub fn upcoming() -> Option<Vec<CalEvent>> {
        if status() != "granted" {
            return None;
        }
        let store = store();
        let now = NSDate::now();
        let end = NSDate::dateWithTimeIntervalSinceNow(LOOKAHEAD_SECS as f64);
        // SAFETY: the store is alive, both dates are valid, `None` means "all calendars".
        let events = unsafe {
            let predicate = store.predicateForEventsWithStartDate_endDate_calendars(&now, &end, None);
            store.eventsMatchingPredicate(&predicate)
        };
        let now_ms = (now.timeIntervalSince1970() * 1000.0) as i64;
        let mut out = Vec::new();
        for ev in events.iter() {
            // SAFETY: plain property getters on a live EKEvent.
            let (title, start, all_day, id) = unsafe {
                (ev.title().to_string(), ev.startDate().timeIntervalSince1970(), ev.isAllDay(), ev.eventIdentifier())
            };
            let start_ms = (start * 1000.0) as i64;
            if in_window(start_ms, all_day, now_ms) {
                let id = id.map(|s| s.to_string()).unwrap_or_else(|| title.clone());
                out.push(CalEvent { id, title, start_ms, all_day });
            }
        }
        Some(out)
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    pub fn status() -> &'static str {
        "unsupported"
    }
    pub fn request_access() -> &'static str {
        "unsupported"
    }
    #[allow(dead_code)]
    pub fn upcoming() -> Option<Vec<super::CalEvent>> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_is_the_next_six_minutes_without_all_day_events() {
        let now = 1_700_000_000_000;
        assert!(in_window(now + 5 * 60_000, false, now));
        assert!(in_window(now + 6 * 60_000, false, now));
        assert!(!in_window(now + 6 * 60_000 + 1, false, now));
        assert!(!in_window(now, false, now)); // already started
        assert!(!in_window(now - 1, false, now));
        assert!(!in_window(now + 60_000, true, now)); // all-day
    }
}
