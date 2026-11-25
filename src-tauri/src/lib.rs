mod calendar;
mod clickthrough;
mod session;
mod system;
mod tray;

/// True when PAPERCLIP_DEBUG_HIT=1: the frontend outlines the interactive hit rects.
#[tauri::command]
fn debug_hit() -> bool {
    std::env::var("PAPERCLIP_DEBUG_HIT").map(|v| v == "1").unwrap_or(false)
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(std::sync::Arc::new(clickthrough::HitState::default()))
        .invoke_handler(tauri::generate_handler![
            clickthrough::set_hit_rects,
            clickthrough::set_eye_follow,
            tray::sync_tray,
            system::get_system,
            calendar::calendar_status,
            calendar::calendar_supported,
            calendar::calendar_request_access,
            calendar::calendar_set_enabled,
            quit_app,
            debug_hit
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory); // no Dock icon
            tray::build(app.handle())?;
            clickthrough::spawn_poller(app.handle().clone());
            session::start(app.handle());
            system::start(app.handle());
            calendar::start(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running paperclip");
}
