import { draggable } from "@shared/draggable";
import { Command, Platform } from "@shared/index";
import { BehaviorSubject, Subject } from "rxjs";
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
  desktopId: string;
  toggle: () => void;
};

export const windowsSubject = new BehaviorSubject<TaskbarWindowInfo[]>([]);

// Multiple virtual desktops ("Spaces"): every window belongs to exactly one
// desktop (tagged via `desktopId`); only the active desktop's windows are
// shown. Persisted so the desktop layout survives a reload.
export type DesktopInfo = { id: string; name: string };

const DESKTOPS_CONFIG_PATH = "/etc/wm/desktops.json";

const DEFAULT_DESKTOPS_CONFIG = { desktops: [{ id: "1", name: "Desktop 1" }], active: "1" };

const readDesktopsConfig = (): { desktops: DesktopInfo[]; active: string } => {
  try {
    const fs = platform.host.getFS();
    const raw = JSON.parse(fs.readFileSync(DESKTOPS_CONFIG_PATH, "utf-8"));
    if (Array.isArray(raw.desktops) && raw.desktops.length && raw.active) return raw;
  } catch (err) { /* default */ }
  return DEFAULT_DESKTOPS_CONFIG;
};

const writeDesktopsConfig = (desktops: DesktopInfo[], active: string) => {
  try {
    const fs = platform.host.getFS();
    if (!fs.existsSync("/etc/wm")) fs.mkdirSync("/etc/wm", { recursive: true });
    fs.writeFileSync(DESKTOPS_CONFIG_PATH, JSON.stringify({ desktops, active }, null, 2));
  } catch (err) { /* best effort */ }
};

const initialDesktopsConfig = readDesktopsConfig();
export const desktopsSubject = new BehaviorSubject<DesktopInfo[]>(initialDesktopsConfig.desktops);
export const activeDesktopSubject = new BehaviorSubject<string>(initialDesktopsConfig.active);

export const switchDesktop = (id: string) => {
  if (id === activeDesktopSubject.getValue()) return;
  if (!desktopsSubject.getValue().some(d => d.id === id)) return;
  activeDesktopSubject.next(id);
  writeDesktopsConfig(desktopsSubject.getValue(), id);
};

export const addDesktop = () => {
  const desktops = desktopsSubject.getValue();
  const id = `${Date.now()}`;
  const updated = [...desktops, { id, name: `Desktop ${desktops.length + 1}` }];
  desktopsSubject.next(updated);
  activeDesktopSubject.next(id);
  writeDesktopsConfig(updated, id);
};


export const removeDesktop = (id: string) => {
  const desktops = desktopsSubject.getValue();
  if (desktops.length <= 1) return;
  const idx = desktops.findIndex(d => d.id === id);
  if (idx === -1) return;

  const updated = desktops.filter(d => d.id !== id);
  const wasActive = activeDesktopSubject.getValue() === id;
  const newActive = wasActive ? updated[Math.max(0, idx - 1)].id : activeDesktopSubject.getValue();

  // Move any windows on the removed desktop to the desktop that becomes active.
  windowsSubject.next(
    windowsSubject.getValue().map(w => w.desktopId === id ? { ...w, desktopId: newActive } : w)
  );

  desktopsSubject.next(updated);
  activeDesktopSubject.next(newActive);
  writeDesktopsConfig(updated, newActive);
};

const PROC_DIR = "/proc";
let nextPid = 1;

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
};
const processRegistry = new Map<number, ProcessEntry>();

const removeRecursive = (path: string) => {
  const fs = platform.host.getFS();
  if (!fs.existsSync(path)) return;
  for (const entry of fs.readdirSync(path) as string[]) {
    const entryPath = `${path.endsWith("/") ? path : `${path}/`}${entry}`;
    if (fs.statSync(entryPath).isDirectory()) removeRecursive(entryPath);
    else fs.unlinkSync(entryPath);
  }
  fs.rmdirSync(path);
};

