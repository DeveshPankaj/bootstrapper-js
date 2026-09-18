import { draggable } from "@shared/draggable";
import { Command, Platform } from "@shared/index";
import { removeRecursive, readJsonFile, writeJsonFile, ensureDir } from "@shared/fs-utils";
import { PROC_DIR, WINDOW_MANAGER_MODULE_PATH, WM_DIR } from "@shared/constants";
import { BehaviorSubject, Subject } from "rxjs";
import { ProcessManager } from "../platform/process-manager";
import { ProxyFS } from "../platform/proxy-fs";
import { WindowManager as Wm2 } from "../system/window-manager";
import { LayoutManager } from "../system/layout-manager";
const platform = Platform.getInstance();

export const WINDOWS_CONTAINER_CLASS = "windows";
export const DESKTOP_CONTAINER_CLASS = "desktop";

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

// Behavior (event wiring, etc.) for new windows lives in the virtual
// filesystem so it can be edited (via the file explorer) and takes effect
// for the next window opened, without rebuilding the app.
const FALLBACK_WM_SETTINGS = {
  behavior: {
    dblClickHeaderFullscreen: true,
    bringToFrontOnClick: true,
  },
};

const MANAGERS_CONFIG_PATH = '/etc/managers.json';

const loadWindowManagerModule = (): any => {
  try {
    const fs = platform.host.getFS();

    // Load base module — provides setupWindow, readSettings, snap zones, etc.
    const baseModule: any = (() => {
      if (!fs.existsSync(WINDOW_MANAGER_MODULE_PATH)) return {};
      const source = fs.readFileSync(WINDOW_MANAGER_MODULE_PATH, "utf-8") as string;
      return platform.host.execString(source, WINDOW_MANAGER_MODULE_PATH);
    })();

    // Check for an active WM style override in /etc/managers.json.
    let wmId = 'default';
    try {
      if (fs.existsSync(MANAGERS_CONFIG_PATH)) {
        const config = JSON.parse(fs.readFileSync(MANAGERS_CONFIG_PATH, 'utf-8') as string);
        if (config.windowManager) wmId = config.windowManager;
      }
    } catch (_) {}

    if (wmId === 'default') return baseModule;

    // Load style override from /opt/wm/<id>.js — exports createHeader (and
    // optionally createContainer). Merges over base: style overrides win for
    // visual hooks, base keeps setupWindow/readSettings/etc.
    const wmStylePath = `/opt/wm/${wmId}.js`;
    if (!fs.existsSync(wmStylePath)) return baseModule;
    const wmStyleSource = fs.readFileSync(wmStylePath, "utf-8") as string;
    const wmStyleModule = platform.host.execString(wmStyleSource, wmStylePath);
    return { ...baseModule, ...wmStyleModule };
  } catch (err) {
    console.error("Failed to load window manager module", err);
    return {};
  }
};

