//! System awareness ("presence"). One thread samples every 5 s and emits a `system` event to the
//! main window only when something meaningful changed (see `significant_change`):
//!
//! | field         | macOS                                   | Windows                          | Linux                  |
//! |---------------|-----------------------------------------|----------------------------------|------------------------|
//! | `fullscreen`  | CGWindowList: layer-0 window == display | SHQueryUserNotificationState     | false (not detected)   |
//! | `batteryPct`  | `pmset -g batt` (every 30 s)            | GetSystemPowerStatus             | /sys/class/power_supply|
//! | `charging`    | `pmset -g batt` (on AC = true)          | GetSystemPowerStatus             | /sys/class/power_supply|
//! | `cpuPct`      | host_statistics(HOST_CPU_LOAD_INFO)     | GetSystemTimes                   | /proc/stat             |
//! | `audioPlaying`| `pmset -g assertions` (every 15 s)      | false (no cheap API)             | false (not detected)   |
//! | `idleSecs`    | CGEventSourceSecondsSinceLastEventType  | GetLastInputInfo                 | 0 (not detected)       |
//!
//! Unsupported signals report `false` / `None` / 0 and never panic. The latest snapshot is also
//! available through the `get_system` command so the frontend can read it right after boot.

use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

pub const SAMPLE_EVERY: Duration = Duration::from_secs(5);
/// Battery is polled every 6th sample (30 s); audio every 3rd (15 s).
const BATTERY_EVERY: u64 = 6;
const AUDIO_EVERY: u64 = 3;
/// Change thresholds that decide whether a new snapshot is worth an event.
pub const STEP_PCT: f32 = 5.0;
pub const LOW_BATTERY_PCT: u8 = 15;
pub const HIGH_CPU_PCT: f32 = 85.0;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// Another app is full screen or presenting on Paperclip's display.
    pub fullscreen: bool,
    pub battery_pct: Option<u8>,
    /// True when on AC power (charging or full); false on battery; None without a battery.
    pub charging: Option<bool>,
    /// System-wide CPU load, smoothed, 0..100.
    pub cpu_pct: f32,
    pub audio_playing: bool,
    /// Seconds since the last keyboard or mouse input.
    pub idle_secs: u32,
}

impl Default for Snapshot {
    fn default() -> Self {
        Self { fullscreen: false, battery_pct: None, charging: None, cpu_pct: 0.0, audio_playing: false, idle_secs: 0 }
    }
}

pub struct SystemState(Mutex<Snapshot>);

/// Coarse idle bands so the 5 s idle counter does not produce an event every sample:
/// 0 = active (< 60 s), 1 = away (< 300 s), 2 = on a break (>= 300 s).
pub fn idle_band(secs: u32) -> u8 {
    match secs {
        0..=59 => 0,
        60..=299 => 1,
        _ => 2,
    }
}

/// Should `next` be emitted given the last emitted snapshot?
pub fn significant_change(prev: &Snapshot, next: &Snapshot) -> bool {
    if prev.fullscreen != next.fullscreen || prev.audio_playing != next.audio_playing || prev.charging != next.charging {
        return true;
    }
    if idle_band(prev.idle_secs) != idle_band(next.idle_secs) {
        return true;
    }
    match (prev.battery_pct, next.battery_pct) {
        (None, None) => {}
        (Some(a), Some(b)) => {
            if a.abs_diff(b) as f32 >= STEP_PCT || (a <= LOW_BATTERY_PCT) != (b <= LOW_BATTERY_PCT) {
                return true;
            }
        }
        _ => return true,
    }
    (prev.cpu_pct - next.cpu_pct).abs() >= STEP_PCT || (prev.cpu_pct >= HIGH_CPU_PCT) != (next.cpu_pct >= HIGH_CPU_PCT)
}

/// Exponential smoothing of the 5 s CPU samples (alpha 0.4: a spike needs ~3 samples to register).
#[derive(Default)]
pub struct CpuSmoother {
    value: Option<f32>,
}

