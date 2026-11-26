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
    style_outfits: CheckMenuItem<Wry>,
    water_enabled: CheckMenuItem<Wry>,
    water_intervals: Vec<(u32, CheckMenuItem<Wry>)>,
    water_info: MenuItem<Wry>,
    greet: CheckMenuItem<Wry>,
    hide_presenting: CheckMenuItem<Wry>,
    react_to_music: CheckMenuItem<Wry>,
    stretch_enabled: CheckMenuItem<Wry>,
    stretch_intervals: Vec<(u32, CheckMenuItem<Wry>)>,
    focus_stop: MenuItem<Wry>,
    focus_info: MenuItem<Wry>,
    meeting: CheckMenuItem<Wry>,
    ask_menu: Submenu<Wry>,
    ask_key: MenuItem<Wry>,
    ask_remove: MenuItem<Wry>,
    ask_provider_openrouter: CheckMenuItem<Wry>,
    ask_provider_groq: CheckMenuItem<Wry>,
    ask_provider_anthropic: CheckMenuItem<Wry>,
    /// OpenRouter model radios: free default, Claude Haiku (paid), custom id.
    ask_free: CheckMenuItem<Wry>,
    ask_haiku: CheckMenuItem<Wry>,
    ask_other: CheckMenuItem<Wry>,
    /// Groq model radios: fast default, smarter, custom id.
    ask_groq_fast: CheckMenuItem<Wry>,
    ask_groq_smart: CheckMenuItem<Wry>,
    ask_groq_other: CheckMenuItem<Wry>,
    /// Claude (Anthropic) model radios.
    ask_claude_haiku: CheckMenuItem<Wry>,
    ask_claude_sonnet: CheckMenuItem<Wry>,
    /// Which provider's model radios are currently in the submenu (`openrouter`, `groq` or `anthropic`).
    ask_shown: std::sync::Mutex<String>,
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
    // Ask Paperclip: one submenu (the main menu row count is pinned). Same ids as the right-click menu.
    let ask_open = MenuItem::with_id(app, "ask-open", "Ask a question…", true, None::<&str>)?;
    let ask_key = MenuItem::with_id(app, "ask-key", "Set OpenRouter API key…", true, None::<&str>)?;
    let ask_remove = MenuItem::with_id(app, "ask-remove", "Remove API key", false, None::<&str>)?;
    let ask_provider_openrouter = CheckMenuItem::with_id(app, "ask-provider-openrouter", "OpenRouter", true, true, None::<&str>)?;
    let ask_provider_groq = CheckMenuItem::with_id(app, "ask-provider-groq", "Groq", true, false, None::<&str>)?;
    let ask_provider_anthropic = CheckMenuItem::with_id(app, "ask-provider-anthropic", "Claude (Anthropic)", true, false, None::<&str>)?;
    let ask_groq_fast = CheckMenuItem::with_id(app, "ask-groq-fast", "Fast answers (Qwen 3.8 27B)", true, true, None::<&str>)?;
    let ask_groq_smart = CheckMenuItem::with_id(app, "ask-groq-smart", "Smarter answers (GPT-OSS 120B)", true, false, None::<&str>)?;
    let ask_groq_other = CheckMenuItem::with_id(app, "ask-groq-other", "Other model…", true, false, None::<&str>)?;
    let ask_free = CheckMenuItem::with_id(app, "ask-model-free", "Free (Gemma 4 31B)", true, true, None::<&str>)?;
    let ask_haiku = CheckMenuItem::with_id(app, "ask-model-haiku", "Claude Haiku 5.5 (paid)", true, false, None::<&str>)?;
    let ask_other = CheckMenuItem::with_id(app, "ask-model-other", "Other model…", true, false, None::<&str>)?;
    let ask_claude_haiku = CheckMenuItem::with_id(app, "ask-claude-haiku", "Fast answers (Haiku)", true, true, None::<&str>)?;
    let ask_claude_sonnet = CheckMenuItem::with_id(app, "ask-claude-sonnet", "Smarter answers (Sonnet)", true, false, None::<&str>)?;
    let ask_sep1 = PredefinedMenuItem::separator(app)?;
    let ask_sep2 = PredefinedMenuItem::separator(app)?;
    let ask_sep3 = PredefinedMenuItem::separator(app)?;
    // Starts with the OpenRouter model radios; `sync_tray` swaps them when the provider changes.
    let ask_menu = Submenu::with_items(
        app,
        "Ask Paperclip",
        true,
        &[&ask_open, &ask_sep1, &ask_provider_openrouter, &ask_provider_groq, &ask_provider_anthropic, &ask_sep2, &ask_key, &ask_remove, &ask_sep3, &ask_free, &ask_haiku, &ask_other],
    )?;
    let style_classic = CheckMenuItem::with_id(app, "style-classic", "Classic", true, true, None::<&str>)?;
    let style_flat = CheckMenuItem::with_id(app, "style-flat", "Flat", true, false, None::<&str>)?;
    let style_outfits = CheckMenuItem::with_id(app, "style-outfits", "Seasonal outfits", true, true, None::<&str>)?;
    let style_sep = PredefinedMenuItem::separator(app)?;
    let style_menu = Submenu::with_items(app, "Style", true, &[&style_classic, &style_flat, &style_sep, &style_outfits])?;
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
    // Stretch breaks: same shape as the water submenu.
    let stretch_enabled = CheckMenuItem::with_id(app, "stretch-enabled", "Remind me", true, true, None::<&str>)?;
    let mut stretch_intervals: Vec<(u32, CheckMenuItem<Wry>)> = Vec::new();
    for n in [30u32, 45, 60, 90] {
        let item = CheckMenuItem::with_id(app, format!("stretch-{n}"), format!("Every {n} min"), true, n == 60, None::<&str>)?;
        stretch_intervals.push((n, item));
    }
    let stretch_now = MenuItem::with_id(app, "stretch-now", "Stretch now", true, None::<&str>)?;
    let stretch_sep1 = PredefinedMenuItem::separator(app)?;
    let stretch_sep2 = PredefinedMenuItem::separator(app)?;
    let mut stretch_items: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = vec![&stretch_enabled, &stretch_sep1];
    for (_, item) in &stretch_intervals {
        stretch_items.push(item);
    }
    stretch_items.push(&stretch_sep2);
    stretch_items.push(&stretch_now);
    let stretch_menu = Submenu::with_items(app, "Stretch breaks", true, &stretch_items)?;
    // Focus timer: four lengths, Stop (only while running) and a read-only time-left line.
    let mut focus_starts: Vec<MenuItem<Wry>> = Vec::new();
    for n in [15u32, 25, 45, 60] {
        focus_starts.push(MenuItem::with_id(app, format!("focus-{n}"), format!("{n} minutes"), true, None::<&str>)?);
    }
    let focus_stop = MenuItem::with_id(app, "focus-stop", "Stop", false, None::<&str>)?;
    let focus_info = MenuItem::with_id(app, "focus-info", "Not running", false, None::<&str>)?;
    let focus_sep = PredefinedMenuItem::separator(app)?;
    let mut focus_items: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = Vec::new();
    for item in &focus_starts {
        focus_items.push(item);
    }
    focus_items.push(&focus_sep);
    focus_items.push(&focus_stop);
    focus_items.push(&focus_info);
    let focus_menu = Submenu::with_items(app, "Focus timer", true, &focus_items)?;
    // Meeting heads-up exists everywhere (the handle is shared) but only macOS puts it in the menu.
    let meeting = CheckMenuItem::with_id(app, "meeting", "Meeting heads-up", true, false, None::<&str>)?;
    // Wellbeing groups the reminder-style features so the top level stays short.
    let mut wellbeing_items: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = vec![&water_menu, &stretch_menu, &focus_menu];
    if cfg!(target_os = "macos") {
        wellbeing_items.push(&meeting);
    }
    let wellbeing_menu = Submenu::with_items(app, "Wellbeing", true, &wellbeing_items)?;
    let greet = CheckMenuItem::with_id(app, "greet", "Greet me when I unlock", true, true, None::<&str>)?;
    let hide_presenting = CheckMenuItem::with_id(app, "presence-hide", "Hide when presenting", true, true, None::<&str>)?;
    let react_to_music = CheckMenuItem::with_id(app, "presence-music", "Dance to music", true, true, None::<&str>)?;
    let update_check = MenuItem::with_id(app, "update-check", "Check for updates…", true, None::<&str>)?;
    let guide_open = MenuItem::with_id(app, "guide-open", "Welcome guide…", true, None::<&str>)?;
    let presence_sep = PredefinedMenuItem::separator(app)?;
    let presence_menu = Submenu::with_items(app, "Presence", true, &[&hide_presenting, &react_to_music, &presence_sep, &update_check, &guide_open])?;
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
        &[&toggle, &sep1, &hi, &joke, &quote, &ask_menu, &animate, &nap, &sep2, &quiet, &greet, &presence_menu, &style_menu, &wellbeing_menu, &autostart, &sep3, &quit],
    )?;

    app.manage(TrayHandles {
        toggle: toggle.clone(),
        quiet: quiet.clone(),
        nap: nap.clone(),
        style_classic: style_classic.clone(),
        style_flat: style_flat.clone(),
        style_outfits: style_outfits.clone(),
        water_enabled: water_enabled.clone(),
        water_intervals: water_intervals.clone(),
        water_info: water_info.clone(),
        greet: greet.clone(),
        hide_presenting: hide_presenting.clone(),
        react_to_music: react_to_music.clone(),
        stretch_enabled: stretch_enabled.clone(),
        stretch_intervals: stretch_intervals.clone(),
        focus_stop: focus_stop.clone(),
        focus_info: focus_info.clone(),
        meeting: meeting.clone(),
        ask_menu: ask_menu.clone(),
        ask_key: ask_key.clone(),
        ask_remove: ask_remove.clone(),
        ask_provider_openrouter: ask_provider_openrouter.clone(),
        ask_provider_groq: ask_provider_groq.clone(),
        ask_provider_anthropic: ask_provider_anthropic.clone(),
        ask_groq_fast: ask_groq_fast.clone(),
        ask_groq_smart: ask_groq_smart.clone(),
        ask_groq_other: ask_groq_other.clone(),
        ask_free: ask_free.clone(),
        ask_haiku: ask_haiku.clone(),
        ask_other: ask_other.clone(),
        ask_claude_haiku: ask_claude_haiku.clone(),
        ask_claude_sonnet: ask_claude_sonnet.clone(),
        ask_shown: std::sync::Mutex::new("openrouter".to_string()),
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
                "style-outfits" => {
                    let checked = style_outfits.is_checked().ok();
                    let _ = app.emit("tray-action", TrayAction { id: id.to_string(), checked });
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
                "stretch-enabled" => {
                    let checked = stretch_enabled.is_checked().ok();
                    let _ = app.emit("tray-action", TrayAction { id: id.to_string(), checked });
                }
                id if id.starts_with("stretch-") && id != "stretch-now" => {
                    if let Some(n) = id.strip_prefix("stretch-").and_then(|s| s.parse::<u32>().ok()) {
                        // Radio behaviour for the interval items.
                        for (m, item) in &stretch_intervals {
                            let _ = item.set_checked(*m == n);
                        }
                        let _ = app.emit("tray-action", TrayAction { id: id.to_string(), checked: Some(true) });
                    }
                }
                // Radios: the frontend decides, then pushes the truth back through `sync_tray` (which sets every check).
                "ask-provider-openrouter" | "ask-provider-groq" | "ask-provider-anthropic" | "ask-groq-fast" | "ask-groq-smart" | "ask-groq-other" | "ask-model-free" | "ask-model-haiku" | "ask-model-other" | "ask-claude-haiku" | "ask-claude-sonnet" => {
                    let _ = app.emit("tray-action", TrayAction { id: id.to_string(), checked: Some(true) });
                }
                "meeting" => {
                    let checked = meeting.is_checked().ok();
                    let _ = app.emit("tray-action", TrayAction { id: "meeting".to_string(), checked });
                }
                "presence-hide" => {
                    let checked = hide_presenting.is_checked().ok();
                    let _ = app.emit("tray-action", TrayAction { id: "presence-hide".to_string(), checked });
                }
                "presence-music" => {
                    let checked = react_to_music.is_checked().ok();
                    let _ = app.emit("tray-action", TrayAction { id: "presence-music".to_string(), checked });
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
    hide_presenting: bool,
    react_to_music: bool,
    stretch_enabled: bool,
    stretch_interval: u32,
    /// Whole minutes left in a running focus session; `None` when no timer is running.
    focus_left: Option<u32>,
    meeting: bool,
    outfits: bool,
    /// An API key for Ask Paperclip is stored (enables "Remove API key").
    ask_key: bool,
    ask_model: String,
    /// `"openrouter"`, `"groq"` or `"anthropic"`.
    ask_provider: String,
    /// The Groq provider's model id.
    ask_groq_model: String,
    /// `claude-haiku-5-5` or `claude-sonnet-5-5` (used by the Anthropic provider).
    ask_claude_model: String,
}

#[tauri::command]
pub fn sync_tray(app: AppHandle, state: State<'_, TrayHandles>, sync: TraySync) -> Result<(), String> {
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
    state.hide_presenting.set_checked(sync.hide_presenting).map_err(|e| e.to_string())?;
    state.react_to_music.set_checked(sync.react_to_music).map_err(|e| e.to_string())?;
    state.stretch_enabled.set_checked(sync.stretch_enabled).map_err(|e| e.to_string())?;
    for (m, item) in &state.stretch_intervals {
        item.set_checked(*m == sync.stretch_interval).map_err(|e| e.to_string())?;
    }
    state.focus_stop.set_enabled(sync.focus_left.is_some()).map_err(|e| e.to_string())?;
    state.focus_info.set_text(focus_label(sync.focus_left)).map_err(|e| e.to_string())?;
    state.style_outfits.set_checked(sync.outfits).map_err(|e| e.to_string())?;
    state.meeting.set_checked(sync.meeting).map_err(|e| e.to_string())?;
    state.ask_remove.set_enabled(sync.ask_key).map_err(|e| e.to_string())?;
    let anthropic = sync.ask_provider == "anthropic";
    let groq = sync.ask_provider == "groq";
    state.ask_provider_openrouter.set_checked(!anthropic && !groq).map_err(|e| e.to_string())?;
    state.ask_provider_groq.set_checked(groq).map_err(|e| e.to_string())?;
    state.ask_provider_anthropic.set_checked(anthropic).map_err(|e| e.to_string())?;
    let key_label = if anthropic { "Set Claude API key…" } else if groq { "Set Groq API key…" } else { "Set OpenRouter API key…" };
    state.ask_key.set_text(key_label).map_err(|e| e.to_string())?;
    let free = sync.ask_model == "google/gemma-4-31b-it:free";
    let paid = sync.ask_model == "anthropic/claude-haiku-5.5";
    state.ask_free.set_checked(free).map_err(|e| e.to_string())?;
    state.ask_haiku.set_checked(paid).map_err(|e| e.to_string())?;
    state.ask_other.set_checked(!free && !paid).map_err(|e| e.to_string())?;
    // The custom id is shown as the third radio's label (the frontend only stores ids of the validated shape).
    let other_label = if free || paid || sync.ask_model.len() > 100 { "Other model…".to_string() } else { sync.ask_model.clone() };
    state.ask_other.set_text(other_label).map_err(|e| e.to_string())?;
    let g_fast = sync.ask_groq_model == "qwen/qwen3.8-27b";
    let g_smart = sync.ask_groq_model == "openai/gpt-oss-120b";
    state.ask_groq_fast.set_checked(g_fast).map_err(|e| e.to_string())?;
    state.ask_groq_smart.set_checked(g_smart).map_err(|e| e.to_string())?;
    state.ask_groq_other.set_checked(!g_fast && !g_smart).map_err(|e| e.to_string())?;
    let g_label = if g_fast || g_smart || sync.ask_groq_model.len() > 100 { "Other model…".to_string() } else { sync.ask_groq_model.clone() };
    state.ask_groq_other.set_text(g_label).map_err(|e| e.to_string())?;
    state.ask_claude_haiku.set_checked(sync.ask_claude_model != "claude-sonnet-5-5").map_err(|e| e.to_string())?;
    state.ask_claude_sonnet.set_checked(sync.ask_claude_model == "claude-sonnet-5-5").map_err(|e| e.to_string())?;
    // Only the active provider's model radios are in the submenu.
    let want = if anthropic { "anthropic" } else if groq { "groq" } else { "openrouter" };
    if let Ok(mut shown) = state.ask_shown.lock() {
        if *shown != want {
            let _ = state.ask_menu.remove(&state.ask_free);
            let _ = state.ask_menu.remove(&state.ask_haiku);
            let _ = state.ask_menu.remove(&state.ask_other);
            let _ = state.ask_menu.remove(&state.ask_groq_fast);
            let _ = state.ask_menu.remove(&state.ask_groq_smart);
            let _ = state.ask_menu.remove(&state.ask_groq_other);
            let _ = state.ask_menu.remove(&state.ask_claude_haiku);
            let _ = state.ask_menu.remove(&state.ask_claude_sonnet);
            if anthropic {
                let _ = state.ask_menu.append(&state.ask_claude_haiku);
                let _ = state.ask_menu.append(&state.ask_claude_sonnet);
            } else if groq {
                let _ = state.ask_menu.append(&state.ask_groq_fast);
                let _ = state.ask_menu.append(&state.ask_groq_smart);
                let _ = state.ask_menu.append(&state.ask_groq_other);
            } else {
                let _ = state.ask_menu.append(&state.ask_free);
                let _ = state.ask_menu.append(&state.ask_haiku);
                let _ = state.ask_menu.append(&state.ask_other);
            }
            *shown = want.to_string();
        }
    }
    if let Some(tray) = app.tray_by_id("main") {
        // The time left, where the user looks: the tooltip everywhere, plus a short title next to the macOS icon.
        let tip = match sync.focus_left {
            Some(_) => format!("Paperclip - {}", focus_label(sync.focus_left)),
            None => "Paperclip".to_string(),
        };
        let _ = tray.set_tooltip(Some(tip));
        #[cfg(target_os = "macos")]
        let _ = tray.set_title(sync.focus_left.map(|n| format!("{n}m")));
    }
    state.quiet.set_checked(sync.quiet).map_err(|e| e.to_string())
}

/// "Not running", "1 min left", "18 min left".
fn focus_label(left: Option<u32>) -> String {
    match left {
        None => "Not running".to_string(),
        Some(n) => format!("{n} min left"),
    }
}

#[cfg(test)]
mod tests {
    use super::focus_label;

    #[test]
    fn focus_label_reads_naturally() {
        assert_eq!(focus_label(None), "Not running");
        assert_eq!(focus_label(Some(18)), "18 min left");
        // Ask Paperclip can start any length from 1 to 180 minutes, not just the four menu presets.
        assert_eq!(focus_label(Some(1)), "1 min left");
        assert_eq!(focus_label(Some(137)), "137 min left");
        assert_eq!(focus_label(Some(180)), "180 min left");
    }
}
