// Ring 2 — Desktop Manager
// Owns desktop icon list, wallpaper application, and desktop-level events.
// React (layout/index.tsx) subscribes and renders; no DOM manipulation here.

import { BehaviorSubject, Observable } from 'rxjs'
import type _fs from 'fs'

export type DesktopIcon = {
    name: string
    path: string
    type: 'file' | 'dir'
    icon?: string
    command?: string
}

export class DesktopManager {
    private static _instance: DesktopManager | null = null

    private _icons$ = new BehaviorSubject<DesktopIcon[]>([])
    private _wallpaper$ = new BehaviorSubject<string>('')

    public readonly icons$: Observable<DesktopIcon[]> = this._icons$.asObservable()
    public readonly wallpaper$: Observable<string> = this._wallpaper$.asObservable()

    static getInstance(): DesktopManager {
        if (!DesktopManager._instance) DesktopManager._instance = new DesktopManager()
        return DesktopManager._instance
    }

    public setIcons(icons: DesktopIcon[]): void {
        this._icons$.next(icons)
    }

    public setWallpaper(url: string, fs?: typeof _fs, prefsPath = '/user-preferences.json'): void {
        this._wallpaper$.next(url)
        if (!fs) return
        try {
            let prefs: Record<string, unknown> = {}
            if (fs.existsSync(prefsPath)) {
                prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8') as string)
            }
            prefs.wallpaper = url
            fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2))
        } catch (_) {}
    }

    public getWallpaper(): string {
        return this._wallpaper$.getValue()
    }

    public loadWallpaper(fs: typeof _fs, prefsPath = '/user-preferences.json'): void {
        try {
            const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8') as string)
            if (prefs.wallpaper) this._wallpaper$.next(prefs.wallpaper)
        } catch (_) {}
    }
}
