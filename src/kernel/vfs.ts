// Ring 0 — VFS kernel module
// Owns BrowserFS mount, path bootstrap from meta.json, and segment-safe mkdir.
// No business logic. Called once at boot from src/index.ts.

//@ts-nocheck
import type _fs from 'fs'
import { initIpcBus } from './ipc-bus'
import { normalizePath, isInside, isValidAppId } from './path-policy'
import { afterLanding } from './background'
import { recordMetaHashes } from './meta-hashes'

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
    const mirrors: any[] = []
    if (fsBackend === 'localstorage') {
        const rootFS = await createBackend(Backend.LocalStorage, {})
        const tmpFS  = await createBackend(Backend.InMemory, {})
        const mntFS  = await createBackend(Backend.InMemory, {})
        mfs = await createBackend(Backend.MountableFileSystem, { '/': rootFS, '/tmp': tmpFS, '/mnt': mntFS })
    } else {
        const rootFS = await createIndexedDBMirror(Backend, 'fs')
        const tmpFS  = await createIndexedDBMirror(Backend, 'tmp')
        const mntFS  = await createIndexedDBMirror(Backend, 'mnt')
        mirrors.push(rootFS, tmpFS, mntFS)
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
    // Writes reach memory at once and IndexedDB through each AsyncMirror's queue
    // (BrowserFS 2.0 `_queue` / `_queueRunning`). Code that reloads the page right
    // after writing many files (Settings › Storage › Force Reload) waits for this,
    // or the tail of the queue is lost. Resolves false if it times out.
    ;(fs as any).whenFlushed = (timeoutMs = 30000): Promise<boolean> => new Promise(resolve => {
        const end = Date.now() + timeoutMs
        const idle = () => mirrors.every(m => !m._queueRunning && !(m._queue && m._queue.length))
        const tick = () => idle() ? resolve(true) : Date.now() > end ? resolve(false) : setTimeout(tick, 50)
        tick()
    })

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

// One meta.json entry (annotated at build time by scripts/gen-meta-manifest.mjs).
type MetaEntry = {
    file: string
    path: string
    force_reload?: boolean
    sha256?: string
    when?: 'boot' | 'background'
    app?: string
}

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

type SyncJob = { target: string; source: string; force: boolean; sha256: string | null; app: string | null }

const UNINSTALLED_PATH = '/etc/pkg/uninstalled.json'
// Preinstalled apps already delivered once. The app folders are the installed list
// (pkg-manager/loader.js scans /opt/apps), so a user deletes an app by deleting its
// folder; recording the delivery keeps a deleted preinstalled app from coming back.
const SEEDED_PATH = '/etc/pkg/seeded.json'
const HEX64 = /^[0-9a-f]{64}$/

const sha256Hex = async (data: ArrayBuffer | Uint8Array): Promise<string> =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(b => b.toString(16).padStart(2, '0')).join('')

// Runs `fn` over `items` with at most `limit` in flight.
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
    let next = 0
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) await fn(items[next++])
    }))
}

