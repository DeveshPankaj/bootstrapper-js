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

export class ProcessManager {
    private static _instance: ProcessManager | null = null

    private _pidCounter = 1
    private _processes = new Map<number, ProcessRecord>()
    private _processes$ = new BehaviorSubject<ProcessRecord[]>([])

    public readonly processes$: Observable<ProcessRecord[]> = this._processes$.asObservable()

    static getInstance(): ProcessManager {
        if (!ProcessManager._instance) ProcessManager._instance = new ProcessManager()
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
        this._pidCounter = 1
        this._processes.clear()
        this._processes$.next([])
    }
}
