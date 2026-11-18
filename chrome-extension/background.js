// Tab Muncher Bridge — streams tab activity to the desktop app over ws://127.0.0.1.
//
// Privacy: only tab ids, order, pinned/active flags and window bounds are sent. No URLs or titles
// (the extension doesn't even request the "tabs" permission), and only to localhost.

const PORT = 17345; // must match src-tauri/src/bridge.rs
const URL = `ws://127.0.0.1:${PORT}`;
const KEEPALIVE_MS = 20_000; // < 30s so Chrome keeps this service worker alive while connected
const SNAPSHOT_DEBOUNCE_MS = 40;

let ws = null;
let keepalive = null;
let retryMs = 1_000;
let retryTimer = null;
let snapshotTimer = null;

/* ---------------------------------------------------------------- connection */

function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
  clearTimeout(retryTimer);
  try {
    ws = new WebSocket(URL);
  } catch {
    scheduleReconnect();
    return;
  }
  ws.onopen = () => {
    retryMs = 1_000;
    send({ type: "hello", version: chrome.runtime.getManifest().version });
    sendSnapshot();
    clearInterval(keepalive);
    keepalive = setInterval(() => send({ type: "ping" }), KEEPALIVE_MS);
  };
  ws.onmessage = (e) => {
    try {
      if (JSON.parse(e.data).type === "resync") sendSnapshot();
    } catch {
      /* ignore */
    }
  };
  ws.onclose = () => {
    clearInterval(keepalive);
    ws = null;
    scheduleReconnect();
  };
  ws.onerror = () => {
    /* onclose follows */
  };
}

function scheduleReconnect() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(connect, retryMs);
  retryMs = Math.min(retryMs * 2, 15_000);
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

/* ---------------------------------------------------------------- snapshots */

async function buildSnapshot() {
  const wins = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const focused = wins.find((w) => w.focused);
  return {
    type: "snapshot",
    ts: Date.now(),
    focusedWindowId: focused ? focused.id : -1,
    windows: wins.map((w) => ({
      id: w.id,
      left: w.left,
      top: w.top,
      width: w.width,
      height: w.height,
      state: w.state,
      focused: w.focused,
      tabs: (w.tabs || []).map((t) => ({ id: t.id, index: t.index, active: t.active, pinned: t.pinned })),
    })),
  };
}

async function sendSnapshot() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    send(await buildSnapshot());
  } catch (e) {
    console.warn("[tab-muncher] snapshot failed", e);
  }
}

/** Coalesce bursts (e.g. focus NONE → id when switching windows, tab drag reorders). */
function queueSnapshot() {
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(sendSnapshot, SNAPSHOT_DEBOUNCE_MS);
}

/* ---------------------------------------------------------------- tab + window events */

chrome.tabs.onCreated.addListener((tab) => {
  send({ type: "tab-created", tabId: tab.id, windowId: tab.windowId, index: tab.index, active: tab.active });
  queueSnapshot();
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  send({ type: "tab-activated", tabId, windowId });
  queueSnapshot();
});

chrome.tabs.onUpdated.addListener((_tabId, change) => {
  // Only layout-relevant changes; title/favicon/loading updates are ignored.
  if ("pinned" in change || "groupId" in change) queueSnapshot();
});

// Sent immediately (not debounced) so the app still has the pre-removal layout to aim at.
chrome.tabs.onRemoved.addListener((tabId, { windowId, isWindowClosing }) => {
  send({ type: "tab-removed", tabId, windowId, isWindowClosing });
  queueSnapshot();
});

chrome.tabs.onMoved.addListener(queueSnapshot);
chrome.tabs.onAttached.addListener(queueSnapshot);
chrome.tabs.onDetached.addListener(queueSnapshot);
chrome.windows.onCreated.addListener(queueSnapshot);
chrome.windows.onRemoved.addListener(queueSnapshot);
chrome.windows.onFocusChanged.addListener(queueSnapshot);
chrome.windows.onBoundsChanged.addListener(queueSnapshot);

/* ---------------------------------------------------------------- lifecycle */

// If the desktop app isn't running, the worker may be suspended between retries;
// this alarm wakes it up to try again.
chrome.alarms.create("tab-muncher-reconnect", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "tab-muncher-reconnect") connect();
});

chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
connect();
