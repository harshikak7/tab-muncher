import { useCallback, useEffect, useId, useRef } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type MotionValue } from "framer-motion";
import type { Mascot, RigEye } from "../mascots/data";

function Eye({ e, i, uid, lid }: { e: RigEye; i: number; uid: string; lid: MotionValue<number> }) {
  const h = useTransform(lid, (v) => v * e.ry * 2.06);
  const lashY = useTransform(lid, (v) => e.cy - e.ry * 1.03 + v * e.ry * 2.06);
  const lashOp = useTransform(lid, (v) => (v > 0.08 ? 1 : 0));
  const cid = `eye${uid}${i}`;
  return (
    <g>
      <clipPath id={cid}>
        <ellipse cx={e.cx} cy={e.cy} rx={e.rx * 1.03} ry={e.ry * 1.03} />
      </clipPath>
      <g clipPath={`url(#${cid})`}>
        <motion.rect x={e.cx - e.rx * 1.1} y={e.cy - e.ry * 1.03} width={e.rx * 2.2} height={h} fill={e.lid} />
        <motion.line
          x1={e.cx - e.rx * 1.1}
          x2={e.cx + e.rx * 1.1}
          y1={lashY}
          y2={lashY}
          stroke="rgba(35,15,20,.55)"
          strokeWidth={e.rx * 0.1}
          strokeLinecap="round"
          style={{ opacity: lashOp }}
        />
      </g>
    </g>
  );
}

export interface MascotRigProps {
  m: Mascot;
  width: number;
  /** 0 = closed, 1 = wide open */
  mouth: MotionValue<number>;
  sleepy: boolean;
  happy: boolean;
  worried: boolean;
  /** bump to force a blink */
  blinkTick: number;
  showRig?: boolean;
}

