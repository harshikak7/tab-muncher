import { isMascotId, type MascotId } from "../mascots/data";

/** Same knobs as the playground's settings panel. */
export interface Settings {
  /** roaming width in px */
  size: number;
  /** height in px while perched on a tab */
  perchSize: number;
  /** height in px while lunging at a closing tab (kept small so it stays framed near the tab strip) */
  munchSize: number;
  /** animation speed multiplier */
  speed: number;
  /** total open tabs at which the mascot gets worried */
  threshold: number;
  /** seconds idle before wandering off (×1.6 when already napping somewhere) */
  roamDelay: number;
  /** stop self-driven wandering after this many seconds without any user/tab activity */
  roamBudget: number;
  autoRoam: boolean;
  showRig: boolean;
  forceWorried: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  size: 124,
  perchSize: 36,
  munchSize: 64,
  speed: 1,
  threshold: 8,
  roamDelay: 25,
  roamBudget: 60,
  autoRoam: true,
  showRig: false,
  forceWorried: false,
};

/** What we persist: only things the user chose or earned. Tuning lives in DEFAULT_SETTINGS. */
export interface Prefs {
  mascotId: MascotId;
  autoRoam: boolean;
  tabsEaten: number;
  onboarded: boolean;
}

const KEY = "tab-muncher:prefs";
const FALLBACK: Prefs = { mascotId: "salamander", autoRoam: true, tabsEaten: 0, onboarded: false };

export function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw !== "object") return FALLBACK;
    return {
      mascotId: isMascotId(raw.mascotId) ? raw.mascotId : FALLBACK.mascotId,
      // v0.1 stored autoRoam inside a `settings` object
      autoRoam: typeof raw.autoRoam === "boolean" ? raw.autoRoam : (raw.settings?.autoRoam ?? true),
      tabsEaten: Number.isFinite(raw.tabsEaten) ? Math.max(0, Math.floor(raw.tabsEaten)) : 0,
      onboarded: raw.onboarded === true,
    };
  } catch {
    return FALLBACK;
  }
}

export function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable: prefs just won't persist */
  }
}
