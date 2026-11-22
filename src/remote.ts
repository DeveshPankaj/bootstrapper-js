import { ActivityDef, Command, Host, Platform, PlatformEvent, SettingsSectionDef, WidgetDef, provideBabel, setModulesPending } from "@shared/index";
import { removeRecursive, VFS, readJsonFile, writeJsonFile } from "@shared/fs-utils";
import { KEYBINDINGS_FILE, WIDGETS_DIR } from "@shared/constants";
import { BehaviorSubject, Subject } from "rxjs";
import { Module, modules } from "./modules/modules";
import React from "react";
import { createRoot } from "react-dom/client";
import * as utils from '@shared/utils'
import { DESKTOP_CONTAINER_CLASS, WINDOWS_CONTAINER_CLASS } from './core/window-manager'
import { startCronScheduler } from './core/cron'
import { startSystemd, startUnit, stopUnit, restartUnit, enableUnit, disableUnit, getStatus as getUnitStatus, listUnits, readJournal, getSelf as getSystemdSelf } from './core/systemd'
import { initIpc } from './core/ipc'

// The one copy of Babel standalone: Host.execString / Platform.require transpile vfs code with it.
provideBabel(require('./shared/babel.js'));

class WindowService {
  constructor(private window: Window, private container: HTMLElement) {}

  public async createWindow(uniqueName: string) {
    return await new Promise<[Window, Subject<PlatformEvent>]>((resolve) => {
      const iframe = this.window.document.createElement("iframe");
      iframe.style.display = "none";
      iframe.onload = () => {
        const platformEventEmitter = new Subject<PlatformEvent>();
        const newPlatform = new Platform(platformEventEmitter, uniqueName);
        iframe.contentWindow!.platform = newPlatform;

        const host = new Host(this.window, newPlatform, commands, widgets, modulesMap, settingsSections, widgetTypes, activities);
        newPlatform.setHost(host);
        // Cross-origin window.open from module code gets noopener,noreferrer
        // (kernel hook; audit KRN-11/APP-9). The frame never navigates, so
        // hardening its initial window covers the module script loaded next.
        host.hardenWindow(iframe.contentWindow);

        resolve([iframe.contentWindow!, platformEventEmitter]);
      };
      this.container.appendChild(iframe);
    });
  }

  public async loadScript(src: string, window: Window) {
    return await new Promise<Platform>((resolve) => {
      const script = window.document.createElement("script");
      script.src = src;
      script.type = 'module'

      script.onload = () => {
        resolve(window.platform);
      };
      // A bundle that fails to load must not hold up boot or the background loader.
      script.onerror = () => {
        console.error(`[modules] failed to load ${src}`);
        resolve(window.platform);
      };
      window.document.head.appendChild(script);
    });
  }
}


const modulesMap = new Map<
  string,
  {
    module: Module;
    window: Window;
    eventEmitter: Subject<PlatformEvent>;
    platform: Platform;
  }
>();

const isLoadedOnceRef = {current: false}
// Bundles marked `preload` (src/modules/modules.json) are what the landing page needs and
// load first; the rest load in the background once the landing page is on screen
// (small spinner, bottom-right). Until they're in, openWindow waits for a command one of
// them registers (setModulesPending).
const loadModules = async (modules: { [name: string]: Module }) => {
  const eager: string[] = [];
  const deferred: string[] = [];
  for (const name in modules) {
    if (modulesMap.has(name)) continue;
    (modules[name].preload ? eager : deferred).push(name);
  }

  const loadModule = async (name: string) => {
    const _module = modules[name];
    const [win, eventEmitter] = await windowService.createWindow(name);
    modulesMap.set(name, { module: _module, window: win, eventEmitter, platform: win.platform });
    await windowService.loadScript(_module.url, win);
    return () => eventEmitter.next({ type: "loaded", payload: [], module: _module });
  };

  const announceEager = await Promise.all(eager.map(loadModule));
  announceEager.forEach((announce) => announce());

  if (!isLoadedOnceRef.current && (isLoadedOnceRef.current = true)) {
    setTimeout(runInitCommands)
  }

  if (deferred.length) {
    const background = host.whenLandingReady().then(() => host.trackBackgroundTask(async () => {
      const announce = await Promise.all(deferred.map(loadModule));
      announce.forEach((a) => a());
    }, 'loading apps'));
    setModulesPending(background.then(() => setModulesPending(null)));
  }
};

