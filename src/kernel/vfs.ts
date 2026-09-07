// Ring 0 — VFS kernel module
// Owns BrowserFS mount, path bootstrap from meta.json, and segment-safe mkdir.
// No business logic. Called once at boot from src/index.ts.

//@ts-nocheck
import type _fs from 'fs'
import { initIpcBus } from './ipc-bus'

export const FS_BACKEND_STORAGE_KEY = '__app_fs_backend__';
export const FS_BACKEND_QUERY_PARAM = 'fsBackend';

export type FsBackend = 'indexeddb' | 'localstorage';

export function resolveFsBackend(): FsBackend {
    const fromQuery = new URLSearchParams(window.location.search).get(FS_BACKEND_QUERY_PARAM)
    if (fromQuery === 'indexeddb' || fromQuery === 'localstorage') {
        localStorage.setItem(FS_BACKEND_STORAGE_KEY, fromQuery)
        return fromQuery
    }
    return localStorage.getItem(FS_BACKEND_STORAGE_KEY) === 'localstorage' ? 'localstorage' : 'indexeddb'
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
    '/home', '/home/user1', '/home/user1/apps', '/home/user1/tools',
    '/home/user1/projects', '/home/user1/quotes',
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

    // Wire IPC fs handlers so service worker / iframes can call fs via postMessage
    initIpcBus(fs)

    DEFAULT_DIRS.forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir)
    })

    await bootstrapMetaFiles(fs, bootLog)

    return fs
}

async function bootstrapMetaFiles(fs: typeof _fs, bootLog: (label: string, t0: number, err?: string) => void) {
    const t1 = Date.now()
    const metaFilePath = '/meta.json'
    const metaFileServerPath = '/public/mount/meta.json'

    let defaultFiles: Array<{ file: string; path: string; force_reload?: boolean }> = []
    if (fs.existsSync(metaFilePath)) {
        defaultFiles = JSON.parse(fs.readFileSync(metaFilePath).toString())
    }

    const ignoreMetaReload = defaultFiles.find(item => item.path === metaFilePath && item.force_reload === false)
    if (!ignoreMetaReload) defaultFiles = await (await fetch(metaFileServerPath)).json()

    let fileCount = 0
    await Promise.all(defaultFiles.map(async item => {
        if (fs.existsSync(item.path) && !item.force_reload) return
        const serverPath = item.file.startsWith('http')
            ? item.file
            : `/public/mount${item.file.startsWith('/') ? '' : '/'}${item.file}`
        const fileData = await (await fetch(serverPath)).arrayBuffer() as any
        const dir = item.path.slice(0, item.path.lastIndexOf('/')) || '/'
        if (!fs.existsSync(dir)) mkdirRecursive(fs, dir)
        fs.writeFileSync(item.path, Buffer.from(fileData))
        fileCount++
    }))

    bootLog(`meta.json bootstrap (${fileCount} files written)`, t1)
}
