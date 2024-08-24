import { Command, Host, Platform, PlatformEvent } from "@shared/index";
import { BehaviorSubject, Subject } from "rxjs";
import { Module, modules } from "./modules/modules";
import type fs from 'fs'


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

        const host = new Host(this.window, newPlatform, commands, modulesMap);
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

      const _ = await windowService.loadScript(_module.url, win);

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
  initd.forEach(command => host.exec(command[0], ...command.slice(1)))

}

const runCommand = (cmd: string) => {
  const context = {
    window: null,
    global: null,
    globalThis: null,
    service: (moduleName: string, serviceName: string) => {
      const mod = modulesMap.get(moduleName)!;
      const srv = mod.platform.getService(serviceName)!
      if(!srv) throw `Servive: [${moduleName}/${serviceName}] not found`
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
const host = new Host(window, hostPlatform, commands, modulesMap);
hostPlatform.setHost(host);

modulesMap.set('root', {platform} as any)


// Init App
platform.host.registerCommand('core.add-module', (namespace: string, mod: Module) => {
    const currentModules = modules.getValue()
    const nextModules = {...currentModules, [namespace]: mod}
    modules.next(nextModules)
    platformEventEmitter.next({type: 'core.module-loaded', payload: nextModules})
});


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
      for(let filePath of args) {
        if(_fs.existsSync(filePath)){
          _fs.rmdirSync(filePath, { recursive: true });
        }
      }
  }
})
platform.register('exec', platform.host.exec.bind(platform.host))

export const windowService = new WindowService(window, window.document.body);
modules.subscribe((modules) => loadModules(modules));
