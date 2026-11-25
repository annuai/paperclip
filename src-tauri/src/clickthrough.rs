//! Click-through for the transparent window.
//!
//! The frontend reports the interactive regions (character, balloon, menu) in CSS px relative to the
//! window content. A background thread polls the global cursor position and calls
//! `set_ignore_cursor_events` only when the desired state changes, so transparent pixels let clicks
//! fall through to the apps underneath.
//!
//! Platform notes:
//! - macOS: needs `macOSPrivateApi`; while ignoring, the webview gets no mouse events, hence the poller.
//!   `acceptFirstMouse` lets the first click on the unfocused window register.
//! - Windows: works; coordinates are physical (scale factor path used). Verify on a 150% display.
//! - Linux X11: works. Wayland: the global cursor position is unavailable -> the `Err` path keeps the
//!   whole window interactive (transparent area blocks clicks; acceptable degradation). Run with
//!   `GDK_BACKEND=x11` for full behaviour.
//! - Dragging: the cursor stays over the character during `start_dragging`, so no special case.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

#[derive(Clone, Copy, Debug, serde::Deserialize)]
pub struct HitRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Default)]
pub struct HitState {
    pub rects: Mutex<Vec<HitRect>>,
    /// Eye-follow: while true the poller streams the global cursor position to the frontend.
    pub follow: AtomicBool,
    /// Menu open: the poller streams the cursor (`menu-pointer`) and reports clicks outside the hit rects
    /// (`outside-press`). macOS often refuses to make the window active, and then the web view gets neither
    /// mouse-move events (no hover) nor a blur (no click-outside-to-close), so the menu cannot rely on them.
    pub menu: AtomicBool,
}

#[tauri::command]
pub fn set_menu_tracking(state: State<'_, Arc<HitState>>, enabled: bool) {
    state.menu.store(enabled, Ordering::Relaxed);
}

/// True on the poll where a mouse button went down while the cursor was outside every hit rect.
pub fn pressed_outside(was_down: bool, is_down: bool, inside: bool) -> bool {
    is_down && !was_down && !inside
}

/// Whether any mouse button (left, right, middle) is down right now, system-wide. Needs no permission.
#[cfg(target_os = "macos")]
fn any_button_down() -> bool {
    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        fn CGEventSourceButtonState(state_id: i32, button: u32) -> bool;
    }
    const COMBINED_SESSION_STATE: i32 = 0;
    // SAFETY: a pure query of the input state; no pointers involved.
    (0..3).any(|b| unsafe { CGEventSourceButtonState(COMBINED_SESSION_STATE, b) })
}

#[cfg(windows)]
fn any_button_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_MBUTTON, VK_RBUTTON};
    // SAFETY: GetAsyncKeyState only reads the key state.
    [VK_LBUTTON, VK_RBUTTON, VK_MBUTTON].iter().any(|k| unsafe { GetAsyncKeyState(i32::from(k.0)) } as u16 & 0x8000 != 0)
}

#[cfg(not(any(target_os = "macos", windows)))]
fn any_button_down() -> bool {
    false // Linux: no portable global button state; the in-window click and blur still close the menu
}

#[derive(Clone, Copy, serde::Serialize)]
struct CursorPayload {
    x: f64,
    y: f64,
}