// systemd (see src/core/systemd.ts) is PID 1: the first thing boot starts,
// and it owns starting everything else this layer is responsible for - cron,
// widget loading, and the user's shell/session init script - as its own
// enabled units (cron.service/widgets.service/shell.service, see
// /etc/systemd/system/) rather than as separate hardcoded calls here. Their
// ExecStart scripts call the load-widgets/start-cron-scheduler commands
// registered below, or host.exec the initd.run script directly.
//
// This doesn't (and structurally can't, without a much larger rearchitecture)
// extend to the layout/dock UI shell: that boots as a separate webpack
// bundle/iframe "module" loaded in parallel by loadModules() below, already
// running by the time runInitCommands fires here - closer to kernel/module
// loading than a systemd-managed userspace service.
const runInitCommands = () => {
  initIpc(host.getFS());
  startSystemd();
}

// Loads every `.js` file in `/etc/widgets/` and runs it via execString, so it
// can call `platform.host.registerWidget(...)`. The widgets directory is
// plain virtual-fs files editable through the file explorer.
const loadWidgets = () => {
  try {
    const fs = host.getFS();
    if (!fs.existsSync(WIDGETS_DIR)) return;
    for (const file of fs.readdirSync(WIDGETS_DIR) as string[]) {
      if (!file.endsWith('.js')) continue;
      const filepath = `${WIDGETS_DIR}/${file}`;
      try {
        const source = fs.readFileSync(filepath, 'utf-8') as string;
        host.execString(source, filepath);
      } catch (err) {
        console.error(`Failed to load widget [${filepath}]`, err);
      }
    }
  } catch (err) {
    console.error('Failed to load widgets', err);
  }
};

// Load default variables
const platformEventEmitter = new Subject<PlatformEvent>();
const hostPlatform = new Platform(platformEventEmitter, "root");
const platform = window.platform = hostPlatform;

const commands = new BehaviorSubject<Array<Command>>([]);
const widgets = new BehaviorSubject<Array<WidgetDef>>([]);
const settingsSections = new BehaviorSubject<Array<SettingsSectionDef>>([]);
const widgetTypes = new Map<string, import('@shared/index').WidgetTypeRenderer>();
const activities = new BehaviorSubject<Array<ActivityDef>>([]);
const host = new Host(window, hostPlatform, commands, widgets, modulesMap, settingsSections, widgetTypes, activities);
hostPlatform.setHost(host);

modulesMap.set('root', {platform} as any)


platform.register('utils', utils)
platform.register('window-manager', { DESKTOP_CONTAINER_CLASS, WINDOWS_CONTAINER_CLASS })
platform.register('React', React)
platform.register('ReactDOM', { createRoot })

// Init App
platform.host.registerCommand('core.add-module', (namespace: string, mod: Module) => {
    const currentModules = modules.getValue()
    const nextModules = {...currentModules, [namespace]: mod}
    modules.next(nextModules)
    platformEventEmitter.next({type: 'core.module-loaded', payload: nextModules})
});

