// Ring 0 — IPC bus kernel module
// Raw postMessage router. All inter-process messaging goes through here.
// Platform (Ring 1) builds higher-level MessageBus on top of this.

import type _fs from 'fs'
import { normalizePath, isInside, isKernelOwned } from './path-policy'

export type IpcHandler = (data: unknown, source: Window) => unknown | Promise<unknown>

export type WmBridge = {
    getWindows: () => { pid: number; name: string; title: string; icon: string; minimized: boolean; active: boolean }[]
    toggleWindow: (pid: number) => void
    getLaunchItems: () => { name: string; label: string; icon: string; cmd?: string }[]
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
        __wosKernel?: WosKernelHook
    }
}

// --- Frame registry (documentation/security/decisions.md D4, audit KRN-1) ----
// Only frames the kernel itself created and registered may use this bus, and
// only for the events and paths in their policy. Callers: the layout (docks,
// canvas wallpaper) and ui.sandboxed-app — through `platform.host.registerIpcFrame`.
//
// Every webpack entry gets its own copy of this module, so the registry that
// the listener reads lives in the bundle that installs the listener (the
// bootstrapper, via initVFS) and other bundles reach it through the frozen
// `window.__wosKernel` hook installed below. Same-origin code can still call
// it — acceptable until phase 2, since same-origin code already has raw fs.
export type IpcFramePolicy = {
    /** Stable label for logs/tests, e.g. 'dock:gnome', 'wallpaper:canvas', 'sandboxed-app:/home/user1/x.html'. */
    id: string
    /** Allowed event names; a trailing '*' matches a prefix ('dock.*'). */
    events: string[]
    /** Path scopes for fs.* events — normalised prefixes, checked with path-policy isInside. */
    fs?: { read?: string[]; write?: string[] }
}

export type WosKernelHook = Readonly<{
    registerIpcFrame: (win: Window | null | undefined, policy: IpcFramePolicy) => () => void
    /** Installs the kernel's `window.open` hardening on a same-origin window (see hardenWindow). */
    hardenWindow?: (win: Window | null | undefined) => void
    /** Posts a `wos-ipc-event` to the registered frames whose policy covers it (see broadcastIpcEvent). */
    broadcastIpcEvent?: (event: string, data: unknown) => void
}>

/**
 * Wraps `win.open` so that cross-origin URLs always open with
 * `noopener,noreferrer`: the opened page gets no `window.opener` reference
 * back into the OS (audit KRN-11, APP-9). Same-origin opens, and about:blank
 * (which takes our origin), are unchanged. Idempotent per document: a
 * WindowProxy survives navigation, so "already hardened" is read from the
 * current document's own `open` property (our wrapper is locked), and a frame
 * that navigated to a new document is wrapped again. Ignores windows it can't
 * touch.
 */
export function hardenWindow(win: Window | null | undefined): void {
    if (!win) return
    let nativeOpen: Window['open']
    try {
        const current = Object.getOwnPropertyDescriptor(win, 'open')
        if (current && current.configurable === false) return
        nativeOpen = win.open.bind(win)
    } catch (_) { return }
    const wrapped = function (url?: string | URL, target?: string, features?: string): Window | null {
        let resolved: URL | null = null
        try { resolved = new URL(String(url ?? ''), win.location.href) } catch (_) { /* let the browser reject it */ }
        if (resolved && resolved.protocol !== 'about:' && resolved.origin !== win.location.origin) {
            const list = String(features ?? '').split(',').map(s => s.trim()).filter(Boolean)
            for (const f of ['noopener', 'noreferrer']) if (!list.includes(f)) list.push(f)
            return nativeOpen(resolved.href, target ?? '_blank', list.join(','))
        }
        return nativeOpen(url as string, target, features)
    }
    try {
        Object.defineProperty(win, 'open', { value: wrapped, writable: false, configurable: false })
    } catch (_) { /* already locked or cross-origin */ }
}

