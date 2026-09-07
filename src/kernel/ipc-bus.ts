// Ring 0 — IPC bus kernel module
// Raw postMessage router. All inter-process messaging goes through here.
// Platform (Ring 1) builds higher-level MessageBus on top of this.

import type _fs from 'fs'

export type IpcHandler = (data: unknown, source: Window) => unknown | Promise<unknown>

export type WmBridge = {
    getWindows: () => { pid: number; name: string; title: string; icon: string; minimized: boolean; active: boolean }[]
    toggleWindow: (pid: number) => void
    getLaunchItems: () => { name: string; label: string; icon: string; cmd: string }[]
    launch?: (name: string) => void
}

export type DockSettingEntry = {
    key: string
    label: string
    type: 'toggle' | 'color' | 'range' | 'select' | 'app-list'
    value: unknown
    options?: string[]
    min?: number
    max?: number
    step?: number
}

export type DockBridge = {
    schema: DockSettingEntry[]
    dockId: string
    set: (key: string, value: unknown) => void
}

declare global {
    interface Window {
        __wosWmBridge?: WmBridge
        __wosDockBridge?: DockBridge
        __wosIpcInit?: boolean
    }
}

const handlers = new Map<string, IpcHandler>()

export function registerIpcHandler(event: string, handler: IpcHandler) {
    handlers.set(event, handler)
}

export function broadcastIpcEvent(event: string, data: unknown, targetDoc: Document = document) {
    targetDoc.querySelectorAll('iframe').forEach(f => {
        try { f.contentWindow?.postMessage({ type: 'wos-ipc-event', event, data }, '*') } catch (_) {}
    })
}

export function registerWmBridge(
    getWindows: WmBridge['getWindows'],
    toggleWindow: WmBridge['toggleWindow'],
    mainWindow: Window = window,
    getLaunchItems?: WmBridge['getLaunchItems'],
) {
    mainWindow.__wosWmBridge = {
        getWindows,
        toggleWindow,
        getLaunchItems: getLaunchItems ?? (() => []),
    }
}

export function initIpcBus(fs: typeof _fs) {
    if (!window.__wosIpcInit) {
        window.__wosIpcInit = true
        window.addEventListener('message', async (e: MessageEvent) => {
            if (!e.data || e.data.type !== 'wos-ipc') return
            const { id, event, data } = e.data
            const source = e.source as Window | null
            if (!source) return
            const handler = handlers.get(event)
            if (!handler) {
                source.postMessage({ type: 'wos-ipc-response', id, error: `Unknown IPC event: ${event}` }, '*')
                return
            }
            try {
                const result = await handler(data, source)
                source.postMessage({ type: 'wos-ipc-response', id, result: result ?? null }, '*')
            } catch (err) {
                source.postMessage({ type: 'wos-ipc-response', id, error: String(err) }, '*')
            }
        })
    }

    // Window manager bridge handlers
    registerIpcHandler('wm.getWindows', () => window.__wosWmBridge?.getWindows() ?? [])
    registerIpcHandler('wm.toggleWindow', (d: any) => { window.__wosWmBridge?.toggleWindow(Number(d.pid)); return true })
    registerIpcHandler('wm.getLaunchItems', () => window.__wosWmBridge?.getLaunchItems() ?? [])
    registerIpcHandler('wm.launch', (d: any) => { window.__wosWmBridge?.launch?.(String(d.name)); return true })

    // Dock bridge handlers
    registerIpcHandler('dock.registerSettings', (d: any) => {
        if (window.__wosDockBridge) {
            window.__wosDockBridge.schema = d.schema ?? []
            window.__wosDockBridge.dockId = d.dockId ?? ''
        } else {
            window.__wosDockBridge = { schema: d.schema ?? [], dockId: d.dockId ?? '', set: () => {} }
        }
        broadcastIpcEvent('dock.schemaChanged', { schema: window.__wosDockBridge!.schema, dockId: window.__wosDockBridge!.dockId })
        return true
    })
    registerIpcHandler('dock.getSchema', () => window.__wosDockBridge
        ? { schema: window.__wosDockBridge.schema, dockId: window.__wosDockBridge.dockId }
        : { schema: [], dockId: '' }
    )
    registerIpcHandler('dock.setSetting', (d: any) => {
        if (!window.__wosDockBridge) return false
        const entry = window.__wosDockBridge.schema.find(e => e.key === d.key)
        if (entry) entry.value = d.value
        broadcastIpcEvent('dock.settingChanged', { key: d.key, value: d.value })
        return true
    })
    registerIpcHandler('dock.getSettings', () =>
        window.__wosDockBridge
            ? window.__wosDockBridge.schema.reduce((acc: any, e) => { acc[e.key] = e.value; return acc }, {})
            : {}
    )

    // FS handlers — accessed through platform's ProxyFS in Ring 1;
    // these raw handlers remain for trusted system callers (SW bridge, dock, etc.)
    registerIpcHandler('fs.read',     (d: any) => Array.from(fs.readFileSync(d.path) as Buffer))
    registerIpcHandler('fs.readText', (d: any) => fs.readFileSync(d.path, 'utf8') as string)
    registerIpcHandler('fs.write',    (d: any) => {
        const c = d.content
        if (typeof c === 'string') fs.writeFileSync(d.path, c)
        else fs.writeFileSync(d.path, Buffer.from(c))
        return true
    })
    registerIpcHandler('fs.list',   (d: any) => fs.readdirSync(d.path) as string[])
    registerIpcHandler('fs.exists', (d: any) => fs.existsSync(d.path) as boolean)
    registerIpcHandler('fs.mkdir',  (d: any) => { fs.mkdirSync(d.path); return true })
    registerIpcHandler('fs.rm',     (d: any) => { fs.unlinkSync(d.path); return true })
    registerIpcHandler('fs.stat',   (d: any) => {
        const s = fs.statSync(d.path)
        return { isDirectory: s.isDirectory(), size: s.size ?? 0 }
    })
}
