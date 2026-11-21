// Ring 2 — the layout's own pluggable code, loaded only from the immutable
// static build (documentation/security/decisions.md D1; audit WIN-6, BOOT-5,
// BOOT-11).
//
// /opt/window-manager.js, /opt/wm/<id>.js, /opt/desktop/<id>.js and
// /usr/lib/ui/menuItem.js used to be read from the writable vfs and executed in
// the top realm, so any vfs write became persistent code execution. Their
// source now comes from the copy GitHub Pages serves from docs/
// (`/public/mount<path>`); the vfs copies are view-only. Sources are fetched
// once (callers preload them at layout start) and each module is evaluated at
// most once, on first use, so window creation can stay synchronous: until a
// module is available — or if it can't be loaded — callers use their compiled
// defaults.

import { Platform } from '@shared/index'

const STATIC_MOUNT_ROOT = '/public/mount'

// Absolute paths of plain segments ending in .js — never a URL, '..' or a query.
const SYSTEM_MODULE_PATH_RE = /^(\/[a-z0-9][a-z0-9_-]*)+(\/[A-Za-z0-9][A-Za-z0-9._-]*\.js)$/

type Entry = {
    /** undefined while the fetch is in flight, null when it failed. */
    source: string | null | undefined
    loaded: Promise<void>
    /** Set on first evaluation; null when evaluation failed. */
    evaluated?: { exports: any | null }
}
const entries = new Map<string, Entry>()

const fetchSource = async (path: string): Promise<string | null> => {
    try {
        if (!SYSTEM_MODULE_PATH_RE.test(path) || path.includes('..')) throw new Error('not a system module path')
        const origin = Platform.getInstance().window.location.origin
        const res = await fetch(new URL(STATIC_MOUNT_ROOT + path, origin).href, { credentials: 'same-origin' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.text()
    } catch (err) {
        console.warn(`[layout] ${path}: static copy unavailable — using the built-in default`, err)
        return null
    }
}

const entryFor = (path: string): Entry => {
    let entry = entries.get(path)
    if (!entry) {
        const created: Entry = { source: undefined, loaded: Promise.resolve() }
        created.loaded = fetchSource(path).then(source => { created.source = source })
        entries.set(path, created)
        entry = created
    }
    return entry
}

const evaluate = (path: string, entry: Entry): any | null => {
    if (!entry.evaluated) {
        let exports: any | null = null
        if (entry.source) {
            try {
                exports = Platform.getInstance().host.execString(entry.source, path) ?? null
            } catch (err) {
                console.error(`[layout] ${path}: failed to evaluate the static copy`, err)
            }
        }
        entry.evaluated = { exports }
    }
    return entry.evaluated.exports
}

/** Starts fetching a module's static source (idempotent). */
export const preloadSystemModule = (path: string): void => { entryFor(path) }

/**
 * Synchronous access: the module's exports once its source has arrived, `null`
 * if it can't be loaded, `undefined` while the fetch is still in flight.
 */
export const getSystemModule = (path: string): any | null | undefined => {
    const entry = entryFor(path)
    return entry.source === undefined ? undefined : evaluate(path, entry)
}

/** Resolves to the module's exports, or null if it can't be loaded. */
export const loadSystemModule = async (path: string): Promise<any | null> => {
    const entry = entryFor(path)
    await entry.loaded
    return evaluate(path, entry)
}