// One entry per registered frame. `origin` is pinned from the first request the
// frame sends ('null' for opaque sandboxes): a later request from another origin
// means the frame now holds a different document, and is ignored.
type IpcFrameEntry = { readonly policy: Readonly<IpcFramePolicy>; origin?: string }

const ipcFrames = new WeakMap<Window, IpcFrameEntry>()
// The same windows, iterable, for broadcasts. Discarded frames (closed) are
// pruned on the next broadcast.
const ipcFrameWindows = new Set<Window>()

// True only in the bundle copy that installed the listener (see initIpcBus).
let isKernelCopy = false

// The hook installed by the kernel copy, looked up from this realm upwards
// (a module iframe's own window has none; its parent — the OS window — does).
function findKernelHook(): WosKernelHook | undefined {
    let w: Window = window
    for (let depth = 0; depth < 16; depth++) {
        try { if (w.__wosKernel) return w.__wosKernel } catch (_) { return undefined }
        if (w.parent === w) return undefined
        w = w.parent
    }
    return undefined
}

const toStringList = (list: unknown): string[] =>
    Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string' && s !== '') : []

// fs scopes must be absolute, normalisable paths; anything else is dropped.
const toScopeList = (list: unknown): string[] => toStringList(list).filter(p => {
    try { return p.startsWith('/') && normalizePath(p) !== undefined } catch (_) { return false }
})

/** Registers a kernel-created frame's window with a policy. Returns an unregister function. */
export function registerIpcFrame(win: Window | null | undefined, policy: IpcFramePolicy): () => void {
    if (!win) return () => {}
    // Another bundle's copy of this module: register in the kernel's registry,
    // the only one the listener reads.
    if (!isKernelCopy) {
        const hook = findKernelHook()
        if (hook && hook.registerIpcFrame !== registerIpcFrame) return hook.registerIpcFrame(win, policy)
    }
    const frozen: Readonly<IpcFramePolicy> = Object.freeze({
        id: String(policy?.id ?? ''),
        events: Object.freeze(toStringList(policy?.events)) as string[],
        fs: Object.freeze({
            read: Object.freeze(toScopeList(policy?.fs?.read)) as string[],
            write: Object.freeze(toScopeList(policy?.fs?.write)) as string[],
        }),
    })
    const entry: IpcFrameEntry = { policy: frozen }
    ipcFrames.set(win, entry)
    ipcFrameWindows.add(win)
    return () => {
        if (ipcFrames.get(win) !== entry) return
        ipcFrames.delete(win)
        ipcFrameWindows.delete(win)
    }
}

/** The policy registered for a message source, or undefined for anything the kernel didn't register. */
export function getIpcFramePolicy(source: unknown): Readonly<IpcFramePolicy> | undefined {
    return source ? ipcFrames.get(source as Window)?.policy : undefined
}

/** True when `event` is in the policy's list — exactly, or under a trailing-'*' prefix entry ('dock.*'). */
export function isIpcEventAllowed(policy: Readonly<IpcFramePolicy>, event: string): boolean {
    return policy.events.some(p => p === event || (p.endsWith('*') && event.startsWith(p.slice(0, -1))))
}

// fs.* events by the scope they need. An fs.* event in neither set is refused.
const FS_READ_EVENTS: readonly string[] = ['fs.read', 'fs.readText', 'fs.list', 'fs.exists', 'fs.stat']
const FS_WRITE_EVENTS: readonly string[] = ['fs.write', 'fs.mkdir', 'fs.rm']

/**
 * Checks an fs.* request against the frame's policy and returns the
 * normalised path the handler must use. Throws when it isn't allowed:
 * read events need policy.fs.read, write events policy.fs.write, and system
 * paths (path-policy isKernelOwned, invariant I4) are never writable over IPC.
 */
