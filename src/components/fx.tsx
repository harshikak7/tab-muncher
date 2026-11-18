import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { clamp, type Rect } from "../engine/util";

export type BubbleSide = "top" | "bottom" | "left" | "right";
export interface Point {
  x: number;
  y: number;
}

interface BubbleProps {
  text: string;
  anchor: Point;
  side: BubbleSide;
  tone?: "warn";
  /** Visible area in the same local coordinates as `anchor`; the bubble is kept inside it. */
  bounds?: Rect;
}

export function Bubble({ text, anchor, side, tone, bounds }: BubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setSize({ w: el.offsetWidth, h: el.offsetHeight });
  }, [text]);

  const w = size?.w ?? 0;
  const h = size?.h ?? 0;
  let left = anchor.x - w / 2;
  let top = anchor.y - 8 - h;
  if (side === "right") [left, top] = [anchor.x + 8, anchor.y - h / 2];
  else if (side === "left") [left, top] = [anchor.x - 8 - w, anchor.y - h / 2];
  else if (side === "bottom") top = anchor.y + 8;
  if (bounds) {
    left = clamp(left, bounds.x, bounds.x + bounds.w - w);
    top = clamp(top, bounds.y, bounds.y + bounds.h - h);
  }

  return (
    <div ref={ref} className="fx-abs" style={{ left, top, zIndex: 5, visibility: size ? "visible" : "hidden" }}>
      <motion.div
        key={text}
        initial={{ scale: 0.4, opacity: 0, y: 6 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.6, opacity: 0 }}
        transition={{ type: "spring", stiffness: 520, damping: 20 }}
        className={`bubble ${tone === "warn" ? "bubble--warn" : ""}`}
      >
        {text}
      </motion.div>
    </div>
  );
}

export function Zzz({ anchor }: { anchor: Point }) {
  return (
    <div className="fx-abs" style={{ left: anchor.x, top: anchor.y }}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="zzz"
          style={{ fontSize: 14 + i * 4 }}
          initial={{ opacity: 0, x: 0, y: 0 }}
          animate={{ opacity: [0, 1, 0], x: [0, 14 + i * 6], y: [0, -34 - i * 10] }}
          transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
        >
          z
        </motion.span>
      ))}
    </div>
  );
}

export interface Particle {
  id: number;
  kind: "crumb" | "heart";
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  rot: number;
  size: number;
  color: string;
  round: boolean;
}

export function Particles({ items }: { items: Particle[] }) {
  return (
    <div className="fx-layer" style={{ zIndex: 40 }}>
      {items.map((p) =>
        p.kind === "heart" ? (
          <motion.div
            key={p.id}
            className="fx-abs heart"
            style={{ left: p.cx, top: p.cy, fontSize: p.size }}
            initial={{ opacity: 0, scale: 0.3, x: 0, y: 0 }}
            animate={{ opacity: [0, 1, 0], scale: 1, x: p.vx * 0.3, y: p.vy - 40 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
          >
            ♥
          </motion.div>
        ) : (
          <motion.div
            key={p.id}
            className="fx-abs"
            style={{ left: p.cx, top: p.cy, width: p.size, height: p.size, background: p.color, borderRadius: p.round ? 99 : 2 }}
            initial={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
            animate={{ x: [0, p.vx * 0.55, p.vx], y: [0, p.vy, p.vy + 110], rotate: p.rot, opacity: [1, 1, 0] }}
            transition={{ duration: 0.85, times: [0, 0.35, 1], ease: "easeOut" }}
          />
        ),
      )}
    </div>
  );
}

/**
 * Stand-in for a Chrome tab that was just closed. Chrome removes the real tab instantly,
 * so the mascot chomps this ghost at the tab's last known position (same eat animation
 * as the playground's <Tab>).
 */
export function GhostTab({ rect, closeX, eating, speed }: { rect: Rect; closeX: number; eating: boolean; speed: number }) {
  const eatT = { duration: 0.3 / speed, ease: "easeIn" as const };
  return (
    <motion.div
      className="ghost-tab"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, originX: 1 }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={
        eating
          ? { opacity: 0, scaleX: 0.12, scaleY: 0.3, rotate: -10, x: 24, y: -4, transition: eatT }
          : { opacity: 0.92, scale: 1, rotate: [-2.5, 2.5, -2.5], transition: { rotate: { duration: 0.18, repeat: Infinity } } }
      }
      exit={{ opacity: 0, transition: { duration: 0 } }}
    >
      <span className="ghost-tab__x" style={{ left: closeX - rect.x - 9 }}>
        ✕
      </span>
    </motion.div>
  );
}
