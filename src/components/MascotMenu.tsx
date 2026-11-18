import { motion } from "framer-motion";
import { MASCOTS, type MascotId } from "../mascots/data";
import type { Rect } from "../engine/util";

const MENU_W = 216;
const MENU_H = 196;

interface Props {
  /** mascot's rect in stage coords */
  at: Rect;
  stage: { w: number; h: number };
  current: MascotId;
  autoRoam: boolean;
  tabsEaten: number;
  onPick: (id: MascotId) => void;
  onToggleRoam: () => void;
  onReset: () => void;
  onClose: () => void;
}

/** Compact right-click menu: switch mascot, toggle roaming, reset position. */
export function MascotMenu({ at, stage, current, autoRoam, tabsEaten, onPick, onToggleRoam, onReset, onClose }: Props) {
  // Prefer below-right of the mascot; flip to stay on screen.
  let left = at.x + at.w + 6;
  if (left + MENU_W > stage.w - 8) left = at.x - MENU_W - 6;
  let top = at.y + at.h + 6;
  if (top + MENU_H > stage.h - 8) top = at.y - MENU_H - 6;
  left = Math.max(8, Math.min(stage.w - MENU_W - 8, left));
  top = Math.max(8, Math.min(stage.h - MENU_H - 8, top));

  return (
    <>
      <div className="menu-backdrop" onPointerDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <motion.div
        className="menu"
        style={{ left, top, width: MENU_W }}
        initial={{ opacity: 0, scale: 0.9, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 520, damping: 30 }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="menu__label">Mascot</div>
        <div className="menu__mascots">
          {MASCOTS.map((m) => (
            <button
              key={m.id}
              className={`menu__mascot ${m.id === current ? "is-active" : ""}`}
              style={{ ["--accent" as string]: m.accent }}
              title={`${m.label} the ${m.full}`}
              onClick={() => onPick(m.id)}
            >
              <img src={m.src} alt={m.label} draggable={false} />
              <span>{m.label}</span>
            </button>
          ))}
        </div>
        <button className="menu__row" onClick={onToggleRoam}>
          Roam freely
          <span className={`switch ${autoRoam ? "is-on" : ""}`} />
        </button>
        <button className="menu__row" onClick={onReset}>
          Reset position <span className="menu__hint">↺</span>
        </button>
        <div className="menu__stat">
          <span>Tabs eaten</span>
          <b>{tabsEaten.toLocaleString()}</b>
        </div>
      </motion.div>
    </>
  );
}
