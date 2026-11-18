import { useState, type CSSProperties } from "react";
import { MASCOTS, byId, type Mascot, type MascotId } from "../src/mascots/data";
import { mix } from "../src/engine/util";
import { Preview } from "./Preview";
import { EXTENSION_FOLDER, LINKS } from "./release";

const BLURBS: Record<MascotId, string> = {
  salamander: "Quiet type. Never forgets a tab.",
  narwhal: "Cheerful. Waves at every close.",
  iguana: "Calm. Judges your tabs silently.",
  "hermit-crab": "Hoards tabs, then lets go.",
  "baby-dragon": "Tiny, warm, always a little hungry.",
};

const FEATURES = [
  ["🍽️", "Eats closed tabs", "Darts over and chomps every tab you close, staying small near the tab bar."],
  ["📌", "Perches on your tab", "Sits beside the active tab’s × and follows you between tabs and windows."],
  ["😵‍💫", "Hates hoarding", "Starts sweating at 8+ open tabs and calms down when you close a few."],
  ["🔢", "Counts every snack", "Keeps a tabs-eaten total in its right-click menu and the tray icon."],
  ["🎨", "Yours to pick", "Choose a mascot on first launch. Right-click it or use the tray to switch."],
  ["💤", "Never in the way", "Wanders a little when idle, then naps. Clicks pass straight through."],
] as const;

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Page palette derived from the selected mascot: soft surfaces from its background, accents from its colour. */
function themeFor(m: Mascot): CSSProperties {
  const accentInk = luminance(m.accent) > 0.45 ? mix(m.accent, "#000000", 0.35) : m.accent;
  return {
    ["--tint" as string]: m.bgTint,
    ["--on-tint" as string]: luminance(m.bgTint) < 0.45 ? "#ffffff" : "#1e1b3a",
    ["--accent" as string]: m.accent,
    ["--accent-ink" as string]: accentInk,
    // filled buttons carry white text, so always darken enough for contrast
    ["--accent-strong" as string]: mix(m.accent, "#000000", luminance(m.accent) > 0.3 ? 0.3 : 0.1),
    ["--bg" as string]: mix(m.bgTint, "#f5f4fb", 0.9),
    ["--soft" as string]: mix(m.bgTint, "#ffffff", 0.84),
    ["--softer" as string]: mix(m.bgTint, "#ffffff", 0.93),
  };
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn btn--ghost btn--xs"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          },
          () => {},
        )
      }
    >
      {done ? "Copied ✓" : `Copy ${text}`}
    </button>
  );
}

