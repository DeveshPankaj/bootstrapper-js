import { draggable } from "@shared/draggable";
import { Command, Platform } from "@shared/index";
import { removeRecursive, readJsonFile, writeJsonFile, ensureDir } from "@shared/fs-utils";
import { PROC_DIR, WINDOW_MANAGER_MODULE_PATH, WM_CURRENT_PATH, WM_DIR } from "@shared/constants";
import { BehaviorSubject, Subject } from "rxjs";
import { ProcessManager } from "../platform/process-manager";
import { ProxyFS } from "../platform/proxy-fs";
import { WindowManager as Wm2 } from "../system/window-manager";
import { LayoutManager } from "../system/layout-manager";
import { getSystemModule, preloadSystemModule } from "../system/static-code";
const platform = Platform.getInstance();

export const WINDOWS_CONTAINER_CLASS = "windows";
export const DESKTOP_CONTAINER_CLASS = "desktop";

// ── Window chrome input checks (audit WIN-5) ─────────────────────────────────
// Titles, icons, header styles and geometry come from apps and from command
// metadata (often derived from file names). They are applied to the top
// document only as text, as allowlisted style properties, or as clamped numbers.

// Icons are Material Symbols ligature names, rendered as text. Anything else
// (markup, entities, long strings) is replaced by `fallback`.
export const ICON_NAME_RE = /^[a-z0-9_]+$/;
export const safeIconName = (icon: unknown, fallback = ""): string =>
  typeof icon === "string" && icon.length <= 64 && ICON_NAME_RE.test(icon) ? icon : fallback;

const MAX_TITLE_LENGTH = 1024;
const toTitleText = (title: unknown): string => String(title ?? "").slice(0, MAX_TITLE_LENGTH);

// Header styles: the properties apps actually set (colours, shadow, borders),
// as CSSOM names or CSS names. Values are short, made of a conservative
// character set (no quotes, backslashes, ';', ':', '!', braces) and may only
// call colour/gradient functions — so no url(), image-set(), expression().
const HEADER_STYLE_PROPERTIES: Readonly<Record<string, string>> = Object.freeze({
  background: "background", backgroundColor: "background-color", "background-color": "background-color",
  color: "color", boxShadow: "box-shadow", "box-shadow": "box-shadow",
  border: "border", borderColor: "border-color", "border-color": "border-color",
  borderBottom: "border-bottom", "border-bottom": "border-bottom",
  borderTop: "border-top", "border-top": "border-top",
  opacity: "opacity", fontWeight: "font-weight", "font-weight": "font-weight",
});
const HEADER_STYLE_VALUE_RE = /^[a-zA-Z0-9#%(),./\s-]*$/;
const HEADER_STYLE_FUNCTIONS = new Set([
  "rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color-mix", "var", "calc",
  "linear-gradient", "radial-gradient", "conic-gradient",
  "repeating-linear-gradient", "repeating-radial-gradient", "repeating-conic-gradient",
]);
const MAX_HEADER_STYLE_VALUE = 200;
const MAX_HEADER_STYLE_KEYS = 16;

export const sanitizeHeaderStyles = (styles: unknown): Array<[string, string]> => {
  if (!styles || typeof styles !== "object" || Array.isArray(styles)) return [];
  const out: Array<[string, string]> = [];
  for (const [key, raw] of Object.entries(styles as Record<string, unknown>).slice(0, MAX_HEADER_STYLE_KEYS)) {
    const property = Object.prototype.hasOwnProperty.call(HEADER_STYLE_PROPERTIES, key) ? HEADER_STYLE_PROPERTIES[key] : undefined;
    if (!property) continue;
    const value = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : raw;
    if (typeof value !== "string" || value.length > MAX_HEADER_STYLE_VALUE || !HEADER_STYLE_VALUE_RE.test(value)) continue;
    const functions = Array.from(value.matchAll(/([a-zA-Z-]+)\s*\(/g), m => m[1].toLowerCase());
    if (functions.some(name => !HEADER_STYLE_FUNCTIONS.has(name))) continue;
    out.push([property, value]);
  }
  return out;
};

const applyHeaderStyles = (head: HTMLElement, styles: unknown) => {
  for (const [property, value] of sanitizeHeaderStyles(styles)) {
    if (value === "") head.style.removeProperty(property);
    else head.style.setProperty(property, value);
  }
};

// Geometry: only finite numeric left/top/width/height, in px. Sizes are
// clamped to the viewport; the position keeps the window inside the area it
// is placed in (the viewport, or the scrollable canvas of the canvas WM).
const MIN_WINDOW_WIDTH = 120;
const MIN_WINDOW_HEIGHT = 80;
const clampNumber = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max));

// A window's corner radius as a bounded CSS length — the only style besides
// geometry an app may set through setBoundingClientRect (Settings rounds its
// window). Numbers are px; strings must be a plain number + px/rem/em/%.
const RADIUS_RE = /^(\d{1,3}(?:\.\d{1,3})?)(px|rem|em|%)$/;
const RADIUS_MAX: Record<string, number> = { px: 64, rem: 4, em: 4, "%": 50 };
export const safeBorderRadius = (value: unknown): string | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? `${clampNumber(value, 0, RADIUS_MAX.px)}px` : undefined;
  if (typeof value !== "string") return undefined;
  const m = RADIUS_RE.exec(value.trim());
  if (!m) return undefined;
  return `${Math.min(parseFloat(m[1]), RADIUS_MAX[m[2]])}${m[2]}`;
};