// Keybinding wiring — reads /etc/keybindings.json and wires up document-level keydown listeners.
// Called on boot (after vfs is ready) and after keybindings are changed in Settings.
// Bindings use `code` (e.g. 'KeyF', 'Space') so Alt+letter works on Mac (where e.key becomes
// a Unicode char like 'ƒ' instead of 'f'). Falls back to matching `key` for old-format entries.
//
// OS-aware defaults — chosen to avoid conflicts with OS/browser shortcuts:
//   macOS  : Alt (Option) alone — safe; browser/OS don't intercept Alt+letter on Mac
//   Windows: Alt+Shift — avoids legacy Alt-menu shortcuts (Alt+F = File menu in Firefox,
//            Alt+T = Tools menu); bare Alt+Shift does switch keyboard layout but only on
//            release without an additional key, so Alt+Shift+letter is safe
//   Linux  : Alt alone — WM shortcuts (Alt+Space, Alt+F2, Alt+F4) are intercepted at the
//            compositor level, not inside the browser window's key event stream
const _kbPlatform = (() => {
  try {
    const p = (navigator as any).userAgentData?.platform || navigator.platform || '';
    if (/win/i.test(p)) return 'windows';
    if (/mac/i.test(p)) return 'mac';
    return 'linux';
  } catch (_) { return 'linux'; }
})();
const _kbMods: string[] = _kbPlatform === 'windows' ? ['Alt', 'Shift'] : ['Alt'];
const DEFAULT_KEYBINDINGS = [
  { code: 'Space', modifiers: _kbMods, command: 'spotlight' },
  { code: 'KeyF',  modifiers: _kbMods, command: 'explorer' },
  { code: 'KeyT',  modifiers: _kbMods, command: 'ui.terminal' },
  { code: 'KeyS',  modifiers: _kbMods, command: 'ui.settings' },
];
let keybindingAbort: AbortController | null = null;
const wireKeybindings = () => {
  keybindingAbort?.abort();
  keybindingAbort = new AbortController();
  const { signal } = keybindingAbort;
  try {
    const fs = host.getFS();
    let bindings: Array<{ code?: string; key?: string; modifiers: string[]; command: string }> = DEFAULT_KEYBINDINGS;
    if (fs.existsSync(KEYBINDINGS_FILE)) {
      try { bindings = JSON.parse(fs.readFileSync(KEYBINDINGS_FILE, 'utf-8') as string); } catch (_) {}
    }
    window.document.addEventListener('keydown', (e: KeyboardEvent) => {
      for (const b of bindings) {
        // Prefer code matching (layout-independent); fall back to key for legacy entries.
        const keyMatch = b.code ? e.code === b.code : e.key === (b as any).key;
        if (!keyMatch) continue;
        const mods = b.modifiers || [];
        if (mods.includes('Meta')  !== e.metaKey)  continue;
        if (mods.includes('Ctrl')  !== e.ctrlKey)  continue;
        if (mods.includes('Alt')   !== e.altKey)   continue;
        if (mods.includes('Shift') !== e.shiftKey) continue;
        e.preventDefault();
        try { platform.host.callCommand(b.command); } catch (err) { console.error('[keybinding]', b.command, err) }
        break;
      }
    }, { signal });
  } catch (_) {}
};
platform.host.registerCommand('reload-keybindings', wireKeybindings);
// Wire up keybindings shortly after boot so vfs is ready
setTimeout(wireKeybindings, 3000);

// Query-param app launcher — opens apps on page load via URL params.
// Single app:   ?app=<commandName>[&args=<base64(JSON.stringify([...strings]))>]
// Multiple apps: ?apps=<base64(JSON.stringify([{app, args?}]))>
//
// SECURITY (audit KRN-2/BOOT-1, decisions.md D9): the URL is untrusted input.
// The name is validated, only launchable apps open (title + icon, the app
// drawer's rule), everything travels as values through host.openWindow —
// never as DSL source — and args are accepted only by commands that opt in
// with `deepLink: true` in their registerCommand meta (like `#open=` links).
const QUERY_APP_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const QUERY_MAX_APPS = 8
const QUERY_MAX_ARGS = 8
const QUERY_MAX_ARG_LENGTH = 20000

