//! Transparent, always-on-top, full-monitor overlay with smart click-through.
//!
//! The window ignores the mouse by default so clicks land on Chrome / the desktop behind it.
//! The frontend reports the rects that should be interactive (the mascot, its menu); a small
//! watcher thread polls the cursor and flips `set_ignore_cursor_events` when it enters or
//! leaves one of them. (While ignoring, the webview gets no mouse events at all, so this
//! check can't live in JavaScript.)

use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde::Deserialize;
use tauri::{Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow};

const POLL: Duration = Duration::from_millis(16);
/// Window origin / DPI rarely change; re-read them about once a second.
const GEOMETRY_REFRESH: Duration = Duration::from_secs(1);

/// A rect in CSS pixels, relative to the overlay's top-left.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct HitRect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

impl HitRect {
    fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x <= self.x + self.w && y >= self.y && y <= self.y + self.h
    }
}

#[derive(Default)]
struct Regions {
    rects: Vec<HitRect>,
    /// Capture the whole window (mid-drag, or while the mascot menu is open).
    capture_all: bool,
}

#[derive(Default)]
pub struct HitState(Mutex<Regions>);

#[tauri::command]
pub fn set_hit_regions(state: State<'_, HitState>, regions: Vec<HitRect>, capture_all: bool) {
    if let Ok(mut r) = state.0.lock() {
        r.rects = regions;
        r.capture_all = capture_all;
    }
}

/// Cover the primary monitor. One pixel short of full height so Windows doesn't treat the
/// overlay as a fullscreen app (which would hide the taskbar / mute notifications).
pub fn fit_to_primary_monitor(win: &WebviewWindow) -> tauri::Result<()> {
    if let Some(m) = win.primary_monitor()? {
        let pos = m.position();
        let size = m.size();
        win.set_position(PhysicalPosition::new(pos.x, pos.y))?;
        win.set_size(PhysicalSize::new(size.width, size.height.saturating_sub(1)))?;
    }
    Ok(())
}

pub fn spawn_cursor_watch(win: WebviewWindow) {
    thread::spawn(move || {
        let mut ignoring = true;
        let mut origin = PhysicalPosition::new(0, 0);
        let mut scale = 1.0;
        let mut refreshed: Option<Instant> = None;

        loop {
            thread::sleep(POLL);

            // Copy the regions out so the lock is never held across calls into the main thread.
            let (rects, capture_all) = match win.state::<HitState>().0.lock() {
                Ok(r) => (r.rects.clone(), r.capture_all),
                Err(_) => continue,
            };

            let inside = if capture_all {
                true
            } else if rects.is_empty() {
                false
            } else {
                if refreshed.is_none_or(|t| t.elapsed() > GEOMETRY_REFRESH) {
                    if let (Ok(p), Ok(s)) = (win.inner_position(), win.scale_factor()) {
                        origin = p;
                        scale = s;
                        refreshed = Some(Instant::now());
                    }
                }
                let Ok(c) = win.cursor_position() else { continue };
                let x = (c.x - origin.x as f64) / scale;
                let y = (c.y - origin.y as f64) / scale;
                rects.iter().any(|r| r.contains(x, y))
            };

            if inside == ignoring {
                ignoring = !inside;
                let _ = win.set_ignore_cursor_events(ignoring);
            }
        }
    });
}
