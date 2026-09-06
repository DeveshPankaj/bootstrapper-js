// Ring 2 — Layout Manager
// Extracted from src/core/layout/index.tsx.
// Owns layout config load/switch and the active layout observable.
// No React dependency — pure state management.

import { BehaviorSubject, Observable } from 'rxjs'
import type _fs from 'fs'

export type GridDef = {
    areas: string
    columns: string
    rows: string
}

export type LayoutDef = {
    id: string
    name: string
    grid: GridDef
    commands?: {
        slot?: string
        vertical?: boolean
        align?: string
    }
}

const DEFAULT_LAYOUTS: LayoutDef[] = [
    {
        id: 'default',
        name: 'Classic',
        grid: {
            areas: `"header header" "content-area content-area" "footer footer"`,
            columns: '1fr',
            rows: 'auto 1fr auto',
        },
    },
    {
        id: 'no-header',
        name: 'No Header',
        grid: {
            areas: `"content-area" "footer"`,
            columns: '1fr',
            rows: '1fr auto',
        },
    },
]

const LAYOUTS_PATH  = '/etc/wm/layouts.json'
const CONFIG_PATH   = '/etc/wm/config.json'

export class LayoutManager {
    private static _instance: LayoutManager | null = null

    private _layouts: LayoutDef[] = DEFAULT_LAYOUTS
    private _active$ = new BehaviorSubject<LayoutDef>(DEFAULT_LAYOUTS[0])

    public readonly active$: Observable<LayoutDef> = this._active$.asObservable()

    static getInstance(): LayoutManager {
        if (!LayoutManager._instance) LayoutManager._instance = new LayoutManager()
        return LayoutManager._instance
    }

    public init(fs: typeof _fs): void {
        try {
            const raw = fs.readFileSync(LAYOUTS_PATH, 'utf8') as string
            const parsed: LayoutDef[] = JSON.parse(raw)
            if (Array.isArray(parsed) && parsed.length) this._layouts = parsed
        } catch (_) {}

        try {
            const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8') as string)
            const found = this._layouts.find(l => l.id === cfg.layout)
            if (found) this._active$.next(found)
        } catch (_) {}
    }

    public getLayouts(): LayoutDef[] {
        return this._layouts
    }

    public getActive(): LayoutDef {
        return this._active$.getValue()
    }

    public setLayout(id: string, fs: typeof _fs): void {
        const found = this._layouts.find(l => l.id === id)
        if (!found) return
        this._active$.next(found)
        try {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify({ layout: id }))
        } catch (_) {}
    }
}