// Keeps the vfs in step with the server's meta.json while downloading as little as
// possible (scripts/gen-meta-manifest.mjs annotates the entries):
//   - system files (force_reload) are fetched only when missing or when the vfs copy's
//     hash differs from the server's — a tampered copy is restored, an unchanged one
//     costs nothing;
//   - user-editable files (no force_reload) are seeded once, never overwritten;
//   - app files (`app`) are installed once — only for apps that are preinstalled and
//     not uninstalled — and never refreshed at boot: App Manager's Update/Reinstall
//     refreshes them;
//   - `when: 'boot'` entries are fetched before the desktop shows; everything else
//     after the landing page, in the background (small spinner, bottom-right).
async function bootstrapMetaFiles(fs: typeof _fs, bootLog: (label: string, t0: number, err?: string) => void) {
    const t1 = Date.now()
    // The server's meta.json decides what is restored and from where (audit
    // BOOT-6, decisions.md D12). The vfs copy at /meta.json is plain data —
    // any app can write it — so it is just overwritten with the server copy.
    // `no-cache` revalidates: an unchanged meta.json is a cheap 304.
    let entries: MetaEntry[]
    let metaText: string
    try {
        const res = await fetch(META_SERVER_PATH, { cache: 'no-cache' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        metaText = await res.text()
        const list = JSON.parse(metaText)
        if (!Array.isArray(list)) throw new Error('not a list')
        entries = list
    } catch (err) {
        bootLog('meta.json bootstrap', t1, `server meta.json unavailable: ${err}`)
        return
    }
    try { fs.writeFileSync('/meta.json', metaText) } catch (_) { /* view-only copy */ }
    recordMetaHashes(entries)

    const readIdSet = (path: string): Set<string> => {
        try {
            const v = JSON.parse(fs.readFileSync(path, 'utf8') as string || '[]')
            return new Set(Array.isArray(v) ? v.filter((id): id is string => typeof id === 'string') : [])
        } catch (_) { return new Set() }
    }
    const uninstalled = readIdSet(UNINSTALLED_PATH)
    const seeded = readIdSet(SEEDED_PATH)
    // An app counts as delivered once every one of its files is in place.
    const recordSeeded = (jobs: SyncJob[]) => {
        const before = seeded.size
        for (const id of new Set(jobs.map(j => j.app).filter((id): id is string => !!id))) {
            if (!seeded.has(id) && jobs.every(j => j.app !== id || fs.existsSync(j.target))) seeded.add(id)
        }
        if (seeded.size === before) return
        try {
            if (!fs.existsSync('/etc/pkg')) mkdirRecursive(fs, '/etc/pkg')
            fs.writeFileSync(SEEDED_PATH, JSON.stringify([...seeded].sort(), null, 2))
        } catch (err) { console.warn('[vfs] could not record delivered apps:', err) }
    }

    const rejected: string[] = []
    const boot: SyncJob[] = []
    const background: SyncJob[] = []
    for (const item of entries) {
        if (item?.path === '/meta.json') continue
        const target = metaTargetPath(item?.path)
        const source = metaSourceUrl(item?.file)
        if (!target || !source) { rejected.push(String(item?.path)); continue }
        const job: SyncJob = {
            target,
            source,
            force: item.force_reload === true,
            sha256: typeof item.sha256 === 'string' && HEX64.test(item.sha256) ? item.sha256 : null,
            app: typeof item.app === 'string' && isValidAppId(item.app) && isInside(`/opt/apps/${item.app}`, target) ? item.app : null,
        }
        ;(item.when === 'background' ? background : boot).push(job)
    }

    const needsFetch = async (job: SyncJob): Promise<boolean> => {
        const exists = fs.existsSync(job.target)
        if (job.app) return !exists && !uninstalled.has(job.app) && !seeded.has(job.app)
        if (!exists) return true
        if (!job.force) return false
        if (!job.sha256) return true // not annotated: refresh, as before
        try { return (await sha256Hex(fs.readFileSync(job.target) as unknown as Uint8Array)) !== job.sha256 }
        catch (_) { return true }
    }

    const fetchBytes = async (url: string, cache: RequestCache): Promise<ArrayBuffer> => {
        const res = await fetch(url, { cache })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.arrayBuffer()
    }

    const failed: string[] = []
    const sync = async (jobs: SyncJob[], limit: number): Promise<SyncJob[]> => {
        const flags = await Promise.all(jobs.map(needsFetch))
        const todo = jobs.filter((_, i) => flags[i])
        const written: SyncJob[] = []
        await pool(todo, limit, async job => {
            try {
                let data = await fetchBytes(job.source, 'default')
                if (job.sha256 && (await sha256Hex(data)) !== job.sha256) {
                    // Probably a stale HTTP-cache copy from before a deploy: ask the server.
                    data = await fetchBytes(job.source, 'reload')
                    if ((await sha256Hex(data)) !== job.sha256) {
                        console.warn('[vfs] server copy still differs from meta.json (deploy in progress?):', job.target)
                    }
                }
                const dir = job.target.slice(0, job.target.lastIndexOf('/')) || '/'
                if (!fs.existsSync(dir)) mkdirRecursive(fs, dir)
                fs.writeFileSync(job.target, Buffer.from(data))
                written.push(job)
            } catch (err) {
                failed.push(job.target)
                console.warn('[vfs] meta.json entry not restored:', job.target, err)
            }
        })
        return written
    }

    if (rejected.length) console.warn('[vfs] meta.json entries rejected (not a /public/mount source or bad path):', rejected)
    const bootWritten = await sync(boot, 16)
    recordSeeded(boot)
    const problems = () => [rejected.length && `${rejected.length} rejected`, failed.length && `${failed.length} failed`].filter(Boolean).join(', ')
    bootLog(`meta.json bootstrap: boot sync (${bootWritten.length} of ${boot.length} files fetched)`, t1, problems() || undefined)

    // Everything else once the landing page is on screen.
    afterLanding(async () => {
        const t2 = Date.now()
        const written = await sync(background, 6)
        recordSeeded(background)
        bootLog(`meta.json bootstrap: background sync (${written.length} of ${background.length} files fetched)`, t2, problems() || undefined)
        // Preinstalled apps whose files just arrived (a first visit): the boot loader
        // registers them now (docs/public/mount/opt/apps/pkg-manager/loader.js).
        const ids = [...new Set(written.map(j => j.app).filter((id): id is string => !!id))]
            .filter(id => background.every(j => j.app !== id || fs.existsSync(j.target)))
        if (ids.length) window.dispatchEvent(new CustomEvent('wos:apps-installed', { detail: { ids } }))
    }, 'syncing files')
}
