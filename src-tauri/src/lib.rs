mod bridge;
mod overlay;
mod tray;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(overlay::HitState::default())
        .manage(bridge::BridgeState::default())
        .invoke_handler(tauri::generate_handler![
            overlay::set_hit_regions,
            tray::sync_tray,
            bridge::bridge_state
        ])
        .setup(|app| {
            let win = app
                .get_webview_window("main")
                .expect("main window is defined in tauri.conf.json");
            overlay::fit_to_primary_monitor(&win)?;
            win.set_ignore_cursor_events(true)?;
            win.show()?;
            overlay::spawn_cursor_watch(win);

            tray::build(app)?;
            bridge::spawn(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
