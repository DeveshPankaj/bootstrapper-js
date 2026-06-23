import { Command, Host, Platform, PlatformEvent, SettingsSectionDef, WidgetDef } from "@shared/index";
import { BehaviorSubject, Subject } from "rxjs";
import { Module, modules } from "./modules/modules";
import type fs from 'fs'
import React from "react";
import { createRoot } from "react-dom/client";
import * as utils from '@shared/utils'
import { DESKTOP_CONTAINER_CLASS, WINDOWS_CONTAINER_CLASS } from './core/window-manager'
import { startCronScheduler } from './core/cron'

//@ts-ignore
const public_path = __webpack_public_path__ as string;

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

        // iframe.contentWindow!.require = (moduleName: string) => {
        //   console.log(`${uniqueName} require ${moduleName}`)
        // };

        const host = new Host(this.window, newPlatform, commands, widgets, modulesMap, settingsSections);
        newPlatform.setHost(host);

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
const loadModules = async (modules: { [name: string]: Module }) => {
  const runAfterLoad: Array<() => void> = [];
  const Q: Array<Promise<any>> = [];

  for (let _module_name in modules) {
    // TODO:  // if (modulesMap.has(_module_name) && modulesMap.get(_module_name)?.module.url === modules[_module_name].url) continue;
    if (modulesMap.has(_module_name)) continue;

    const _module = modules[_module_name];


    const loadScript = async () => {
      const [win, eventEmitter] = await windowService.createWindow(_module_name);
      modulesMap.set(_module_name, {
        module: _module,
        window: win,
        eventEmitter,
        platform: win.platform,
      });

      const _ = windowService.loadScript(_module.url, win);

      if(_module.preload) {
        await _;
      }

      runAfterLoad.push(() =>
        eventEmitter.next({ type: "loaded", payload: [], module: _module})
      );

      // eventEmitter.next({type: 'exit', payload: []})
    };

    Q.push(loadScript());
  }

  if (Q.length) await Promise.all(Q);
  runAfterLoad.forEach((callback) => callback());
  // console.log(dependenciesMap);

  if(!isLoadedOnceRef.current && (isLoadedOnceRef.current = true)) {
    setTimeout(runInitCommands)
  }
};

const runInitCommands = () => {
  const allCommands = commands.getValue()
  const initCommands: Array<{name: string, args: Array<any>}> = [
    // {
    //   name: 'open-window',
    //   args: [allCommands.find(x => x.name==='ui.notepad')]
    // },
    // {
    //   name: 'open-window',
    //   args: [allCommands.find(x => x.name==='ui.iframe')]
    // }, 
  ]


  // const preparedCommands = initCommands.map(cmd => ({commandRef: allCommands.find(x => x.name === cmd.name), cmd})).filter(x => x.commandRef)
  
  // preparedCommands.forEach(command => {
  //   command.commandRef?.exec(...command.cmd.args)
  // })
  // console.log(preparedCommands)
  
  // {
  //   // service('001-core.layout', 'open-window').call(this, command('ui.iframe'))

  //   runCommand(`service('001-core.layout', 'open-window') (command('ui.iframe'))`)

  //   // const dep = modulesMap.get('001-core.layout')!;
  //   // const layoutOpenWindowService = dep.platform.getService('open-window') as (...args: any) => void;
  //   // const win = allCommands.find(x => x.name==='ui.iframe')!
  //   // layoutOpenWindowService(win)
  // }
  // {
  //   runCommand(`service('003-core.iframe', 'fullscreen') () `)

  //   // const dep = modulesMap.get('003-core.iframe')!;
  //   // const iframeFullScreenService = dep.platform.getService('fullscreen') as () => void;
  //   // iframeFullScreenService()
  // }
  // {
  //   runCommand(`service('001-core.layout', 'open-window') (command('ui.notepad'))`)
  //   // const dep = modulesMap.get('005-ui.notepad')!;
  //   // const notepadFullScreenService = dep.platform.getService('fullscreen') as (...args: any) => void;
  //   // notepadFullScreenService()
  // }

  const _commands: Array<string> = [
    // `service('001-core.layout', 'open-window') (command('ui.iframe'), '/usr/desktop/index.html')`,
    // `service('001-core.layout', 'open-window') (command('ui.notepad'))`,
    // `service('003-core.iframe', 'fullscreen') () `,
  ];
  _commands.forEach(runCommand)




  const initd: Array<Array<string>> = [
    // ['/usr/desktop/index.html'],
    ['/home/user1/initd.run']
  ];
  initd.forEach(command => host.exec(hostPlatform, command[0], ...command.slice(1)))

  loadWidgets();
  startCronScheduler();
}

// Loads every `.js` file in `/etc/widgets/` and runs it via execString, so it
// can call `platform.host.registerWidget(...)`. The widgets directory is
// plain virtual-fs files editable through the file explorer.
const WIDGETS_DIR = '/etc/widgets';
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

const runCommand = (cmd: string) => {
  const context = {
    window: null,
    global: null,
    globalThis: null,
    service: (moduleName: string, serviceName: string) => {
      const mod = modulesMap.get(moduleName)!;
      const srv = mod.platform.getService(serviceName)!
      if (!srv) console.warn(`Servive: [${moduleName}/${serviceName}] not found`);
      return srv
    },
    command: (commandName: string) => {
      const allCommands = commands.getValue()
      const _cmd = allCommands.find(x => x.name === commandName);
      if(!_cmd) throw `Command: [${commandName}] not found`
      return _cmd
    }
  }
  const factory = new Function(...Object.keys(context), cmd);
  factory.call({}, ...Object.values(context))
}


