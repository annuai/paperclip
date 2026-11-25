use serde::Serialize;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::image::Image;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, Wry};
use tauri_plugin_autostart::ManagerExt;

pub struct TrayHandles {
    toggle: MenuItem<Wry>,
    quiet: CheckMenuItem<Wry>,
    nap: MenuItem<Wry>,
    style_classic: CheckMenuItem<Wry>,
    style_flat: CheckMenuItem<Wry>,
    water_enabled: CheckMenuItem<Wry>,
    water_intervals: Vec<(u32, CheckMenuItem<Wry>)>,
    water_info: MenuItem<Wry>,
    greet: CheckMenuItem<Wry>,
}

#[derive(Clone, Serialize)]
struct TrayAction {
    id: String,
    checked: Option<bool>,
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Hide Paperclip", true, None::<&str>)?;
    let hi = MenuItem::with_id(app, "hi", "Say hi", true, None::<&str>)?;
    let joke = MenuItem::with_id(app, "joke", "Tell a joke", true, None::<&str>)?;
    let quote = MenuItem::with_id(app, "quote", "Give a quote", true, None::<&str>)?;
    let animate = MenuItem::with_id(app, "animate", "Animate!", true, None::<&str>)?;
    let style_classic = CheckMenuItem::with_id(app, "style-classic", "Classic", true, true, None::<&str>)?;
    let style_flat = CheckMenuItem::with_id(app, "style-flat", "Flat", true, false, None::<&str>)?;
    let style_menu = Submenu::with_items(app, "Style", true, &[&style_classic, &style_flat])?;
    let water_enabled = CheckMenuItem::with_id(app, "water-enabled", "Remind me", true, true, None::<&str>)?;
    let mut water_intervals: Vec<(u32, CheckMenuItem<Wry>)> = Vec::new();
    for n in [30u32, 45, 60, 90] {
        let item = CheckMenuItem::with_id(app, format!("water-{n}"), format!("Every {n} min"), true, n == 45, None::<&str>)?;
        water_intervals.push((n, item));
    }
    let water_now = MenuItem::with_id(app, "water-now", "Remind me now", true, None::<&str>)?;
    let water_info = MenuItem::with_id(app, "water-info", "Today: 0 glasses", false, None::<&str>)?;
    let water_sep1 = PredefinedMenuItem::separator(app)?;
    let water_sep2 = PredefinedMenuItem::separator(app)?;
    let mut water_items: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = vec![&water_enabled, &water_sep1];
    for (_, item) in &water_intervals {
        water_items.push(item);
    }
    water_items.push(&water_sep2);
    water_items.push(&water_now);
    water_items.push(&water_info);
    let water_menu = Submenu::with_items(app, "Water reminders", true, &water_items)?;
    let greet = CheckMenuItem::with_id(app, "greet", "Greet me when I unlock", true, true, None::<&str>)?;
    let nap = MenuItem::with_id(app, "nap", "Take a nap", true, None::<&str>)?;
    let quiet = CheckMenuItem::with_id(app, "quiet", "Quiet mode", true, false, None::<&str>)?;
    let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart = CheckMenuItem::with_id(app, "autostart", "Launch at login", true, autostart_on, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[&toggle, &sep1, &hi, &joke, &quote, &animate, &nap, &sep2, &quiet, &greet, &style_menu, &water_menu, &autostart, &sep3, &quit],
    )?;

    app.manage(TrayHandles {
        toggle: toggle.clone(),
        quiet: quiet.clone(),
        nap: nap.clone(),
        style_classic: style_classic.clone(),
        style_flat: style_flat.clone(),
        water_enabled: water_enabled.clone(),
        water_intervals: water_intervals.clone(),
        water_info: water_info.clone(),
        greet: greet.clone(),
    });

