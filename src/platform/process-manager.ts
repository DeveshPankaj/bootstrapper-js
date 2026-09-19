// Ring 1 — Process Manager
// Owns PID assignment and Namespace lifecycle.
// The only place where Namespaces are created or destroyed.

import { BehaviorSubject, Observable } from 'rxjs'
import { Namespace, NamespaceOpts } from './namespace'

export type ProcessRecord = {
    pid: number
    id: string
    appDir: string
    namespace: Namespace
    startedAt: number
    label?: string  // human-readable title (e.g. 'Model Builder')
}

declare global {
    interface Window { __wosProcessManager?: ProcessManager }
}

export class ProcessManager {
    private static _instance: ProcessManager | null = null

    // Starts at 2, not 1 - PID 1 is reserved for systemd (src/core/systemd.ts),
    // the init system that starts before any GUI window can open, matching
    // real Linux where PID 1 is always init/systemd.
    private _pidCounter = 2
    private _processes = new Map<number, ProcessRecord>()
    private _processes$ = new BehaviorSubject<ProcessRecord[]>([])

    public readonly processes$: Observable<ProcessRecord[]> = this._processes$.asObservable()

    // Shared across all bundles (layout + remote) via the top-level window.
    // Each bundle has its own module scope so a plain static _instance would
    // be duplicated; storing on window.top ensures both bundles share one instance.
    static getInstance(): ProcessManager {
        const shared = (window.top as any)?.__wosProcessManager
        if (shared) return shared
        if (!ProcessManager._instance) {
            ProcessManager._instance = new ProcessManager()
            try { (window.top as any).__wosProcessManager = ProcessManager._instance } catch (_) {}
        }
        return ProcessManager._instance
    }

    public spawn(id: string, opts: Partial<Omit<NamespaceOpts, 'pid' | 'id'>> & { label?: string } = {}): Namespace {
        const pid = this._pidCounter++
        const ns = new Namespace({ pid, id, appDir: opts.appDir, extraAcl: opts.extraAcl })
        const record: ProcessRecord = {
            pid,
            id,
            appDir: ns.appDir,
            namespace: ns,
            startedAt: Date.now(),
            label: opts.label,
        }
        this._processes.set(pid, record)
        this._processes$.next(Array.from(this._processes.values()))
        return ns
    }

    public kill(pid: number): void {
        this._processes.delete(pid)
        this._processes$.next(Array.from(this._processes.values()))
    }

    public get(pid: number): ProcessRecord | undefined {
        return this._processes.get(pid)
    }

    public list(): ProcessRecord[] {
        return Array.from(this._processes.values())
    }

    public reset(): void {
        this._pidCounter = 2
        this._processes.clear()
        this._processes$.next([])
    }
}
