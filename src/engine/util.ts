import type { Mascot } from "../mascots/data";

let _uid = 1;
export const uid = () => _uid++;

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Blend a #rrggbb colour toward another. */
export const mix = (hex: string, toward = "#ffffff", t = 0.5) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex);
  const b = p(toward);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
};

export interface Geom {
  W: number;
  H: number;
  s: number;
  mouth: { x: number; y: number };
}

/** Rendered size of a mascot at width W, plus where its mouth is (in px, unflipped). */
export function geom(m: Mascot, W: number): Geom {
  const [bx, by, bw, bh] = m.bbox;
  const s = W / bw;
  return { W, H: bh * s, s, mouth: { x: (m.lipCx - bx) * s, y: (m.lipY + m.jaw * 0.22 - by) * s } };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