const launchFromQuery = (app: unknown, args: unknown) => {
  if (typeof app !== 'string' || !QUERY_APP_NAME_RE.test(app) || app.includes('..')) {
    console.warn('[query-launch] ignored an invalid app name:', JSON.stringify(String(app)).slice(0, 80))
    return
  }
  const cmd = platform.host.getCommand(app)
  const meta = (cmd?.meta ?? {}) as Record<string, unknown>
  if (!cmd || !meta.title || !meta.icon || meta.callable === false) {
    console.warn(`[query-launch] "${app}" is not an app that can be opened from a link`)
    return
  }
  let values: string[] = []
  if (Array.isArray(args) && args.length) {
    if (meta.deepLink !== true) {
      console.warn(`[query-launch] "${app}" does not accept arguments from links (no deepLink opt-in); opening it without them`)
    } else if (args.length <= QUERY_MAX_ARGS && args.every(a => typeof a === 'string' && a.length <= QUERY_MAX_ARG_LENGTH)) {
      values = args as string[]
    } else {
      console.warn(`[query-launch] "${app}": link arguments must be at most ${QUERY_MAX_ARGS} strings`)
      return
    }
  }
  platform.host.openWindow(app, ...values)
}

const launchFromQueryParams = () => {
  const params = new URLSearchParams(window.location.search)
  const decode = (b64: string): unknown => JSON.parse(atob(b64))
  try {
    const appsParam = params.get('apps')
    if (appsParam) {
      const entries = decode(appsParam)
      if (!Array.isArray(entries)) throw new Error('?apps= must be a list')
      for (const entry of entries.slice(0, QUERY_MAX_APPS)) {
        try { launchFromQuery(entry?.app, entry?.args) }
        catch (e) { console.error('[query-launch]', e) }
      }
      return
    }
    const appParam = params.get('app')
    if (appParam) {
      const argsParam = params.get('args')
      launchFromQuery(appParam, argsParam ? decode(argsParam) : [])
    }
  } catch (e) { console.error('[query-launch] failed:', e) }
}
// Run after initd.run and widget/settings scripts have had time to register commands.
setTimeout(launchFromQueryParams, 4000);

// Persistent notification history backing the notification-center widget
// (/etc/widgets/notifications.js) — every `notify` call below also appends an
// entry here, capped at the most recent 50. `notifications.list`/
// `notifications.mark-all-read` let a widget read/mutate the log without
// duplicating this file I/O.
const NOTIFICATIONS_LOG_PATH = '/var/log/notifications.json';
const MAX_NOTIFICATION_HISTORY = 50;

type NotificationEntry = { id: number; title: string; body: string; timestamp: number; read: boolean };

const readNotificationHistory = (): NotificationEntry[] => {
  return readJsonFile<NotificationEntry[]>(platform.host.getFS(), NOTIFICATIONS_LOG_PATH, []) || [];
};

const writeNotificationHistory = (entries: NotificationEntry[]) => {
  try {
    writeJsonFile(platform.host.getFS(), NOTIFICATIONS_LOG_PATH, entries, true);
  } catch (err) { console.error('[notifications] failed to persist history:', err); }
};

platform.host.registerCommand('notifications.list', (): NotificationEntry[] => {
  return readNotificationHistory().slice().reverse();
});

platform.host.registerCommand('notifications.mark-all-read', (): NotificationEntry[] => {
  const history = readNotificationHistory().map(entry => ({ ...entry, read: true }));
  writeNotificationHistory(history);
  return history.slice().reverse();
});