#[tauri::command]
pub fn set_eye_follow(state: State<'_, Arc<HitState>>, enabled: bool) {
    state.follow.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
pub fn set_hit_rects(state: State<'_, Arc<HitState>>, rects: Vec<HitRect>) {
    if let Ok(mut guard) = state.rects.lock() {
        *guard = rects;
    }
}

/// Returns `None` when the window is hidden, otherwise
/// `(cursor_inside_a_rect, cursor_near_window, cursor_x, cursor_y)` with the cursor in logical px
/// relative to the window's top-left (same conversion as the click-through test).
fn sample(
    app: &AppHandle,
    win: &WebviewWindow,
    state: &HitState,
    geom: &mut Geometry,
) -> tauri::Result<Option<(bool, bool, f64, f64)>> {
    if !win.is_visible()? {
        return Ok(None);
    }
    let cursor = app.cursor_position()?;
    let pos = win.inner_position()?;
    // Size and scale factor change rarely; refresh them every ~2 s to keep main-thread round trips low.
    if geom.age == 0 || geom.age > 20 {
        geom.size = win.inner_size()?;
        geom.scale = win.scale_factor()?;
        geom.primary_scale = app.primary_monitor()?.map_or(geom.scale, |m| m.scale_factor());
        geom.age = 0;
    }
    geom.age += 1;
    let (size, scale) = (geom.size, geom.scale);
    // macOS: tao reports the cursor as logical points x the *primary* monitor's scale, while the window
    // position uses the window's own monitor scale. Compare in logical points so mixed-DPI setups agree.
    #[cfg(target_os = "macos")]
    let (lx, ly) = (
        cursor.x / geom.primary_scale - f64::from(pos.x) / scale,
        cursor.y / geom.primary_scale - f64::from(pos.y) / scale,
    );
    #[cfg(not(target_os = "macos"))]
    let (lx, ly) = (
        (cursor.x - f64::from(pos.x)) / scale,
        (cursor.y - f64::from(pos.y)) / scale,
    );
    let rects: Vec<HitRect> = state.rects.lock().map(|g| g.clone()).unwrap_or_default();
    let inside = rects
        .iter()
        .any(|r| lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h);
    let margin = 150.0;
    #[cfg(target_os = "macos")]
    let cursor = tauri::PhysicalPosition::new(
        cursor.x / geom.primary_scale * scale,
        cursor.y / geom.primary_scale * scale,
    );
    let near = cursor.x >= f64::from(pos.x) - margin
        && cursor.x <= f64::from(pos.x) + f64::from(size.width) + margin
        && cursor.y >= f64::from(pos.y) - margin
        && cursor.y <= f64::from(pos.y) + f64::from(size.height) + margin;
    Ok(Some((inside, near, lx, ly)))
}

struct Geometry {
    size: tauri::PhysicalSize<u32>,
    scale: f64,
    primary_scale: f64,
    age: u32,
}

pub fn spawn_poller(app: AppHandle) {
    let state = app.state::<Arc<HitState>>().inner().clone();
    std::thread::spawn(move || {
        // Start in ignore mode so the transparent window never swallows clicks/hover before the
        // first poll; the poller flips it only while the cursor is over a reported hit rect.
        let mut ignoring: Option<bool> = None;
        if let Some(win) = app.get_webview_window("main") {
            if win.set_ignore_cursor_events(true).is_ok() {
                ignoring = Some(true);
            }
        }
        let mut last_sent: Option<(f64, f64)> = None;
        let mut last_menu_sent: Option<(f64, f64)> = None;
        let mut was_down = false;
        let mut geom = Geometry {
            size: tauri::PhysicalSize::new(0, 0),
            scale: 1.0,
            primary_scale: 1.0,
            age: 0,
        };
        loop {
            let mut sleep_ms = 150;
            if let Some(win) = app.get_webview_window("main") {
                match sample(&app, &win, &state, &mut geom) {
                    Ok(Some((inside, near, lx, ly))) => {
                        let want = !inside;
                        if ignoring != Some(want) && win.set_ignore_cursor_events(want).is_ok() {
                            ignoring = Some(want);
                        }
                        if near {
                            sleep_ms = 33; // ~30 Hz near the window, ~7 Hz far away
                        }
                        if state.follow.load(Ordering::Relaxed) {
                            // Eye-follow: ~30 Hz, and only when the position actually changed.
                            sleep_ms = 33;
                            if last_sent != Some((lx, ly)) {
                                last_sent = Some((lx, ly));
                                let _ = app.emit_to("main", "cursor", CursorPayload { x: lx, y: ly });
                            }
                        } else {
                            last_sent = None;
                        }
                        if state.menu.load(Ordering::Relaxed) {
                            sleep_ms = 16; // ~60 Hz while the menu is open: hover must feel immediate
                            if last_menu_sent != Some((lx, ly)) {
                                last_menu_sent = Some((lx, ly));
                                let _ = app.emit_to("main", "menu-pointer", CursorPayload { x: lx, y: ly });
                            }
                            let down = any_button_down();
                            if pressed_outside(was_down, down, inside) {
                                let _ = app.emit_to("main", "outside-press", ());
                            }
                            was_down = down;
                        } else {
                            last_menu_sent = None;
                            was_down = false;
                        }
                    }
                    Ok(None) => {
                        // hidden: make sure we are not left interactive
                        if ignoring != Some(true) && win.set_ignore_cursor_events(true).is_ok() {
                            ignoring = Some(true);
                        }
                        sleep_ms = 250;
                    }
                    Err(_) => {
                        // cursor position unsupported (e.g. Wayland): keep the window interactive
                        if ignoring != Some(false) && win.set_ignore_cursor_events(false).is_ok() {
                            ignoring = Some(false);
                        }
                        sleep_ms = 1000;
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(sleep_ms));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::pressed_outside;

    #[test]
    fn a_press_outside_counts_once_on_the_way_down() {
        assert!(pressed_outside(false, true, false));
        assert!(!pressed_outside(true, true, false), "held button: not a new press");
        assert!(!pressed_outside(true, false, false), "release is not a press");
        assert!(!pressed_outside(false, false, false));
    }

    #[test]
    fn a_press_inside_paperclip_is_left_to_the_web_view() {
        assert!(!pressed_outside(false, true, true));
    }
}
