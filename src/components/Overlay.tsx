// The mascot "brain": a port of playground.html's <Playground>, driven by real Chrome tabs.
// Behaviours (goPerch / roam / munch queue / drag / pet / worried) and every tween are kept 1:1;
// only the tab source changed (the extension instead of a mock tab strip) and the stage is now
// the desktop work area instead of a 640px card.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useAnimationFrame,
  useMotionValue,
  useSpring,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
  type MotionValue,
} from "framer-motion";
import { MascotRig } from "./MascotRig";
import { Bubble, GhostTab, Particles, Zzz, type BubbleSide, type Particle, type Point } from "./fx";
import { MascotMenu } from "./MascotMenu";
import type { Mascot, MascotId } from "../mascots/data";
import type { Settings } from "../engine/settings";
import { clamp, geom, mix, pick, uid, type Rect } from "../engine/util";
import { layoutTabs, stripRect, stripVisible, type Origin, type TabGeom } from "../bridge/geometry";
import { useBrowserBridge } from "../bridge/useBrowserBridge";
import { domRect, updateHitRegions } from "../bridge/hitTest";
import type { ChromeWindow, TabCreated, TabRemoved, Snapshot } from "../bridge/types";

export interface OverlayApi {
  reset: () => void;
}

type Mode = "travel" | "perch" | "free" | "drag" | "munch" | "chill";
type Pose = "up" | "left-edge" | "right-edge";
type Ease = "linear" | "easeIn" | "easeOut" | "easeInOut" | [number, number, number, number];

interface Ghost {
  id: number;
  rect: Rect;
  close: Rect;
}

/** Keep wandering spots below the top of the screen where Chrome's tab strip usually lives. */
const TOP_BAND = 120;
/** How long the "too many tabs" bubble stays up after the count changes. */
const WARN_SHOW_MS = 5000;

const workArea = (): Rect => {
  const s = window.screen as Screen & { availLeft?: number; availTop?: number };
  const x = Math.max(0, s.availLeft ?? 0);
  const y = Math.max(0, s.availTop ?? 0);
  return {
    x,
    y,
    w: Math.min(window.innerWidth - x, s.availWidth || window.innerWidth),
    h: Math.min(window.innerHeight - y, s.availHeight || window.innerHeight),
  };
};

interface Props {
  mascot: Mascot;
  settings: Settings;
  origin: Origin;
  apiRef: MutableRefObject<OverlayApi | null>;
  tabsEaten: number;
  onTabEaten: () => void;
  onPickMascot: (id: MascotId) => void;
  onToggleRoam: () => void;
}

const MILESTONES = new Set([1, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]);

