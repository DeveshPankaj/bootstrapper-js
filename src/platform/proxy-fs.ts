// Ring 1 — ProxyFS
// Wraps the raw kernel VFS with per-namespace ACL enforcement.
// Apps receive a ProxyFS instance — they never touch the raw fs directly.
//
// Every operation checks its path with the namespace (which normalises it,
// src/platform/namespace.ts) and then uses the normalised path it got back, so
// '/tmp/<id>/../../etc/crontab' is checked — and refused — as '/etc/crontab'.

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
        const p = this.ns.checkRead(path)
        return encoding ? this.fs.readFileSync(p, encoding) : this.fs.readFileSync(p)
    }

    readText(path: string): Promise<string> {
        try {
            const p = this.ns.checkRead(path)
            return Promise.resolve(this.fs.readFileSync(p, 'utf8') as string)
        } catch (e) { return Promise.reject(e) }
    }

    readBinary(path: string): Promise<Buffer> {
        try {
            const p = this.ns.checkRead(path)
            return Promise.resolve(this.fs.readFileSync(p) as Buffer)
        } catch (e) { return Promise.reject(e) }
    }

    existsSync(path: string): boolean {
        const p = this.ns.checkRead(path)
        return this.fs.existsSync(p)
    }

    exists(path: string): Promise<boolean> {
        try {
            const p = this.ns.checkRead(path)
            return Promise.resolve(this.fs.existsSync(p))
        } catch (e) { return Promise.reject(e) }
    }

    readdirSync(path: string): string[] {
        const p = this.ns.checkRead(path)
        return this.fs.readdirSync(p) as string[]
    }

    list(path: string): Promise<string[]> {
        try {
            const p = this.ns.checkRead(path)
            return Promise.resolve(this.fs.readdirSync(p) as string[])
        } catch (e) { return Promise.reject(e) }
    }

    statSync(path: string): ReturnType<typeof _fs.statSync> {
        const p = this.ns.checkRead(path)
        return this.fs.statSync(p)
    }

    stat(path: string): Promise<{ isDirectory: boolean; isFile: boolean; size: number }> {
        try {
            const p = this.ns.checkRead(path)
            const s = this.fs.statSync(p)
            return Promise.resolve({ isDirectory: s.isDirectory(), isFile: s.isFile(), size: s.size })
        } catch (e) { return Promise.reject(e) }
    }

    // --- Write operations ---

    writeFileSync(path: string, data: string | Buffer): void {
        const p = this.ns.checkWrite(path)
        this.fs.writeFileSync(p, data)
    }

    writeText(path: string, content: string): Promise<boolean> {
        try {
            const p = this.ns.checkWrite(path)
            // Auto-create parent dirs (BrowserFS doesn't support recursive)
            const dir = p.slice(0, p.lastIndexOf('/')) || '/'
            if (dir && !this.fs.existsSync(dir)) mkdirRecursive(this.fs, dir)
            this.fs.writeFileSync(p, content)
            return Promise.resolve(true)
        } catch (e) { return Promise.reject(e) }
    }

    mkdirSync(path: string): void {
        const p = this.ns.checkWrite(path)
        this.fs.mkdirSync(p)
    }

    mkdir(path: string): Promise<boolean> {
        try {
            const p = this.ns.checkWrite(path)
            mkdirRecursive(this.fs, p)
            return Promise.resolve(true)
        } catch (e) { return Promise.reject(e) }
    }

    // mkdirRecursive exposed for convenience — the target must be writable
    mkdirRecursive(path: string): void {
        const p = this.ns.checkWrite(path)
        mkdirRecursive(this.fs, p)
    }

    unlinkSync(path: string): void {
        const p = this.ns.checkWrite(path)
        this.fs.unlinkSync(p)
    }

    remove(path: string): Promise<boolean> {
        try {
            const p = this.ns.checkWrite(path)
            this.fs.unlinkSync(p)
            return Promise.resolve(true)
        } catch (e) { return Promise.reject(e) }
    }

    renameSync(from: string, to: string): void {
        const f = this.ns.checkWrite(from)
        const t = this.ns.checkWrite(to)
        this.fs.renameSync(f, t)
    }

    rename(from: string, to: string): Promise<boolean> {
        try {
            const f = this.ns.checkWrite(from)
            const t = this.ns.checkWrite(to)
            this.fs.renameSync(f, t)
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