// Window materials an app may ask for with props.setWindowMaterial(name). A fixed
// list mapped to a `material-<name>` class on the window container, styled in
// src/core/layout/styles/window.ts, so an app picks a look but never supplies CSS.
// 'glass' is the spatial (visionOS-like) frosted material used by Settings.
export const WINDOW_MATERIALS: readonly string[] = ['default', 'glass'];

export const clampWindowRect = (
  rect: unknown,
  current: { width: number; height: number },
  viewport: { width: number; height: number },
  area: { width: number; height: number },
): Partial<Record<"left" | "top" | "width" | "height", number>> => {
  if (!rect || typeof rect !== "object") return {};
  const r = rect as Record<string, unknown>;
  const num = (k: string) => (typeof r[k] === "number" && Number.isFinite(r[k] as number) ? (r[k] as number) : undefined);
  const out: Partial<Record<"left" | "top" | "width" | "height", number>> = {};
  const width = num("width"), height = num("height"), left = num("left"), top = num("top");
  if (width !== undefined) out.width = clampNumber(width, MIN_WINDOW_WIDTH, viewport.width);
  if (height !== undefined) out.height = clampNumber(height, MIN_WINDOW_HEIGHT, viewport.height);
  const w = out.width ?? current.width, h = out.height ?? current.height;
  if (left !== undefined) out.left = clampNumber(left, 0, Math.max(area.width, viewport.width) - w);
  if (top !== undefined) out.top = clampNumber(top, 0, Math.max(area.height, viewport.height) - h);
  return out;
};

// Tracks every currently-open window so the taskbar can render an icon per
// running window and show minimize state on hover.
export type TaskbarWindowInfo = {
  pid: number;
  name: string;
  title: string;
  icon: string;
  minimized: boolean;
  active: boolean;
  toggle: () => void;
};

export const windowsSubject = new BehaviorSubject<TaskbarWindowInfo[]>([]);

// Mirror windowsSubject into Ring 2 WindowManager so external consumers
// (task-manager, spotlight, etc.) can subscribe to Wm2.getInstance().windows$.
windowsSubject.subscribe(wins => {
  const wm2 = Wm2.getInstance();
  const current = new Set(wm2.getAll().map(w => w.pid));
  const next = new Set(wins.map(w => w.pid));
  // Unregister closed windows
  for (const pid of current) {
    if (!next.has(pid)) wm2.unregister(pid);
  }
  // Update or register open windows
  for (const w of wins) {
    if (current.has(w.pid)) {
      wm2.updateRecord(w.pid, { title: w.title, minimized: w.minimized, active: w.active });
    } else {
      wm2.register({ pid: w.pid, command: w.name, title: w.title, icon: w.icon, minimized: w.minimized, active: w.active });
    }
  }
});

// One entry per running window/process, keyed by pid. Backs the
// `process.*` commands (kill, send-message, list) so any script - a `/bin`
// command, a widget, the task manager, etc. - can interact with a running
// window by pid alone.
type ProcessEntry = {
  close: () => void;   // SIGTERM: runs callbacks then closes
  kill: () => void;    // SIGKILL: force-closes, no callbacks
  messages$: Subject<unknown>;
  servicePlatformName: string;
  startedAt: number;
  proxyFs?: ProxyFS;   // ACL-scoped VFS proxy for this process
  iframe?: HTMLIFrameElement; // the window's app iframe, for a best-effort memory reading
};
const processRegistry = new Map<number, ProcessEntry>();


const writeProcMeta = (pid: number, meta: Record<string, unknown>) => {
  try {
    writeJsonFile(platform.host.getFS(), `${PROC_DIR}/${pid}/meta.json`, meta, true);
  } catch (err) {
    console.error("Failed to write /proc metadata", err);
  }
};

// Appends an inbox message to `/proc/<pid>/inbox.json` so a process can read
// messages sent to it (e.g. on next tick / poll) even if it wasn't around to
// receive the live `messages$` event.
const appendProcInbox = (pid: number, message: unknown) => {
  try {
    const fs = platform.host.getFS();
    const dir = `${PROC_DIR}/${pid}`;
    if (!fs.existsSync(dir)) return;
    const inboxPath = `${dir}/inbox.json`;
    const inbox: Array<unknown> = readJsonFile<Array<unknown>>(fs, inboxPath, [])!;
    inbox.push({ message, receivedAt: Date.now() });
    while (inbox.length > 50) inbox.shift();
    writeJsonFile(fs, inboxPath, inbox);
  } catch (err) {
    console.error("Failed to write /proc inbox", err);
  }
};

