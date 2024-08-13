import { Module } from "@modules/modules"
import { BehaviorSubject, Observable, Subject } from "rxjs"
import type fs from 'fs'

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

  public execCommand(command: string) {
    console.log(
      `%c> ${command}`,
      "color: green;background:black;font-size:12px"
    );

    const context = {
      window: null,
      document: null,
      global: null,
      globalThis: null,
      service: (moduleName: string, serviceName: string) => {
        return this.getService(moduleName, serviceName);
      },
      command: (commandName: string) => {
        const allCommands = this.commands.getValue();
        const _cmd = allCommands.find((x) => x.name === commandName);
        if (!_cmd) throw `Command: [${commandName}] not found`;
        return _cmd;
      },
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

    const loadModule = (source: string) => {
      const jsBlob = new Blob([source], { type: "application/javascript" });
      const url = URL.createObjectURL(jsBlob);
      const configPlacegholder = `{
              "url": "${url}",
              "metedata": {
                  "version": "0.0.1"
              },
              "params": []
          }`;
      const form = {
        namespace: "dynamic",
        config: configPlacegholder,
      };
      const config = JSON.parse(form.config);
      console.log({ ...form, config });
      this.callCommand("core.add-module", form.namespace, config);

      return () => {};
    };

    // const worker = runAsRoot(source);
    // const worker = startWorker(source);
    const worker = loadModule(source);
    return worker;
  }

  public exec(filepath: string, ...args: string[]) {
    console.log(`$${filepath}`);
    const fs = this.getFS();
    const stat = fs.statSync(filepath);

    let script: string = "";
    if (stat.isDirectory()) {
      script = `service('001-core.layout', 'open-window') (command('ui.file-explorer'), '${filepath}' ${
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
        md: "ui.notepad",
        run: "ui.notepad",
      };

      script = `service('001-core.layout', 'open-window') (command('${
        appExtMap[fileExt as string] ?? appExtMap[""]
      }'), '${filepath}'${args.length ? ", " : ""}${args
        .map((x) => `"${x}"`)
        .join(", ")})`;

      // console.log(fileExt)
      // this.execCommand(script)
    }

    // console.log(`%c> ${script}`, 'color: green;background:black;font-size:12px')
    this.execCommand(script);
  }

  public getService(moduleName: string, serviceName: string): unknown {
    const mod = this.modulesMap.get(moduleName)!;
    if (!mod) return;

    const srv = mod.platform.getService(serviceName)!;
    if (!srv) throw `Servive: [${moduleName}/${serviceName}] not found`;

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
    constructor(private readonly _events: Subject<PlatformEvent>, public readonly name: string) {
        this.events$ = _events.asObservable()
    }

    public setHost(host: Host) {
        this.host = host
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
    public getService<T>(serviceName: string) {
        console.log(`Resolving service [${serviceName}]`)
        // this.host.getService(serviceName)
        return this._services.get(serviceName) as T;
    }

}

