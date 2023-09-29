import { Command, Host, Platform, PlatformEvent } from "@shared/index";
import { BehaviorSubject, Subject } from "rxjs";
import { Module, modules } from "./modules/modules";

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

        const host = new Host(this.window, newPlatform, commands);
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

      script.onload = () => {
        resolve(window.platform);
      };
      window.document.head.appendChild(script);
    });
  }
}


const dependenciesMap = new Map<
  string,
  {
    module: Module;
    window: Window;
    eventEmitter: Subject<PlatformEvent>;
    platform: Platform;
  }
>();
const loadModules = async (modules: { [name: string]: Module }) => {
  const runAfterLoad: Array<() => void> = [];
  const Q: Array<Promise<any>> = [];

  for (let _module_name in modules) {
    if (dependenciesMap.has(_module_name)) continue;

    const _module = modules[_module_name];
    const loadScript = async () => {
      const [win, eventEmitter] = await windowService.createWindow(_module_name);
      dependenciesMap.set(_module_name, {
        module: _module,
        window: win,
        eventEmitter,
        platform: win.platform,
      });

      const _ = await windowService.loadScript(_module.url, win);

      runAfterLoad.push(() =>
        eventEmitter.next({ type: "loaded", payload: [] })
      );

      // eventEmitter.next({type: 'exit', payload: []})
    };

    Q.push(loadScript());
  }

  if (Q.length) await Promise.all(Q);
  runAfterLoad.forEach((callback) => callback());
  console.log(dependenciesMap);
};

// Load default variables
const platformEventEmitter = new Subject<PlatformEvent>();
const hostPlatform = new Platform(platformEventEmitter, "root");
const platform = window.platform = hostPlatform;

const commands = new BehaviorSubject<Array<Command>>([]);
const host = new Host(window, hostPlatform, commands);
hostPlatform.setHost(host);



// Init App
platform.host.registerCommand('core.add-module', (namespace: string, mod: Module) => {
    const currentModules = modules.getValue()
    const nextModules = {...currentModules, [namespace]: mod}
    modules.next(nextModules)
    platformEventEmitter.next({type: 'core.module-loaded', payload: nextModules})
})

const windowService = new WindowService(window, window.document.body);
modules.subscribe((modules) => loadModules(modules));