// `window-manager.ts` is bundled both into `remote.bundle.js` (where
// `Platform.getInstance()` resolves to `undefined` at module-eval time,
// since `window.platform` isn't assigned yet) and into `layout.bundle.js`
// (loaded into an iframe whose `window.platform` is already set). Only
// register the `process.*` commands once `platform.host` is actually
// available - lazily, from the `WindowManager` constructor.
let processCommandsRegistered = false;
const registerProcessCommands = () => {
  if (processCommandsRegistered || !platform?.host) return;
  processCommandsRegistered = true;

  // `process.kill(pid)` - sends SIGTERM: runs onDestroy callbacks then closes.
  platform.host.registerCommand("process.kill", (pid: number | string) => {
    processRegistry.get(Number(pid))?.close();
  });

  // `process.sigkill(pid)` - sends SIGKILL: force-closes without any callbacks.
  platform.host.registerCommand("process.sigkill", (pid: number | string) => {
    processRegistry.get(Number(pid))?.kill();
  });

  // `process.send-message(pid, message)` - delivers `message` to the process
  // with the given pid: appended to `/proc/<pid>/inbox.json` for polling, and
  // emitted live to any `onMessage` listener the process registered.
  platform.host.registerCommand("process.send-message", (pid: number | string, message: unknown) => {
    const numericPid = Number(pid);
    appendProcInbox(numericPid, message);
    processRegistry.get(numericPid)?.messages$.next(message);
  });

  // Best-effort per-window memory reading via the non-standard Chrome-only
  // `performance.memory` API on the window's own app iframe (same-origin,
  // so accessible from here). Note this reports the whole renderer's shared
  // JS heap, not a true per-iframe figure - same-origin iframes typically
  // share one process, so it commonly reads the same value for every
  // window. Still useful as a rough "is memory growing" signal; returns
  // `null` when the API isn't available (non-Chromium browsers) or the
  // iframe hasn't loaded far enough to have a contentWindow yet.
  const readWindowMemory = (pid: number): number | null => {
    try {
      const mem = (processRegistry.get(pid)?.iframe?.contentWindow as any)?.performance?.memory;
      return typeof mem?.usedJSHeapSize === 'number' ? mem.usedJSHeapSize : null;
    } catch {
      return null;
    }
  };

  // `process.list()` - returns a snapshot of every running window/process,
  // including uptime and the services its platform has requested so far.
  // Used by `/bin/ps.run` and the task manager app.
  platform.host.registerCommand("process.list", () => {
    return windowsSubject.getValue().map(win => {
      const entry = processRegistry.get(win.pid);
      const proc = entry ? platform.host.getModulePlatform(entry.servicePlatformName) : undefined;
      return {
        pid: win.pid,
        name: win.name,
        title: win.title,
        icon: win.icon,
        minimized: win.minimized,
        active: win.active,
        startedAt: entry?.startedAt ?? Date.now(),
        services: proc ? Array.from(proc.requestedServices) : [],
        memory: readWindowMemory(win.pid),
      };
    });
  });

  // `process.memory(pid)` - the same best-effort reading for a single pid,
  // for callers that don't need a full `process.list()` snapshot.
  platform.host.registerCommand("process.memory", (pid: number | string) => readWindowMemory(Number(pid)));
};

// Per-window behavior (event wiring, snapping) comes from /opt/window-manager.js
// and the optional header/container style from /opt/wm/<id>.js — both run from
// the immutable static copy that ships with the build (decisions.md D1, audit
// WIN-6/BOOT-5); the vfs copies are view-only. Their sources are preloaded at
// layout start and evaluated once, so createWindow stays synchronous; until
// they're available (or if they can't be loaded) the compiled defaults below
// apply.
const FALLBACK_WM_SETTINGS = {
  behavior: {
    dblClickHeaderFullscreen: true,
    bringToFrontOnClick: true,
  },
};

const MANAGERS_CONFIG_PATH = '/etc/managers.json';

// Window-manager styles that ship in docs/public/mount/opt/wm/. The id in
// /etc/managers.json (writable) only selects one of these.
const WM_STYLE_IDS: readonly string[] = ['canvas', 'classic', 'glass', 'minimal', 'tiling', 'ubuntu'];
const SYSTEM_ID_RE = /^[a-z0-9-]+$/;
const wmStylePath = (id: string) => `/opt/wm/${id}.js`;

// The base module and the selected style load now. The other styles load once the
// landing page is up, so a style picked in Settings applies to the very next window.
// (On a repeat visit they come from the hash-verified vfs copies: no requests.)
export const preloadWindowManagerCode = () => {
  if (!platform?.host) return;
  preloadSystemModule(WINDOW_MANAGER_MODULE_PATH);
  const wmId = readWmStyleId();
  if (wmId !== 'default') preloadSystemModule(wmStylePath(wmId));
  const host = platform.host as { whenLandingReady?: () => Promise<void> };
  const preloadRest = () => WM_STYLE_IDS.forEach(id => preloadSystemModule(wmStylePath(id)));
  if (typeof host.whenLandingReady === 'function') host.whenLandingReady().then(preloadRest, preloadRest);
  else preloadRest();
};

const warnedWmIds = new Set<string>();
const readWmStyleId = (): string => {
  let id: unknown = 'default';
  try {
    const fs = platform.host.getFS();
    if (fs.existsSync(MANAGERS_CONFIG_PATH)) {
      id = JSON.parse(fs.readFileSync(MANAGERS_CONFIG_PATH, 'utf-8') as string)?.windowManager ?? 'default';
    }
  } catch (_) {}
  if (typeof id === 'string' && SYSTEM_ID_RE.test(id) && WM_STYLE_IDS.includes(id)) return id;
  if (id !== 'default' && !warnedWmIds.has(String(id))) {
    warnedWmIds.add(String(id));
    console.warn('[wm] /etc/managers.json windowManager is not a shipped style — using the default:', id);
  }
  return 'default';
};

