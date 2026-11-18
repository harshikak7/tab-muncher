// Estimates where Chrome draws each tab on screen.
//
// Extensions cannot read tab pixel positions, so we rebuild Chrome's tab-strip layout from the
// window bounds + tab order. The numbers below match Chrome's 2023+ "Refresh" UI on Windows 11 at
// 100–150% scaling. If the mascot sits a little off on your setup, tune them here — this is the
// only place tab geometry is defined.
import type { Rect } from "../engine/util";
import type { ChromeWindow } from "./types";

export const CHROME_LAYOUT = {
  /** Windows reports maximized windows ~8 DIP outside the screen on every side. */
  maximizedInset: 8,
  /** Distance from the top of the window to the top of the tabs. */
  tabTopMaximized: 6,
  tabTopNormal: 14,
  tabHeight: 34,
  /** Space left of the first tab (window edge padding + the tab-search button). */
  stripLeft: 46,
  /** Space right of the last possible tab (new-tab button + min/max/close caption buttons). */
  stripRightReserve: 190,
  /** Tabs overlap their neighbours by this much (separator area). */
  tabOverlap: 18,
  tabMaxWidth: 240,
  tabMinWidth: 56,
  pinnedWidth: 48,
  /** Close (×) button centre, measured from the right edge of the visible tab body. */
  closeFromRight: 15,
  closeSize: 16,
} as const;

export interface TabGeom {
  id: number;
  index: number;
  /** Visible tab body, in overlay-viewport CSS px. */
  rect: Rect;
  /** × button rect (zero-width for pinned tabs, which have none). */
  close: Rect;
}

/** Where Chrome's DIP (0,0) sits relative to the overlay viewport's (0,0). */
export interface Origin {
  x: number;
  y: number;
}

function frame(win: ChromeWindow, origin: Origin) {
  const L = CHROME_LAYOUT;
  const inset = win.state === "maximized" ? L.maximizedInset : 0;
  return {
    x: win.left + inset - origin.x,
    y: win.top + inset - origin.y,
    w: win.width - inset * 2,
    tabTop: win.state === "maximized" ? L.tabTopMaximized : L.tabTopNormal,
  };
}

/** Rect covering the whole tab strip (used for "drop the mascot on a tab"). */
export function stripRect(win: ChromeWindow, origin: Origin): Rect {
  const f = frame(win, origin);
  const L = CHROME_LAYOUT;
  return { x: f.x + L.stripLeft, y: f.y + f.tabTop, w: Math.max(0, f.w - L.stripLeft - L.stripRightReserve), h: L.tabHeight };
}

export function layoutTabs(win: ChromeWindow, origin: Origin): TabGeom[] {
  const L = CHROME_LAYOUT;
  const strip = stripRect(win, origin);
  const tabs = [...win.tabs].sort((a, b) => a.index - b.index);
  const pinned = tabs.filter((t) => t.pinned).length;
  const normal = tabs.length - pinned;

  const pinnedSpan = pinned * (L.pinnedWidth - L.tabOverlap);
  const avail = strip.w - pinnedSpan;
  const ideal = normal ? (avail - L.tabOverlap) / normal + L.tabOverlap : L.tabMaxWidth;
  const width = Math.max(L.tabMinWidth, Math.min(L.tabMaxWidth, ideal));
  const stripEnd = strip.x + strip.w;

  let cursor = strip.x;
  return tabs.map((t) => {
    const w = t.pinned ? L.pinnedWidth : width;
    // Past the end of the strip Chrome scrolls; we just pin the overflow to the right edge.
    const left = Math.min(cursor, stripEnd - w);
    cursor += w - L.tabOverlap;
    const rect = { x: left + L.tabOverlap / 2, y: strip.y, w: w - L.tabOverlap, h: L.tabHeight };
    const cx = rect.x + rect.w - L.closeFromRight;
    const cy = rect.y + rect.h / 2;
    const close = t.pinned
      ? { x: rect.x + rect.w / 2, y: cy, w: 0, h: 0 }
      : { x: cx - L.closeSize / 2, y: cy - L.closeSize / 2, w: L.closeSize, h: L.closeSize };
    return { id: t.id, index: t.index, rect, close };
  });
}

/** True when the window is in a state where its tab strip is visible on the overlay's monitor. */
export function stripVisible(win: ChromeWindow, origin: Origin, viewport: { w: number; h: number }): boolean {
  if (win.state !== "normal" && win.state !== "maximized") return false;
  const s = stripRect(win, origin);
  return s.w > 40 && s.x < viewport.w && s.x + s.w > 0 && s.y >= -4 && s.y < viewport.h - 40;
}
