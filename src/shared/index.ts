import { Module } from "@modules/modules"
import { BehaviorSubject, Observable, Subject } from "rxjs"
import type fs from 'fs'
const Babel = require('./babel.js');

const babelOpts = (filename: string, cwd: string) => ({
    presets: [['env', { modules: 'commonjs' }], 'react', 'typescript'],
    sourceMaps: true,
    filename,
    cwd,
})

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

// A widget is a small piece of UI rendered onto the desktop (e.g. a clock or
// a status display), registered via `platform.host.registerWidget(...)` from
// any script - typically one of the auto-loaded files in `/etc/widgets/`, but
// the registration call itself isn't special to that location.
export type WidgetApi = {
  platform: Platform;
  onDestroy: (cb: Function) => void;
};

export type WidgetDef = {
  name: string;
  render: (container: HTMLElement, api: WidgetApi) => void | (() => void);
  servicePlatformName: string;
  meta: Record<string, unknown>;
};

// A settings section is a dynamically-registered page in the Settings app
// (see /home/user1/settings.html) - registered via
// `platform.host.registerSettingsSection(...)` (or the 'settings' service's
// `registerSection`/`unregisterSection`). Settings renders one nav item per
// section (using `name` + `icon` from `meta`) and, when selected, calls
// `render` with a container element to fill, mirroring `WidgetDef.render`.
export type SettingsSectionApi = {
  platform: Platform;
  onDestroy: (cb: Function) => void;
};

export type SettingsSectionDef = {
  name: string;
  render: (container: HTMLElement, api: SettingsSectionApi) => void | (() => void);
  servicePlatformName: string;
  meta: Record<string, unknown>;
};


export type UICallbackProps = {
    pid: number
    setWindowView: (show: boolean) => void
    setTitle: (title: string) => void
    appendActionButton: (props: {icon: string, title: string, onClick: () => void}) => {remove: ()=>void}
    close: () => void
    onMessage: (cb: (message: unknown) => void) => () => void
    onDestroy: (cb: Function) => void
    toggleFullScreen: () => void
    getBoundingClientRect: () => Record<string, number>
    setBoundingClientRect: (rect: Record<string, number>) => void
    $args?: any[]
}

export class Host {
  public readonly commands$: Observable<Array<Command>>;
  public readonly widgets$: Observable<Array<WidgetDef>>;
  public readonly settingsSections$: Observable<Array<SettingsSectionDef>>;
  constructor(
    private window: Window,
    private readonly platform: Platform,
    private commands: BehaviorSubject<Array<Command>>,
    private widgets: BehaviorSubject<Array<WidgetDef>> = new BehaviorSubject<Array<WidgetDef>>([]),
    protected modulesMap: Map<
      string,
      {
        module: Module;
        window: Window;
        eventEmitter: Subject<PlatformEvent>;
        platform: Platform;
      }
    > = new Map(),
    private settingsSections: BehaviorSubject<Array<SettingsSectionDef>> = new BehaviorSubject<Array<SettingsSectionDef>>([])
  ) {
    this.commands$ = this.commands.asObservable();
    this.widgets$ = this.widgets.asObservable();
    this.settingsSections$ = this.settingsSections.asObservable();
  }