const loadWindowManagerModule = (): any => {
  // Base module: setupWindow, readSettings, snap zones. undefined (still
  // loading) and null (unavailable) both mean "use the compiled defaults".
  const baseModule = getSystemModule(WINDOW_MANAGER_MODULE_PATH) ?? {};
  const wmId = readWmStyleId();
  if (wmId === 'default') return baseModule;
  // Style override (createHeader, optionally createContainer/setupWindow),
  // merged over base: style hooks win, base keeps the rest.
  const wmStyleModule = getSystemModule(wmStylePath(wmId));
  return wmStyleModule ? { ...baseModule, ...wmStyleModule } : baseModule;
};

// Compiled stand-ins for the base module's readSettings/setupWindow.
const readFallbackWmSettings = () => {
  try {
    const raw = JSON.parse(platform.host.getFS().readFileSync(WM_CURRENT_PATH, 'utf-8') as string);
    return { ...raw, behavior: { ...FALLBACK_WM_SETTINGS.behavior, ...raw?.behavior } };
  } catch (_) {
    return FALLBACK_WM_SETTINGS;
  }
};

const fallbackSetupWindow = ({ container, head, settings, toggleFullScreen, moveOnTop }: {
  container: HTMLElement; head: HTMLElement; settings: any; toggleFullScreen: () => void; moveOnTop: () => void;
}) => {
  if (settings?.behavior?.dblClickHeaderFullscreen) {
    head.addEventListener('dblclick', (event) => {
      if ((event.target as Element | null)?.closest?.('.window-action')) return;
      toggleFullScreen();
    });
  }
  if (settings?.behavior?.bringToFrontOnClick) container.addEventListener('mousedown', () => moveOnTop());
};

export class WindowManager {
  private readonly windows: Record<
    string,
    Array<{ container: HTMLDivElement; pid: number }>
  > = {};
  constructor(private contentRef: { current: HTMLDivElement | null }) {
    registerProcessCommands();
    preloadWindowManagerCode();
  }