impl CpuSmoother {
    pub fn push(&mut self, raw: f32) -> f32 {
        let raw = raw.clamp(0.0, 100.0);
        let v = match self.value {
            None => raw,
            Some(prev) => prev + 0.4 * (raw - prev),
        };
        self.value = Some(v);
        v
    }
}

/// CPU load between two cumulative (busy, total) tick readings.
pub fn cpu_pct_between(prev: (u64, u64), cur: (u64, u64)) -> Option<f32> {
    let total = cur.1.wrapping_sub(prev.1);
    if total == 0 || total > u64::MAX / 2 {
        return None;
    }
    let busy = cur.0.wrapping_sub(prev.0).min(total);
    Some(busy as f32 * 100.0 / total as f32)
}

// ---------------------------------------------------------------------------------------------
// Pure parsers. They live here (not under a platform module) so every host can unit test them.
// ---------------------------------------------------------------------------------------------

/// `pmset -g batt` -> (percent, on AC). No battery -> (None, None) when the output has no percent.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn parse_pmset_batt(out: &str) -> (Option<u8>, Option<bool>) {
    let on_ac = if out.contains("'AC Power'") {
        Some(true)
    } else if out.contains("'Battery Power'") || out.contains("'UPS Power'") {
        Some(false)
    } else {
        None
    };
    let pct = out
        .lines()
        .filter(|l| l.contains("InternalBattery") || l.contains('%'))
        .find_map(|l| {
            let end = l.find('%')?;
            let digits: String = l[..end].chars().rev().take_while(|c| c.is_ascii_digit()).collect::<Vec<_>>().into_iter().rev().collect();
            digits.parse::<u16>().ok().map(|n| n.min(100) as u8)
        });
    match pct {
        Some(p) => (Some(p), on_ac),
        None => (None, None),
    }
}

/// `pmset -g assertions`: audio is playing when coreaudiod holds an assertion whose resources
/// include `audio-out` (the generic PreventUserIdleSystemSleep alone is held by powerd and many apps).
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn parse_pmset_audio(out: &str) -> bool {
    let mut in_coreaudio = false;
    for line in out.lines() {
        let t = line.trim_start();
        if t.starts_with("pid ") {
            in_coreaudio = t.contains("(coreaudiod)");
            if in_coreaudio && t.contains("output.context") {
                return true;
            }
        } else if in_coreaudio && t.contains("audio-out") {
            return true;
        }
    }
    false
}

/// First line of /proc/stat -> cumulative (busy, total) jiffies.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub fn parse_proc_stat(stat: &str) -> Option<(u64, u64)> {
    let line = stat.lines().next()?;
    let mut it = line.split_whitespace();
    if it.next()? != "cpu" {
        return None;
    }
    let v: Vec<u64> = it.take(8).filter_map(|s| s.parse().ok()).collect();
    if v.len() < 4 {
        return None;
    }
    let idle = v[3] + v.get(4).copied().unwrap_or(0); // idle + iowait
    let total: u64 = v.iter().sum();
    Some((total.saturating_sub(idle), total))
}

/// /sys/class/power_supply/BAT*/{capacity,status} -> (percent, on AC).
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub fn parse_sysfs_battery(capacity: &str, status: &str) -> (Option<u8>, Option<bool>) {
    let pct = capacity.trim().parse::<u16>().ok().map(|n| n.min(100) as u8);
    let ac = match status.trim() {
        "Discharging" => Some(false),
        "Charging" | "Full" | "Not charging" => Some(true),
        _ => None,
    };
    (pct, if pct.is_some() { ac } else { None })
}

// ---------------------------------------------------------------------------------------------
// Sampling thread
// ---------------------------------------------------------------------------------------------

pub fn start(app: &AppHandle) {
    app.manage(Arc::new(SystemState(Mutex::new(Snapshot::default()))));
    let app = app.clone();
    let spawned = std::thread::Builder::new().name("paperclip-system".into()).spawn(move || run(&app));
    if let Err(e) = spawned {
        eprintln!("paperclip: system sampler unavailable: {e}");
    }
}

