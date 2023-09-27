import { Host, Platform, PlatformEvent } from "@shared/index"
import { Subject } from "rxjs"
import { Module, modules } from "./modules"

//@ts-ignore
const public_path = __webpack_public_path__ as string

class WindowService {

    constructor(private window: Window, private container: HTMLElement) {}

    public async createWindow() {
        return await new Promise<[Window, Subject<PlatformEvent>]>((resolve) => {
            const iframe = this.window.document.createElement('iframe')
            iframe.style.display = 'none'
            iframe.onload = () => {

                const platformEventEmitter = new Subject<PlatformEvent>()
                const newPlatform = new Platform(platformEventEmitter)
                iframe.contentWindow!.platform = newPlatform

                const host = new Host(this.window, newPlatform)
                newPlatform.setHost(host)

                resolve([iframe.contentWindow!, platformEventEmitter])
            }
            this.container.appendChild(iframe)
        })
    }

    public async loadScript(src: string, window: Window) {
        return await new Promise<Platform>((resolve) => {
            const script = window.document.createElement('script')
            script.src = src
    
            script.onload = () => {
                resolve(window.platform)
            }
            window.document.head.appendChild(script)
        })
    }
}

const windowService = new WindowService(window, window.document.body)
const dependenciesMap = new Map<string, {module: Module, window: Window, eventEmitter: Subject<PlatformEvent>, platform: Platform}>()

const run = async () => {

    const runAfterLoad: Array<()=>void> = []
    const Q: Array<Promise<any>> = []


    for(let _module_name in modules) {
        const _module = modules[_module_name]

        const loadScript = async () => {
            const [win, eventEmitter] = await windowService.createWindow()
            dependenciesMap.set(_module_name, {
                module: _module,
                window: win,
                eventEmitter,
                platform: win.platform
            })

            const _ = await windowService.loadScript(_module.url, win)

            runAfterLoad.push(() => eventEmitter.next({type: 'loaded', payload: []}))
            
            // eventEmitter.next({type: 'exit', payload: []})
        }

        Q.push(loadScript())
    }


    await Promise.all(Q)

    runAfterLoad.forEach(callback => callback())

    console.log(dependenciesMap)
}


run()