export function checkIpcFsAccess(policy: Readonly<IpcFramePolicy>, event: string, data: unknown): string {
    const isWrite = FS_WRITE_EVENTS.includes(event)
    if (!isWrite && !FS_READ_EVENTS.includes(event)) throw new Error(`${event}: not available over IPC`)
    const raw = data && typeof data === 'object' ? (data as { path?: unknown }).path : undefined
    if (typeof raw !== 'string' || !raw.startsWith('/')) throw new Error(`${event}: an absolute path is required`)
    const path = normalizePath(raw)
    if (isWrite && isKernelOwned(path)) throw new Error(`${event}: permission denied: ${path} is a system path`)
    const scopes = (isWrite ? policy.fs?.write : policy.fs?.read) ?? []
    if (!scopes.some(base => isInside(base, path))) throw new Error(`${event}: permission denied: ${path}`)
    return path
}

// Non-fs events that act on one file: the path is checked exactly like a read
// (the frame may only name files inside its fs.read scope).
const PATH_READ_EVENTS: readonly string[] = ['editor.open']

// postMessage can't target an opaque origin by name, so sandboxed frames get
// '*' — the message still goes only to that one window.
const replyTargetOrigin = (origin: string): string => (origin && origin !== 'null' ? origin : '*')

async function handleIpcMessage(e: MessageEvent): Promise<void> {
    const msg = e.data
    if (!msg || typeof msg !== 'object' || msg.type !== 'wos-ipc') return
    const source = e.source as Window | null
    const entry = source ? ipcFrames.get(source) : undefined
    // Unregistered or foreign sender (other sites via opener/popup/embed, frames
    // the kernel didn't create): no reply at all.
    if (!source || !entry) return
    if (entry.origin === undefined) entry.origin = e.origin
    else if (entry.origin !== e.origin) return

    const { id, event, data } = msg as { id: unknown; event: unknown; data: unknown }
    const reply = (body: { result?: unknown; error?: string }) => {
        // Only to that registered window, and only while it still holds the
        // registration it had when it asked.
        if (ipcFrames.get(source) !== entry) return
        try { source.postMessage({ type: 'wos-ipc-response', id, ...body }, replyTargetOrigin(e.origin)) } catch (_) {}
    }

    if (typeof event !== 'string' || !isIpcEventAllowed(entry.policy, event)) {
        reply({ error: `IPC event not permitted: ${String(event)}` })
        return
    }
    const handler = handlers.get(event)
    if (!handler) {
        reply({ error: `Unknown IPC event: ${event}` })
        return
    }
    try {
        const arg = event.startsWith('fs.')
            ? { ...(data as object), path: checkIpcFsAccess(entry.policy, event, data) }
            : PATH_READ_EVENTS.includes(event)
                ? { ...(data as object), path: checkIpcFsAccess(entry.policy, 'fs.readText', data) }
                : data
        const result = await handler(arg, source)
        reply({ result: result ?? null })
    } catch (err) {
        reply({ error: String(err) })
    }
}

const handlers = new Map<string, IpcHandler>()

export function registerIpcHandler(event: string, handler: IpcHandler) {
    handlers.set(event, handler)
}

// A broadcast `ns.name` reaches a registered frame whose policy allows that
// event (isIpcEventAllowed) or any other event in the same namespace — a dock
// allowed 'wm.getWindows' also gets 'wm.windowsChanged'; a frame with only
// fs.* gets no window titles (audit KRN-13).
function isIpcBroadcastFor(policy: Readonly<IpcFramePolicy>, event: string): boolean {
    if (isIpcEventAllowed(policy, event)) return true
    const dot = event.indexOf('.')
    if (dot <= 0) return false
    const ns = event.slice(0, dot + 1)
    return policy.events.some(p => p.startsWith(ns))
}

/**
 * Posts a `wos-ipc-event` to the frames registered with registerIpcFrame whose
 * policy covers `event`, and to nothing else (audit KRN-13). `targetDoc` is
 * kept for compatibility and no longer used: registered frames are reached
 * wherever they are. Other bundles' copies delegate to the kernel's registry.
 */