fn run(app: &AppHandle) {
    let mut probe = platform::Probe::new();
    let mut smoother = CpuSmoother::default();
    let mut prev_ticks: Option<(u64, u64)> = None;
    let mut cur = Snapshot::default();
    let mut last_emitted: Option<Snapshot> = None;
    let mut n: u64 = 0;
    loop {
        if n.is_multiple_of(BATTERY_EVERY) {
            let (pct, charging) = probe.battery();
            cur.battery_pct = pct;
            cur.charging = charging;
        }
        if n.is_multiple_of(AUDIO_EVERY) {
            cur.audio_playing = probe.audio_playing();
        }
        cur.fullscreen = probe.fullscreen(anchor_point(app));
        cur.idle_secs = probe.idle_secs();
        if let Some(ticks) = probe.cpu_ticks() {
            if let Some(p) = prev_ticks.and_then(|p| cpu_pct_between(p, ticks)) {
                cur.cpu_pct = smoother.push(p);
            }
            prev_ticks = Some(ticks);
        }
        if let Some(state) = app.try_state::<Arc<SystemState>>() {
            if let Ok(mut g) = state.0.lock() {
                *g = cur.clone();
            }
        }
        if last_emitted.as_ref().is_none_or(|p| significant_change(p, &cur)) {
            let _ = app.emit_to("main", "system", cur.clone());
            last_emitted = Some(cur.clone());
        }
        n += 1;
        std::thread::sleep(SAMPLE_EVERY);
    }
}

/// Centre of Paperclip's window in logical points (the same top-left global space the OS uses for
/// display bounds on macOS), or None while the window is unavailable.
fn anchor_point(app: &AppHandle) -> Option<(f64, f64)> {
    let w = app.get_webview_window("main")?;
    let p = w.outer_position().ok()?;
    let s = w.outer_size().ok()?;
    let f = w.scale_factor().ok()?.max(0.1);
    Some(((p.x as f64 + s.width as f64 / 2.0) / f, (p.y as f64 + s.height as f64 / 2.0) / f))
}

#[tauri::command]
pub fn get_system(state: State<'_, Arc<SystemState>>) -> Snapshot {
    state.0.lock().map(|g| g.clone()).unwrap_or_default()
}

// ---------------------------------------------------------------------------------------------
// Platforms
// ---------------------------------------------------------------------------------------------