export function Landing() {
  const [pickId, setPickId] = useState<MascotId>("iguana");
  const mascot = byId[pickId];

  return (
    <div className="page" style={themeFor(mascot)}>
      <div className="wrap">
        <header className="nav">
          <a className="brand" href="#top">
            <span className="brand__icon">
              <img src={mascot.src} alt="" />
            </span>
            Tab Muncher
          </a>
          <a className="btn btn--dark btn--xs" href="#install">
            Download
          </a>
        </header>

        <main id="top">
          {/* ---------- hero: headline + downloads | live preview */}
          <section className="hero">
            <div className="hero__copy">
              <span className="eyebrow">Desktop pet for Windows + Chrome</span>
              <h1>
                Close a tab.
                <br />
                Feed your pet.
              </h1>
              <p>
                Tab Muncher puts a tiny mascot on top of your Chrome tabs. It chomps every tab you close, counts them, and gets nervous when you
                hoard too many.
              </p>
              <div className="dl">
                <a className="btn btn--dark" href={LINKS.exe}>
                  <span className="btn__icon">⊞</span>
                  <span>
                    Windows Installer
                    <small>.exe · Windows 10/11</small>
                  </span>
                </a>
                <a className="btn btn--light" href={LINKS.extension}>
                  <span className="btn__icon">🧩</span>
                  <span>
                    Chrome Extension
                    <small>.zip · load unpacked</small>
                  </span>
                </a>
              </div>
              <p className="fineprint">
                Free. Prefer an MSI? <a href={LINKS.msi}>Download the .msi</a> · <a href={LINKS.releases}>All files on GitHub Releases</a>
              </p>
            </div>
            <Preview mascot={mascot} onPick={setPickId} />
          </section>

          {/* ---------- mascot selector (drives the preview above) */}
          <section className="picker" aria-labelledby="picker-title">
            <div className="picker__head">
              <h2 id="picker-title">Pick your mascot</h2>
              <span className="picker__hint">
                <span className="picker__arrow" aria-hidden>
                  ↑
                </span>
                Click a mascot to preview it above
              </span>
            </div>
            <div className="picker__row" role="radiogroup" aria-label="Mascot">
              {MASCOTS.map((m) => {
                const active = m.id === pickId;
                return (
                  <button
                    key={m.id}
                    role="radio"
                    aria-checked={active}
                    className={`chip ${active ? "is-active" : ""}`}
                    style={{ ["--c" as string]: m.bgTint, ["--c-ink" as string]: luminance(m.bgTint) < 0.45 ? "#fff" : "#1e1b3a" }}
                    onClick={() => setPickId(m.id)}
                  >
                    <span className="chip__art">
                      <img src={m.src} alt="" />
                    </span>
                    <span className="chip__text">
                      <b>{m.label}</b>
                      <small>{m.full}</small>
                    </span>
                    {active && <span className="chip__check">✓</span>}
                  </button>
                );
              })}
            </div>
            <p className="picker__blurb">
              <b>{mascot.label}:</b> {BLURBS[pickId]} In the app you pick on first launch, then right-click it or use the tray icon to switch.
            </p>
          </section>

          {/* ---------- what it does */}
          <section className="features" aria-label="Features">
            {FEATURES.map(([icon, title, text]) => (
              <div className="feature" key={title}>
                <span className="feature__icon" aria-hidden>
                  {icon}
                </span>
                <div>
                  <b>{title}</b>
                  <span>{text}</span>
                </div>
              </div>
            ))}
          </section>

          {/* ---------- install */}
          <section className="install" id="install">
            <div className="install__head">
              <div>
                <h2>Set up in 4 steps</h2>
                <p>Both downloads come from the latest GitHub Release.</p>
              </div>
              <div className="install__dl">
                <a className="btn btn--dark btn--sm" href={LINKS.exe}>
                  Windows Installer (.exe)
                </a>
                <a className="btn btn--light btn--sm" href={LINKS.extension}>
                  Chrome Extension (.zip)
                </a>
              </div>
            </div>
            <ol className="steps">
              <li className="step">
                <span className="step__n">1</span>
                <h3>Install the app</h3>
                <p>
                  Download and run the <b>Windows Installer</b> from the GitHub Release. If SmartScreen appears, choose <b>More info → Run anyway</b>.
                </p>
                <div className="step__act">
                  <a className="btn btn--ghost btn--xs" href={LINKS.exe}>
                    .exe
                  </a>
                  <a className="btn btn--ghost btn--xs" href={LINKS.msi}>
                    .msi
                  </a>
                </div>
              </li>
              <li className="step">
                <span className="step__n">2</span>
                <h3>Get the extension</h3>
                <p>
                  Download the <b>Chrome Extension .zip</b> from the GitHub Release and extract it. Keep the folder somewhere permanent.
                </p>
                <div className="step__act">
                  <a className="btn btn--ghost btn--xs" href={LINKS.extension}>
                    .zip
                  </a>
                  <span className="mono">→ {EXTENSION_FOLDER}/</span>
                </div>
              </li>
              <li className="step">
                <span className="step__n">3</span>
                <h3>Load it unpacked</h3>
                <p>
                  Open <b>chrome://extensions</b>, turn on <b>Developer mode</b>, click <b>Load unpacked</b> and select the extracted folder.
                </p>
                <div className="step__act">
                  <CopyButton text="chrome://extensions" />
                </div>
              </li>
              <li className="step">
                <span className="step__n">4</span>
                <h3>Feed it tabs</h3>
                <p>
                  Choose your mascot on first launch, then open and close tabs in Chrome. <b>Right-click</b> your pet (or use the tray icon) to
                  switch anytime.
                </p>
                <div className="step__act">
                  <span className="kbd">Right-click</span>
                  <span className="mono">→ switch · stats</span>
                </div>
              </li>
            </ol>
          </section>
        </main>

        <footer className="footer">
          <p>
            Tab Muncher runs entirely on your computer. The extension only shares tab order and window positions with the app on your PC, never
            URLs or page titles.
          </p>
          <a href={LINKS.repo}>Source on GitHub</a>
        </footer>
      </div>
    </div>
  );
}
