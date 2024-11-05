import { Module } from "@modules/modules"
import { BehaviorSubject, Observable, Subject } from "rxjs"
import type fs from 'fs'
const Babel = require('./babel.js');


declare global{
    interface Window {
        platform: Platform
        require: (moduleName: string) => unknown
    }
}

export type PlatformEvent = {
    type: string
    service?: {
        namespace: string
        name: string
    }
    payload: any,
    module?: Module
}


export type Command = {
  name: string;
  exec: (...args: unknown[]) => void;
  servicePlatformName: string;
  meta: Record<string, unknown>;
};


export type UICallbackProps = {
    setWindowView: (show: boolean) => void
    setTitle: (title: string) => void
    appendActionButton: (props: {icon: string, title: string, onClick: () => void}) => {remove: ()=>void}
    close: () => void
    toggleFullScreen: () => void
    getBoundingClientRect: () => Record<string, number>
    setBoundingClientRect: (rect: Record<string, number>) => void
    $args?: any[]
}

export class Host {
  public readonly commands$: Observable<Array<Command>>;
  constructor(
    private window: Window,
    private readonly platform: Platform,
    private commands: BehaviorSubject<Array<Command>>,
    protected modulesMap: Map<
      string,
      {
        module: Module;
        window: Window;
        eventEmitter: Subject<PlatformEvent>;
        platform: Platform;
      }
    > = new Map()
  ) {
    this.commands$ = this.commands.asObservable();
  }

  public appendDomElement(el: HTMLElement) {
    this.window.document.body.appendChild(el);
  }

  public createCSSStyleSheet() {
    return new CSSStyleSheet();
  }

  public addCSSStyleSheet(style: CSSStyleSheet) {
    if (this.window.document.adoptedStyleSheets.find((x) => x === style))
      return;

    this.window.document.adoptedStyleSheets.push(style);
  }

  public removeCSSStyleSheet(style: CSSStyleSheet) {
    this.window.document.adoptedStyleSheets =
      this.window.document.adoptedStyleSheets.filter((x) => x !== style);
  }

  public registerCommand(
    command_name: string,
    callback: (...args: any[]) => void,
    meta: Record<string, unknown> = {}
  ): { remove: () => void } {
    // if(this.commands.getValue().find(x => x.name === command_name)) {
    //     throw `Duplicate command name [${command_name}]`
    // }

    const newCommandObject = Object.freeze({
      name: command_name,
      exec: callback,
      servicePlatformName: this.platform.name,
      meta,
    });
    this.commands.next([newCommandObject, ...this.commands.getValue()]);

    return {
      remove: () => {
        this.commands.next(
          this.commands.getValue().filter((x) => x !== newCommandObject)
        );
      },
    };
  }

  public getCommand(command_name: string) {
    const allCommands = this.commands.getValue();
    return allCommands.find((x) => x.name === command_name);
  }

  public callCommand(command_name: string, ...args: any) {
    const allCommands = this.commands.getValue();
    const commands = allCommands.filter((x) => x.name === command_name);

    if (commands.length === 0)
      console.log(`Command [${command_name}] not registered!`);

    commands.forEach((command) => command.exec(...args));
  }

  public execCommand(command: string, platform: Platform, ...args: string[]) {
    // console.log(
    //   `%c> ${command}`,
    //   "color: green;background:black;font-size:12px"
    // );

    const context = {
      window: null,
      document: null,
      global: null,
      globalThis: null,
      platform,
      service: (moduleName: string, serviceName: string) => {

        // try {
        //   const moduleResult = plarform.getService(moduleName)
        //   if(moduleResult) return moduleResult;
        // } catch (error) {}
        
        const hostResult = this.getService(moduleName, serviceName);
        return hostResult
      },
      command: (commandName: string) => {
        const allCommands = this.commands.getValue();
        const _cmd = allCommands.find((x) => x.name === commandName);
        if (!_cmd) throw `Command: [${commandName}] not found`;
        return _cmd;
      },
      $args: args
    };
    //   const factory = new Function(...Object.keys(context), 'return '+command);
    const factory = new Function(...Object.keys(context), command);
    factory.call({}, ...Object.values(context));
  }

  public execString(source: string) {
    function startWorker(source: string) {
      const blob = new Blob([source], { type: "application/javascript" });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);
      worker.onmessage = function (event) {
        console.log(event.data);
      };
      return () => worker.terminate();
    }

    function runAsRoot(source: string) {
      const factory = new Function(source);
      factory.call(window);
      return () => {};
    }

