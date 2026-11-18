import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { BridgeStatus, BrowserEvent, Snapshot, TabCreated, TabRemoved } from "./types";

export interface BridgeHandlers {
  /** Fires before the post-removal snapshot is applied; `prev` still contains the closed tab. */
  onRemoved?: (ev: TabRemoved, prev: Snapshot | null) => void;
  onCreated?: (ev: TabCreated) => void;
}

/** How long Chrome may be unfocused before the mascot gives up its perch (avoids flicker on alt-tab / clicking the mascot). */
const BLUR_GRACE_MS = 1200;

export function useBrowserBridge(handlers: BridgeHandlers) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const snapRef = useRef<Snapshot | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    const unsubs: Promise<() => void>[] = [];

    const apply = (s: Snapshot) => {
      snapRef.current = s;
      setSnapshot(s);
    };

    unsubs.push(
      listen<BrowserEvent>("tab-event", ({ payload: ev }) => {
        if (ev.type === "snapshot") apply(ev);
        else if (ev.type === "tab-removed") handlersRef.current.onRemoved?.(ev, snapRef.current);
        else if (ev.type === "tab-created") handlersRef.current.onCreated?.(ev);
      }),
      listen<BridgeStatus>("bridge-status", ({ payload }) => {
        setStatus(payload);
        if (payload.clients === 0) apply({ type: "snapshot", ts: Date.now(), focusedWindowId: -1, windows: [] });
      }),
    );

    // Catch up on anything that arrived before this listener was attached.
    invoke<{ status: BridgeStatus; snapshot: Snapshot | null }>("bridge_state")
      .then((r) => {
        if (!alive) return;
        setStatus(r.status);
        if (r.snapshot && !snapRef.current) apply(r.snapshot);
      })
      .catch(() => {});

    return () => {
      alive = false;
      unsubs.forEach((p) => p.then((off) => off()));
    };
  }, []);

  /* Which Chrome window the mascot should perch on (sticky through short focus blips). */
  const [perchWindowId, setPerchWindowId] = useState<number | null>(null);
  useEffect(() => {
    const focused = snapshot?.focusedWindowId ?? -1;
    if (focused !== -1) {
      setPerchWindowId(focused);
      return;
    }
    if (!snapshot || snapshot.windows.length === 0) {
      setPerchWindowId(null);
      return;
    }
    // Chrome lost focus. If it went to the overlay itself (user clicked the mascot), keep perching.
    const check = () => {
      if (!document.hasFocus()) setPerchWindowId(null);
    };
    const t = setTimeout(check, BLUR_GRACE_MS);
    window.addEventListener("blur", check);
    return () => {
      clearTimeout(t);
      window.removeEventListener("blur", check);
    };
  }, [snapshot]);

  const perchWindow = snapshot?.windows.find((w) => w.id === perchWindowId) ?? null;
  const totalTabs = snapshot ? snapshot.windows.reduce((n, w) => n + w.tabs.length, 0) : 0;

  return { snapshot, status, perchWindow, totalTabs, connected: (status?.clients ?? 0) > 0 };
}
