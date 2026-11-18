// Messages streamed by chrome-extension/background.js → Rust WebSocket server → "tab-event".

export interface ChromeTab {
  id: number;
  index: number;
  active: boolean;
  pinned: boolean;
}

export interface ChromeWindow {
  id: number;
  /** Bounds in Chrome DIPs (screen coordinates divided by the display scale). */
  left: number;
  top: number;
  width: number;
  height: number;
  state: "normal" | "minimized" | "maximized" | "fullscreen" | "locked-fullscreen";
  focused: boolean;
  tabs: ChromeTab[];
}

export interface Snapshot {
  type: "snapshot";
  ts: number;
  /** -1 when no Chrome window has OS focus */
  focusedWindowId: number;
  windows: ChromeWindow[];
}

export interface TabCreated {
  type: "tab-created";
  tabId: number;
  windowId: number;
  index: number;
  active: boolean;
}

export interface TabRemoved {
  type: "tab-removed";
  tabId: number;
  windowId: number;
  isWindowClosing: boolean;
}

export interface TabActivated {
  type: "tab-activated";
  tabId: number;
  windowId: number;
}

export type BrowserEvent = Snapshot | TabCreated | TabRemoved | TabActivated | { type: "hello"; version: string };

export interface BridgeStatus {
  listening: boolean;
  clients: number;
  port: number;
  error?: string;
}