    const runJS = (source: string) => {
      const program = Babel.transform(source, { presets: [['env', { modules: false }], "react", 'typescript'],  sourceMaps: true, filename: 'dynamic.js' });
      const base64SourceMap = btoa(unescape(encodeURIComponent(JSON.stringify(program.map))));
      const codeWithSourceMap = `${program.code}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64SourceMap}`;



      // const jsBlob = new Blob([codeWithSourceMap], { type: "application/javascript" });
      // const url = URL.createObjectURL(jsBlob);
      // const configPlacegholder = `{
      //         "url": "${url}",
      //         "metedata": {
      //             "version": "0.0.1"
      //         },
      //         "params": [],
      //         "preload": true
      //     }`;
      // const form = {
      //   namespace: "dynamic",
      //   config: configPlacegholder,
      // };
      // const config = JSON.parse(form.config);
      // this.callCommand("core.add-module", form.namespace, config);


      // const program = Babel.transform(code, { presets: [['env', { modules: false }], 'typescript', "react"],  sourceMaps: true, filename: 'dynamic.js' });
      //     const base64SourceMap = btoa(unescape(encodeURIComponent(JSON.stringify(program.map))));
      //     const codeWithSourceMap = `${program.code}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64SourceMap}`;

      //     code = codeWithSourceMap
      //   }
        const _ctx: any = {exports: {}, require: this.platform.require.bind(this.platform)}
        const factory = new Function(...Object.keys(_ctx), codeWithSourceMap)
        factory.call(this, ...Object.values(_ctx))

        return _ctx.exports
      // return () => {};
    };

    // const worker = runAsRoot(source);
    // const worker = startWorker(source);
    const worker = runJS(source);
    return worker;
  }

  public exec(plarform: Platform, filepath: string, ...args: string[]) {
    console.log(`$${filepath}`);
    const fs = this.getFS();
    const stat = fs.statSync(filepath);

    let script: string = "";
    if (stat.isDirectory()) {
      script = `service('001-core.layout', 'open-window') (command('explorer'), '${filepath}' ${
        args.length ? "," : ""
      } ${args.map((x) => `"${x}"`).join(", ")})`;
      // console.log(script)
      // this.execCommand(script)
      // return
    }

    if (stat.isFile()) {
      // if(filepath.endsWith('.html')) {
      //     this.execCommand(`service('001-core.layout', 'open-window') (command('ui.iframe'), '/cache${filepath}')`)
      //     return
      // }
      const fileExt = filepath.split(".").at(-1);

      const appExtMap: Record<string, string> = {
        "": "ui.notepad",
        html: "ui.iframe",
        ts: "ui.notepad",
        png: "ui.iframe",
        txt: "ui.notepad",
        md: "ui.markdown",
      };

      if (fileExt === 'js') {
        const fs = this.getFS()
        const source = fs.readFileSync(filepath)
        this.execString(source.toString())

        return;
      }

      else if (fileExt === 'run') {
        const fs = this.getFS()
        const source = fs.readFileSync(filepath)
        this.execCommand(source.toString(), plarform, ...args)
        return;
      }

      else {
        script = `service('001-core.layout', 'open-window') (command('${appExtMap[fileExt as string] ?? appExtMap[""]}'), '${filepath}'${args.length ? ", " : ""}${args.map((x) => `"${x}"`).join(", ")})`;
      }


      // console.log(fileExt)
      // this.execCommand(script)
    }

    // console.log(`%c> ${script}`, 'color: green;background:black;font-size:12px')
    this.execCommand(script, plarform, ...args);
  }

  public getService(moduleName: string, serviceName: string): unknown {

    // const callerPlatform = (this.getService as any).callerPlatform as Platform;
    // const isMatch = (key: string, value: Platform) => moduleName ? key === moduleName && value.getServiceSync(serviceName) : value.getServiceSync(serviceName)
    // const srv = Array.from(this.modulesMap).filter(([key, _]) => key !== callerPlatform?.name).find(([key, value]) => isMatch(key, value.platform))?.[1]?.platform?.getService(serviceName);

    if(!moduleName) return;

    const mod = this.modulesMap.get(moduleName)!;
    if (!mod) return;
    // return mod.platform.getService(serviceName)

    const srv = mod.platform.getServiceSync(serviceName)!;
    if (!srv) console.warn(`Servive: [${moduleName}/${serviceName}] not found`);

    return srv;
  }

  public getFS() {
    // @ts-ignore
    return this.window.fs as typeof fs;

    // @ts-ignore
    // return this.window.fs as {readdir: Function, readdirSync: Function, statSync: (path: string) => {}}
  }

  public getServiceWorker() {
    return navigator.serviceWorker.controller;
  }

  public getModulesDetails() {
    const mp: Record<string, Array<string>> = {};
    this.modulesMap.forEach(
      (item) => (mp[item.platform.name] = item.platform.getServiceList())
    );
    return mp;
  }
}