    let mut builder = TrayIconBuilder::with_id("main").tooltip("Paperclip").menu(&menu);
    // macOS: monochrome template silhouette that adapts to light/dark menu bars.
    // Windows/Linux: the colour app icon.
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .icon(Image::from_bytes(include_bytes!("../icons/tray/tray@2x.png"))?)
            .icon_as_template(true);
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    // Left click summons/pokes Paperclip (handled by the frontend); right click opens the menu.
    // Linux tray backends (libappindicator) may only expose the menu and never deliver click events.
    builder
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = tray
                    .app_handle()
                    .emit("tray-action", TrayAction { id: "tray-click".to_string(), checked: None });
            }
        })
        .on_menu_event(move |app, event| {
            let id = event.id().as_ref();
            match id {
                "autostart" => {
                    let launcher = app.autolaunch();
                    let want = autostart.is_checked().unwrap_or(false);
                    let res = if want { launcher.enable() } else { launcher.disable() };
                    if res.is_err() {
                        let _ = autostart.set_checked(!want);
                    }
                }
                "style-classic" | "style-flat" => {
                    // Radio behaviour: exactly one of the two stays checked.
                    let flat = id == "style-flat";
                    let _ = style_classic.set_checked(!flat);
                    let _ = style_flat.set_checked(flat);
                    let _ = app.emit("tray-action", TrayAction { id: id.to_string(), checked: Some(true) });
                }
                id if id.starts_with("water-") && id != "water-info" => {
                    if let Some(n) = id.strip_prefix("water-").and_then(|s| s.parse::<u32>().ok()) {
                        // Radio behaviour for the interval items.
                        for (m, item) in &water_intervals {
                            let _ = item.set_checked(*m == n);
                        }
                        let _ = app.emit("tray-action", TrayAction { id: id.to_string(), checked: Some(true) });
                    } else if id == "water-enabled" {
                        let checked = water_enabled.is_checked().ok();
                        let _ = app.emit("tray-action", TrayAction { id: id.to_string(), checked });
                    } else {
                        let _ = app.emit("tray-action", TrayAction { id: id.to_string(), checked: None });
                    }
                }
                "greet" => {
                    let checked = greet.is_checked().ok();
                    let _ = app.emit("tray-action", TrayAction { id: "greet".to_string(), checked });
                }
                "quit" => {
                    // The frontend plays an exit animation, then calls `quit_app`. Fall back to a
                    // hard exit if the frontend does not answer in time.
                    let _ = app.emit("tray-action", TrayAction { id: "quit".to_string(), checked: None });
                    let handle = app.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(2500));
                        handle.exit(0);
                    });
                }
                _ => {
                    let checked = if id == "quiet" { quiet.is_checked().ok() } else { None };
                    let _ = app.emit("tray-action", TrayAction { id: id.to_string(), checked });
                }
            }
        })
        .build(app)?;
    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraySync {
    visible: bool,
    quiet: bool,
    asleep: bool,
    style: String,
    water_enabled: bool,
    water_interval: u32,
    glasses: u32,
    greet: bool,
}

#[tauri::command]
pub fn sync_tray(state: State<'_, TrayHandles>, sync: TraySync) -> Result<(), String> {
    state
        .toggle
        .set_text(if sync.visible { "Hide Paperclip" } else { "Show Paperclip" })
        .map_err(|e| e.to_string())?;
    state
        .nap
        .set_text(if sync.asleep { "Wake up" } else { "Take a nap" })
        .map_err(|e| e.to_string())?;
    state.style_classic.set_checked(sync.style != "flat").map_err(|e| e.to_string())?;
    state.style_flat.set_checked(sync.style == "flat").map_err(|e| e.to_string())?;
    state.water_enabled.set_checked(sync.water_enabled).map_err(|e| e.to_string())?;
    for (m, item) in &state.water_intervals {
        item.set_checked(*m == sync.water_interval).map_err(|e| e.to_string())?;
    }
    let label = if sync.glasses == 1 { "Today: 1 glass".to_string() } else { format!("Today: {} glasses", sync.glasses) };
    state.water_info.set_text(label).map_err(|e| e.to_string())?;
    state.greet.set_checked(sync.greet).map_err(|e| e.to_string())?;
    state.quiet.set_checked(sync.quiet).map_err(|e| e.to_string())
}
