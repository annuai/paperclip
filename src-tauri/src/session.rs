//! Screen lock / unlock notifications. Emits `session-unlocked` ({ awaySeconds: number | null })
//! to the main window when the user unlocks the screen (this also covers waking from sleep, which
//! ends at the lock screen). The lock notification is only used to measure how long the user was away.
//!
//! - macOS: distributed notifications `com.apple.screenIsLocked` / `com.apple.screenIsUnlocked`.
//! - Windows: WTSRegisterSessionNotification + WM_WTSSESSION_CHANGE on a hidden message-only window.
//! - Linux: logind `Session` D-Bus `Lock` / `Unlock` signals (best effort; logs and continues if unavailable).

use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Unlocked {
    away_seconds: Option<u64>,
}

/// When the screen was last locked (None = unknown).
#[derive(Clone, Default)]
struct LockClock(Arc<Mutex<Option<Instant>>>);

impl LockClock {
    fn locked(&self) {
        if let Ok(mut g) = self.0.lock() {
            *g = Some(Instant::now());
        }
    }

    fn unlocked(&self, app: &AppHandle) {
        let away = self
            .0
            .lock()
            .ok()
            .and_then(|mut g| g.take())
            .map(|t| t.elapsed().as_secs());
        let _ = app.emit_to("main", "session-unlocked", Unlocked { away_seconds: away });
    }
}

pub fn start(app: &AppHandle) {
    let clock = LockClock::default();
    platform::start(app.clone(), clock);
}

#[cfg(target_os = "macos")]
mod platform {
    use super::LockClock;
    use block2::RcBlock;
    use objc2_foundation::{NSDistributedNotificationCenter, NSNotification, NSString};
    use std::ptr::NonNull;
    use tauri::AppHandle;

    pub fn start(app: AppHandle, clock: LockClock) {
        let center = NSDistributedNotificationCenter::defaultCenter();

        let lock_clock = clock.clone();
        let on_lock = RcBlock::new(move |_n: NonNull<NSNotification>| lock_clock.locked());
        let on_unlock = RcBlock::new(move |_n: NonNull<NSNotification>| clock.unlocked(&app));

        let locked_name = NSString::from_str("com.apple.screenIsLocked");
        let unlocked_name = NSString::from_str("com.apple.screenIsUnlocked");
        // SAFETY: the blocks are Send-safe closures over cloneable handles; delivery on any thread is fine.
        let (a, b) = unsafe {
            (
                center.addObserverForName_object_queue_usingBlock(Some(&locked_name), None, None, &on_lock),
                center.addObserverForName_object_queue_usingBlock(Some(&unlocked_name), None, None, &on_unlock),
            )
        };
        // Keep the observers (and their blocks) alive for the whole app lifetime.
        std::mem::forget(a);
        std::mem::forget(b);
        std::mem::forget(on_lock);
        std::mem::forget(on_unlock);
    }
}

#[cfg(windows)]
mod platform {
    use super::LockClock;
    use std::sync::OnceLock;
    use tauri::AppHandle;
    use windows::core::w;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::RemoteDesktop::{WTSRegisterSessionNotification, NOTIFY_FOR_THIS_SESSION};
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW, TranslateMessage, HWND_MESSAGE, MSG,
        WINDOW_EX_STYLE, WINDOW_STYLE, WNDCLASSW,
    };

    const WM_WTSSESSION_CHANGE: u32 = 0x02B1;
    const WTS_SESSION_LOCK: usize = 0x7;
    const WTS_SESSION_UNLOCK: usize = 0x8;

    static CTX: OnceLock<(AppHandle, LockClock)> = OnceLock::new();

    unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if msg == WM_WTSSESSION_CHANGE {
            if let Some((app, clock)) = CTX.get() {
                match wparam.0 {
                    WTS_SESSION_LOCK => clock.locked(),
                    WTS_SESSION_UNLOCK => clock.unlocked(app),
                    _ => {}
                }
            }
            return LRESULT(0);
        }
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    pub fn start(app: AppHandle, clock: LockClock) {
        let _ = CTX.set((app, clock));
        std::thread::spawn(|| unsafe {
            let Ok(hinst) = GetModuleHandleW(None) else { return };
            let class = w!("PaperclipSessionWatcher");
            let wc = WNDCLASSW {
                lpfnWndProc: Some(wndproc),
                hInstance: hinst.into(),
                lpszClassName: class,
                ..Default::default()
            };
            RegisterClassW(&wc);
            let Ok(hwnd) = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                class,
                w!("Paperclip session watcher"),
                WINDOW_STYLE(0),
                0,
                0,
                0,
                0,
                Some(HWND_MESSAGE),
                None,
                Some(hinst.into()),
                None,
            ) else {
                return;
            };
            if WTSRegisterSessionNotification(hwnd, NOTIFY_FOR_THIS_SESSION).is_err() {
                return;
            }
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use super::LockClock;
    use tauri::AppHandle;

    pub fn start(app: AppHandle, clock: LockClock) {
        std::thread::spawn(move || {
            if let Err(e) = watch(&app, &clock) {
                eprintln!("paperclip: logind lock/unlock watcher unavailable: {e}");
            }
        });
    }

    fn watch(app: &AppHandle, clock: &LockClock) -> zbus::Result<()> {
        let conn = zbus::blocking::Connection::system()?;
        let proxy = zbus::blocking::Proxy::new(
            &conn,
            "org.freedesktop.login1",
            "/org/freedesktop/login1/session/auto",
            "org.freedesktop.login1.Session",
        )?;
        for msg in proxy.receive_all_signals()? {
            match msg.header().member().map(|m| m.as_str().to_owned()).as_deref() {
                Some("Lock") => clock.locked(),
                Some("Unlock") => clock.unlocked(app),
                _ => {}
            }
        }
        Ok(())
    }
}

#[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
mod platform {
    use super::LockClock;
    use tauri::AppHandle;

    pub fn start(_app: AppHandle, _clock: LockClock) {}
}