export class Platform {
    private _services = new Map<string, unknown>()

    public readonly events$: Observable<PlatformEvent>
    public host!: Host
    public window: Window = window
    public userPref!: UserPreference
    constructor(private readonly _events: Subject<PlatformEvent>, public readonly name: string, public readonly cwd='/') {
        this.events$ = _events.asObservable()
    }

    public setHost(host: Host) {
        this.host = host
        this.userPref = new UserPreference('/user-preferences.json', this);
    }

    static getInstance() {
        return window.platform
    }

    public register(serviceName: string, service: unknown) {
        this._services.set(serviceName, service)
    }

    public getServiceList() {
        return Array.from(this._services.keys());
    }

    public getServiceSync<T>(serviceName: string) {
      return this._services.get(serviceName) as T;
    }
    public getService<T>(serviceName: string) {
        console.log(`Resolving service [${serviceName}]`)
        // this.host.getService(serviceName)
        if(this._services.has(serviceName)) return this._services.get(serviceName) as T;

        // FIXME: BUG - service should not update other service function diractly, use shared point of memory for communication
        const oldCallerPlatform = (this.host.getService as any).callerPlatform;
        (this.host.getService as any).callerPlatform = this;
        const result = this.host.getService('root', serviceName);
        (this.host.getService as any).callerPlatform = oldCallerPlatform;
        return result
    }

    public require(filepath: string) {
      const fs = this.host.getFS()

      if(filepath.startsWith('.')) {
        // TODO: prefix current program working directory
        filepath = (this.cwd || '') + filepath
      }
      try {

        if(filepath.startsWith('https://')) {
          return fetch(filepath).then(res => res.text()).then(code => Babel.transform(code,  { presets: [['env', { modules: false }], 'typescript', "react"],  sourceMaps: true, filename: 'dynamic.js' }).code)
            .then(
              code => {
                const _ctx: any = {exports: {}, require: this.require.bind(this)}
                const factory = new Function(...Object.keys(_ctx), code)
                factory.call(this, ...Object.values(_ctx))
                return _ctx.exports
              }
            )
        }

        if(!fs.existsSync(filepath)) return this.getService(filepath);

        let code = fs.readFileSync(filepath).toString()

        if(filepath.endsWith('.js')) {
          const program = Babel.transform(code, { presets: [['env', { modules: false }], 'typescript', "react"],  sourceMaps: true, filename: filepath });
          const base64SourceMap = btoa(unescape(encodeURIComponent(JSON.stringify(program.map))));
          const codeWithSourceMap = `${program.code}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64SourceMap}`;

          code = codeWithSourceMap
        }
        const _ctx: any = {exports: {}, require: this.require.bind(this)}
        const factory = new Function(...Object.keys(_ctx), code)
        factory.call(this, ...Object.values(_ctx))
        return _ctx.exports
      } catch (error) {
        console.error(error)
        return undefined
      }
      
    }

}

type UserPreferences = {
  wallpaper?: string;
  wallpapers?: Array<string>;
  [key: string]: any; // Allows for additional preference properties
};

class UserPreference {
  private preferences: UserPreferences = {};
  private filePath: string;

  constructor(filePath: string, private platform: Platform) {
    this.filePath = filePath;
    this.loadPreferences();
  }

  // Load preferences from JSON file
  private loadPreferences(): void {
    const fs = this.platform.host.getFS();
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      this.preferences = JSON.parse(data);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        console.log('Preferences file not found, creating a new one.');
        this.savePreferences();
      } else {
        console.error('Error loading preferences:', err);
      }
    }
  }

  // Save preferences to JSON file
  private savePreferences(): void {
    const fs = this.platform.host.getFS();
    try {
      const data = JSON.stringify(this.preferences, null, 2);
      fs.writeFileSync(this.filePath, data);
    } catch (err) {
      console.error('Error saving preferences:', err);
    }
  }

  // Get the current wallpaper setting
  public getWallpaper(): string | undefined {
    return this.preferences.wallpaper;
  }

  // Set a new wallpaper and save the preferences
  public setWallpaper(wallpaper: string): void {
    this.loadPreferences();
    this.preferences.wallpaper = wallpaper;
    this.savePreferences();
  }

  public addWallpaper(wallpaper: string): void {
    this.loadPreferences();
    this.preferences.wallpapers?.push(wallpaper);
    this.savePreferences();
  }

  // Require method for specific preference key
  public require(key: string): any {
    if (!this.preferences[key]) {
      throw new Error(`Preference for ${key} is required but not found.`);
    }
    return this.preferences[key];
  }
}