  public createWindow(command_name: string, ...args: unknown[]) {
    const command: Command = platform.host.getCommand(command_name)!;
    if (!command) {
      throw `Command not found [${command_name}]`;
    }

    // Ring 1: spawn a namespace for this process — assigns pid + ACL
    const ns = ProcessManager.getInstance().spawn(command_name, {
      label: (command.meta?.title as string) || command_name,
    });
    const pid = ns.pid;

    // Build a ProxyFS scoped to this namespace — passed to app loaders via props
    let proxyFs: ProxyFS | undefined;
    try {
      const rawFs = platform.host.getFS();
      proxyFs = new ProxyFS(rawFs, ns);
    } catch (_) {}

    // Resolve the window-manager module once at the top so its hooks
    // (createContainer, createHeader, setupWindow) are all available.
    const wmModule = loadWindowManagerModule();
    const wmSettings = wmModule.readSettings?.() ?? readFallbackWmSettings();

    // --- Module hook: createContainer({ command, settings }) ---
    // Return an HTMLElement to replace the default <div class="window">.
    // Mandatory attributes/classes are still applied by compiled code below.
    // Use nodeType === 1 (ELEMENT_NODE) instead of instanceof HTMLElement so
    // elements created via top.document (a different frame) still match.
    const customContainer = wmModule.createContainer?.({ command, settings: wmSettings });
    const container = (customContainer?.nodeType === 1
      ? customContainer
      : platform.window.document.createElement("div")) as HTMLDivElement;

    container.setAttribute("data-name", command.name);
    container.setAttribute("data-pid", `${pid}`);
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-label", (command.meta.title as string) || command.name);
    container.classList.add("window");
    container.classList.add("hidden");

    // windowRef must exist before closeFunction since closeFunction calls closeWindow(windowRef).
    const windowRef = { container, command, pid };
    this.windows[command.name] ??= [];
    this.windows[command.name].push(windowRef);
    Object.freeze(windowRef);

    // Declare iframe early so emitSignal can close over it before its assignment below.
    let iframe!: HTMLIFrameElement;

    let onCloseCallbacks: Array<Function> = [];
    const signalCallbacks = new Map<string, Array<Function>>();
    const emitSignal = (name: string) => {
      (signalCallbacks.get(name) ?? []).forEach(cb => { try { cb() } catch (_) {} });
      // The window frame is same-origin; pin the target so a document it
      // navigated to elsewhere isn't told (audit KRN-13).
      try { iframe.contentWindow?.postMessage({ type: 'signal', name }, platform.window.location.origin) } catch (_) {}
    };
    // SIGTERM — notifies the app then closes.
    const closeFunction = () => {
      emitSignal('SIGTERM');
      onCloseCallbacks.forEach(cb => { try { cb() } catch (_) {} });
      onCloseCallbacks = [];
      signalCallbacks.clear();
      this.closeWindow(windowRef);
    };
    // SIGKILL — immediate removal, no callbacks or signals.
    const killFunction = () => {
      onCloseCallbacks = [];
      signalCallbacks.clear();
      this.closeWindow(windowRef);
    };
    // Shared minimize/fullscreen callbacks — passed to createHeader and setupWindow.
    const minimizeCallback = () => this.toggleMinimize(windowRef);
    const fullscreenCallback = () => toggleFullScreen(this.contentRef.current!, container);

    // --- Module hook: createHeader({ command, settings, close, minimize, fullscreen }) ---
    // Return an HTMLElement to replace the default header.
    // The callbacks are provided so custom headers can wire their own controls.
    // If null/undefined is returned, the default compiled header is used instead.
    const customHead = wmModule.createHeader?.({
      command,
      settings: wmSettings,
      close: closeFunction,
      minimize: minimizeCallback,
      fullscreen: fullscreenCallback,
    });
    let head: HTMLElement,
        closeButton: HTMLElement | null,
        fullScreenButton: HTMLElement | null,
        minimizeButton: HTMLElement | null,
        setTitleRaw: (t: string) => void,
        appendActionButton: (props: { icon: string; title: string; onClick: () => void }) => { remove: () => void },
        setHeaderStyles: (styles: Record<string, string>) => void;

    if (customHead?.nodeType === 1) {
      head = customHead;
      // Module-provided header has already received the callbacks — don't wire compiled buttons.
      closeButton = null;
      fullScreenButton = null;
      minimizeButton = null;
      // If custom header exposes _setTitle, call it on title updates.
      setTitleRaw = (t: string) => {
        if (typeof (head as any)._setTitle === 'function') {
          try { (head as any)._setTitle(t); } catch (_) {}
        }
      };
      appendActionButton = () => ({ remove: () => {} });
      setHeaderStyles = () => {};
    } else {
      [head, closeButton, fullScreenButton, minimizeButton, setTitleRaw, appendActionButton, setHeaderStyles] =
        createWindowHeader(command);
    }

    // Titles are plain text everywhere (header, taskbar, docks, /proc); icons
    // are checked ligature names (audit WIN-5).
    const icon = safeIconName(command.meta?.icon);
    const setTitle = (rawTitle: string) => {
      const newTitle = toTitleText(rawTitle);
      setTitleRaw(newTitle);
      writeProcMeta(pid, { pid, name: command.name, title: newTitle, icon, startedAt: Date.now() });
      windowsSubject.next(
        windowsSubject.getValue().map(w => w.pid === pid ? { ...w, title: newTitle } : w)
      );
    };

    const title = toTitleText(command.meta?.title || command.name);
    writeProcMeta(pid, { pid, name: command.name, title, icon, startedAt: Date.now() });
    windowsSubject.next([
      ...windowsSubject.getValue(),
      {
        pid,
        name: command.name,
        title,
        icon,
        minimized: false,
        active: true,
        toggle: () => this.toggleMinimize(windowRef),
      },
    ]);

    container.appendChild(head);
    if (command.meta.fullScreen) {
      head.style.display = 'none';
    }
    const toggleHeader = (flag?: boolean) => {
      if (flag === undefined) head.style.display = head.style.display === 'none' ? '' : 'none';
      if (flag === true) head.style.display = '';
      if (flag === false) head.style.display = 'none';
    };

    iframe = platform.window.document.createElement("iframe");
    iframe.classList.add("draggable");
    iframe.setAttribute("allowfullscreen", "");

    const messages$ = new Subject<unknown>();
    processRegistry.set(pid, {
      close: closeFunction,
      kill: killFunction,
      messages$,
      servicePlatformName: command.servicePlatformName,
      startedAt: Date.now(),
      proxyFs,
      iframe,
    });

    // What app loaders get of the ProxyFS (vector-store, model-builder use
    // mkdir/exists/writeText): bound promise methods in a frozen object.
    const proxyFsFacade = proxyFs ? Object.freeze({
      readText: (p: string) => proxyFs!.readText(p),
      readBinary: (p: string) => proxyFs!.readBinary(p),
      writeText: (p: string, c: string) => proxyFs!.writeText(p, c),
      mkdir: (p: string) => proxyFs!.mkdir(p),
      remove: (p: string) => proxyFs!.remove(p),
      list: (p: string) => proxyFs!.list(p),
      exists: (p: string) => proxyFs!.exists(p),
      stat: (p: string) => proxyFs!.stat(p),
      rename: (from: string, to: string) => proxyFs!.rename(from, to),
    }) : undefined;

    iframe.onload = () => {
      // Cross-origin window.open from this window gets noopener,noreferrer
      // (audit KRN-11/APP-9).
      platform.host.hardenWindow(iframe.contentWindow);
      const iframeBody = iframe.contentWindow?.document?.body;
      if (!iframeBody) return;
      iframeBody.style.margin = "0";
      const hostDimension = {
        innerWidth: platform.window.innerWidth,
        innerHeight: platform.window.innerHeight,
      };

      platform.window.addEventListener('resize', () => {
        hostDimension.innerHeight = platform.window.innerHeight;
        hostDimension.innerWidth = platform.window.innerWidth;
      });

      command.exec(
        iframeBody,
        {
          // A process can read its own pid to namespace temp files under
          // `/proc/<pid>/...`, and use it as the target for `process.kill`
          // and `process.send-message` from other scripts.
          pid,
          // Ring 1: scoped VFS proxy — app loaders use this instead of
          // host.getFS(). A frozen set of its async methods, not the instance or
          // the namespace, whose ACL is reachable and mutable (audit WIN-10).
          proxyFs: proxyFsFacade,
          close: closeFunction,
          onMessage: (cb: (message: unknown) => void) => {
            const subscription = messages$.subscribe(cb);
            return () => subscription.unsubscribe();
          },
          onDestroy: (cb: Function) => {
            onCloseCallbacks.push(cb);
            return () => {
              onCloseCallbacks = onCloseCallbacks.filter(x => x !== cb);
            };
          },
          onSignal: (name: string, cb: Function) => {
            if (!signalCallbacks.has(name)) signalCallbacks.set(name, []);
            signalCallbacks.get(name)!.push(cb);
            return () => {
              const arr = signalCallbacks.get(name);
              if (arr) signalCallbacks.set(name, arr.filter(x => x !== cb));
            };
          },
          kill: killFunction,
          setTitle,
          toggleHeader,
          appendActionButton,
          setHeaderStyles,
          // Sandbox an app sub-iframe and wire its AppSDK via a MessageChannel
          // bridge backed by ProxyFS — prevents direct VFS/platform access.
          // Call this BEFORE setting iframe.src so the sandbox is active from
          // the first navigation.
          sandboxAppIframe: (appIframe: HTMLIFrameElement) => {
            // allow-same-origin is required: sandboxed null-origin iframes are not
            // controlled by the service worker, so /(sw)/ sub-resources 404.
            // Access control is enforced by the ProxyFS ACL in the MessageChannel
            // bridge below — the AppSDK is the only endorsed API for VFS access.
            appIframe.setAttribute('sandbox',
              'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads')
            // One channel per document (decisions.md D4, audit KRN-6/WIN-10): the
            // port is posted once, after that document's load, and only to this
            // origin (these frames stay same-origin until phase 2), so a page the
            // frame navigated to elsewhere never receives it. A later load is a
            // restart: the previous port is closed and the new document gets a
            // fresh channel with the same ACL.
            const targetOrigin = platform.window.location.origin
            let port: MessagePort | null = null
            const closePort = () => { try { port?.close() } catch (_) {} port = null }
            onCloseCallbacks.push(closePort)
            appIframe.addEventListener('load', () => {
              closePort()
              const appWindow = appIframe.contentWindow
              if (!appWindow) return
              platform.host.hardenWindow(appWindow)
              try {
                const channel = new MessageChannel()
                const sdkPort = port = channel.port1
                sdkPort.onmessage = (ev: MessageEvent) => {
                  const d = ev.data as { t: string; id: number; a: unknown[] }
                  const ok  = (r: unknown) => sdkPort.postMessage({ id: d.id, r, err: null })
                  const err = (e: Error)   => sdkPort.postMessage({ id: d.id, r: null, err: e.message })
                  if (!d || typeof d !== 'object' || !Array.isArray(d.a)) return
                  const fs  = proxyFs
                  if (!fs) { err(new Error('no sandbox fs')); return }
                  switch (d.t) {
                    case 'r':     fs.readText(d.a[0] as string).then(ok).catch(err); break
                    case 'w':     fs.writeText(d.a[0] as string, d.a[1] as string).then(ok).catch(err); break
                    case 'd':     fs.mkdir(d.a[0] as string).then(ok).catch(err); break
                    case 'rm':    fs.remove(d.a[0] as string).then(ok).catch(err); break
                    case 'ls':    fs.list(d.a[0] as string).then(ok).catch(err); break
                    case 'e':     fs.exists(d.a[0] as string).then(ok).catch(err); break
                    case 'st':    fs.stat(d.a[0] as string).then(ok).catch(err); break
                    case 'mv':    fs.rename(d.a[0] as string, d.a[1] as string).then(ok).catch(err); break
                    case 'title': setTitle(d.a[0] as string); ok(true); break
                    case 'log':   console.log('[app]', d.a[0]); ok(true); break
                    default:      err(new Error('unknown: ' + d.t))
                  }
                }
                sdkPort.start()
                appWindow.postMessage({ type: 'wos:sdk-init' }, targetOrigin, [channel.port2])
              } catch (_) {}
            })
          },
          setWindowView: (show: boolean) =>
            show
              ? container.classList.remove("hidden")
              : container.classList.add("hidden"),
          toggleFullScreen: fullscreenCallback,
          getBoundingClientRect: () => container.getBoundingClientRect(),
          // Only finite numeric left/top/width/height, clamped (audit WIN-5) —
          // other keys (cssText, position, zIndex, right/bottom, …) are ignored.
          setBoundingClientRect: (rect: Record<string, number>) => {
            const area = container.offsetParent as HTMLElement | null;
            const next = clampWindowRect(
              rect,
              { width: container.offsetWidth, height: container.offsetHeight },
              { width: platform.window.innerWidth, height: platform.window.innerHeight },
              { width: area?.scrollWidth ?? 0, height: area?.scrollHeight ?? 0 },
            );
            for (const [key, value] of Object.entries(next)) {
              container.style[key as "left" | "top" | "width" | "height"] = `${value}px`;
            }
            const radius = safeBorderRadius((rect as Record<string, unknown> | null)?.borderRadius);
            if (radius !== undefined) container.style.borderRadius = radius;
          },
          // One of WINDOW_MATERIALS; anything else is ignored.
          setWindowMaterial: (material: unknown) => {
            if (typeof material !== 'string' || !WINDOW_MATERIALS.includes(material)) return;
            WINDOW_MATERIALS.forEach(m => container.classList.remove(`material-${m}`));
            if (material !== 'default') container.classList.add(`material-${material}`);
          },
          host: hostDimension,
        },
        ...args
      );

      draggable(container, head as HTMLDivElement);
      addResizeHandles(container);
      this.moveOnTop(windowRef);
      head.addEventListener("mousedown", () => this.moveOnTop(windowRef));

      // setupWindow receives close/minimize/setTitle so custom headers can
      // wire their controls here rather than in createHeader.
      (wmModule.setupWindow ?? fallbackSetupWindow)({
        container,
        head,
        iframe,
        command,
        settings: wmSettings,
        toggleFullScreen: fullscreenCallback,
        moveOnTop: () => this.moveOnTop(windowRef),
        close: closeFunction,
        minimize: minimizeCallback,
        setTitle,
      });
    };

    if (this.contentRef.current) {
      container.appendChild(iframe);
      appendWindow(this.contentRef.current, container);
      // Wire compiled default-header controls only when no module supplied a custom header.
      if (closeButton) closeButton.onclick = closeFunction;
      if (fullScreenButton) fullScreenButton.onclick = fullscreenCallback;
      if (minimizeButton) minimizeButton.onclick = minimizeCallback;
    }
  }

