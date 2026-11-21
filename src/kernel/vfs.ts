// Ring 0 — VFS kernel module
// Owns BrowserFS mount, path bootstrap from meta.json, and segment-safe mkdir.
// No business logic. Called once at boot from src/index.ts.

//@ts-nocheck
import type _fs from 'fs'
import { initIpcBus } from './ipc-bus'
import { normalizePath, isInside } from './path-policy'

export const FS_BACKEND_STORAGE_KEY = '__app_fs_backend__';
export const FS_BACKEND_QUERY_PARAM = 'fsBackend';

export type FsBackend = 'indexeddb' | 'localstorage';

// Removes one query parameter from the address bar, keeping the rest of the
// URL (other params, the deep-link hash) as it was.
function stripQueryParam(name: string) {
    try {
        const url = new URL(window.location.href)
        if (!url.searchParams.has(name)) return
        url.searchParams.delete(name)
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    } catch (_) { /* best effort */ }
}

export function resolveFsBackend(): FsBackend {
    let stored: FsBackend = 'indexeddb'
    try { if (localStorage.getItem(FS_BACKEND_STORAGE_KEY) === 'localstorage') stored = 'localstorage' } catch (_) {}
    const params = new URLSearchParams(window.location.search)
    if (!params.has(FS_BACKEND_QUERY_PARAM)) return stored
    const fromQuery = params.get(FS_BACKEND_QUERY_PARAM)
    // Consumed either way, so a reload or a copied link doesn't apply it again.
    stripQueryParam(FS_BACKEND_QUERY_PARAM)
    if ((fromQuery !== 'indexeddb' && fromQuery !== 'localstorage') || fromQuery === stored) return stored
    // The two backends are separate filesystems: a link must not switch this
    // browser to another one without the user agreeing (audit KRN-9). Settings
    // > Storage stores the choice before reloading, so it never gets here.
    let ok = false
    try {
        ok = window.confirm(
            `This link asks to switch this browser's file system storage from "${stored}" to "${fromQuery}".\n\n` +
            'The two are separate file systems — your files stay where they are, but you will see ' +
            'the other one until you switch back in Settings > Storage.\n\nSwitch now?')
    } catch (_) { ok = false }
    if (!ok) return stored
    try { localStorage.setItem(FS_BACKEND_STORAGE_KEY, fromQuery) } catch (_) {}
    return fromQuery
}

// BrowserFS ignores { recursive: true } — create each segment individually.
export function mkdirRecursive(fs: typeof _fs, path: string): void {
    const segments = path.replace(/^\//, '').split('/')
    let cur = ''
    for (const seg of segments) {
        cur += '/' + seg
        try { fs.mkdirSync(cur) } catch (e: any) { if (e.code !== 'EEXIST') throw e }
    }
}

const DEFAULT_DIRS = [
    '/home', '/home/user1', '/home/user1/projects',
    '/mnt', '/usr', '/usr/bin', '/usr/lib', '/usr/local',
    '/usr/share', '/usr/share/icons',
    '/bin', '/etc', '/etc/wm', '/etc/pkg',
    '/opt', '/opt/apps',
    '/proc', '/srv', '/sys', '/tmp',
    '/var', '/var/log', '/var/spool',
]

const createBackend = <T>(Ctor: { Create(opts: T, cb: (err: any, fs?: any) => void): void }, opts: T): Promise<any> =>
    new Promise((resolve, reject) => Ctor.Create(opts, (err, fs) => err ? reject(err) : resolve(fs)))

const createIndexedDBMirror = async (Backend: any, storeName: string) => {
    const idbFS = await createBackend(Backend.IndexedDB, { storeName })
    await new Promise<void>((resolve, reject) => idbFS.makeRootDirectory((err: any) => err ? reject(err) : resolve()))
    const memFS = await createBackend(Backend.InMemory, {})
    return createBackend(Backend.AsyncMirror, { sync: memFS, async: idbFS })
}

export async function initVFS(bootLog: (label: string, t0: number, err?: string) => void): Promise<typeof _fs> {
    const t0 = Date.now()
    window.BrowserFS.install(window)

    const Backend = window.BrowserFS.FileSystem
    const fsBackend = resolveFsBackend()

    let mfs: any
    if (fsBackend === 'localstorage') {
        const rootFS = await createBackend(Backend.LocalStorage, {})
        const tmpFS  = await createBackend(Backend.InMemory, {})
        const mntFS  = await createBackend(Backend.InMemory, {})
        mfs = await createBackend(Backend.MountableFileSystem, { '/': rootFS, '/tmp': tmpFS, '/mnt': mntFS })
    } else {
        const rootFS = await createIndexedDBMirror(Backend, 'fs')
        const tmpFS  = await createIndexedDBMirror(Backend, 'tmp')
        const mntFS  = await createIndexedDBMirror(Backend, 'mnt')
        mfs = await createBackend(Backend.MountableFileSystem, { '/': rootFS, '/tmp': tmpFS, '/mnt': mntFS })
    }

    window.BrowserFS.initialize(mfs)
    bootLog(`VFS init (${fsBackend})`, t0)

    const fs = window.require('fs') as typeof _fs
    window.fs = fs

    // Expose runtime (un)mount + backend creation so apps can graft extra backends into
    // the tree after boot (e.g. WebRTC's live remote-folder mounts under /mnt/webrtc/<label> —
    // see docs/public/mount/opt/apps/webrtc/main.html). `mfs` is the top-level
    // MountableFileSystem; any code holding `platform.host.getFS()` (always this exact `fs`
    // object, even from a different same-origin iframe) gets these too.
    ;(fs as any).mount = (mountPoint: string, backend: any) => mfs.mount(mountPoint, backend)
    ;(fs as any).umount = (mountPoint: string) => mfs.umount(mountPoint)
    ;(fs as any).createBackend = (name: string, opts: Record<string, unknown> = {}) =>
        createBackend((window.BrowserFS.FileSystem as any)[name], opts)

    // Wire IPC fs handlers so service worker / iframes can call fs via postMessage
    initIpcBus(fs)

    DEFAULT_DIRS.forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir)
    })

    await bootstrapMetaFiles(fs, bootLog)

    return fs
}