// Toast notification system — platform.host.callCommand('notify', {title, body, duration})
const TOAST_CONTAINER_ID = '__toast_container__';
const ensureToastContainer = () => {
  let container = window.document.getElementById(TOAST_CONTAINER_ID);
  if (!container) {
    container = window.document.createElement('div');
    container.id = TOAST_CONTAINER_ID;
    Object.assign(container.style, {
      position: 'fixed', bottom: '1.5rem', right: '1.5rem',
      display: 'flex', flexDirection: 'column', gap: '0.5rem',
      zIndex: '999999', pointerEvents: 'none',
    });
    window.document.body.appendChild(container);
  }
  return container;
};
platform.host.registerCommand('notify', ({ title = '', body = '', duration = 4000 }: { title?: string; body?: string; duration?: number }) => {
  const container = ensureToastContainer();
  const toast = window.document.createElement('div');
  Object.assign(toast.style, {
    background: 'rgba(30,30,30,0.92)', color: '#fff',
    borderRadius: '12px', padding: '0.7rem 1rem',
    boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
    minWidth: '220px', maxWidth: '320px',
    backdropFilter: 'blur(12px)',
    pointerEvents: 'auto', cursor: 'pointer',
    transition: 'opacity 0.3s, transform 0.3s',
    opacity: '0', transform: 'translateY(8px)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: '13px',
  });
  if (title) {
    const h = window.document.createElement('div');
    h.textContent = title;
    Object.assign(h.style, { fontWeight: '600', marginBottom: body ? '0.2rem' : '0' });
    toast.appendChild(h);
  }
  if (body) {
    const p = window.document.createElement('div');
    p.textContent = body;
    Object.assign(p.style, { opacity: '0.8', lineHeight: '1.4' });
    toast.appendChild(p);
  }
  container.appendChild(toast);
  const dismiss = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 320);
  };
  toast.addEventListener('click', dismiss);
  requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });
  setTimeout(dismiss, duration);

  // Additive side effect: persist to the notification-center history log.
  // Doesn't affect the toast behavior above in any way.
  const history = readNotificationHistory();
  history.push({ id: Date.now() + Math.random(), title, body, timestamp: Date.now(), read: false });
  while (history.length > MAX_NOTIFICATION_HISTORY) history.shift();
  writeNotificationHistory(history);
});

// systemctl-style service management commands, backing /bin/systemctl.run and
// the Settings > Services page. See src/core/systemd.ts for the unit-file
// parsing/activation/restart-policy logic these just expose as commands.
platform.host.registerCommand('systemd.start', (name: string) => startUnit(name));
platform.host.registerCommand('systemd.stop', (name: string) => stopUnit(name));
platform.host.registerCommand('systemd.restart', (name: string) => restartUnit(name));
platform.host.registerCommand('systemd.enable', (name: string) => enableUnit(name));
platform.host.registerCommand('systemd.disable', (name: string) => disableUnit(name));
platform.host.registerCommand('systemd.status', (name: string) => getUnitStatus(name));
platform.host.registerCommand('systemd.list', () => listUnits());
platform.host.registerCommand('systemd.self', () => getSystemdSelf());
platform.host.registerCommand('systemd.journal', (name: string, lines?: number) => readJournal(name, lines));

// Backing commands for cron.service/widgets.service (see /etc/systemd/system/
// and /opt/systemd/lib/) - lets those units' ExecStart scripts reach this
// compiled TS logic via the normal command-call path instead of duplicating
// it in the vfs.
platform.host.registerCommand('start-cron-scheduler', () => startCronScheduler());
platform.host.registerCommand('load-widgets', () => loadWidgets());

// Generic activity registry (see Host.registerActivity in shared/index.ts) — lets
// any app register/track lightweight in-progress work (e.g. distributed-compute
// acting as a worker for another peer's job) without inventing its own bespoke
// process-listing mechanism. `activity.list` mirrors `process.list`/`systemd.list`
// (a command, not direct BehaviorSubject access, so callers stay decoupled from
// Host internals); `activity.kill` mirrors `process.kill`.
platform.host.registerCommand('activity.list', () => activities.getValue());
platform.host.registerCommand('activity.kill', (id: string) => host.killActivity(id));

// Convenience commands for opening the terminal and settings via the keybinding
// system, Spotlight, and the desktop context menu. These are proper app commands
// that render directly into the window body they receive (via ui.iframe's exec),
// so only ONE window/taskbar entry is created per open. When called without a body
// (e.g. from a keybinding via callCommand), they open a new window for themselves.
platform.host.registerCommand('ui.terminal', (body: any, props: any) => {
    if (!body) {
        platform.host.openWindow('ui.terminal')
        return
    }
    platform.host.getCommand('ui.iframe')?.exec(body, props, '/opt/apps/terminal/main.html')
}, { icon: 'terminal', title: 'Terminal' })