  private closeWindow(windowRef: {
    command: Command;
    container: HTMLDivElement;
    pid: number;
  }) {
    if (!this.windows[windowRef.command.name]) return;

    this.windows[windowRef.command.name]
      .find((x) => x === windowRef)
      ?.container.remove();
    this.windows[windowRef.command.name] = this.windows[
      windowRef.command.name
    ].filter((x) => x != windowRef);

    removeRecursive(platform.host.getFS(), `${PROC_DIR}/${windowRef.pid}`);
    processRegistry.get(windowRef.pid)?.messages$.complete();
    processRegistry.delete(windowRef.pid);
    ProcessManager.getInstance().kill(windowRef.pid);
    windowsSubject.next(windowsSubject.getValue().filter(w => w.pid !== windowRef.pid));
  }

  private moveOnTop(windowRef: {
    command: Command;
    container: HTMLDivElement;
    pid: number;
  }) {
    Object.values(this.windows).forEach((wins) =>
      wins.forEach((win) => win.container.classList.remove("top"))
    );
    windowRef.container.classList.add("top");
    windowsSubject.next(
      windowsSubject.getValue().map(w => ({ ...w, active: w.pid === windowRef.pid }))
    );
  }

  public toggleMinimize(windowRef: {
    command: Command;
    container: HTMLDivElement;
    pid: number;
  }) {
    const isMinimized = windowRef.container.classList.contains("minimized");
    if (isMinimized) {
      this.restoreWindow(windowRef);
    } else {
      this.minimizeWindow(windowRef);
    }
  }

