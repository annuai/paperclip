mod ask;
mod calendar;
mod clickthrough;
mod files;
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(std::sync::Arc::new(clickthrough::HitState::default()))
        .manage(files::DropState::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(e) = event {
                files::handle_drag_drop(window, e);
            }
        })
        .invoke_handler(tauri::generate_handler![
            clickthrough::set_hit_rects,
            clickthrough::set_eye_follow,
            clickthrough::set_menu_tracking,
            tray::sync_tray,
            system::get_system,
            calendar::calendar_status,
            calendar::calendar_supported,
            calendar::calendar_request_access,
            calendar::calendar_set_enabled,
            ask::ask,
            ask::ask_key_status,
            ask::ask_set_key,
            ask::ask_remove_key,
            ask::ask_focus,
            files::zip_dropped,
            files::clear_dropped,
            files::reveal_zip,
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
