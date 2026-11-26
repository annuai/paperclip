//! macOS trackpads: a two-finger double tap is the system "Smart Zoom" gesture, so the page never sees the two right
//! clicks that open Ask Paperclip. This watches for the gesture over our own windows and tells that window.

/// AppKit measures from the bottom-left of the window; the page measures from the top-left.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(crate) fn css_point(x: f64, y: f64, height: f64) -> (f64, f64) {
    (x, height - y)
}

#[cfg(target_os = "macos")]
pub fn start(app: &tauri::AppHandle) {
    use block2::RcBlock;
    use objc2::encode::{Encode, Encoding};
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};
    use std::ptr::NonNull;
    use tauri::{Emitter, Manager};

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct Point {
        x: f64,
        y: f64,
    }
    // SAFETY: matches NSPoint/CGPoint, two doubles.
    unsafe impl Encode for Point {
        const ENCODING: Encoding = Encoding::Struct("CGPoint", &[f64::ENCODING, f64::ENCODING]);
    }
    /// NSEventMaskSmartMagnify (event type 32).
    const SMART_MAGNIFY: u64 = 1 << 32;

    let app = app.clone();
    let handler = RcBlock::new(move |event: NonNull<AnyObject>| -> *mut AnyObject {
        // SAFETY: AppKit hands the monitor a live NSEvent on the main thread; `window` and `locationInWindow` only read it.
        let (window, at): (*mut AnyObject, Point) = unsafe {
            (msg_send![event.as_ref(), window], msg_send![event.as_ref(), locationInWindow])
        };
        for (label, w) in app.webview_windows() {
            if w.ns_window().is_ok_and(|p| p.cast::<AnyObject>() == window) {
                if let (Ok(size), Ok(scale)) = (w.inner_size(), w.scale_factor()) {
                    let (x, y) = css_point(at.x, at.y, f64::from(size.height) / scale);
                    let _ = app.emit_to(label.as_str(), "smart-zoom", serde_json::json!({ "x": x, "y": y }));
                }
            }
        }
        event.as_ptr() // pass the event on unchanged
    });
    // SAFETY: the documented NSEvent class method; AppKit copies the block, and the monitor lives as long as the app.
    let _monitor: *mut AnyObject = unsafe { msg_send![class!(NSEvent), addLocalMonitorForEventsMatchingMask: SMART_MAGNIFY, handler: &*handler] };
}

#[cfg(not(target_os = "macos"))]
pub fn start(_app: &tauri::AppHandle) {}

#[cfg(test)]
mod tests {
    use super::css_point;

    #[test]
    fn flips_to_page_coordinates() {
        assert_eq!(css_point(10.0, 380.0, 380.0), (10.0, 0.0));
        assert_eq!(css_point(200.0, 40.0, 380.0), (200.0, 340.0));
    }
}