  private minimizeWindow(windowRef: {
    command: Command;
    container: HTMLDivElement;
    pid: number;
  }) {
    windowRef.container.classList.add("minimized");
    windowsSubject.next(
      windowsSubject.getValue().map(w => w.pid === windowRef.pid ? { ...w, minimized: true, active: false } : w)
    );
  }

  private restoreWindow(windowRef: {
    command: Command;
    container: HTMLDivElement;
    pid: number;
  }) {
    windowRef.container.classList.remove("minimized");
    windowsSubject.next(
      windowsSubject.getValue().map(w => w.pid === windowRef.pid ? { ...w, minimized: false } : w)
    );
    this.moveOnTop(windowRef);
  }
}

const createWindowHeader = (command: Command) => {
  const head = platform.window.document.createElement("div");

  const title = platform.window.document.createElement("span");
  const icon = platform.window.document.createElement("span");
  const titleText = platform.window.document.createElement("span");
  titleText.textContent = toTitleText(command.meta?.title || command.name);
  title.appendChild(icon);
  title.appendChild(titleText);
  title.classList.add("title");

  icon.classList.add("material-symbols-outlined");
  icon.style.cursor = "pointer";
  icon.style.marginLeft = "auto";
  icon.textContent = safeIconName(command.meta?.icon);

  const gap = platform.window.document.createElement("span");
  gap.classList.add("window-gap");
  gap.style.marginLeft = "auto";

  const controls = platform.window.document.createElement("div");
  controls.classList.add("window-controls");

  const minimize = platform.window.document.createElement("span");
  minimize.classList.add("material-symbols-outlined", "window-action", "wm-minimize");
  minimize.style.cursor = "pointer";
  minimize.textContent = "remove";
  minimize.title = "minimize window";
  minimize.setAttribute("role", "button");
  minimize.setAttribute("tabindex", "0");

  const fullScreen = platform.window.document.createElement("span");
  fullScreen.classList.add("material-symbols-outlined", "window-action", "wm-fullscreen");
  fullScreen.style.cursor = "pointer";
  fullScreen.textContent = "fullscreen";
  fullScreen.title = "toggle fullscreen";
  fullScreen.setAttribute("role", "button");
  fullScreen.setAttribute("tabindex", "0");

  const close = platform.window.document.createElement("span");
  close.classList.add("material-symbols-outlined", "window-action", "wm-close");
  close.style.cursor = "pointer";
  close.textContent = "close";
  close.title = "close window";
  close.setAttribute("role", "button");
  close.setAttribute("tabindex", "0");

  controls.appendChild(minimize);
  controls.appendChild(fullScreen);
  controls.appendChild(close);

  head.appendChild(title);
  head.appendChild(gap);
  head.appendChild(controls);

  head.classList.add("window-header");

  // Allowlisted properties and values only — never cssText, position or url().
  const setHeaderStyles = (styles: Record<string, string>) => applyHeaderStyles(head, styles);

  setHeaderStyles((command.meta?.header as any)?.style || {})

  const setTitle = (title: string) => {
    titleText.textContent = toTitleText(title);
  };

  const appendActionButton = (props: {
    icon: string;
    title: string;
    onClick: () => void;
  }) => {
    const newButton = platform.window.document.createElement("span");
    newButton.classList.add("material-symbols-outlined", "window-action");
    newButton.style.cursor = "pointer";
    newButton.textContent = safeIconName(props?.icon, "more_horiz");
    newButton.title = toTitleText(props?.title);
    newButton.onclick = typeof props?.onClick === "function" ? props.onClick : null;
    gap.after(newButton);

    return {
      remove: () => newButton.remove(),
    };
  };

  return [head, close, fullScreen, minimize, setTitle, appendActionButton, setHeaderStyles] as const;
};

