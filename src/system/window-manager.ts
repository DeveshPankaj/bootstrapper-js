// Ring 2 — Window Manager
// Manages the lifecycle of open windows (open, close, minimize, focus).
// Each window is tied to a namespace pid from the ProcessManager.
// React rendering (the actual DOM) stays in src/core/layout/index.tsx — this
// module is pure state; layout subscribes and renders.

import { BehaviorSubject, Observable } from 'rxjs'

export type WindowRecord = {
    pid: number
    command: string
    title: string
    icon: string
    minimized: boolean
    active: boolean
    // Callbacks injected by the React render layer
    close?: () => void
    toggleMinimize?: () => void
    focus?: () => void
}

export class WindowManager {
    private static _instance: WindowManager | null = null

    private _windows = new BehaviorSubject<WindowRecord[]>([])
    public readonly windows$: Observable<WindowRecord[]> = this._windows.asObservable()

    static getInstance(): WindowManager {
        if (!WindowManager._instance) WindowManager._instance = new WindowManager()
        return WindowManager._instance
    }

    public register(record: WindowRecord): () => void {
        const current = this._windows.getValue()
        // Deactivate all, activate new one
        this._windows.next([...current.map(w => ({ ...w, active: false })), { ...record, active: true }])
        return () => this.unregister(record.pid)
    }

    public unregister(pid: number): void {
        this._windows.next(this._windows.getValue().filter(w => w.pid !== pid))
    }

    public focus(pid: number): void {
        this._windows.next(
            this._windows.getValue().map(w => ({ ...w, active: w.pid === pid }))
        )
    }

    public minimize(pid: number): void {
        this._windows.next(
            this._windows.getValue().map(w => w.pid === pid ? { ...w, minimized: !w.minimized, active: !w.minimized } : w)
        )
    }

    public setTitle(pid: number, title: string): void {
        this._windows.next(
            this._windows.getValue().map(w => w.pid === pid ? { ...w, title } : w)
        )
    }

    public updateRecord(pid: number, patch: Partial<WindowRecord>): void {
        this._windows.next(
            this._windows.getValue().map(w => w.pid === pid ? { ...w, ...patch } : w)
        )
    }

    public getAll(): WindowRecord[] {
        return this._windows.getValue()
    }

    public get(pid: number): WindowRecord | undefined {
        return this._windows.getValue().find(w => w.pid === pid)
    }
}
