// Hero demo: a mock browser with the real mascot rig perched on the active tab, mirroring the app:
// click × and it lunges over (staying small) to chomp the tab, the tabs-eaten counter ticks up,
// 8+ tabs makes it nervous, and right-clicking it opens the same kind of switcher as the desktop app.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue } from "framer-motion";
import { MascotRig } from "../src/components/MascotRig";
import { MASCOTS, type Mascot, type MascotId } from "../src/mascots/data";
import { geom, pick, uid } from "../src/engine/util";

const TITLES = [
  "Inbox (47)", "Flights to Goa", "Untitled document", "Recipe for soup", "Lo-fi beats",
  "Pull request #42", "Q4 dashboard", "Weather this week", "Cafés nearby", "Invoice draft",
  "Center a div", "Cart (3 items)",
];
/** Same overload threshold as the desktop app's default. */
const WORRY_AT = 8;
const MAX_TABS = 11;
const PERCH_H = 38;

interface Tab {
  id: number;
  title: string;
}

const freshTabs = (): Tab[] => TITLES.slice(0, 5).map((title) => ({ id: uid(), title }));

interface Props {
  mascot: Mascot;
  onPick: (id: MascotId) => void;
}

export function Preview({ mascot, onPick }: Props) {
  const [tabs, setTabs] = useState(freshTabs);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [eatingId, setEatingId] = useState<number | null>(null);
  const [eaten, setEaten] = useState(0);
  const [bubble, setBubble] = useState<{ id: number; text: string } | null>(null);
  const [happy, setHappy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [blink, setBlink] = useState(0);

  const frameRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const tabEls = useRef(new Map<number, HTMLElement>());
  const xEls = useRef(new Map<number, HTMLElement>());
  const busy = useRef(false);

  const [, , bw, bh] = mascot.bbox;
  const g = geom(mascot, (PERCH_H * bw) / bh);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouth = useMotionValue(0);
  const worried = tabs.length >= WORRY_AT;

  const rel = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const p = bodyRef.current!.getBoundingClientRect();
    return { x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height };
  };

  const say = (text: string, ms = 1300) => {
    const b = { id: uid(), text };
    setBubble(b);
    setTimeout(() => setBubble((cur) => (cur?.id === b.id ? null : cur)), ms);
  };

  /** Sit on the active tab, just left of its ×. */
  const perch = useCallback(
    (instant = false) => {
      const tab = tabEls.current.get(activeId);
      const close = xEls.current.get(activeId);
      if (!tab || !close || !bodyRef.current || busy.current) return;
      const t = rel(tab);
      const c = rel(close);
      const tx = c.x - 2 - g.W;
      const ty = t.y + t.h - g.H + 2;
      if (instant) {
        x.set(tx);
        y.set(ty);
      } else {
        animate(x, tx, { type: "spring", stiffness: 380, damping: 26 });
        animate(y, [y.get(), Math.min(y.get(), ty) - 12, ty], { duration: 0.36, ease: "easeInOut" });
      }
    },
    [activeId, g.W, g.H],
  );

  const first = useRef(true);
  useLayoutEffect(() => {
    perch(first.current);
    first.current = false;
  }, [perch, tabs.length]);
  useEffect(() => {
    const ro = new ResizeObserver(() => perch(true));
    if (bodyRef.current) ro.observe(bodyRef.current);
    return () => ro.disconnect();
  }, [perch]);

  /* Picking a mascot below: pulse the frame and say hi, so the link is obvious. */
  const seen = useRef(mascot.id);
  useEffect(() => {
    if (seen.current === mascot.id) return;
    seen.current = mascot.id;
    if (frameRef.current) animate(frameRef.current, { scale: [0.975, 1.008, 1] }, { duration: 0.4 });
    say(mascot.hi, 1500);
  }, [mascot.id]);

  const close = async (id: number) => {
    if (busy.current) return;
    const btn = xEls.current.get(id);
    if (!btn) return;
    busy.current = true;
    setMenu(false);
    const c = rel(btn);
    const tx = c.x + c.w / 2 - g.mouth.x;
    const ty = c.y + c.h / 2 - g.mouth.y;
    animate(mouth, 0.45, { duration: 0.15 });
    await Promise.all([
      animate(x, tx, { duration: 0.28, ease: [0.3, 0, 0.15, 1] }),
      animate(y, [y.get(), Math.min(y.get(), ty) - 14, ty], { duration: 0.28 }),
    ]);
    setEatingId(id);
    await animate(mouth, 1, { duration: 0.1 });
    await animate(mouth, 0, { duration: 0.08 });
    for (const a of [0.55, 0.4]) {
      await animate(mouth, a, { duration: 0.08 });
      await animate(mouth, 0, { duration: 0.07 });
    }
    const idx = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    const replacement = next.length ? next : freshTabs();
    setEatingId(null);
    setEaten((n) => n + 1);
    setHappy(true);
    setTimeout(() => setHappy(false), 1000);
    say(pick(mascot.yum));
    if (id === activeId || !next.length) setActiveId(replacement[Math.min(idx, replacement.length - 1)].id);
    setTabs(replacement);
    busy.current = false;
  };

  const newTab = () => {
    if (busy.current || tabs.length >= MAX_TABS) return;
    const open = new Set(tabs.map((t) => t.title));
    const t = { id: uid(), title: TITLES.find((s) => !open.has(s)) ?? pick(TITLES) };
    setTabs((cur) => [...cur, t]);
    setActiveId(t.id);
    if (tabs.length + 1 === WORRY_AT) say(`${WORRY_AT} tabs?! I’m stuffed 😵‍💫`, 1800);
  };

  const pet = () => {
    if (busy.current) return;
    setBlink((b) => b + 1);
    setHappy(true);
    setTimeout(() => setHappy(false), 900);
    say(pick(["hehe ♥", "boop!", "that tickles"]), 900);
  };

  return (
    <div className="preview" ref={frameRef}>
      <div className="preview__chrome">
        <span className="preview__dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="preview__title">
          Previewing <b>{mascot.label}</b>
        </span>
        <button className="pill" onClick={newTab} disabled={tabs.length >= MAX_TABS}>
          + Tab
        </button>
      </div>

      <div
        className="preview__body"
        ref={bodyRef}
        onPointerDown={(e) => {
          if (menu && !(e.target as Element).closest(".pmenu, .preview__mascot")) setMenu(false);
        }}
      >
        <div className="preview__strip">
          <AnimatePresence initial={false}>
            {tabs.map((t) => (
              <motion.div
                key={t.id}
                layout
                ref={(el) => void (el ? tabEls.current.set(t.id, el) : tabEls.current.delete(t.id))}
                className={`ptab ${t.id === activeId ? "is-active" : ""}`}
                onClick={() => !busy.current && setActiveId(t.id)}
                initial={{ opacity: 0, y: 6 }}
                animate={
                  eatingId === t.id
                    ? { opacity: 0, scaleX: 0.15, scaleY: 0.3, rotate: -10, transition: { duration: 0.25 } }
                    : { opacity: 1, y: 0, scaleX: 1, scaleY: 1, rotate: 0 }
                }
                exit={{ opacity: 0, transition: { duration: 0 } }}
                style={{ originX: 1 }}
              >
                <span className="ptab__title">{t.title}</span>
                <button
                  ref={(el) => void (el ? xEls.current.set(t.id, el) : xEls.current.delete(t.id))}
                  className="ptab__x"
                  aria-label={`Close ${t.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    close(t.id);
                  }}
                >
                  ×
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="preview__page">
          <div className="sk sk--title" />
          <div className="sk" style={{ width: "88%" }} />
          <div className="sk" style={{ width: "64%" }} />
          <p className="preview__hint">
            Click <b>×</b> to feed {mascot.label} · right-click {mascot.label} to switch
          </p>
        </div>

        <motion.div
          className="preview__mascot"
          style={{ x, y, width: g.W, height: g.H }}
          onClick={pet}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu((m) => !m);
          }}
          title={`${mascot.label}: click to pet, right-click to switch`}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mascot.id}
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.2, opacity: 0, transition: { duration: 0.1 } }}
              transition={{ type: "spring", stiffness: 520, damping: 20 }}
              style={{ originY: 1 }}
            >
              <MascotRig m={mascot} width={g.W} mouth={mouth} sleepy={false} happy={happy} worried={worried} blinkTick={blink} />
            </motion.div>
          </AnimatePresence>
          <AnimatePresence>
            {bubble && !menu && (
              <motion.div
                key={bubble.id}
                className="preview__bubble"
                initial={{ opacity: 0, scale: 0.5, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ type: "spring", stiffness: 520, damping: 22 }}
              >
                {bubble.text}
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {menu && (
              <motion.div
                className={`pmenu ${x.get() > (bodyRef.current?.clientWidth ?? 0) / 2 ? "pmenu--end" : ""}`}
                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 520, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
              >
                <div className="pmenu__row">
                  {MASCOTS.map((m) => (
                    <button
                      key={m.id}
                      className={m.id === mascot.id ? "is-active" : ""}
                      style={{ ["--c" as string]: m.accent }}
                      onClick={() => {
                        onPick(m.id);
                        setMenu(false);
                      }}
                      aria-label={m.label}
                    >
                      <img src={m.src} alt="" />
                    </button>
                  ))}
                </div>
                <div className="pmenu__stat">
                  Tabs eaten <b>{eaten}</b>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <div className="preview__stats">
          <span className="stat">
            Tabs eaten <b>{eaten}</b>
          </span>
          <span className={`status ${worried ? "status--worried" : ""}`}>
            <i /> {worried ? "Stuffed" : "Happy"} · {tabs.length} tabs
          </span>
        </div>
      </div>
    </div>
  );
}
