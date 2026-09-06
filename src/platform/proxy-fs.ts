// Ring 1 — ProxyFS
// Wraps the raw kernel VFS with per-namespace ACL enforcement.
// Apps receive a ProxyFS instance — they never touch the raw fs directly.

import type _fs from 'fs'
import { Namespace } from './namespace'
import { mkdirRecursive } from '../kernel/vfs'

export class ProxyFS {
    constructor(
        private readonly fs: typeof _fs,
        private readonly ns: Namespace,
    ) {}

    // --- Read operations ---

    readFileSync(path: string, encoding?: 'utf8' | 'utf-8'): string | Buffer {
        this.ns.checkRead(path)
        return encoding ? this.fs.readFileSync(path, encoding) : this.fs.readFileSync(path)
    }

    readText(path: string): Promise<string> {
        try {
            this.ns.checkRead(path)
            return Promise.resolve(this.fs.readFileSync(path, 'utf8') as string)
        } catch (e) { return Promise.reject(e) }
    }

    readBinary(path: string): Promise<Buffer> {
        try {
            this.ns.checkRead(path)
            return Promise.resolve(this.fs.readFileSync(path) as Buffer)
        } catch (e) { return Promise.reject(e) }
    }

    existsSync(path: string): boolean {
        this.ns.checkRead(path)
        return this.fs.existsSync(path)
    }

    exists(path: string): Promise<boolean> {
        try {
            this.ns.checkRead(path)
            return Promise.resolve(this.fs.existsSync(path))
        } catch (e) { return Promise.reject(e) }
    }

    readdirSync(path: string): string[] {
        this.ns.checkRead(path)
        return this.fs.readdirSync(path) as string[]
    }

    list(path: string): Promise<string[]> {
        try {
            this.ns.checkRead(path)
            return Promise.resolve(this.fs.readdirSync(path) as string[])
        } catch (e) { return Promise.reject(e) }
    }

    statSync(path: string): ReturnType<typeof _fs.statSync> {
        this.ns.checkRead(path)
        return this.fs.statSync(path)
    }

    stat(path: string): Promise<{ isDirectory: boolean; isFile: boolean; size: number }> {
        try {
            this.ns.checkRead(path)
            const s = this.fs.statSync(path)
            return Promise.resolve({ isDirectory: s.isDirectory(), isFile: s.isFile(), size: s.size })
        } catch (e) { return Promise.reject(e) }
    }

    // --- Write operations ---

    writeFileSync(path: string, data: string | Buffer): void {
        this.ns.checkWrite(path)
        this.fs.writeFileSync(path, data)
    }

    writeText(path: string, content: string): Promise<boolean> {
        try {
            this.ns.checkWrite(path)
            // Auto-create parent dirs (BrowserFS doesn't support recursive)
            const dir = path.slice(0, path.lastIndexOf('/')) || '/'
            if (dir && !this.fs.existsSync(dir)) mkdirRecursive(this.fs, dir)
            this.fs.writeFileSync(path, content)
            return Promise.resolve(true)
        } catch (e) { return Promise.reject(e) }
    }

    mkdirSync(path: string): void {
        this.ns.checkWrite(path)
        this.fs.mkdirSync(path)
    }

    mkdir(path: string): Promise<boolean> {
        try {
            this.ns.checkWrite(path)
            mkdirRecursive(this.fs, path)
            return Promise.resolve(true)
        } catch (e) { return Promise.reject(e) }
    }

    // mkdirRecursive exposed for convenience — checks write on each segment
    mkdirRecursive(path: string): void {
        this.ns.checkWrite(path)
        mkdirRecursive(this.fs, path)
    }

    unlinkSync(path: string): void {
        this.ns.checkWrite(path)
        this.fs.unlinkSync(path)
    }

    remove(path: string): Promise<boolean> {
        try {
            this.ns.checkWrite(path)
            this.fs.unlinkSync(path)
            return Promise.resolve(true)
        } catch (e) { return Promise.reject(e) }
    }

    renameSync(from: string, to: string): void {
        this.ns.checkWrite(from)
        this.ns.checkWrite(to)
        this.fs.renameSync(from, to)
    }

    rename(from: string, to: string): Promise<boolean> {
        try {
            this.ns.checkWrite(from)
            this.ns.checkWrite(to)
            this.fs.renameSync(from, to)
            return Promise.resolve(true)
        } catch (e) { return Promise.reject(e) }
    }

    // --- AppSDK-compatible shape (injected into app iframes) ---
    // Returns an object with the promise-based API that app HTML files expect.
    toAppSDK(opts: { setTitle?: (t: string) => void } = {}): Record<string, Function> {
        return {
            readText:  (p: string) => this.readText(p),
            readBinary:(p: string) => this.readBinary(p),
            writeText: (p: string, c: string) => this.writeText(p, c),
            mkdir:     (p: string) => this.mkdir(p),
            remove:    (p: string) => this.remove(p),
            list:      (p: string) => this.list(p),
            exists:    (p: string) => this.exists(p),
            stat:      (p: string) => this.stat(p),
            rename:    (f: string, t: string) => this.rename(f, t),
            setTitle:  (t: string) => { opts.setTitle?.(t); return Promise.resolve(true) },
            log:       (v: unknown) => { console.log('[app]', v); return Promise.resolve(true) },
        }
    }
}