const writeProcMeta = (pid: number, meta: Record<string, unknown>) => {
  try {
    const fs = platform.host.getFS();
    const dir = `${PROC_DIR}/${pid}`;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/meta.json`, JSON.stringify(meta, null, 2));
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
    const inbox: Array<unknown> = fs.existsSync(inboxPath)
      ? JSON.parse(fs.readFileSync(inboxPath, "utf-8") as string)
      : [];
    inbox.push({ message, receivedAt: Date.now() });
    while (inbox.length > 50) inbox.shift();
    fs.writeFileSync(inboxPath, JSON.stringify(inbox, null, 2));
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

  platform.register('add-desktop', addDesktop);
  platform.host.registerCommand('add-desktop', addDesktop, { callable: true });

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
      };
    });
  });
};

// Behavior (event wiring, etc.) for new windows lives in the virtual
// filesystem so it can be edited (via the file explorer) and takes effect
// for the next window opened, without rebuilding the app.
const WINDOW_MANAGER_MODULE_PATH = "/opt/window-manager.js";

const FALLBACK_WM_SETTINGS = {
  behavior: {
    dblClickHeaderFullscreen: true,
    bringToFrontOnClick: true,
  },
};

const loadWindowManagerModule = (): any => {
  try {
    const fs = platform.host.getFS();
    if (!fs.existsSync(WINDOW_MANAGER_MODULE_PATH)) return {};
    const source = fs.readFileSync(WINDOW_MANAGER_MODULE_PATH, "utf-8") as string;
    return platform.host.execString(source, WINDOW_MANAGER_MODULE_PATH);
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
    activeDesktopSubject.subscribe(() => this.updateVisibility());
    windowsSubject.subscribe(() => this.updateVisibility());
  }

  // Hides windows that don't belong to the active desktop.
  private updateVisibility() {
    const active = activeDesktopSubject.getValue();
    const infos = windowsSubject.getValue();
    Object.values(this.windows).forEach(wins => wins.forEach(w => {
      const info = infos.find(i => i.pid === w.pid);
      const desktopId = info?.desktopId ?? active;
      w.container.classList.toggle("desktop-hidden", desktopId !== active);
    }));
  }

  public createWindow(command_name: string, ...args: unknown[]) {
    const command: Command = platform.host.getCommand(command_name)!;
    if (!command) {
      throw `Command not found [${command_name}]`;
    }

    const pid = nextPid++;
    const container = platform.window.document.createElement("div");
    const [head, closeButton, fullScreenButton, minimizeButton, setTitleRaw, appendActionButton, setHeaderStyles] =
      createWindoeHeader(command);

    const setTitle = (newTitle: string) => {
      setTitleRaw(newTitle);
      writeProcMeta(pid, { pid, name: command.name, title: newTitle, icon: (command.meta?.icon as string) || "", startedAt: Date.now() });
      windowsSubject.next(
        windowsSubject.getValue().map(w => w.pid === pid ? { ...w, title: newTitle } : w)
      );
    };

    // this.closeWindow(command)
    const windowRef = { container, command, pid };
    this.windows[command.name] ??= [];
    this.windows[command.name].push(windowRef);
    Object.freeze(windowRef);

    // container.style.top = '3rem'
    container.setAttribute("data-name", command.name);
    container.setAttribute("data-pid", `${pid}`);
    container.classList.add("window");
    container.classList.add("hidden");

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
        desktopId: activeDesktopSubject.getValue(),
        toggle: () => this.toggleMinimize(windowRef),
      },
    ]);

    container.appendChild(head);
    if (command.meta.fullScreen) {
      head.style.display = 'none'
    }
    const toggleHeader = (flag?:boolean) => {
      if(flag === undefined) head.style.display = head.style.display === 'none' ? '' : 'none'
      if(flag === true)head.style.display = ''
      if(flag === false)head.style.display = 'none'
    }

    const iframe = platform.window.document.createElement("iframe");
    iframe.classList.add("draggable");

    iframe.setAttribute("allowfullscreen", "");

    let onCloseCallbacks: Array<Function> = []
    const signalCallbacks = new Map<string, Array<Function>>()

    const emitSignal = (name: string) => {
      (signalCallbacks.get(name) ?? []).forEach(cb => { try { cb() } catch (_) {} })
      try { iframe.contentWindow?.postMessage({ type: 'signal', name }, '*') } catch (_) {}
    }

    // SIGTERM — notifies the app then closes.
    const closeFunction = () => {
      emitSignal('SIGTERM')
      onCloseCallbacks.forEach(cb => { try { cb() } catch (_) {} })
      onCloseCallbacks = []
      signalCallbacks.clear()
      this.closeWindow(windowRef);
    }

    // SIGKILL — immediate removal, no callbacks or signals.
    const killFunction = () => {
      onCloseCallbacks = []
      signalCallbacks.clear()
      this.closeWindow(windowRef);
    }

    const messages$ = new Subject<unknown>();
    processRegistry.set(pid, {
      close: closeFunction,
      kill: killFunction,
      messages$,
      servicePlatformName: command.servicePlatformName,
      startedAt: Date.now(),
    });

    iframe.onload = () => {
      const iframeBody = iframe.contentWindow?.document?.body;
      if (!iframeBody) return;
      iframeBody.style.margin = "0";
      const hostDimention = {
        innerWidth: platform.window.innerWidth,
        innerHeight: platform.window.innerHeight,
      }

      platform.window.addEventListener('resize', () => {
        hostDimention.innerHeight = platform.window.innerHeight
        hostDimention.innerWidth = platform.window.innerWidth
      })

      command.exec(
        iframeBody,
        {
          // A process can read its own pid to namespace temp files under
          // `/proc/<pid>/...`, and use it as the target for `process.kill`
          // and `process.send-message` from other scripts.
          pid,
          close: closeFunction,
          onMessage: (cb: (message: unknown) => void) => {
            const subscription = messages$.subscribe(cb);
            return () => subscription.unsubscribe();
          },
          onDestroy: (cb: Function) => {
            onCloseCallbacks.push(cb);
            return () => {
              onCloseCallbacks = onCloseCallbacks.filter(x => x !== cb);
            }
          },
          onSignal: (name: string, cb: Function) => {
            if (!signalCallbacks.has(name)) signalCallbacks.set(name, [])
            signalCallbacks.get(name)!.push(cb)
            return () => {
              const arr = signalCallbacks.get(name)
              if (arr) signalCallbacks.set(name, arr.filter(x => x !== cb))
            }
          },
          kill: killFunction,
          setTitle,
          toggleHeader,
          appendActionButton,
          setHeaderStyles,
          setWindowView: (show: boolean) =>
            show
              ? container.classList.remove("hidden")
              : container.classList.add("hidden"),
          toggleFullScreen: () =>
            toggleFullScreen(this.contentRef.current!, container),
          getBoundingClientRect: () => container.getBoundingClientRect(),
          setBoundingClientRect: (rect: Record<string, number>) => {
            const newCord: Record<string, string> = {}
            Object.keys(rect).forEach(
              (attr: any) =>(newCord[attr] = `${rect[attr]}${typeof rect[attr] === "number" ? "px" : ""}`)
            );
            Object.assign(container.style, newCord);
          },
          host: hostDimention
        },
        ...args
      );

      draggable(container, head);
      addResizeHandles(container);
      this.moveOnTop(windowRef);
      head.addEventListener("mousedown", () => this.moveOnTop(windowRef));

      const wmModule = loadWindowManagerModule();
      const settings = wmModule.readSettings?.() ?? FALLBACK_WM_SETTINGS;
      wmModule.setupWindow?.({
        container,
        head,
        iframe,
        command,
        settings,
        toggleFullScreen: () => toggleFullScreen(this.contentRef.current!, container),
        moveOnTop: () => this.moveOnTop(windowRef),
      });
    };

    if (this.contentRef.current) {
      // contentRef.current.innerText = ''
      container.appendChild(iframe);
      appendWindow(this.contentRef.current, container);
      closeButton.onclick = closeFunction;
      fullScreenButton.onclick = () =>
        toggleFullScreen(this.contentRef.current!, container);
      minimizeButton.onclick = () => this.toggleMinimize(windowRef);
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

    removeRecursive(`${PROC_DIR}/${windowRef.pid}`);
    processRegistry.get(windowRef.pid)?.messages$.complete();
    processRegistry.delete(windowRef.pid);
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

const createWindoeHeader = (command: Command) => {
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
  gap.style.marginLeft = "auto";
  const minimize = platform.window.document.createElement("span");
  minimize.classList.add("material-symbols-outlined", "window-action");
  minimize.style.cursor = "pointer";
  minimize.innerHTML = "remove";
  minimize.title = "minimize window";

  const fullScreen = platform.window.document.createElement("span");
  fullScreen.classList.add("material-symbols-outlined", "window-action");
  fullScreen.style.cursor = "pointer";
  fullScreen.innerHTML = "fullscreen";
  fullScreen.title = "toggle fullscreen";
  fullScreen.onclick = () => {
    console.log(command);
  };

  const close = platform.window.document.createElement("span");
  close.classList.add("material-symbols-outlined", "window-action");
  close.style.cursor = "pointer";
  close.innerHTML = "close";
  close.title = "close window";
  close.onclick = () => {
    console.log(command);
  };

  head.appendChild(title);
  head.appendChild(gap);
  head.appendChild(minimize);
  head.appendChild(fullScreen);
  head.appendChild(close);

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
  const container = contentArea; // contentArea.querySelector(`:scope > .${WINDOWS_CONTAINER_CLASS}`)

  const isFullScreen = (win.getAttribute("data-fullscreen") || "false") === "true";
  win.setAttribute("data-fullscreen", isFullScreen ? "false" : "true");

  const mergeAttributes = ["height", "width", "left", "right", "top"] as const;

  if (isFullScreen) {
    mergeAttributes.forEach(
      (attr) => (win.style[attr] = `${win.getAttribute(`data-prev-${attr}`)}`)
    );
  } else {
    const containerRect = container?.getBoundingClientRect();
    mergeAttributes.forEach((attr) =>
      win.setAttribute(`data-prev-${attr}`, win.style[attr])
    );
    mergeAttributes.forEach(
      (attr) => (win.style[attr] = `${containerRect[attr]}px`)
    );
  }

  // if (platform.window.document.fullscreenElement) {
  //     platform.window.document
  //     .exitFullscreen()
  //     .then(() => console.log("Document Exited from Full screen mode"))
  //     .catch((err) => console.error(err));
  // } else {
  //     win.requestFullscreen();
  // }
};
