// Mascot art + rig data, ported verbatim from playground.html (TM_IMG / TM_META / TM_RIG / LINES).
import salamanderArt from "./art/salamander.webp";
import narwhalArt from "./art/narwhal.webp";
import iguanaArt from "./art/iguana.webp";
import hermitCrabArt from "./art/hermit-crab.webp";
import babyDragonArt from "./art/baby-dragon.webp";

export const ORDER = ["salamander", "narwhal", "iguana", "hermit-crab", "baby-dragon"] as const;
export type MascotId = (typeof ORDER)[number];

export interface RigEye {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  lid: string;
}

interface RigSpec {
  label: string;
  full: string;
  facing: "left" | "right" | "front";
  accent: string;
  bgTint: string;
  eyes: RigEye[];
  lip: [number, number][];
  jaw: number;
  tongue: string;
  brow?: string;
}

export interface Mascot extends RigSpec {
  id: MascotId;
  yum: string[];
  hi: string;
  /** [x, y, w, h] of the art inside the rig's coordinate space */
  bbox: [number, number, number, number];
  src: string;
  lipCx: number;
  lipY: number;
  lipTop: number;
  lipBottom: number;
}

const ART: Record<MascotId, string> = {
  salamander: salamanderArt,
  narwhal: narwhalArt,
  iguana: iguanaArt,
  "hermit-crab": hermitCrabArt,
  "baby-dragon": babyDragonArt,
};

const BBOX: Record<MascotId, [number, number, number, number]> = {
  salamander: [212, 167, 1042, 1087],
  narwhal: [0, 77, 1172, 1177],
  iguana: [0, 151, 1116, 1103],
  "hermit-crab": [48, 145, 1158, 1028],
  "baby-dragon": [109, 110, 916, 1144],
};

const LINES: Record<MascotId, { yum: string[]; hi: string }> = {
  salamander: { yum: ["nom!", "crunchy ✨", "*gulp*", "mmm, tab"], hi: "hi! I’m Sal 🧡" },
  narwhal: { yum: ["blub-nom!", "tasty tab 🫧", "nom nom", "more pls"], hi: "hiya! Nori here 🫧" },
  iguana: { yum: ["chomp!", "mmm, pixels", "snack time 🌿", "crispy!"], hi: "sup. I’m Iggy 🌿" },
  "hermit-crab": { yum: ["snip snip!", "crunch!", "nom! 🐚", "delish"], hi: "hello from my shell! 🐚" },
  "baby-dragon": { yum: ["rawr-nom! 🔥", "toasty!", "mmm!", "nom nom"], hi: "rawr! I’m Ember 🔥" },
};

const RIG: Record<MascotId, RigSpec> = {
  salamander: {
    label: "Sal", full: "Salamander", facing: "left", accent: "#e66620", bgTint: "#0e4482",
    eyes: [{ cx: 664, cy: 338, rx: 90, ry: 80, lid: "#e66620" }],
    lip: [[232, 440], [330, 458], [460, 492], [585, 503], [712, 478]], jaw: 75, tongue: "#ff8a8a",
  },
  narwhal: {
    label: "Nori", full: "Narwhal", facing: "front", accent: "#1f7294", bgTint: "#f59e6e",
    eyes: [{ cx: 482, cy: 517, rx: 62, ry: 72, lid: "#1f7294" }, { cx: 888, cy: 543, rx: 56, ry: 70, lid: "#1f7294" }],
    lip: [[582, 598], [668, 612], [756, 612]], jaw: 120, tongue: "#ff9a9a",
  },
  iguana: {
    label: "Iggy", full: "Iguana", facing: "right", accent: "#3aa469", bgTint: "#d45d3a",
    eyes: [{ cx: 604, cy: 497, rx: 92, ry: 92, lid: "#3aa469" }, { cx: 972, cy: 467, rx: 60, ry: 70, lid: "#3aa469" }],
    lip: [[655, 668], [760, 735], [900, 770], [1068, 705]], jaw: 85, tongue: "#ff8f8f",
  },
  "hermit-crab": {
    label: "Shelly", full: "Hermit crab", facing: "front", accent: "#c94d40", bgTint: "#f5bd29",
    eyes: [{ cx: 617, cy: 560, rx: 78, ry: 78, lid: "#cc4e41" }, { cx: 851, cy: 560, rx: 78, ry: 78, lid: "#cc4e41" }],
    lip: [[686, 726], [755, 740], [822, 726]], jaw: 110, tongue: "#ff9a9a", brow: "#3a0d0a",
  },
  "baby-dragon": {
    label: "Ember", full: "Baby dragon", facing: "front", accent: "#fb6e60", bgTint: "#d1b4f9",
    eyes: [{ cx: 567, cy: 653, rx: 56, ry: 64, lid: "#fc6f62" }, { cx: 921, cy: 575, rx: 44, ry: 60, lid: "#fc6f62" }],
    lip: [[728, 664], [772, 690], [816, 660]], jaw: 75, tongue: "#ff8f8f",
  },
};

export const MASCOTS: Mascot[] = ORDER.map((id) => {
  const r = RIG[id];
  const lx = r.lip.map((p) => p[0]);
  const ly = r.lip.map((p) => p[1]);
  return {
    id,
    ...r,
    ...LINES[id],
    bbox: BBOX[id],
    src: ART[id],
    lipCx: (Math.min(...lx) + Math.max(...lx)) / 2,
    lipY: ly.reduce((a, b) => a + b, 0) / ly.length,
    lipTop: Math.min(...ly),
    lipBottom: Math.max(...ly),
  };
});

export const byId = Object.fromEntries(MASCOTS.map((m) => [m.id, m])) as Record<MascotId, Mascot>;

export const isMascotId = (v: unknown): v is MascotId => typeof v === "string" && (ORDER as readonly string[]).includes(v);