export class WindowManager {
  private readonly windows: Record<
    string,
    Array<{ container: HTMLDivElement; pid: number }>
  > = {};
  constructor(private contentRef: { current: HTMLDivElement | null }) {
    registerProcessCommands();
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

    // Load the VFS window-manager module once at the top so its hooks
    // (createContainer, createHeader, setupWindow) are all available.
    const wmModule = loadWindowManagerModule();
    const wmSettings = wmModule.readSettings?.() ?? FALLBACK_WM_SETTINGS;

    // --- VFS hook: createContainer({ command, settings }) ---
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
      try { iframe.contentWindow?.postMessage({ type: 'signal', name }, '*') } catch (_) {}
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

    // --- VFS hook: createHeader({ command, settings, close, minimize, fullscreen }) ---
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
      // VFS-provided header has already received the callbacks — don't wire compiled buttons.
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

    const setTitle = (newTitle: string) => {
      setTitleRaw(newTitle);
      writeProcMeta(pid, { pid, name: command.name, title: newTitle, icon: (command.meta?.icon as string) || "", startedAt: Date.now() });
      windowsSubject.next(
        windowsSubject.getValue().map(w => w.pid === pid ? { ...w, title: newTitle } : w)
      );
    };

    const title = (command.meta.title as string) || command.name;
    const icon = (command.meta?.icon as string) || "";
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

    iframe.onload = () => {
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
          // Ring 1: scoped VFS proxy — app loaders use this instead of host.getFS()
          proxyFs,
          namespace: ns,
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
            appIframe.addEventListener('load', () => {
              try {
                const channel = new MessageChannel()
                appIframe.contentWindow!.postMessage({ type: 'wos:sdk-init' }, '*', [channel.port2])
                const port = channel.port1
                port.start()
                port.onmessage = (ev: MessageEvent) => {
                  const d = ev.data as { t: string; id: number; a: unknown[] }
                  const ok  = (r: unknown) => port.postMessage({ id: d.id, r, err: null })
                  const err = (e: Error)   => port.postMessage({ id: d.id, r: null, err: e.message })
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
              } catch (_) {}
            }, { once: true })
          },
          setWindowView: (show: boolean) =>
            show
              ? container.classList.remove("hidden")
              : container.classList.add("hidden"),
          toggleFullScreen: fullscreenCallback,
          getBoundingClientRect: () => container.getBoundingClientRect(),
          setBoundingClientRect: (rect: Record<string, number>) => {
            const newCord: Record<string, string> = {};
            Object.keys(rect).forEach(
              (attr: any) => (newCord[attr] = `${rect[attr]}${typeof rect[attr] === "number" ? "px" : ""}`)
            );
            Object.assign(container.style, newCord);
          },
          host: hostDimension,
        },
        ...args
      );

      draggable(container, head as HTMLDivElement);
      addResizeHandles(container);
      this.moveOnTop(windowRef);
      head.addEventListener("mousedown", () => this.moveOnTop(windowRef));

      // setupWindow receives close/minimize/setTitle so VFS-custom headers can
      // wire their controls here rather than in createHeader.
      wmModule.setupWindow?.({
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
      // Wire compiled default-header controls only when VFS didn't supply a custom header.
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
  titleText.innerHTML = (command.meta.title as string) || command.name;
  title.appendChild(icon);
  title.appendChild(titleText);
  title.classList.add("title");

  icon.classList.add("material-symbols-outlined");
  icon.style.cursor = "pointer";
  icon.style.marginLeft = "auto";
  icon.innerHTML = `${command.meta?.icon}`;

  const gap = platform.window.document.createElement("span");
  gap.classList.add("window-gap");
  gap.style.marginLeft = "auto";

  const controls = platform.window.document.createElement("div");
  controls.classList.add("window-controls");

  const minimize = platform.window.document.createElement("span");
  minimize.classList.add("material-symbols-outlined", "window-action", "wm-minimize");
  minimize.style.cursor = "pointer";
  minimize.innerHTML = "remove";
  minimize.title = "minimize window";
  minimize.setAttribute("role", "button");
  minimize.setAttribute("tabindex", "0");

  const fullScreen = platform.window.document.createElement("span");
  fullScreen.classList.add("material-symbols-outlined", "window-action", "wm-fullscreen");
  fullScreen.style.cursor = "pointer";
  fullScreen.innerHTML = "fullscreen";
  fullScreen.title = "toggle fullscreen";
  fullScreen.setAttribute("role", "button");
  fullScreen.setAttribute("tabindex", "0");

  const close = platform.window.document.createElement("span");
  close.classList.add("material-symbols-outlined", "window-action", "wm-close");
  close.style.cursor = "pointer";
  close.innerHTML = "close";
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

  const setHeaderStyles = (styles: Record<string, string>) => {
    Object.assign(head.style, styles)
  }

  const headerStyles = (command.meta?.header as any)?.style || {};
  setHeaderStyles(headerStyles)

  const setTitle = (title: string) => {
    titleText.innerText = title;
  };

  const appendActionButton = (props: {
    icon: string;
    title: string;
    onClick: () => void;
  }) => {
    const newButton = platform.window.document.createElement("span");
    newButton.classList.add("material-symbols-outlined", "window-action");
    newButton.style.cursor = "pointer";
    newButton.innerHTML = props.icon;
    newButton.title = props.title;
    newButton.onclick = props.onClick;
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
