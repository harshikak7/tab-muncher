//! System tray: switch mascot, toggle roaming, reset position, quit.
//! Menu clicks are forwarded to the frontend as `tray-action` events; the frontend calls
//! `sync_tray` back whenever its state changes (e.g. from the in-overlay menu).

use serde_json::json;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{App, AppHandle, Emitter, Manager, State, Wry};

const MASCOTS: [(&str, &str); 5] = [
    ("salamander", "Sal the Salamander"),
    ("narwhal", "Nori the Narwhal"),
    ("iguana", "Iggy the Iguana"),
    ("hermit-crab", "Shelly the Hermit crab"),
    ("baby-dragon", "Ember the Baby dragon"),
];

pub struct TrayItems {
    mascots: Vec<(&'static str, CheckMenuItem<Wry>)>,
    roam: CheckMenuItem<Wry>,
}

impl TrayItems {
    fn check_mascot(&self, id: &str) {
        for (mid, item) in &self.mascots {
            let _ = item.set_checked(*mid == id);
        }
    }
}

pub fn build(app: &mut App) -> tauri::Result<()> {
    let h = app.handle();
    let header = MenuItem::with_id(h, "header", "Mascot", false, None::<&str>)?;
    let mascots = MASCOTS
        .iter()
        .map(|(id, label)| {
            let item = CheckMenuItem::with_id(h, format!("mascot:{id}"), *label, true, *id == "salamander", None::<&str>)?;
            Ok((*id, item))
        })
        .collect::<tauri::Result<Vec<_>>>()?;
    let roam = CheckMenuItem::with_id(h, "roam", "Roam freely", true, true, None::<&str>)?;
    let reset = MenuItem::with_id(h, "reset", "Reset position", true, None::<&str>)?;
    let quit = MenuItem::with_id(h, "quit", "Quit Tab Muncher", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(h)?;
    let sep2 = PredefinedMenuItem::separator(h)?;

    let menu = Menu::new(h)?;
    menu.append(&header)?;
    for (_, item) in &mascots {
        menu.append(item)?;
    }
    menu.append_items(&[&sep1, &roam, &reset, &sep2, &quit])?;

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Tab Muncher")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(on_menu_event);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;

    app.manage(TrayItems { mascots, roam });
    Ok(())
}

fn on_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let items = app.state::<TrayItems>();
    match event.id().as_ref() {
        "quit" => app.exit(0),
        "reset" => {
            let _ = app.emit("tray-action", json!({ "kind": "reset" }));
        }
        "roam" => {
            let value = items.roam.is_checked().unwrap_or(true);
            let _ = app.emit("tray-action", json!({ "kind": "roam", "value": value }));
        }
        id => {
            if let Some(mascot) = id.strip_prefix("mascot:") {
                // Behave like radio items: clicking the current one must not uncheck it.
                items.check_mascot(mascot);
                let _ = app.emit("tray-action", json!({ "kind": "mascot", "id": mascot }));
            }
        }
    }
}

/// Keep the tray checkmarks (and the "tabs eaten" tooltip) in sync with the overlay's state.
#[tauri::command]
pub async fn sync_tray(
    app: AppHandle,
    items: State<'_, TrayItems>,
    mascot: String,
    roam: bool,
    eaten: u64,
) -> Result<(), String> {
    items.check_mascot(&mascot);
    items.roam.set_checked(roam).map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id("main") {
        let plural = if eaten == 1 { "" } else { "s" };
        let tip = format!("Tab Muncher · {eaten} tab{plural} eaten");
        tray.set_tooltip(Some(tip.as_str())).map_err(|e| e.to_string())?;
    }
    Ok(())
}