export function broadcastIpcEvent(event: string, data: unknown, _targetDoc?: Document) {
    if (!isKernelCopy) {
        const hook = findKernelHook()
        if (hook?.broadcastIpcEvent && hook.broadcastIpcEvent !== broadcastIpcEvent) hook.broadcastIpcEvent(event, data)
        return
    }
    ipcFrameWindows.forEach(win => {
        const entry = ipcFrames.get(win)
        let closed = true
        try { closed = win.closed } catch (_) {}
        if (!entry || closed) {
            ipcFrameWindows.delete(win)
            if (entry && closed) ipcFrames.delete(win)
            return
        }
        if (!isIpcBroadcastFor(entry.policy, event)) return
        try { win.postMessage({ type: 'wos-ipc-event', event, data }, replyTargetOrigin(entry.origin ?? '')) } catch (_) {}
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
    if (!window.__wosIpcInit && !Object.getOwnPropertyDescriptor(window, '__wosKernel')) {
        window.__wosIpcInit = true
        isKernelCopy = true
        // Cross-bundle entry point to the registry above (see the comment there).
        Object.defineProperty(window, '__wosKernel', {
            value: Object.freeze({ registerIpcFrame, hardenWindow, broadcastIpcEvent }),
            writable: false,
            configurable: false,
            enumerable: false,
        })
        // The only wos-ipc listener (audit KRN-1): it answers frames registered
        // through registerIpcFrame, within their policy, and nobody else.
        window.addEventListener('message', (e: MessageEvent) => { void handleIpcMessage(e) })
    }

    // Window manager bridge handlers
    registerIpcHandler('wm.getWindows', () => window.__wosWmBridge?.getWindows() ?? [])
    registerIpcHandler('wm.toggleWindow', (d: any) => { window.__wosWmBridge?.toggleWindow(Number(d.pid)); return true })
    registerIpcHandler('wm.getLaunchItems', () => window.__wosWmBridge?.getLaunchItems() ?? [])
    // Launches only what the dock was offered (wm.getLaunchItems), not any
    // command by name (audit WIN-7).
    registerIpcHandler('wm.launch', (d: any) => {
        const name = String(d?.name ?? '')
        const offered = (window.__wosWmBridge?.getLaunchItems() ?? []).some(item => item.name === name)
        if (!offered) throw new Error(`wm.launch: ${name} is not a launch item`)
        window.__wosWmBridge?.launch?.(name)
        return true
    })

    // Opens a file the frame may read in the system editor (Notepad). The path
    // was already checked against the frame's fs.read scope; the editor is the
    // user's tool, so saving needs the user. Throttled so a page can't flood
    // the desktop with windows.
    const lastEditorOpen = new WeakMap<Window, number>()
    registerIpcHandler('editor.open', (d: any, source) => {
        const now = Date.now()
        if (now - (lastEditorOpen.get(source) ?? 0) < 1000) throw new Error('editor.open: too many requests')
        lastEditorOpen.set(source, now)
        if (!fs.existsSync(d.path) || fs.statSync(d.path).isDirectory()) throw new Error(`editor.open: not a file: ${d.path}`)
        const host = (window as any).platform?.host
        if (typeof host?.openWindow !== 'function') throw new Error('editor.open: the desktop is not ready')
        host.openWindow('ui.notepad', d.path)
        return true
    })

    // Dock bridge handlers
    registerIpcHandler('dock.registerSettings', (d: any, source) => {
        // A dock frame the layout registered as `dock:<id>` is that dock,
        // whatever dockId it reports about itself.
        const pinned = /^dock:([a-z0-9-]{1,64})$/.exec(ipcFrames.get(source)?.policy.id ?? '')
        const dockId = pinned ? pinned[1] : String(d?.dockId ?? '')
        if (window.__wosDockBridge) {
            window.__wosDockBridge.schema = d?.schema ?? []
            window.__wosDockBridge.dockId = dockId
        } else {
            window.__wosDockBridge = { schema: d?.schema ?? [], dockId, set: () => {} }
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

    // FS handlers. handleIpcMessage has already checked the event and the
    // path against the calling frame's policy (checkIpcFsAccess) and passes
    // the normalised path in `d.path`.
    registerIpcHandler('fs.read',    (d: any) => Array.from(fs.readFileSync(d.path) as Buffer))
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
