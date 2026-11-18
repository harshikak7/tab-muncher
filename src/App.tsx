import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Overlay, type OverlayApi } from "./components/Overlay";
import { Welcome } from "./components/Welcome";
import { byId, isMascotId } from "./mascots/data";
import { DEFAULT_SETTINGS, loadPrefs, savePrefs, type Prefs } from "./engine/settings";
import type { Origin } from "./bridge/geometry";
import "./App.css";

type TrayAction = { kind: "mascot"; id: string } | { kind: "roam"; value: boolean } | { kind: "reset" };

/** Where this overlay's top-left sits in Chrome's DIP screen space (0,0 on a standard primary monitor). */
function useOverlayOrigin(): Origin {
  const [origin, setOrigin] = useState<Origin>({ x: 0, y: 0 });
  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    const refresh = async () => {
      const [pos, scale] = await Promise.all([win.innerPosition(), win.scaleFactor()]);
      setOrigin({ x: pos.x / scale, y: pos.y / scale });
    };
    refresh().catch(() => {});
    window.addEventListener("resize", refresh);
    return () => window.removeEventListener("resize", refresh);
  }, []);
  return origin;
}

export default function App() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const api = useRef<OverlayApi | null>(null);
  const origin = useOverlayOrigin();
  const settings = { ...DEFAULT_SETTINGS, autoRoam: prefs.autoRoam };
  const update = (patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch }));

  useEffect(() => {
    savePrefs(prefs);
    if (isTauri())
      invoke("sync_tray", { mascot: prefs.mascotId, roam: prefs.autoRoam, eaten: prefs.tabsEaten }).catch(() => {});
  }, [prefs]);

  useEffect(() => {
    if (!isTauri()) return;
    const off = listen<TrayAction>("tray-action", ({ payload: a }) => {
      if (a.kind === "mascot" && isMascotId(a.id)) update({ mascotId: a.id });
      else if (a.kind === "roam") update({ autoRoam: a.value });
      else if (a.kind === "reset") api.current?.reset();
    });
    return () => {
      off.then((f) => f());
    };
  }, []);

  return (
    <>
      <Overlay
        mascot={byId[prefs.mascotId]}
        settings={settings}
        origin={origin}
        apiRef={api}
        tabsEaten={prefs.tabsEaten}
        onTabEaten={() => setPrefs((p) => ({ ...p, tabsEaten: p.tabsEaten + 1 }))}
        onPickMascot={(id) => update({ mascotId: id })}
        onToggleRoam={() => update({ autoRoam: !prefs.autoRoam })}
      />
      <AnimatePresence>
        {!prefs.onboarded && (
          <Welcome current={prefs.mascotId} onPick={(id) => update({ mascotId: id })} onDone={() => update({ onboarded: true })} />
        )}
      </AnimatePresence>
    </>
  );
}