#[cfg(target_os = "macos")]
mod platform {
    use super::{parse_pmset_audio, parse_pmset_batt};
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::number::CFNumber;
    use core_foundation::string::CFString;
    use core_graphics::display::CGDisplay;
    use core_graphics::window::{
        copy_window_info, kCGNullWindowID, kCGWindowBounds, kCGWindowLayer, kCGWindowListOptionOnScreenOnly, kCGWindowOwnerPID,
    };
    use std::process::Command;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: i32, event_type: u32) -> f64;
    }
    extern "C" {
        fn mach_host_self() -> u32;
        fn host_statistics(host: u32, flavor: i32, info: *mut i32, count: *mut u32) -> i32;
    }
    const COMBINED_SESSION_STATE: i32 = 0; // kCGEventSourceStateCombinedSessionState
    const ANY_INPUT_EVENT: u32 = u32::MAX; // kCGAnyInputEventType
    const HOST_CPU_LOAD_INFO: i32 = 3;
    const HOST_CPU_LOAD_INFO_COUNT: u32 = 4;

    pub struct Probe {
        host: u32,
        pid: u32,
    }

    impl Probe {
        pub fn new() -> Self {
            // SAFETY: mach_host_self has no preconditions; the port is fetched once and reused.
            Self { host: unsafe { mach_host_self() }, pid: std::process::id() }
        }

        pub fn idle_secs(&mut self) -> u32 {
            // SAFETY: plain value arguments, no pointers.
            let s = unsafe { CGEventSourceSecondsSinceLastEventType(COMBINED_SESSION_STATE, ANY_INPUT_EVENT) };
            if s.is_finite() && s > 0.0 { s.min(u32::MAX as f64) as u32 } else { 0 }
        }

        pub fn cpu_ticks(&mut self) -> Option<(u64, u64)> {
            let mut info = [0i32; HOST_CPU_LOAD_INFO_COUNT as usize]; // user, system, idle, nice
            let mut count = HOST_CPU_LOAD_INFO_COUNT;
            // SAFETY: `info` holds HOST_CPU_LOAD_INFO_COUNT integers and `count` says so.
            let kr = unsafe { host_statistics(self.host, HOST_CPU_LOAD_INFO, info.as_mut_ptr(), &mut count) };
            if kr != 0 {
                return None;
            }
            let t: Vec<u64> = info.iter().map(|&v| v as u32 as u64).collect();
            Some((t[0] + t[1] + t[3], t.iter().sum()))
        }

        pub fn battery(&mut self) -> (Option<u8>, Option<bool>) {
            match Command::new("pmset").args(["-g", "batt"]).output() {
                Ok(o) => parse_pmset_batt(&String::from_utf8_lossy(&o.stdout)),
                Err(_) => (None, None),
            }
        }

        pub fn audio_playing(&mut self) -> bool {
            match Command::new("pmset").args(["-g", "assertions"]).output() {
                Ok(o) => parse_pmset_audio(&String::from_utf8_lossy(&o.stdout)),
                Err(_) => false,
            }
        }

        /// True when another app has a layer-0 window exactly covering Paperclip's display.
        pub fn fullscreen(&mut self, anchor: Option<(f64, f64)>) -> bool {
            fullscreen_on_display(self.pid, anchor)
        }
    }

    fn num(d: &CFDictionary<CFString, CFType>, key: &str) -> Option<f64> {
        let v = d.find(CFString::new(key))?;
        v.downcast::<CFNumber>()?.to_f64()
    }

    pub(super) fn fullscreen_on_display(own_pid: u32, anchor: Option<(f64, f64)>) -> bool {
        let displays: Vec<CGDisplay> = CGDisplay::active_displays().unwrap_or_default().into_iter().map(CGDisplay::new).collect();
        let target = anchor
            .and_then(|(x, y)| {
                displays.iter().map(|d| d.bounds()).find(|b| {
                    x >= b.origin.x && x < b.origin.x + b.size.width && y >= b.origin.y && y < b.origin.y + b.size.height
                })
            })
            .unwrap_or_else(|| CGDisplay::main().bounds());
        let Some(list) = copy_window_info(kCGWindowListOptionOnScreenOnly, kCGNullWindowID) else {
            return false;
        };
        // SAFETY (all three keys): CoreGraphics string constants, valid for the process lifetime.
        let (k_layer, k_pid, k_bounds) = unsafe {
            (
                CFString::wrap_under_get_rule(kCGWindowLayer),
                CFString::wrap_under_get_rule(kCGWindowOwnerPID),
                CFString::wrap_under_get_rule(kCGWindowBounds),
            )
        };
        for item in list.iter() {
            // SAFETY: every element of the CGWindowList array is a CFDictionary.
            let w: CFDictionary<CFString, CFType> = unsafe { CFDictionary::wrap_under_get_rule(*item as _) };
            let Some(layer) = w.find(&k_layer).and_then(|v| v.downcast::<CFNumber>()).and_then(|n| n.to_i64()) else { continue };
            let Some(pid) = w.find(&k_pid).and_then(|v| v.downcast::<CFNumber>()).and_then(|n| n.to_i64()) else { continue };
            if layer != 0 || pid == i64::from(own_pid) {
                continue;
            }
            let Some(bounds) = w.find(&k_bounds).and_then(|v| v.downcast::<CFDictionary>()) else { continue };
            // SAFETY: kCGWindowBounds holds a CFDictionary with CFString keys and CFNumber values.
            let bounds: CFDictionary<CFString, CFType> = unsafe { CFDictionary::wrap_under_get_rule(bounds.as_concrete_TypeRef()) };
            let (Some(x), Some(y), Some(width), Some(height)) =
                (num(&bounds, "X"), num(&bounds, "Y"), num(&bounds, "Width"), num(&bounds, "Height"))
            else {
                continue;
            };
            if super::rect_matches((x, y, width, height), (target.origin.x, target.origin.y, target.size.width, target.size.height)) {
                return true;
            }
        }
        false
    }
}