/** SVG rig: the art plus animated eyelids, jaw/tongue/teeth, blush, worried brows and sweat. */
export function MascotRig({ m, width, mouth, sleepy, happy, worried, blinkTick, showRig = false }: MascotRigProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [bx, by, bw, bh] = m.bbox;
  const height = (width * bh) / bw;

  /* eyelids */
  const lid = useMotionValue(0);
  const base = sleepy ? 0.6 : happy ? 0.12 : 0;
  const baseRef = useRef(base);
  baseRef.current = base;
  useEffect(() => {
    const c = animate(lid, base, { duration: 0.45 });
    return () => c.stop();
  }, [base, lid]);
  const blink = useCallback(() => {
    animate(lid, 1, { duration: 0.06, onComplete: () => void animate(lid, baseRef.current, { duration: 0.13, delay: 0.04 }) });
  }, [lid]);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(
        () => {
          blink();
          if (Math.random() < 0.25) setTimeout(blink, 260);
          loop();
        },
        sleepy ? 4500 + Math.random() * 4000 : 2000 + Math.random() * 3800,
      );
    };
    loop();
    return () => clearTimeout(t);
  }, [sleepy, blink]);
  useEffect(() => {
    if (blinkTick) blink();
  }, [blinkTick, blink]);

  /* jaw */
  const drop = useTransform(mouth, (v) => v * m.jaw * 0.45);
  const tongueY = useTransform(drop, (d) => m.lipY + d * 0.95);
  const cx = m.lipCx;
  const taper = (p: [number, number], depth: number, f: number): [number, number] => [cx + (p[0] - cx) * f, p[1] + depth];
  const rev = [...m.lip].reverse();
  const pts = (arr: [number, number][]) => arr.map((p) => p.join(",")).join(" ");
  const cavity = pts([...m.lip, ...rev.map((p) => taper(p, m.jaw * 0.5, 0.68))]);
  const chin = pts([...m.lip, ...rev.map((p) => taper(p, m.jaw, 0.55))]);
  const lipMinX = Math.min(...m.lip.map((p) => p[0]));
  const lipW = Math.max(...m.lip.map((p) => p[0])) - lipMinX;
  const lipAt = (fx: number): [number, number] => {
    const x = lipMinX + lipW * fx;
    for (let i = 0; i < m.lip.length - 1; i++) {
      const [a, b] = [m.lip[i], m.lip[i + 1]];
      if (x >= a[0] && x <= b[0]) return [x, a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1])];
    }
    return [x, m.lipY];
  };
  const toothW = Math.max(lipW * 0.09, 18);
  const toothH = m.jaw * 0.2;
  const teeth = [0.32, 0.68].map(lipAt);

  /* face helpers */
  const eyesMidX =
    m.eyes.length > 1 ? m.eyes.reduce((a, e) => a + e.cx, 0) / m.eyes.length : m.facing === "left" ? -1e4 : 1e4;
  const bigR = Math.max(...m.eyes.map((e) => e.rx));
  const outer = m.eyes.reduce((a, e) => (Math.abs(e.cx - m.lipCx) > Math.abs(a.cx - m.lipCx) ? e : a), m.eyes[0]);
  const dropX = outer.cx + Math.sign(outer.cx - m.lipCx || 1) * outer.rx * 1.25;
  const dropY = Math.min(...m.eyes.map((e) => e.cy)) - outer.ry * 0.9;
  const r = bigR * 0.42;

  return (
    <svg width={width} height={height} viewBox={`${bx} ${by} ${bw} ${bh}`} style={{ overflow: "visible", display: "block" }}>
      <defs>
        <mask id={`a${uid}`} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x={bx} y={by} width={bw} height={bh}>
          <image href={m.src} x={bx} y={by} width={bw} height={bh} />
        </mask>
        <linearGradient id={`cg${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1={m.lipTop} x2="0" y2={m.lipBottom + m.jaw}>
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.6" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id={`c${uid}`} maskUnits="userSpaceOnUse" x={bx} y={by} width={bw} height={bh + m.jaw}>
          <polygon points={chin} fill={`url(#cg${uid})`} />
        </mask>
        <clipPath id={`k${uid}`}>
          <polygon points={cavity} />
        </clipPath>
        <linearGradient id={`kg${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a0a16" />
          <stop offset="1" stopColor="#5b1a2c" />
        </linearGradient>
      </defs>

      <image href={m.src} x={bx} y={by} width={bw} height={bh} />

      {/* mouth cavity, tongue, teeth (hidden under the chin when closed) */}
      <g mask={`url(#a${uid})`}>
        <polygon points={cavity} fill={`url(#kg${uid})`} />
        <g clipPath={`url(#k${uid})`}>
          <motion.ellipse cx={cx} cy={tongueY} rx={lipW * 0.24} ry={m.jaw * 0.2} fill={m.tongue} />
        </g>
        {teeth.map(([tx, ty], i) => (
          <path key={i} d={`M${tx - toothW / 2},${ty - 3} L${tx + toothW / 2},${ty - 3} L${tx},${ty + toothH} Z`} fill="#fffaf0" />
        ))}
      </g>
      {/* lower jaw: a copy of the art below the lip line that drops down */}
      <motion.g style={{ y: drop }}>
        <g mask={`url(#c${uid})`}>
          <image href={m.src} x={bx} y={by} width={bw} height={bh} />
        </g>
      </motion.g>

      {/* eyelids + blush stay inside the silhouette */}
      <g mask={`url(#a${uid})`}>
        {m.eyes.map((e, i) => (
          <Eye key={i} e={e} i={i} uid={uid} lid={lid} />
        ))}
        <AnimatePresence>
          {happy &&
            m.eyes.map((e, i) => {
              const out = m.eyes.length > 1 ? Math.sign(e.cx - eyesMidX) : 0;
              return (
                <motion.ellipse
                  key={"b" + i}
                  cx={e.cx + out * e.rx * 0.35}
                  cy={e.cy + e.ry * 1.35}
                  rx={e.rx * 0.75}
                  ry={e.ry * 0.38}
                  fill="#ff5f8f"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.5 }}
                  exit={{ opacity: 0 }}
                />
              );
            })}
        </AnimatePresence>
      </g>

      {/* worried brows + sweat */}
      <AnimatePresence>
        {worried &&
          m.eyes.map((e, i) => {
            const dir = Math.sign(eyesMidX - e.cx) || 1;
            const half = e.rx * 0.8;
            const yb = e.cy - e.ry * 1.42;
            const ix = e.cx + dir * half;
            const ox = e.cx - dir * half;
            const d = `M${ox},${yb + e.ry * 0.12} Q${e.cx},${yb - e.ry * 0.18} ${ix},${yb - e.ry * 0.32}`;
            return (
              <motion.path
                key={"w" + i}
                d={d}
                fill="none"
                stroke={m.brow || "#2b1414"}
                strokeWidth={e.rx * 0.17}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              />
            );
          })}
        {worried && (
          <g key="sweat" transform={`translate(${dropX},${dropY})`}>
            <motion.path
              d={`M0,${-r * 1.5} C${r},${-r * 0.2} ${r},${r} 0,${r} C${-r},${r} ${-r},${-r * 0.2} 0,${-r * 1.5}Z`}
              fill="#9fe1ff"
              stroke="#fff"
              strokeWidth={r * 0.18}
              initial={{ opacity: 0, y: -r }}
              animate={{ opacity: [0, 1, 1, 0], y: [-r, 0, r * 1.2, r * 2.4] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeIn" }}
            />
          </g>
        )}
      </AnimatePresence>

      {showRig && (
        <g fill="none" strokeWidth={6} pointerEvents="none">
          {m.eyes.map((e, i) => (
            <ellipse key={i} cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} stroke="#ff00d4" />
          ))}
          <polyline points={pts(m.lip)} stroke="#00e676" />
          <polygon points={chin} stroke="#ffd600" strokeDasharray="14 10" />
          <circle cx={m.lipCx} cy={m.lipY + m.jaw * 0.22} r={14} fill="#ff1744" stroke="#fff" />
          <rect x={bx} y={by} width={bw} height={bh} stroke="#2979ff" strokeDasharray="20 14" />
        </g>
      )}
    </svg>
  );
}
