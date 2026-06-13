import { Command, Host, Platform, PlatformEvent, WidgetDef } from "@shared/index";
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

        const host = new Host(this.window, newPlatform, commands, widgets, modulesMap);
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
const host = new Host(window, hostPlatform, commands, widgets, modulesMap);
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

// Fallback 'explorer' command, delegating to the compiled ui.file-explorer module.
// /home/user1/apps/explorer.js (force_reload: false, so user edits persist) registers
// the real 'explorer' command on boot via initd.run, and its registration is prepended
// after this one so it takes precedence when present. But if the virtual fs has a
// stale/incompatible explorer.js left over from an older app version (e.g. switching
// to a localStorage backend that still has old data), explorer.js may not register
// 'explorer' at all, leaving `command('explorer')` calls (opening a folder, the
// desktop "Explorer" context menu item) to throw an uncaught "Command: [explorer] not
// found". This fallback ensures 'explorer' always resolves to a working file explorer.
platform.host.registerCommand('explorer', (...args: unknown[]) => {
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