const addResizeHandles = (container: HTMLElement) => {
  const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
  const MIN_W = 200, MIN_H = 120;

  for (const dir of DIRS) {
    const handle = platform.window.document.createElement('div');
    handle.className = `window-resize-handle ${dir}`;
    container.appendChild(handle);

    let startX = 0, startY = 0;
    let startRect = { left: 0, top: 0, width: 0, height: 0 };

    handle.addEventListener('pointerdown', (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const r = container.getBoundingClientRect();
      const parentRect = (container.offsetParent as HTMLElement)?.getBoundingClientRect() ?? { left: 0, top: 0 };
      startX = e.clientX;
      startY = e.clientY;
      startRect = { left: r.left - parentRect.left, top: r.top - parentRect.top, width: r.width, height: r.height };
    });

    handle.addEventListener('pointermove', (e: PointerEvent) => {
      if (!handle.hasPointerCapture(e.pointerId)) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let { left, top, width, height } = startRect;

      if (dir.includes('e')) width = Math.max(MIN_W, width + dx);
      if (dir.includes('s')) height = Math.max(MIN_H, height + dy);
      if (dir.includes('w')) { const nw = Math.max(MIN_W, width - dx); left += width - nw; width = nw; }
      if (dir.includes('n')) { const nh = Math.max(MIN_H, height - dy); top += height - nh; height = nh; }

      Object.assign(container.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    });

    handle.addEventListener('pointerup', (e: PointerEvent) => {
      handle.releasePointerCapture(e.pointerId);
    });
  }
};

const appendWindow = (
  contentArea: HTMLDivElement,
  windowElement: HTMLElement
) => {
  if (!contentArea.querySelector(`:scope > .${WINDOWS_CONTAINER_CLASS}`)) {
    const windowsContainer = platform.window.document.createElement("div");
    windowsContainer.classList.add(WINDOWS_CONTAINER_CLASS);
    contentArea.appendChild(windowsContainer);
  }

  contentArea
    .querySelector(`:scope > .${WINDOWS_CONTAINER_CLASS}`)!
    .appendChild(windowElement);
};

const toggleFullScreen = (contentArea: HTMLElement, win: HTMLElement) => {
  const isFullScreen = (win.getAttribute("data-fullscreen") || "false") === "true";
  win.setAttribute("data-fullscreen", isFullScreen ? "false" : "true");

  const saveAttrs = ["height", "width", "left", "right", "top"] as const;

  if (isFullScreen) {
    saveAttrs.forEach((attr) => (win.style[attr] = `${win.getAttribute(`data-prev-${attr}`)}`));
  } else {
    saveAttrs.forEach((attr) => win.setAttribute(`data-prev-${attr}`, win.style[attr]));
    // Use visible viewport dimensions (clientWidth/Height) rather than the element's
    // bounding rect, so canvas-mode (where .content-area is a huge scrollable canvas)
    // doesn't produce a 6000×3600 fullscreen window. scrollLeft/Top shifts the window
    // into the currently-visible viewport region.
    const vw = contentArea.clientWidth;
    const vh = contentArea.clientHeight;
    const sx = contentArea.scrollLeft;
    const sy = contentArea.scrollTop;
    win.style.left   = `${Math.round(sx + vw * 0.01)}px`;
    win.style.top    = `${Math.round(sy + vh * 0.01)}px`;
    win.style.width  = `${Math.round(vw * 0.98)}px`;
    win.style.height = `${Math.round(vh * 0.98)}px`;
    win.style.right  = '';
  }
};
