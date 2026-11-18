// Tells Rust which parts of the transparent overlay should catch the mouse.
// Everywhere else the window ignores cursor events, so clicks fall through to Chrome / the desktop.
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Rect } from "../engine/util";

let last = "";
let pending: { regions: Rect[]; captureAll: boolean } | null = null;
let inflight = false;

function flush() {
  if (inflight || !pending) return;
  const args = pending;
  pending = null;
  inflight = true;
  invoke("set_hit_regions", args)
    .catch(() => {})
    .finally(() => {
      inflight = false;
      flush();
    });
}

/** Cheap to call every frame: only sends when the regions actually change (rounded to 2px). */
export function updateHitRegions(regions: Rect[], captureAll: boolean) {
  if (!isTauri()) return;
  const q = (v: number) => Math.round(v / 2) * 2;
  const norm = regions.map((r) => ({ x: q(r.x), y: q(r.y), w: q(r.w), h: q(r.h) }));
  const key = JSON.stringify([norm, captureAll]);
  if (key === last) return;
  last = key;
  pending = { regions: norm, captureAll };
  flush();
}

export const domRect = (el: Element | null, pad = 0): Rect | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
};