// `initialSection` (optional) matches a settings section's registered
// name (e.g. '04-wallpapers') and lands Settings on that page instead of
// its default first page — see settings.html's currentPage effect, which
// reads it via props.$args[0].
platform.host.registerCommand('ui.settings', (body: any, props: any, initialSection?: string) => {
    if (!body) {
        platform.host.openWindow('ui.settings', ...(initialSection ? [initialSection] : []))
        return
    }
    platform.host.getCommand('ui.iframe')?.exec(body, props, '/opt/apps/settings/main.html', initialSection)
}, { icon: 'settings', title: 'Settings' })

// Fallback 'explorer' command, delegating to the compiled ui.file-explorer module.
// Registered with `fallback: true`: it is the one registration another owner
// (file-explorer/main.js) may replace (audit KRN-10, decisions.md D9).
// docs/public/mount/opt/apps/file-explorer/main.js registers the real 'explorer'
// command when pkg-manager/loader.js loads it as a CORE_APP (prepended, so it takes
// precedence). This fallback handles two cases:
// 1. The brief window before that loads, or a stale/missing legacy copy from an old
//    LocalStorage-backend fs (see CLAUDE.md's Storage backend switch gotcha) — ensures
//    'explorer' always resolves.
// 2. Called with no args (e.g. from a keybinding or Spotlight) — routes through
//    open-window so the window manager sets up body/props correctly.
// Explorers the "Default File Explorer" preference may name. /user-preferences.json
// is writable by any app, so the preference must not route every folder open to
// an arbitrary command (audit KRN-10 follow-up from TODO 1D).
const ALTERNATE_EXPLORERS: ReadonlySet<string> = new Set(['explorer-sifi'])
platform.host.registerCommand('explorer', (...args: unknown[]) => {
    // Respect Settings > Apps > Default File Explorer preference
    try {
        const prefs = JSON.parse(host.getFS().readFileSync('/user-preferences.json', 'utf-8') as string)
        if (prefs.default_explorer && ALTERNATE_EXPLORERS.has(prefs.default_explorer)) {
            const alt = platform.host.getCommand(prefs.default_explorer)
            if (alt) { alt.exec(...args); return }
        }
    } catch (_) {}
    if (!args.length || args[0] == null) {
        platform.host.openWindow('explorer')
        return
    }
    const fileExplorer = platform.host.getCommand('ui.file-explorer')!
    return fileExplorer.exec(...args)
}, { icon: 'folder', title: 'Files', fallback: true })


platform.register('fs', (cmd: string, ...args: string[]) => {
  console.log(cmd, args);
  //@ts-ignore
  const _fs = (window as any).fs as VFS;
  switch(cmd) {
    case "rm":
      for(let filePath of args) {
        if(_fs.existsSync(filePath)){
          _fs.unlinkSync(filePath)
        }
      }
      break;
    case "rmdir":
      for(let filePath of args) {
        if(_fs.existsSync(filePath)){
          removeRecursive(_fs, filePath)
        }
      }
  }
})
// `service('root', 'exec')(path, ...args)` — the DSL's "run" verb, used by
// author-written scripts and config (initd.run, /.initd.run, crontab entries,
// /etc/contextmenu.json). A script given here runs because its author asked
// for it (decisions.md D9/D10); any other file opens like a double-click.
platform.register('exec', (filepath: string, ...args: string[]) => {
  const name = String(filepath ?? '').split('/').pop() ?? ''
  const isScript = /.\.(js|run)$/i.test(name)
  return isScript
    ? platform.host.runFile(platform, filepath, args, { confirm: false })
    : platform.host.exec(platform, filepath, ...args)
})

export const windowService = new WindowService(window, window.document.body);
modules.subscribe((modules) => loadModules(modules));