  // Looks up a module's `Platform` instance by its (unique) module name -
  // e.g. `command.servicePlatformName` - via the shared `modulesMap`, which
  // is the same `Map` instance passed to every `Host` across bundles. Used
  // by the task manager to inspect which services a process has requested.
  public getModulePlatform(name: string): Platform | undefined {
    return this.modulesMap.get(name)?.platform;
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
    // New registrations are prepended and `getCommand`/`callCommand` use `.find()`,
    // so the most-recently-registered command with a given name wins and any earlier
    // one is shadowed (used intentionally for the 'explorer' fallback in remote.ts).
    // Warn so accidental shadowing elsewhere doesn't go unnoticed.
    if (this.commands.getValue().find((x) => x.name === command_name)) {
      console.warn(`registerCommand: '${command_name}' is already registered — the new registration will take precedence.`);
    }

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

  public registerWidget(
    widget_name: string,
    render: WidgetDef["render"],
    meta: Record<string, unknown> = {}
  ): { remove: () => void } {
    const newWidget = Object.freeze({
      name: widget_name,
      render,
      servicePlatformName: this.platform.name,
      meta,
    });
    this.widgets.next([...this.widgets.getValue(), newWidget]);

    return {
      remove: () => {
        this.widgets.next(
          this.widgets.getValue().filter((x) => x !== newWidget)
        );
      },
    };
  }

  public registerSettingsSection(
    section_name: string,
    render: SettingsSectionDef["render"],
    meta: Record<string, unknown> = {}
  ): { remove: () => void } {
    const newSection = Object.freeze({
      name: section_name,
      render,
      servicePlatformName: this.platform.name,
      meta,
    });
    this.settingsSections.next([...this.settingsSections.getValue(), newSection]);

    return {
      remove: () => {
        this.settingsSections.next(
          this.settingsSections.getValue().filter((x) => x !== newSection)
        );
      },
    };
  }

  public getCommand(command_name: string) {
    const allCommands = this.commands.getValue();
    return allCommands.find((x) => x.name === command_name);
  }

  public getCommandsForExtension(ext: string) {
    const seen = new Set<string>();
    const results: Array<{ name: string; title: string; icon: string; wildcard: boolean }> = [];
    const dotExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext}`.toLowerCase();
    for (const cmd of this.commands.getValue()) {
      if (seen.has(cmd.name)) continue;
      const exts = (cmd.meta as any)?.fileExtensions as string[] | undefined;
      if (!exts || !Array.isArray(exts)) continue;
      seen.add(cmd.name);
      const isWild = exts.includes('*');
      const isMatch = isWild || exts.some(e => (e.startsWith('.') ? e : `.${e}`).toLowerCase() === dotExt);
      if (isMatch) {
        results.push({ name: cmd.name, title: (cmd.meta as any)?.title || cmd.name, icon: (cmd.meta as any)?.icon || 'apps', wildcard: isWild });
      }
    }
    results.sort((a, b) => (a.wildcard === b.wildcard ? a.title.localeCompare(b.title) : a.wildcard ? 1 : -1));
    return results;
  }

  public callCommand(command_name: string, ...args: any) {
    const command = this.getCommand(command_name);
    if (!command) { console.log(`Command [${command_name}] not registered!`); return; }
    return command.exec(...args);
  }

  public execCommand(command: string, platform: Platform, ...args: string[]) {
    const context = {
      window: null,
      document: null,
      global: null,
      globalThis: null,
      platform,
      service: (moduleName: string, serviceName: string) => {
        return this.getService(moduleName, serviceName);
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
    // Wrap in an async IIFE so command strings/`.run` scripts can use `await` and
    // callers (e.g. the terminal) can await completion of async commands. For
    // existing synchronous commands this has no observable effect: the body still
    // runs synchronously up to its first `await` (i.e. fully synchronously if it
    // has none), and the returned promise can simply be ignored.
    const factory = new Function(...Object.keys(context), `return (async () => {\n${command}\n})();`);
    return factory.call({}, ...Object.values(context));
  }

  public execString(source: string, filenameAlias: string = '/tmp/dynamic.js', _platform?: Platform, _platformProps?: Record<string, unknown>) {
    const runJS = (source: string) => {
      const program = Babel.transform(source, babelOpts(filenameAlias, this.platform.cwd));
      program.map.sources = ['babel://'+filenameAlias]
      const base64SourceMap = btoa(unescape(encodeURIComponent(JSON.stringify(program.map))));
      const codeWithSourceMap = `${program.code}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64SourceMap}`;

        const platformEventEmitter = new Subject<PlatformEvent>();
        const lastSlash = filenameAlias.lastIndexOf('/')
        const pwd = lastSlash > -1 ? filenameAlias.slice(0, lastSlash) || "/" : "/"
        let newPlatform = _platform ? _platform : new Platform(platformEventEmitter, filenameAlias, pwd);
        if(!_platform) {
          newPlatform.setHost(this);
          newPlatform.register('props', {});
          newPlatform.register('$args', []);
          newPlatform.register('React', this.platform.getService('React'));
          newPlatform.register('ReactDOM', this.platform.getService('ReactDOM'));
        }
        if (_platformProps) {
          Object.assign(newPlatform, _platformProps);
        }
        const _ctx: any = {
          exports: {}, 
          require: (req_filename: string) => newPlatform.require.bind(newPlatform)(req_filename, filenameAlias, newPlatform), 
          window: {platform: newPlatform, document: this.window.document, top: this.window.top},
          platform: newPlatform,
        }
        _ctx.module = _ctx.exports
        const factory = new Function(...Object.keys(_ctx), codeWithSourceMap)
        factory.call(this, ...Object.values(_ctx))

        return _ctx.exports
    };

    return runJS(source);
  }

  public exec(callerPlatform: Platform, filepath: string, ...args: string[]) {
    console.log(`$${filepath}`);
    const fs = this.getFS();
    const stat = fs.statSync(filepath);

    let script: string = "";
    if (stat.isDirectory()) {
      script = `service('001-core.layout', 'open-window') (command('explorer'), '${filepath}' ${
        args.length ? "," : ""
      } ${args.map((x) => `"${x}"`).join(", ")})`;
    }

    if (stat.isFile()) {
      const fileExt = filepath.split(".").at(-1);

      const appExtMap: Record<string, string> = {
        "": "ui.notepad",
        html: "ui.iframe",
        ts: "ui.notepad",
        png: "ui.imageviewer",
        jpg: "ui.imageviewer",
        jpeg: "ui.imageviewer",
        gif: "ui.imageviewer",
        webp: "ui.imageviewer",
        svg: "ui.iframe",
        bmp: "ui.imageviewer",
        ico: "ui.iframe",
        avif: "ui.imageviewer",
        txt: "ui.notepad",
        md: "ui.markdown",
        csv: "ui.csv-viewer",
        db: "ui.sqlite",
        mmd: "ui.mermaid",
        mermaid: "ui.mermaid",
      };

      if (fileExt === 'js') {
        const fs = this.getFS()
        const source = fs.readFileSync(filepath)
        const appDir = (callerPlatform as any)?._appDir;
        return this.execString(source.toString(), '/(sw)' + filepath, undefined, appDir ? { _appDir: appDir } : undefined)
      }

      else if (fileExt === 'run') {
        const fs = this.getFS()
        const source = fs.readFileSync(filepath)
        return this.execCommand(source.toString(), callerPlatform, ...args)
      }

      else {
        const registered = this.getCommandsForExtension(fileExt as string);
        const bestMatch = registered.find(r => !r.wildcard) || registered[0];
        const cmdName = bestMatch ? bestMatch.name : (appExtMap[fileExt as string] ?? appExtMap[""]);
        script = `service('001-core.layout', 'open-window') (command('${cmdName}'), '${filepath}'${args.length ? ", " : ""}${args.map((x) => `"${x}"`).join(", ")})`;
      }


    }

    return this.execCommand(script, callerPlatform, ...args);
  }

  public getService(moduleName: string, serviceName: string): unknown {
    if(!moduleName) return;

    const mod = this.modulesMap.get(moduleName)!;
    if (!mod) return;

    const srv = mod.platform.getServiceSync(serviceName)!;
    if (!srv) console.warn(`Service: [${moduleName}/${serviceName}] not found`);

    return srv;
  }

  public getFS() {
    this.platform.requestedServices.add('fs')
    // @ts-ignore
    return this.window.fs as typeof fs;
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

    // Services this platform instance has requested via `getService`, used
    // by the task manager to show "which services are requested by the
    // process" (looked up cross-bundle via `Host.getModulePlatform`).
    public readonly requestedServices = new Set<string>()

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
        this.requestedServices.add(serviceName)
        // this.host.getService(serviceName)
        if(this._services.has(serviceName)) return this._services.get(serviceName) as T;

        // FIXME: BUG - service should not update other service function diractly, use shared point of memory for communication
        const oldCallerPlatform = (this.host.getService as any).callerPlatform;
        (this.host.getService as any).callerPlatform = this;
        const result = this.host.getService('root', serviceName);
        (this.host.getService as any).callerPlatform = oldCallerPlatform;
        return result
    }

    public require(filepath: string, by?: string, _platform?:Platform) {
      if(filepath.startsWith('./')) {
        // TODO: prefix current program working directory

        let pwd = _platform ? _platform.cwd : this.cwd
        if(by) {
          pwd = by.slice(0, by.lastIndexOf('/') > -1 ? by.lastIndexOf('/'): undefined) || pwd
        }
        //FIXME: fallback to root (/) is not a good idea
        filepath = (pwd || '/') + filepath.slice(1)
      }

      if(filepath.startsWith('/(sw)/')){
        filepath = filepath.slice('/(sw)'.length)
      }

      const fs = this.host.getFS()
      
      try {

        if(filepath.startsWith('https://')) {
          return fetch(filepath).then(res => res.text()).then(code => Babel.transform(code,  { presets: [['env', { modules: false }], 'typescript', "react"],  sourceMaps: true, filename: 'dynamic.js' }).code)
            .then(
              code => {
                const _ctx: any = {
                  exports: {}, 
                  require: (req_filename: string) => this.require.bind(this)(req_filename, filepath, _platform), 
                  platform: _platform,
                  // React: this.getService('React'),
                }
                _ctx.module = _ctx.exports
                const factory = new Function(...Object.keys(_ctx), code)
                factory.call(this, ...Object.values(_ctx))
                return _ctx.exports
              }
            )
        }

        if(!fs.existsSync(filepath)) return this.getService(filepath);

        let code = fs.readFileSync(filepath).toString()

        if(filepath.endsWith('.js') || filepath.endsWith('.ts') || filepath.endsWith('.tsx')) {
          const program = Babel.transform(code, babelOpts(filepath, this.cwd));
          const base64SourceMap = btoa(unescape(encodeURIComponent(JSON.stringify(program.map))));
          program.map.sources = ['babel://'+filepath]
          const codeWithSourceMap = `${program.code}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64SourceMap}`;

          code = codeWithSourceMap
        }
        const _ctx: any = {
          exports: {}, 
          require: (req_filename: string) => this.require.bind(this)(req_filename, filepath, _platform), 
          // React: this.getService('React')
        }
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

  // Get the directory the Wallpaper settings page additionally lists images from
  public getWallpapersDir(): string | undefined {
    return this.preferences.wallpapers_dir;
  }

  public setWallpapersDir(dir: string): void {
    this.loadPreferences();
    this.preferences.wallpapers_dir = dir;
    this.savePreferences();
  }

  // Removes a wallpaper from the saved list. If it was the active wallpaper, falls
  // back to default_wallpaper (or the first remaining wallpaper).
  public removeWallpaper(wallpaper: string): string | undefined {
    this.loadPreferences();
    this.preferences.wallpapers = this.preferences.wallpapers?.filter(w => w !== wallpaper);

    if (this.preferences.wallpaper === wallpaper) {
      this.preferences.wallpaper = this.preferences.default_wallpaper ?? this.preferences.wallpapers?.[0];
    }

    this.savePreferences();
    return this.preferences.wallpaper;
  }

  // Require method for specific preference key
  public require(key: string): any {
    if (!this.preferences[key]) {
      throw new Error(`Preference for ${key} is required but not found.`);
    }
    return this.preferences[key];
  }
}