#[cfg(windows)]
mod platform {
    use windows::Win32::Foundation::FILETIME;
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::System::Threading::GetSystemTimes;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    use windows::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
    };

    pub struct Probe;

    fn ft(f: FILETIME) -> u64 {
        (u64::from(f.dwHighDateTime) << 32) | u64::from(f.dwLowDateTime)
    }

    impl Probe {
        pub fn new() -> Self {
            Probe
        }

        pub fn fullscreen(&mut self, _anchor: Option<(f64, f64)>) -> bool {
            // SAFETY: no arguments; returns the shell's notification state.
            match unsafe { SHQueryUserNotificationState() } {
                Ok(s) => s == QUNS_PRESENTATION_MODE || s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_BUSY,
                Err(_) => false,
            }
        }

        pub fn idle_secs(&mut self) -> u32 {
            let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
            // SAFETY: `info` is a valid LASTINPUTINFO with cbSize set.
            if unsafe { GetLastInputInfo(&mut info) }.as_bool() {
                // SAFETY: no arguments.
                let now = unsafe { GetTickCount() };
                now.wrapping_sub(info.dwTime) / 1000
            } else {
                0
            }
        }

        pub fn cpu_ticks(&mut self) -> Option<(u64, u64)> {
            let (mut idle, mut kernel, mut user) = (FILETIME::default(), FILETIME::default(), FILETIME::default());
            // SAFETY: three valid out-pointers.
            unsafe { GetSystemTimes(Some(&mut idle), Some(&mut kernel), Some(&mut user)) }.ok()?;
            let (i, k, u) = (ft(idle), ft(kernel), ft(user));
            let total = k + u; // kernel time includes idle time
            Some((total.saturating_sub(i), total))
        }

        pub fn battery(&mut self) -> (Option<u8>, Option<bool>) {
            let mut s = SYSTEM_POWER_STATUS::default();
            // SAFETY: valid out-pointer.
            if unsafe { GetSystemPowerStatus(&mut s) }.is_err() || s.BatteryFlag & 128 != 0 || s.BatteryLifePercent > 100 {
                return (None, None);
            }
            (Some(s.BatteryLifePercent), Some(s.ACLineStatus == 1))
        }

        /// No cheap media-session API without WinRT; reported as not playing.
        pub fn audio_playing(&mut self) -> bool {
            false
        }
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use super::{parse_proc_stat, parse_sysfs_battery};
    use std::fs;

    pub struct Probe;

    impl Probe {
        pub fn new() -> Self {
            Probe
        }

        /// Full screen is not detected on Linux (X11/Wayland differ too much for a cheap probe).
        pub fn fullscreen(&mut self, _anchor: Option<(f64, f64)>) -> bool {
            false
        }

        /// Idle time is not detected on Linux; 0 means "always active".
        pub fn idle_secs(&mut self) -> u32 {
            0
        }

        pub fn cpu_ticks(&mut self) -> Option<(u64, u64)> {
            parse_proc_stat(&fs::read_to_string("/proc/stat").ok()?)
        }

        pub fn battery(&mut self) -> (Option<u8>, Option<bool>) {
            let Ok(dir) = fs::read_dir("/sys/class/power_supply") else { return (None, None) };
            for e in dir.flatten() {
                let p = e.path();
                if fs::read_to_string(p.join("type")).map(|t| t.trim() == "Battery").unwrap_or(false) {
                    let cap = fs::read_to_string(p.join("capacity")).unwrap_or_default();
                    let status = fs::read_to_string(p.join("status")).unwrap_or_default();
                    return parse_sysfs_battery(&cap, &status);
                }
            }
            (None, None)
        }

        /// Not detected on Linux.
        pub fn audio_playing(&mut self) -> bool {
            false
        }
    }
}

#[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
mod platform {
    pub struct Probe;