const META_SERVER_PATH = '/public/mount/meta.json'
const STATIC_ROOT = '/public/mount'

type MetaEntry = { file: string; path: string; force_reload?: boolean }

// Where a meta.json entry may be written: an absolute, already-normalised vfs path.
function metaTargetPath(path: unknown): string | null {
    if (typeof path !== 'string' || !path.startsWith('/')) return null
    try { return normalizePath(path) === path && path !== '/' ? path : null } catch (_) { return null }
}

// The static copy a meta.json entry may come from: a path under /public/mount on
// this origin. Absolute or protocol-relative URLs, '..', query/fragment
// characters, backslashes and control characters are refused.
function metaSourceUrl(file: unknown): string | null {
    if (typeof file !== 'string' || file === '') return null
    if (/^[a-z][a-z0-9+.-]*:/i.test(file) || file.startsWith('//') || /[?#%\\]/.test(file)) return null
    if (file.split('/').includes('..')) return null
    let rel: string
    try { rel = normalizePath(file.startsWith('/') ? file : `/${file}`) } catch (_) { return null }
    const url = STATIC_ROOT + rel
    return url !== STATIC_ROOT && isInside(STATIC_ROOT, url) ? url : null
}

async function bootstrapMetaFiles(fs: typeof _fs, bootLog: (label: string, t0: number, err?: string) => void) {
    const t1 = Date.now()
    // The server's meta.json decides what is restored and from where (audit
    // BOOT-6, decisions.md D12). The vfs copy at /meta.json is plain data —
    // any app can write it — so it can no longer switch refreshing off or name
    // other sources; it is just overwritten with the server copy.
    let entries: MetaEntry[]
    try {
        const res = await fetch(META_SERVER_PATH)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const list = await res.json()
        if (!Array.isArray(list)) throw new Error('not a list')
        entries = list
    } catch (err) {
        bootLog('meta.json bootstrap', t1, `server meta.json unavailable: ${err}`)
        return
    }

    let fileCount = 0
    const rejected: string[] = []
    const failed: string[] = []
    await Promise.all(entries.map(async item => {
        const target = metaTargetPath(item?.path)
        const source = metaSourceUrl(item?.file)
        if (!target || !source) { rejected.push(String(item?.path)); return }
        if (fs.existsSync(target) && !item.force_reload) return
        try {
            const res = await fetch(source)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const fileData = await res.arrayBuffer()
            const dir = target.slice(0, target.lastIndexOf('/')) || '/'
            if (!fs.existsSync(dir)) mkdirRecursive(fs, dir)
            fs.writeFileSync(target, Buffer.from(fileData))
            fileCount++
        } catch (err) {
            failed.push(target)
            console.warn('[vfs] meta.json entry not restored:', target, err)
        }
    }))

    if (rejected.length) console.warn('[vfs] meta.json entries rejected (not a /public/mount source or bad path):', rejected)
    const problems = [rejected.length && `${rejected.length} rejected`, failed.length && `${failed.length} failed`].filter(Boolean).join(', ')
    bootLog(`meta.json bootstrap (${fileCount} files written)`, t1, problems || undefined)
}
