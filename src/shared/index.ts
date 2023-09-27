import { BehaviorSubject, Observable, Subject } from "rxjs"

declare global{
    interface Window {
        platform: Platform
    }
}

export type PlatformEvent = {
    type: string
    service?: {
        namespace: string
        name: string
    }
    payload: any
}


export class Host {

    public readonly commands$: Observable<Array<{name: string, exec: ()=>void}>>
    constructor(private window: Window, private readonly platform: Platform, private commands: BehaviorSubject<Array<{name: string, exec: ()=>void}>>) {
        this.commands$ = this.commands.asObservable()
    }

    public appendDomElement(el: HTMLElement) {
        this.window.document.body.appendChild(el)
    }

    public createCSSStyleSheet() {
        return new CSSStyleSheet()
    }

    public addCSSStyleSheet(style: CSSStyleSheet) {
        if(this.window.document.adoptedStyleSheets.find(x => x === style)) return

        this.window.document.adoptedStyleSheets.push(style)
    }

    public removeCSSStyleSheet(style: CSSStyleSheet) {        
        this.window.document.adoptedStyleSheets = this.window.document.adoptedStyleSheets.filter(x => x !== style)
    }

    public registerCommand(command_name: string, callback: (...args: any[]) => void, options: {label?: string} = {}) {
        this.commands.next([...this.commands.getValue(), {name: command_name, exec: callback}])
    }
}


export class Platform {
    private _services = new Map<string, unknown>()

    public readonly events$: Observable<PlatformEvent>
    public host!: Host
    public window: Window = window
    constructor(private readonly _events: Subject<PlatformEvent>) {
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

    public getService<T>(serviceName: string) {
        return this._services.get(serviceName) as T
    }

}

