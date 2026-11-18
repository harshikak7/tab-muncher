import { motion, useMotionValue } from "framer-motion";
import { MASCOTS, type Mascot, type MascotId } from "../mascots/data";
import { MascotRig } from "./MascotRig";

function Tile({ m, selected, onPick }: { m: Mascot; selected: boolean; onPick: () => void }) {
  const mouth = useMotionValue(0);
  return (
    <button
      className={`welcome__tile ${selected ? "is-active" : ""}`}
      style={{ ["--accent" as string]: m.accent }}
      onClick={onPick}
      onPointerEnter={() => mouth.set(0.35)}
      onPointerLeave={() => mouth.set(0)}
    >
      <div className="welcome__art">
        <MascotRig m={m} width={64} mouth={mouth} sleepy={false} happy={selected} worried={false} blinkTick={0} />
      </div>
      <b>{m.label}</b>
      <span>{m.full}</span>
    </button>
  );
}

interface Props {
  current: MascotId;
  onPick: (id: MascotId) => void;
  onDone: () => void;
}

/**
 * First-launch picker. Shown once; choosing "Let's go" or skipping marks onboarding complete.
 * `data-hit` makes the card catch the mouse while the rest of the overlay stays click-through.
 */
export function Welcome({ current, onPick, onDone }: Props) {
  return (
    <motion.div
      className="welcome"
      data-hit
      initial={{ opacity: 0, scale: 0.94, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button className="welcome__close" onClick={onDone} title="Skip">
        ✕
      </button>
      <h1>Pick your tab muncher</h1>
      <p className="welcome__lead">
        Your buddy perches on your active Chrome tab, chomps tabs as you close them, and gets nervous when you hoard too many.
      </p>
      <div className="welcome__grid">
        {MASCOTS.map((m) => (
          <Tile key={m.id} m={m} selected={m.id === current} onPick={() => onPick(m.id)} />
        ))}
      </div>
      <div className="welcome__hint">
        <span className="welcome__kbd">Right-click</span> your mascot anytime to switch, toggle roaming, or see how many tabs it has eaten. The tray icon has
        the same options.
      </div>
      <button className="welcome__go" onClick={onDone}>
        Let’s go
      </button>
    </motion.div>
  );
}