// Load default variables
const platformEventEmitter = new Subject<PlatformEvent>();
const hostPlatform = new Platform(platformEventEmitter, "root");
const platform = window.platform = hostPlatform;

const commands = new BehaviorSubject<Array<Command>>([]);
const widgets = new BehaviorSubject<Array<WidgetDef>>([]);
const settingsSections = new BehaviorSubject<Array<SettingsSectionDef>>([]);
const host = new Host(window, hostPlatform, commands, widgets, modulesMap, settingsSections);
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
const KEYBINDINGS_FILE = '/etc/keybindings.json';
const DEFAULT_KEYBINDINGS = [
  { code: 'Space', modifiers: ['Alt'], command: 'spotlight' },
  { code: 'KeyF',  modifiers: ['Alt'], command: 'explorer' },
  { code: 'KeyT',  modifiers: ['Alt'], command: 'ui.terminal' },
  { code: 'KeyS',  modifiers: ['Alt'], command: 'ui.settings' },
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
      }
    }, { signal });
  } catch (_) {}
};
platform.host.registerCommand('reload-keybindings', wireKeybindings);
// Wire up keybindings shortly after boot so vfs is ready
setTimeout(wireKeybindings, 3000);

// Query-param app launcher — opens apps on page load via URL params.
// Single app:   ?app=<commandName>&args=<base64(JSON.stringify([...]))>
// Multiple apps: ?apps=<base64(JSON.stringify([{app, args?}]))>
// base64 encoding lets args carry arbitrary strings (paths, JSON, etc.) safely.
const launchFromQueryParams = () => {
  const params = new URLSearchParams(window.location.search)
  const openWindow = (app: string, args: unknown[]) => {
    const argsStr = args.map(a => `'${String(a).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`).join(',')
    const script = `service('001-core.layout','open-window')(command('${app}')${argsStr ? ',' + argsStr : ''})`
    platform.host.execCommand(script, platform)
  }
  try {
    const appsParam = params.get('apps')
    if (appsParam) {
      const entries: Array<{ app: string; args?: unknown[] }> = JSON.parse(atob(appsParam))
      for (const entry of entries) {
        try { openWindow(entry.app, entry.args ?? []) }
        catch (e) { console.error('[query-launch]', entry.app, e) }
      }
      return
    }
    const appParam = params.get('app')
    if (appParam) {
      const argsParam = params.get('args')
      const args: unknown[] = argsParam ? JSON.parse(atob(argsParam)) : []
      openWindow(appParam, args)
    }
  } catch (e) { console.error('[query-launch] failed:', e) }
}
// Run after initd.run and widget/settings scripts have had time to register commands.
setTimeout(launchFromQueryParams, 4000);

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
});

// Convenience commands for opening the terminal and settings via the keybinding
// system (and Spotlight). The actual open logic mirrors the taskbar's execCommand calls.
platform.host.registerCommand('ui.terminal', () => {
    platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.iframe'), '/opt/apps/terminal/main.html')", platform)
}, { icon: 'terminal', title: 'Terminal' })

platform.host.registerCommand('ui.settings', () => {
    platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.iframe'), '/opt/apps/settings/main.html')", platform)
}, { icon: 'settings', title: 'Settings' })

// Fallback 'explorer' command, delegating to the compiled ui.file-explorer module.
// /home/user1/apps/explorer.js registers the real 'explorer' command on boot via
// initd.run (prepended, so it takes precedence). This fallback handles two cases:
// 1. Stale/missing explorer.js (localStorage backend gotcha) — ensures 'explorer'
//    always resolves.
// 2. Called with no args (e.g. from a keybinding or Spotlight) — routes through
//    open-window so the window manager sets up body/props correctly.
platform.host.registerCommand('explorer', (...args: unknown[]) => {
    // Respect Settings > Apps > Default File Explorer preference
    try {
        const prefs = JSON.parse(host.getFS().readFileSync('/user-preferences.json', 'utf-8') as string)
        if (prefs.default_explorer && prefs.default_explorer !== 'explorer') {
            const alt = platform.host.getCommand(prefs.default_explorer)
            if (alt) { alt.exec(...args); return }
        }
    } catch (_) {}
    if (!args.length || args[0] == null) {
        platform.host.execCommand("service('001-core.layout', 'open-window') (command('explorer'))", platform)
        return
    }
    const fileExplorer = platform.host.getCommand('ui.file-explorer')!
    return fileExplorer.exec(...args)
}, { icon: 'folder', title: 'Files' })


platform.register('fs', (cmd: string, ...args: string[]) => {
  console.log(cmd, args);
  //@ts-ignore
  const _fs = window.fs as typeof fs;
  switch(cmd) {
    case "rm":
      for(let filePath of args) {
        if(_fs.existsSync(filePath)){
          _fs.unlinkSync(filePath)
        }
      }
      break;
    case "rmdir":
      // BrowserFS's rmdirSync doesn't support the `recursive` option (it throws
      // ENOTEMPTY for non-empty directories), so remove contents ourselves first.
      const removeRecursive = (path: string) => {
        for(const entry of _fs.readdirSync(path)) {
          const entryPath = `${path.endsWith('/') ? path : `${path}/`}${entry}`
          if(_fs.statSync(entryPath).isDirectory()) removeRecursive(entryPath)
          else _fs.unlinkSync(entryPath)
        }
        _fs.rmdirSync(path)
      }

      for(let filePath of args) {
        if(_fs.existsSync(filePath)){
          removeRecursive(filePath)
        }
      }
  }
})
platform.register('exec', 
  (filepath: string, ...args: string[]) => platform.host.exec(platform, filepath, ...args)
)

export const windowService = new WindowService(window, window.document.body);
modules.subscribe((modules) => loadModules(modules));