export function Overlay({ mascot, settings, origin, apiRef, tabsEaten, onTabEaten, onPickMascot, onToggleRoam }: Props) {
  const pgRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [wa, setWa] = useState(workArea);
  useEffect(() => {
    const on = () => setWa(workArea());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [eatingId, setEatingId] = useState<number | null>(null);
  const [mode, _setMode] = useState<Mode>("travel");
  const [pose, setPose] = useState<Pose>("up");
  const [bubble, setBubble] = useState<{ text: string; tone?: "warn"; id: number } | null>(null);
  const [happy, setHappy] = useState(false);
  const [blinkTick, setBlinkTick] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [running, setRunning] = useState(false);
  const [menuAt, setMenuAt] = useState<Rect | null>(null);
  const [hovered, setHovered] = useState(false);
  const [warnFresh, setWarnFresh] = useState(false);

  /* ---------------- browser */
  const removedRef = useRef<(ev: TabRemoved, prev: Snapshot | null) => void>(() => {});
  const createdRef = useRef<(ev: TabCreated) => void>(() => {});
  const bridge = useBrowserBridge({
    onRemoved: (ev, prev) => removedRef.current(ev, prev),
    onCreated: (ev) => createdRef.current(ev),
  });
  const viewport = { w: window.innerWidth, h: window.innerHeight };
  const perchWin = bridge.perchWindow && stripVisible(bridge.perchWindow, origin, viewport) ? bridge.perchWindow : null;
  const activeTabId = perchWin?.tabs.find((t) => t.active)?.id ?? null;
  const tabCount = bridge.totalTabs;

  const g = useMemo(() => geom(mascot, settings.size), [mascot, settings.size]);
  const worried = settings.forceWorried || tabCount >= settings.threshold;

  /* refs mirror state for async behaviours */
  const modeRef = useRef<Mode>("travel");
  const gRef = useRef(g);
  const settingsRef = useRef(settings);
  const mascotRef = useRef(mascot);
  const worriedRef = useRef(worried);
  const poseRef = useRef<Pose>("up");
  const perchWinRef = useRef<ChromeWindow | null>(perchWin);
  const originRef = useRef(origin);
  const ghostsRef = useRef<Ghost[]>(ghosts);
  const perchOverride = useRef<number | null>(null);
  gRef.current = g;
  settingsRef.current = settings;
  mascotRef.current = mascot;
  worriedRef.current = worried;
  poseRef.current = pose;
  perchWinRef.current = perchWin;
  originRef.current = origin;
  ghostsRef.current = ghosts;
  const setMode = (m: Mode) => {
    modeRef.current = m;
    _setMode(m);
  };
  const tabsEatenRef = useRef(tabsEaten);
  tabsEatenRef.current = tabsEaten;
  const lastInteract = useRef(Date.now());
  /** When the current stretch of self-driven wandering began (null = not wandering on its own). */
  const roamSince = useRef<number | null>(null);
  const touch = () => {
    lastInteract.current = Date.now();
    roamSince.current = null;
  };

  /* motion values */
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const poseRot = useMotionValue(0);
  const flip = useMotionValue(1);
  const bodyScale = useMotionValue(1);
  const lungeScale = useMotionValue(1);
  const lungeRot = useMotionValue(0);
  const squash = useMotionValue(1);
  const mouth = useMotionValue(0);
  const vx = useVelocity(x);
  const dangle = useSpring(useTransform(vx, (v) => clamp(v / 90, -14, 14)), { stiffness: 260, damping: 18 });

  /* cancellable tweens + behaviour tokens */
  const active = useRef(new Set<{ cancel: () => void }>());
  const token = useRef(0);
  const sp = () => settingsRef.current.speed;
  const track = (start: (done: () => void) => AnimationPlaybackControls) =>
    new Promise<boolean>((res) => {
      let done = false;
      let c: AnimationPlaybackControls | undefined;
      const entry = {
        cancel: () => {
          try {
            c?.stop();
          } catch {
            /* already stopped */
          }
          finish(false);
        },
      };
      const finish = (v: boolean) => {
        if (done) return;
        done = true;
        active.current.delete(entry);
        res(v);
      };
      active.current.add(entry);
      c = start(() => finish(true));
    });
  const tween = (mv: MotionValue<number>, to: number, o: { duration?: number; ease?: Ease } = {}) =>
    track((done) =>
      animate(mv, to, { ...o, ...(o.duration != null ? { duration: o.duration / sp() } : {}), onComplete: done }),
    );
  const tweenFn = (dur: number, ease: Ease, onUpdate: (p: number) => void) =>
    track((done) => animate(0, 1, { duration: dur / sp(), ease, onUpdate, onComplete: done }));
  const stopAll = () => {
    for (const e of [...active.current]) e.cancel();
  };
  const sleep = (s: number) => new Promise<void>((r) => setTimeout(r, (s * 1000) / sp()));
  const newToken = () => {
    stopAll();
    return ++token.current;
  };

  /* geometry helpers (stage coords = desktop work area) */
  const stageOff = () => {
    const p = pgRef.current?.getBoundingClientRect();
    return { x: p?.left ?? 0, y: p?.top ?? 0 };
  };
  const relR = (r: Rect): Rect => {
    const o = stageOff();
    return { x: r.x - o.x, y: r.y - o.y, w: r.w, h: r.h };
  };
  const pgSize = () => ({ w: pgRef.current?.clientWidth ?? wa.w, h: pgRef.current?.clientHeight ?? wa.h });
  const perchGeom = (): TabGeom | null => {
    const win = perchWinRef.current;
    if (!win) return null;
    const tabs = layoutTabs(win, originRef.current);
    const want = perchOverride.current ?? win.tabs.find((t) => t.active)?.id;
    return tabs.find((t) => t.id === want) ?? tabs[tabs.length - 1] ?? null;
  };
  const perchTarget = () => {
    if (!pgRef.current) return null;
    const tab = perchGeom();
    if (!tab) return null;
    const r = relR(tab.rect);
    const { W, H } = gRef.current;
    // tiny "tab buddy": scaled down to perchSize px tall, sitting on the tab just left of its ✕
    const s = Math.min(1, settingsRef.current.perchSize / H);
    const vw = W * s;
    const cx = tab.close.w ? relR(tab.close).x - 3 - vw / 2 : r.x + r.w / 2;
    const bottom = r.y + r.h + 1;
    return { x: cx - W / 2, y: bottom - H, s };
  };

  /* perched: follow the active tab every frame (handles window moves / reflow / size changes) */
  useAnimationFrame(() => {
    if (modeRef.current === "perch") {
      const t = perchTarget();
      if (t) {
        x.set(x.get() + (t.x - x.get()) * 0.22);
        y.set(y.get() + (t.y - y.get()) * 0.22);
        bodyScale.set(bodyScale.get() + (t.s - bodyScale.get()) * 0.22);
      }
    }
    // Only the mascot and panels marked [data-hit] (e.g. the welcome picker) catch the mouse;
    // everything else is click-through.
    const regions: Rect[] = [];
    const body = domRect(bodyRef.current, 4);
    if (body) regions.push(body);
    document.querySelectorAll("[data-hit]").forEach((el) => {
      const r = domRect(el);
      if (r) regions.push(r);
    });
    updateHitRegions(regions, modeRef.current === "drag" || menuOpenRef.current);
  });

  /* expressive helpers */
  const sayTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const say = (text: string, ms = 1500, tone?: "warn") => {
    clearTimeout(sayTimer.current);
    setBubble({ text, tone, id: uid() });
    sayTimer.current = setTimeout(() => setBubble(null), ms);
  };
  const burst = (cx: number, cy: number, n: number, kind: Particle["kind"] = "crumb") => {
    const m = mascotRef.current;
    const colors = ["#f6c86b", "#e9a15a", "#ffffff", "#cbd5e1", m.accent, mix(m.accent, "#ffffff", 0.4)];
    const batch: Particle[] = Array.from({ length: n }, () => ({
      id: uid(),
      kind,
      cx,
      cy,
      vx: (Math.random() - 0.5) * (kind === "heart" ? 90 : 150),
      vy: -(25 + Math.random() * 75),
      rot: (Math.random() - 0.5) * 560,
      size: kind === "heart" ? 13 + Math.random() * 7 : 3 + Math.random() * 5,
      color: pick(colors),
      round: Math.random() < 0.4,
    }));
    setParticles((p) => [...p, ...batch]);
    setTimeout(() => setParticles((p) => p.filter((q) => !batch.includes(q))), 1300);
  };
  const boing = async () => {
    await tween(squash, 0.86, { duration: 0.07 });
    animate(squash, 1, { type: "spring", stiffness: 600, damping: 9 });
  };
  const face = (dir: number) => {
    const m = mascotRef.current;
    const f = m.facing === "front" ? 1 : (m.facing === "left") === dir > 0 ? -1 : 1;
    animate(flip, f, { duration: 0.14 });
    return f;
  };
  const faceNatural = () => animate(flip, 1, { duration: 0.18 });
  const hopTo = (
    tx: number,
    ty: number,
    { dur = 0.45, arc = 40, rot = null as number | null, ease = "easeInOut" as Ease, scale = 1 as number | null } = {},
  ) => {
    const sx = x.get(), sy = y.get(), sr = poseRot.get(), ss = bodyScale.get();
    return tweenFn(dur, ease, (p) => {
      x.set(sx + (tx - sx) * p);
      y.set(sy + (ty - sy) * p - Math.sin(Math.PI * p) * arc);
      if (scale != null) bodyScale.set(ss + (scale - ss) * Math.min(1, p * 1.6));
      if (rot != null) poseRot.set(sr + (rot - sr) * p);
    });
  };
  const headAnchor = (): { a: Point; side: BubbleSide } => {
    const { W, H } = gRef.current;
    if (poseRef.current === "left-edge") return { a: { x: W / 2 + H / 2, y: H / 2 }, side: "right" };
    if (poseRef.current === "right-edge") return { a: { x: W / 2 - H / 2, y: H / 2 }, side: "left" };
    // The body is scaled around its bottom-centre (small while perched / munching), so work from
    // its visible top. Near the top of the screen (Chrome's tab strip) speak downward instead.
    const s = bodyScale.get();
    const visTop = H * (1 - s);
    if (y.get() + visTop < 64) return { a: { x: W / 2, y: H + 4 }, side: "bottom" };
    return { a: { x: W / 2, y: visTop - 2 }, side: "top" };
  };
  /** Stage bounds in the mascot's local coordinates, so bubbles can clamp themselves on-screen. */
  const localBounds = (): Rect => {
    const P = pgSize();
    return { x: 6 - x.get(), y: 6 - y.get(), w: P.w - 12, h: P.h - 12 };
  };

  /* ---------------- behaviours */
  const runningRef = useRef(false);
  const goPerch = async (greet?: string | null) => {
    if (runningRef.current || modeRef.current === "drag") return;
    const t = perchTarget();
    if (!t) return;
    const tok = newToken();
    const wasChill = modeRef.current === "chill";
    setMode("travel");
    setPose("up");
    if (wasChill) {
      say("!", 600);
      setBlinkTick((v) => v + 1);
      await sleep(0.25);
      if (tok !== token.current) return;
    }
    const dist = Math.hypot(t.x - x.get(), t.y - y.get());
    face(t.x - x.get());
    tween(mouth, worriedRef.current ? 0.2 : 0, { duration: 0.15 });
    await boing();
    if (tok !== token.current) return;
    const t2 = perchTarget() ?? t;
    await hopTo(t2.x, t2.y, { dur: clamp(0.3 + dist / 1400, 0.32, 0.7), arc: clamp(dist * 0.25, 18, 90), rot: 0, scale: t2.s });
    if (tok !== token.current) return;
    faceNatural();
    setMode("perch");
    boing();
    if (greet) say(greet, 1500);
  };

  type Spot = { name: string; x: number; y: number; rot: number; pose: Pose };
  const spots = (): Spot[] => {
    const { W, H } = gRef.current;
    const P = pgSize();
    const cy = TOP_BAND + 60 + Math.random() * Math.max(10, P.h - TOP_BAND - 60 - H);
    return [
      { name: "bottom-left", x: 22, y: P.h - H * 0.62, rot: 0, pose: "up" },
      { name: "bottom-right", x: P.w - W - 22, y: P.h - H * 0.62, rot: 0, pose: "up" },
      { name: "bottom-mid", x: P.w * (0.3 + Math.random() * 0.4) - W / 2, y: P.h - H * 0.56, rot: 0, pose: "up" },
      { name: "left-edge", x: H * 0.12 - W / 2, y: cy - H / 2, rot: 90, pose: "left-edge" },
      { name: "right-edge", x: P.w - H * 0.12 - W / 2, y: cy - H / 2, rot: -90, pose: "right-edge" },
    ];
  };
  const lastSpot = useRef<string | null>(null);
  const roam = async (only?: string) => {
    if (runningRef.current || modeRef.current === "drag") return;
    const tok = newToken();
    const all = spots();
    // Wander somewhere close by rather than ping-ponging across every corner of the screen.
    const dist = (s: Spot) => Math.hypot(s.x - x.get(), s.y - y.get());
    const opts = only
      ? all.filter((s) => s.name === only)
      : all.filter((s) => s.name !== lastSpot.current).sort((a, b) => dist(a) - dist(b)).slice(0, 2);
    const s = pick(opts);
    lastSpot.current = s.name;
    setMode("travel");
    setPose("up");
    tween(mouth, 0, { duration: 0.15 });
    if (!only && Math.random() < 0.5) say(pick(["stretch time~", "wander wander", "brb", "exploring…"]), 1200);
    const P = pgSize();
    const { W, H } = gRef.current;
    const mx = clamp((x.get() + s.x) / 2 + (Math.random() - 0.5) * 120, 0, P.w - W);
    const my = clamp(Math.max(TOP_BAND - H * 0.5, (y.get() + s.y) / 2), 0, P.h - H);
    face(mx - x.get());
    await boing();
    if (tok !== token.current) return;
    await hopTo(mx, my, { dur: 0.55, arc: 70, rot: 0 });
    if (tok !== token.current) return;
    boing();
    await sleep(0.18);
    if (tok !== token.current) return;
    face(s.x - x.get());
    await hopTo(s.x, s.y, { dur: 0.6, arc: 60, rot: s.rot });
    if (tok !== token.current) return;
    faceNatural();
    setPose(s.pose);
    setMode("chill");
    boing();
  };

  const queue = useRef<number[]>([]);
  const munchOne = async (id: number) => {
    const ghost = ghostsRef.current.find((gh) => gh.id === id);
    if (!ghost) return;
    const m = mascotRef.current;
    const r = relR(ghost.close.w ? ghost.close : ghost.rect);
    const bx = r.x + r.w / 2;
    const byy = r.y + r.h / 2;
    const { W, H, mouth: mp } = gRef.current;
    const dir = Math.sign(bx - (x.get() + W / 2)) || 1;
    const f = face(dir);
    const mx = f === -1 ? W - mp.x : mp.x;
    // Stay compact while lunging at the tab strip. The body scales around its bottom-centre,
    // so place the box such that the *scaled* mouth lands on the ✕.
    const ms = Math.min(1, settingsRef.current.munchSize / H);
    const tx = bx - W / 2 - (mx - W / 2) * ms;
    const ty = byy - H - (mp.y - H) * ms;
    const dist = Math.hypot(tx - x.get(), ty - y.get());
    setMode("munch");
    setPose("up");
    // anticipation: rear back, start opening
    tween(mouth, 0.4, { duration: 0.2 });
    tween(lungeRot, -dir * 6, { duration: 0.16 });
    await hopTo(tx, ty, {
      dur: clamp(0.22 + dist / 2200, 0.24, 0.42),
      arc: clamp(dist * 0.12, 8, 48),
      rot: 0,
      ease: [0.3, 0, 0.15, 1],
      scale: ms,
    });
    // bite!
    setEatingId(id);
    await Promise.all([tween(mouth, 1, { duration: 0.12 }), tween(lungeScale, 1.14, { duration: 0.12 }), tween(lungeRot, dir * 7, { duration: 0.12 })]);
    await sleep(0.08);
    await Promise.all([tween(mouth, 0, { duration: 0.07 }), tween(lungeScale, 0.94, { duration: 0.07 })]);
    removeGhost(id);
    burst(bx, byy, 14);
    for (const a of [0.6, 0.42]) {
      await Promise.all([tween(mouth, a, { duration: 0.08 }), tween(lungeScale, 1.05, { duration: 0.08 })]);
      await Promise.all([tween(mouth, 0, { duration: 0.07 }), tween(lungeScale, 0.97, { duration: 0.07 })]);
      burst(bx, byy, 5);
    }
    tween(lungeRot, 0, { duration: 0.18 });
    animate(lungeScale, 1, { type: "spring", stiffness: 420, damping: 11 });
    setHappy(true);
    const milestone = milestoneQueue.current.shift();
    if (milestone) say(`🎉 ${milestone} tabs eaten!`, 2200);
    else say(pick(m.yum), 1100);
    await tween(y, ty - 4 - 12 * ms, { duration: 0.11, ease: "easeOut" });
    await tween(y, ty, { duration: 0.14, ease: "easeIn" });
    boing();
    await sleep(0.22);
  };
  const runQueue = async () => {
    if (runningRef.current) return;
    if (modeRef.current === "drag") return;
    runningRef.current = true;
    setRunning(true);
    newToken();
    if (modeRef.current === "chill") {
      setMode("travel");
      setPose("up");
      say("!", 500);
      await sleep(0.2);
    }
    while (queue.current.length) {
      await munchOne(queue.current[0]);
      queue.current.shift();
    }
    await sleep(0.15);
    setHappy(false);
    runningRef.current = false;
    setRunning(false);
    touch();
    if (perchTarget()) goPerch();
    else {
      setMode("free");
      boing();
    }
  };
  const removeGhost = (id: number) => {
    const next = ghostsRef.current.filter((gh) => gh.id !== id);
    ghostsRef.current = next;
    setGhosts(next);
  };

  /* ---------------- tab events (from Chrome) */
  const milestoneQueue = useRef<number[]>([]);
  removedRef.current = (ev, prev) => {
    if (ev.isWindowClosing) return;
    // Every tab the user closes counts as eaten, even ones the mascot can't reach to animate.
    const eaten = tabsEatenRef.current + 1;
    tabsEatenRef.current = eaten;
    onTabEaten();
    touch();
    const milestone = MILESTONES.has(eaten) ? eaten : null;
    const win = prev?.windows.find((w) => w.id === ev.windowId);
    const visible = modeRef.current !== "drag" && perchWinRef.current?.id === ev.windowId; // only tabs the user can see
    const tab = visible && win ? layoutTabs(win, originRef.current).find((t) => t.id === ev.tabId) : undefined;
    if (!tab || queue.current.length >= 4) {
      if (milestone) say(`🎉 ${milestone} tabs eaten!`, 2200);
      return;
    }
    if (milestone) milestoneQueue.current.push(milestone);
    const ghost: Ghost = { id: uid(), rect: tab.rect, close: tab.close };
    ghostsRef.current = [...ghostsRef.current, ghost];
    setGhosts(ghostsRef.current);
    queue.current.push(ghost.id);
    runQueue();
  };
  const greetNext = useRef<string | null>(null);
  createdRef.current = (ev) => {
    touch();
    if (Math.random() >= 0.3) return;
    const line = pick(["ooh, new tab!", "a fresh one ✨", "is that for me?"]);
    if (ev.active) greetNext.current = line;
    else if (!runningRef.current) say(line, 1200);
  };

  /* follow the active tab / focused window */
  const perchKey = perchWin && activeTabId != null ? `${perchWin.id}:${activeTabId}` : null;
  useEffect(() => {
    perchOverride.current = null;
    if (runningRef.current || modeRef.current === "drag") return;
    if (perchKey) {
      touch();
      const greet = greetNext.current;
      greetNext.current = null;
      setTimeout(() => goPerchRef.current(greet), 10);
    } else if (modeRef.current === "perch") {
      // Chrome went to the background / minimized / fullscreen: hop off and hang out on the desktop.
      roamRef.current();
    }
  }, [perchKey]);

  /* ---------------- dragging + petting */
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    touch();
    if (runningRef.current) {
      say("busy munching!", 900);
      return;
    }
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    drag.current = { sx: e.clientX, sy: e.clientY, ox: x.get(), oy: y.get(), moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 4) {
      d.moved = true;
      newToken();
      setMode("drag");
      setPose("up");
      tween(poseRot, 0, { duration: 0.15 });
      tween(bodyScale, 1, { duration: 0.18 });
      faceNatural();
      tween(lungeScale, 1.06, { duration: 0.12 });
      tween(mouth, 0.3, { duration: 0.12 });
      say(pick(["wheee!", "whoa!", "hehe", "up we go!"]), 900);
    }
    if (d.moved) {
      const P = pgSize();
      const { W, H } = gRef.current;
      x.set(clamp(d.ox + dx, -W * 0.15, P.w - W * 0.85));
      y.set(clamp(d.oy + dy, -H * 0.1, P.h - H * 0.55));
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    touch();
    if (!d.moved) return pet();
    tween(lungeScale, 1, { duration: 0.15 });
    tween(mouth, worriedRef.current ? 0.2 : 0, { duration: 0.15 });
    const { W, H } = gRef.current;
    const foot = { x: x.get() + W / 2, y: y.get() + H };
    const win = perchWinRef.current;
    if (win) {
      const s = relR(stripRect(win, originRef.current));
      if (foot.y > s.y - 46 && foot.y < s.y + s.h + 60 && foot.x > s.x && foot.x < s.x + s.w) {
        const list = layoutTabs(win, originRef.current).map((t) => ({ t, r: relR(t.rect) }));
        if (list.length) {
          const best = list.reduce((a, o) => (Math.abs(o.r.x + o.r.w / 2 - foot.x) < Math.abs(a.r.x + a.r.w / 2 - foot.x) ? o : a));
          perchOverride.current = best.t.id;
          setMode("free");
          return goPerch(pick(["comfy spot", "perched!", "this one"]));
        }
      }
    }
    setMode("free");
    boing();
  };
  const pet = () => {
    setBlinkTick((t) => t + 1);
    const { W } = gRef.current;
    burst(x.get() + W / 2, y.get() + 10, 3, "heart");
    say(pick(["hehe ♥", "boop!", "that tickles", "♥ ♥"]), 1100);
    setHappy(true);
    setTimeout(() => !runningRef.current && setHappy(false), 1200);
    if (modeRef.current === "chill") setMode("free");
    boing();
  };

  /* ---------------- menu */
  const menuOpenRef = useRef(false);
  menuOpenRef.current = menuAt != null;
  const openMenu = () => {
    touch();
    const r = domRect(bodyRef.current);
    if (r) setMenuAt(relR(r));
  };

  /* reset: back to the active tab, or the bottom-right corner if Chrome isn't around */
  const reset = () => {
    touch();
    setMenuAt(null);
    if (runningRef.current) return;
    perchOverride.current = null;
    setMode("free");
    if (perchTarget()) goPerch("back to my tab~");
    else roam("bottom-right");
  };
  apiRef.current = { reset };

  /* roam timer */
  const roamRef = useRef(roam);
  roamRef.current = roam;
  const goPerchRef = useRef(goPerch);
  goPerchRef.current = goPerch;
  useEffect(() => {
    const iv = setInterval(() => {
      const s = settingsRef.current;
      if (!s.autoRoam || runningRef.current || worriedRef.current || menuOpenRef.current) return;
      if (["drag", "travel", "munch"].includes(modeRef.current)) return;
      const now = Date.now();
      // After ~a minute of wandering on its own it settles down and naps where it is,
      // until the user (or a tab event) wakes it up again.
      if (roamSince.current != null && now - roamSince.current > s.roamBudget * 1000) return;
      const idle = (now - lastInteract.current) / 1000;
      const need = modeRef.current === "chill" ? s.roamDelay * 1.6 : s.roamDelay;
      if (idle > need) {
        lastInteract.current = now;
        roamSince.current ??= now;
        if (modeRef.current === "chill" && perchWinRef.current && Math.random() < 0.4) goPerchRef.current("back to my tab~");
        else roamRef.current();
      }
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  /* entrance + mascot switch */
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      const enter = () => {
        // Wait until the overlay has been sized to the monitor (it starts hidden at 800×600).
        if (!pgRef.current || pgRef.current.clientWidth < 50) {
          setWa(workArea());
          return void requestAnimationFrame(enter);
        }
        const t = perchTarget();
        const { W, H } = gRef.current;
        if (t) {
          x.set(t.x);
          y.set(-H - 20);
          goPerch(mascot.hi);
        } else {
          // No Chrome yet: pop up from the bottom-right corner.
          const P = pgSize();
          x.set(P.w - W - 22);
          y.set(P.h + 10);
          roam("bottom-right").then(() => say(mascot.hi, 1600));
        }
      };
      requestAnimationFrame(enter);
      return;
    }
    touch();
    setHappy(true);
    setTimeout(() => !runningRef.current && setHappy(false), 1400);
    say(mascot.hi, 1600);
    if (modeRef.current === "chill" && perchWinRef.current) goPerch();
    else boing();
  }, [mascot.id]);

  /* worried reactions */
  const prevWorried = useRef(worried);
  useEffect(() => {
    if (worried && !prevWorried.current) {
      say(pick(["uh oh… so many tabs 😵‍💫", "I’m stuffed!", "that’s a LOT of tabs"]), 1800, "warn");
      if (modeRef.current === "chill") goPerch();
    }
    if (!worried && prevWorried.current) setTimeout(() => say("phew… much better", 1300), 600);
    prevWorried.current = worried;
    if (!runningRef.current && modeRef.current !== "drag") tween(mouth, worried ? 0.2 : 0, { duration: 0.2 });
  }, [worried]);

  // On the real desktop the overload warning shows for a few seconds whenever the count changes
  // (and while hovered) instead of permanently, so it never parks over Chrome's address bar.
  useEffect(() => {
    if (!worried) return;
    setWarnFresh(true);
    const t = setTimeout(() => setWarnFresh(false), WARN_SHOW_MS);
    return () => clearTimeout(t);
  }, [worried, tabCount]);

  /* ---------------- render */
  const stuffed = worried ? 1 + Math.min(0.1, (tabCount - settings.threshold + 1) * 0.025) : 1;
  const breathe =
    mode === "munch" || mode === "drag"
      ? { anim: { scaleY: 1, scaleX: 1, rotate: 0 }, tr: { duration: 0.15 } }
      : mode === "chill"
        ? {
            anim: { scaleY: [1, 1.045, 1], scaleX: [1, 0.99, 1], rotate: [-0.8, 0.8, -0.8] },
            tr: {
              scaleY: { duration: 4.2, repeat: Infinity, ease: "easeInOut" as const },
              scaleX: { duration: 4.2, repeat: Infinity, ease: "easeInOut" as const },
              rotate: { duration: 6.5, repeat: Infinity, ease: "easeInOut" as const },
            },
          }
        : worried
          ? {
              anim: { scaleY: [1, 1.04, 1], scaleX: [stuffed, stuffed * 1.015, stuffed], rotate: [-2.5, 2.5, -2.5] },
              tr: {
                scaleY: { duration: 1.2, repeat: Infinity },
                scaleX: { duration: 1.2, repeat: Infinity },
                rotate: { duration: 0.9, repeat: Infinity, ease: "easeInOut" as const },
              },
            }
          : {
              anim: { scaleY: [1, 1.028, 1], scaleX: [1, 0.995, 1], rotate: [-1.4, 1.4, -1.4] },
              tr: {
                scaleY: { duration: 2.8, repeat: Infinity, ease: "easeInOut" as const },
                scaleX: { duration: 2.8, repeat: Infinity, ease: "easeInOut" as const },
                rotate: { duration: 5.2, repeat: Infinity, ease: "easeInOut" as const },
              },
            };

  const { a: anchor, side } = headAnchor();
  const warnText = `${tabCount} tabs?! ${tabCount >= settings.threshold + 3 ? "I’m gonna pop 🫠" : "I’m stuffed 😵‍💫"}`;
  const shownBubble =
    bubble || (worried && !running && mode !== "drag" && (warnFresh || hovered) ? { text: warnText, tone: "warn" as const, id: -1 } : null);

  return (
    <div ref={pgRef} className="stage" style={{ left: wa.x, top: wa.y, width: wa.w, height: wa.h }}>
      {/* stand-ins for tabs Chrome already closed, so there's something to chomp */}
      <AnimatePresence>
        {ghosts.map((gh) => {
          const r = relR(gh.rect);
          const c = relR(gh.close);
          return <GhostTab key={gh.id} rect={r} closeX={c.x + c.w / 2} eating={gh.id === eatingId} speed={settings.speed} />;
        })}
      </AnimatePresence>

      {/* mascot */}
      <motion.div className="mascot" style={{ x, y, width: g.W, height: g.H }}>
        <AnimatePresence>
          {(mode === "free" || mode === "drag") && (
            <motion.div
              key="shadow"
              className="mascot__shadow"
              style={{ width: g.W * 0.7, x: "-50%" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: mode === "drag" ? 0.5 : 1, scale: mode === "drag" ? 0.7 : 1 }}
              exit={{ opacity: 0 }}
            />
          )}
        </AnimatePresence>
        <motion.div
          ref={bodyRef}
          className="mascot__body"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onContextMenu={(e) => {
            e.preventDefault();
            openMenu();
          }}
          style={{ scale: bodyScale, originY: 1, cursor: mode === "drag" ? "grabbing" : "grab" }}
        >
          <motion.div className="fill" style={{ rotate: poseRot }}>
            <motion.div className="fill" style={{ scaleX: flip }}>
              <motion.div className="fill" style={{ rotate: dangle, originY: 0.2 }}>
                <motion.div
                  className="fill"
                  style={{ scale: lungeScale, rotate: lungeRot, scaleY: squash, originX: g.mouth.x / g.W, originY: g.mouth.y / g.H }}
                >
                  <motion.div className="fill" animate={breathe.anim} transition={breathe.tr} style={{ originY: 1 }}>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={mascot.id}
                        initial={{ scale: 0.2, rotate: -14, opacity: 0 }}
                        animate={{ scale: 1, rotate: 0, opacity: 1 }}
                        exit={{ scale: 0.2, rotate: 14, opacity: 0, transition: { duration: 0.12 } }}
                        transition={{ type: "spring", stiffness: 520, damping: 20 }}
                        style={{ originY: 1 }}
                      >
                        <MascotRig
                          m={mascot}
                          width={g.W}
                          mouth={mouth}
                          sleepy={mode === "chill"}
                          happy={happy}
                          worried={worried && mode !== "chill"}
                          blinkTick={blinkTick}
                          showRig={settings.showRig}
                        />
                      </motion.div>
                    </AnimatePresence>
                  </motion.div>
                </motion.div>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
        {mode === "chill" && <Zzz anchor={side === "top" ? { x: anchor.x + 10, y: anchor.y } : anchor} />}
        <AnimatePresence>
          {shownBubble && (
            <Bubble
              key={shownBubble.id}
              text={shownBubble.text}
              tone={shownBubble.tone}
              anchor={anchor}
              side={side}
              bounds={localBounds()}
            />
          )}
        </AnimatePresence>
      </motion.div>

      <Particles items={particles} />

      {menuAt && (
        <MascotMenu
          at={menuAt}
          stage={pgSize()}
          current={mascot.id}
          autoRoam={settings.autoRoam}
          tabsEaten={tabsEaten}
          onPick={(id) => {
            setMenuAt(null);
            onPickMascot(id);
          }}
          onToggleRoam={onToggleRoam}
          onReset={reset}
          onClose={() => setMenuAt(null)}
        />
      )}
    </div>
  );
}