    impl Probe {
        pub fn new() -> Self {
            Probe
        }
        pub fn fullscreen(&mut self, _anchor: Option<(f64, f64)>) -> bool {
            false
        }
        pub fn idle_secs(&mut self) -> u32 {
            0
        }
        pub fn cpu_ticks(&mut self) -> Option<(u64, u64)> {
            None
        }
        pub fn battery(&mut self) -> (Option<u8>, Option<bool>) {
            (None, None)
        }
        pub fn audio_playing(&mut self) -> bool {
            false
        }
    }
}

/// (x, y, w, h) rectangles equal within 1 point (display bounds vs. window bounds).
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn rect_matches(a: (f64, f64, f64, f64), b: (f64, f64, f64, f64)) -> bool {
    (a.0 - b.0).abs() <= 1.0 && (a.1 - b.1).abs() <= 1.0 && (a.2 - b.2).abs() <= 1.0 && (a.3 - b.3).abs() <= 1.0 && a.2 > 0.0 && a.3 > 0.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap() -> Snapshot {
        Snapshot { battery_pct: Some(80), charging: Some(false), cpu_pct: 10.0, ..Snapshot::default() }
    }

    #[test]
    fn identical_snapshots_do_not_emit() {
        assert!(!significant_change(&snap(), &snap()));
    }

    #[test]
    fn boolean_flips_emit() {
        let mut n = snap();
        n.fullscreen = true;
        assert!(significant_change(&snap(), &n));
        let mut n = snap();
        n.audio_playing = true;
        assert!(significant_change(&snap(), &n));
        let mut n = snap();
        n.charging = Some(true);
        assert!(significant_change(&snap(), &n));
    }

    #[test]
    fn battery_needs_five_points_or_crossing_the_low_line() {
        let mut n = snap();
        n.battery_pct = Some(77);
        assert!(!significant_change(&snap(), &n));
        n.battery_pct = Some(75);
        assert!(significant_change(&snap(), &n));
        let (mut a, mut b) = (snap(), snap());
        a.battery_pct = Some(16);
        b.battery_pct = Some(15);
        assert!(significant_change(&a, &b));
        b.battery_pct = Some(18);
        assert!(!significant_change(&a, &b));
        b.battery_pct = None;
        assert!(significant_change(&a, &b));
    }

    #[test]
    fn cpu_needs_five_points_or_crossing_the_high_line() {
        let mut n = snap();
        n.cpu_pct = 14.0;
        assert!(!significant_change(&snap(), &n));
        n.cpu_pct = 15.0;
        assert!(significant_change(&snap(), &n));
        let (mut a, mut b) = (snap(), snap());
        a.cpu_pct = 84.0;
        b.cpu_pct = 85.5;
        assert!(significant_change(&a, &b));
        b.cpu_pct = 87.0;
        a.cpu_pct = 86.0;
        assert!(!significant_change(&a, &b));
    }

    #[test]
    fn idle_only_emits_on_band_changes() {
        assert_eq!((idle_band(0), idle_band(59), idle_band(60), idle_band(299), idle_band(300)), (0, 0, 1, 1, 2));
        let (mut a, mut b) = (snap(), snap());
        a.idle_secs = 5;
        b.idle_secs = 50;
        assert!(!significant_change(&a, &b));
        b.idle_secs = 65;
        assert!(significant_change(&a, &b));
    }

    #[test]
    fn smoother_starts_at_first_sample_and_lags_spikes() {
        let mut s = CpuSmoother::default();
        assert_eq!(s.push(10.0), 10.0);
        let v = s.push(100.0);
        assert!(v > 40.0 && v < 50.0, "{v}");
        assert!(s.push(500.0) <= 100.0);
    }

    #[test]
    fn cpu_between_ticks() {
        assert_eq!(cpu_pct_between((0, 0), (50, 100)), Some(50.0));
        assert_eq!(cpu_pct_between((10, 100), (10, 100)), None);
        assert_eq!(cpu_pct_between((0, 0), (300, 100)), Some(100.0)); // busy clamped to total
    }

    #[test]
    fn parses_pmset_batt() {
        let discharging = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=37093475)\t85%; discharging; 7:48 remaining present: true\n";
        assert_eq!(parse_pmset_batt(discharging), (Some(85), Some(false)));
        let charging = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t42%; charging; 1:10 remaining present: true\n";
        assert_eq!(parse_pmset_batt(charging), (Some(42), Some(true)));
        let desktop = "Now drawing from 'AC Power'\n";
        assert_eq!(parse_pmset_batt(desktop), (None, None));
        assert_eq!(parse_pmset_batt(""), (None, None));
        assert_eq!(parse_pmset_batt("garbage % line"), (None, None));
    }

    const IDLE_ASSERTIONS: &str = "Listed by owning process:\n   pid 566(powerd): [0x1] 00:06:31 PreventUserIdleSystemSleep named: \"Powerd - Prevent sleep while display is on\"\n   pid 88367(Claude): [0x2] 00:02:58 NoIdleSleepAssertion named: \"Electron\"\nNo kernel assertions.\n";
    const PLAYING_ASSERTIONS: &str = "Listed by owning process:\n   pid 566(powerd): [0x1] 00:06:31 PreventUserIdleSystemSleep named: \"Powerd - Prevent sleep while display is on\"\n   pid 803(coreaudiod): [0x3] 00:00:02 PreventUserIdleSystemSleep named: \"com.apple.audio.2C-BE:output.context.preventuseridlesleep\"\n\tCreated for PID: 34267. \n\tResources: audio-out 2C-BE:output \n";

    #[test]
    fn audio_needs_a_coreaudiod_output_assertion() {
        assert!(!parse_pmset_audio(IDLE_ASSERTIONS));
        assert!(parse_pmset_audio(PLAYING_ASSERTIONS));
        assert!(!parse_pmset_audio("   pid 803(coreaudiod): [0x3] 00:00:02 PreventUserIdleSystemSleep named: \"x:input.context\"\n\tResources: audio-in x:input\n"));
        // audio-out under some other process does not count
        assert!(!parse_pmset_audio("   pid 9(Music): [0x3] 00:00:02 NoIdleSleepAssertion named: \"x\"\n\tResources: audio-out x\n"));
        assert!(!parse_pmset_audio(""));
    }

    #[test]
    fn parses_proc_stat_and_sysfs() {
        assert_eq!(parse_proc_stat("cpu  100 0 50 800 50 0 0 0 0 0\ncpu0 1 2 3\n"), Some((150, 1000)));
        assert_eq!(parse_proc_stat("intr 1 2 3"), None);
        assert_eq!(parse_proc_stat("cpu 1 2"), None);
        assert_eq!(parse_sysfs_battery("57\n", "Discharging\n"), (Some(57), Some(false)));
        assert_eq!(parse_sysfs_battery("100", "Full"), (Some(100), Some(true)));
        assert_eq!(parse_sysfs_battery("", "Charging"), (None, None));
    }

    #[test]
    fn rect_match_tolerates_one_point() {
        assert!(rect_matches((0.0, 0.0, 1512.0, 982.0), (0.0, 0.0, 1512.0, 982.0)));
        assert!(rect_matches((0.5, 0.0, 1512.0, 981.5), (0.0, 0.0, 1512.0, 982.0)));
        assert!(!rect_matches((0.0, 38.0, 1512.0, 944.0), (0.0, 0.0, 1512.0, 982.0)));
    }

    /// `cargo test --manifest-path src-tauri/Cargo.toml live_sample -- --ignored --nocapture`
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore]
    fn live_sample() {
        let mut p = platform::Probe::new();
        let a = p.cpu_ticks();
        std::thread::sleep(Duration::from_secs(2));
        let b = p.cpu_ticks();
        println!("cpu%      = {:?}", a.zip(b).and_then(|(a, b)| cpu_pct_between(a, b)));
        println!("battery   = {:?}", p.battery());
        println!("audio     = {}", p.audio_playing());
        println!("idleSecs  = {}", p.idle_secs());
        println!("fullscreen= {}", p.fullscreen(None));
    }
}
