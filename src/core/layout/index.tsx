import { BehaviorSubject, filter } from 'rxjs'
import { Command, Platform } from '@shared/index'
import { readJsonFile, writeJsonFile, ensureDir } from '@shared/fs-utils'
import { LAYOUTS_PATH, LAYOUT_CONFIG_PATH, WM_CURRENT_PATH, WM_THEMES_DIR, WM_DEFAULT_THEME_PATH, WM_DIR, WIDGET_POSITIONS_PATH, WIDGETS_CONFIG_PATH } from '@shared/constants'
import { createRoot } from 'react-dom/client'
import React from 'react'
import { Taskbar } from './commands'
import { ContextMenu, ContextMenuItem } from './contextmenu'
import { DESKTOP_CONTAINER_CLASS, WINDOWS_CONTAINER_CLASS, WindowManager } from '../window-manager'
import { FileType } from '../../shared/types'
import { ListDirComponent } from '../../apps/file-explorer/desktop'
import { Header } from './header'
import { RESET_CSS, MATERIAL_SYMBOLS_CSS } from './styles/base'
import { layoutCss } from './styles/layout'
import { WINDOW_CSS } from './styles/window'
import { TASKBAR_CSS } from './styles/taskbar'
import { WIDGETS_CSS } from './styles/widgets'
import { CONTEXTMENU_CSS } from './styles/contextmenu'
import { DESKTOP_ENV_CSS } from './styles/desktop-env'

const platform = Platform.getInstance()

const styles = platform.host.createCSSStyleSheet()
// document.body.requestFullscreen()

// Layout presets are stored in the virtual filesystem (standard Linux config
// location: /etc/wm) so they can be edited either through Settings or by
// directly editing the JSON files.

type LayoutDef = {
    id: string
    name: string
    grid: {
        areas: string
        columns: string
        rows: string
    }
    commands: {
        slot: 'header' | 'left-nav' | 'right-nav' | 'footer' | 'toolbar'
        vertical?: boolean
        align?: 'start' | 'center' | 'end'
    }
}

const DEFAULT_LAYOUTS: Array<LayoutDef> = [
    {
        id: 'default',
        name: 'Floating Dock',
        grid: {
            areas: `"header header header" "left-nav content-area right-nav" "footer footer footer"`,
            columns: 'auto 1fr auto',
            rows: 'auto 1fr auto'
        },
        commands: { slot: 'toolbar', vertical: false, align: 'center' }
    },
    {
        id: 'linux-top-header',
        name: 'Linux Top Header',
        grid: {
            areas: `"header header header" "content-area content-area content-area"`,
            columns: '1fr',
            rows: 'auto 1fr'
        },
        commands: { slot: 'header', vertical: false, align: 'start' }
    },
    {
        id: 'ubuntu-left-bar',
        name: 'Ubuntu Left Bar',
        grid: {
            areas: `"left-nav content-area"`,
            columns: 'auto 1fr',
            rows: '1fr'
        },
        commands: { slot: 'left-nav', vertical: true, align: 'start' }
    },
    {
        id: 'windows-bottom-bar',
        name: 'Windows Bottom Taskbar',
        grid: {
            areas: `"content-area" "footer"`,
            columns: '1fr',
            rows: '1fr auto'
        },
        commands: { slot: 'footer', vertical: false, align: 'start' }
    }
]

type WmSettings = {
    appearance: {
        headerBackground: string
        headerColor: string
        windowBackground: string
        taskbarBackground: string
        taskbarSize: number
        accentColor: string
        borderRadius: number
        blur: number
        shadow: boolean
    }
    behavior: {
        dblClickHeaderFullscreen: boolean
        bringToFrontOnClick: boolean
    }
}

const DEFAULT_WM_SETTINGS: WmSettings = {
    appearance: {
        headerBackground: '#000000',
        headerColor: '#ffffff',
        windowBackground: 'rgba(255, 255, 255, 0.15)',
        taskbarBackground: 'rgba(0, 0, 0, 0.5)',
        taskbarSize: 56,
        accentColor: '#0a84ff',
        borderRadius: 5,
        blur: 10,
        shadow: true,
    },
    behavior: {
        dblClickHeaderFullscreen: true,
        bringToFrontOnClick: true,
    },
}

const readJsonFileLocal = (path: string): any | null => readJsonFile(platform.host.getFS(), path)

const mergeWmSettings = (raw: any): WmSettings => ({
    appearance: { ...DEFAULT_WM_SETTINGS.appearance, ...raw?.appearance },
    behavior: { ...DEFAULT_WM_SETTINGS.behavior, ...raw?.behavior },
})

const writeWmCurrent = (raw: any) => {
    writeJsonFile(platform.host.getFS(), WM_CURRENT_PATH, raw, true)
}

// Ensures /etc/wm/current.json exists, seeding it from themes/default.json,
// or failing that, from any other theme file found in /etc/wm/themes.
const ensureWmCurrent = (): any => {
    const fs = platform.host.getFS()
    const current = readJsonFileLocal(WM_CURRENT_PATH)
    if (current) return current

    let seed = readJsonFileLocal(WM_DEFAULT_THEME_PATH)
    if (!seed) {
        try {
            if (fs.existsSync(WM_THEMES_DIR)) {
                const files = (fs.readdirSync(WM_THEMES_DIR) as string[]).filter(f => f.endsWith('.json'))
                for (const file of files) {
                    seed = readJsonFileLocal(`${WM_THEMES_DIR}/${file}`)
                    if (seed) break
                }
            }
        } catch (err) { console.error(err) }
    }
    if (!seed) seed = DEFAULT_WM_SETTINGS

    writeWmCurrent(seed)
    return seed
}

const readWmSettings = (): WmSettings => mergeWmSettings(ensureWmCurrent())

const readThemes = (): Array<{ id: string, name: string, appearance: WmSettings['appearance'] }> => {
    const fs = platform.host.getFS()
    try {
        if (!fs.existsSync(WM_THEMES_DIR)) return []
        const files = (fs.readdirSync(WM_THEMES_DIR) as string[]).filter(f => f.endsWith('.json'))
        return files.map(file => {
            const id = file.replace(/\.json$/, '')
            const raw = readJsonFileLocal(`${WM_THEMES_DIR}/${file}`)
            const merged = mergeWmSettings(raw)
            return { id, name: raw?.name || id, appearance: merged.appearance }
        })
    } catch (err) { console.error(err); return [] }
}

const applyTheme = (themeId: string): WmSettings => {
    const raw = readJsonFileLocal(`${WM_THEMES_DIR}/${themeId}.json`) || DEFAULT_WM_SETTINGS
    writeWmCurrent(raw)
    const settings = mergeWmSettings(raw)
    applyWmSettings(settings)
    return settings
}

// Window appearance is applied as CSS custom properties on the document root,
// so both already-open and newly-opened windows pick up changes immediately.
const applyWmSettings = (settings: WmSettings) => {
    const root = platform.window.document.documentElement
    const { appearance } = settings

    const tokens: Record<string, string> = {
        '--wm-header-bg': appearance.headerBackground,
        '--wm-header-color': appearance.headerColor,
        '--wm-window-bg': appearance.windowBackground,
        '--wm-taskbar-bg': appearance.taskbarBackground,
        '--wm-taskbar-size': `${appearance.taskbarSize}px`,
        '--wm-accent': appearance.accentColor,
        '--wm-radius': `${appearance.borderRadius}px`,
        '--wm-blur': `${appearance.blur}px`,
        '--wm-shadow': appearance.shadow ? '0 8px 32px rgba(31, 38, 135, 0.37)' : 'none',

        '--wm-font-family': "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif",
        '--wm-font-mono': "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
        '--wm-font-size-xs': '0.7rem',
        '--wm-font-size-sm': '0.8rem',
        '--wm-font-size-base': '0.875rem',
        '--wm-font-size-lg': '1rem',
        '--wm-font-size-xl': '1.25rem',
        '--wm-font-size-2xl': '1.75rem',

        '--wm-space-1': '0.25rem',
        '--wm-space-2': '0.5rem',
        '--wm-space-3': '0.75rem',
        '--wm-space-4': '1rem',
        '--wm-space-5': '1.5rem',
        '--wm-space-6': '2rem',

        '--wm-surface-hover': 'rgba(127, 127, 127, 0.2)',
        '--wm-surface-active': 'rgba(127, 127, 127, 0.3)',
        '--wm-border': 'rgba(255, 255, 255, 0.18)',
        '--wm-divider': 'rgba(127, 127, 127, 0.2)',

        '--wm-transition-fast': '0.15s ease',
        '--wm-transition-normal': '0.3s ease',
    }

    for (const [prop, value] of Object.entries(tokens)) {
        root.style.setProperty(prop, value)
    }
}

const readLayouts = (): Array<LayoutDef> => {
    const parsed = readJsonFileLocal(LAYOUTS_PATH)
    if (parsed && Array.isArray(parsed.layouts) && parsed.layouts.length) return parsed.layouts
    return DEFAULT_LAYOUTS
}

const readCurrentLayoutId = (): string => {
    const parsed = readJsonFileLocal(LAYOUT_CONFIG_PATH)
    return parsed?.layout || 'default'
}

const writeCurrentLayoutId = (layoutId: string) => {
    writeJsonFile(platform.host.getFS(), LAYOUT_CONFIG_PATH, { layout: layoutId }, true)
}

const layoutSubject = new BehaviorSubject<string>(readCurrentLayoutId())

const getCurrentLayout = (): LayoutDef => {
    const layouts = readLayouts()
    return layouts.find(l => l.id === layoutSubject.getValue()) || layouts[0] || DEFAULT_LAYOUTS[0]
}

const wallpaperImageMimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.avif': 'image/avif',
}

// `styles` is a Constructable Stylesheet adopted via `document.adoptedStyleSheets` -
// `url()` resource fetches from such stylesheets aren't intercepted by the service
// worker (unlike `<iframe src="/(sw)/...">` navigations), so `/(sw)/<path>` virtual-fs
// wallpaper URLs 404. Read the file directly from the virtual fs and use a blob URL
// instead, mirroring the thumbnail workaround in file-explorer/settings.html.
const resolveWallpaperUrl = (wallpaper: string): string => {
    const swMarker = '/(sw)/'
    const idx = wallpaper.indexOf(swMarker)
    if (idx === -1) return wallpaper

    const path = wallpaper.slice(idx + swMarker.length - 1) // keep leading '/'
    try {
        const fs = platform.host.getFS()
        const ext = path.slice(path.lastIndexOf('.'))
        const data = fs.readFileSync(path)
        const blob = new Blob([data], { type: wallpaperImageMimeTypes[ext] || 'application/octet-stream' })
        return URL.createObjectURL(blob)
    } catch (err) {
        console.error('Failed to load wallpaper', path, err)
        return wallpaper
    }
}

const applyCss = ({wallpaper, grid}: {wallpaper: string, grid: LayoutDef['grid']}) => {
    const wallpaperUrl = resolveWallpaperUrl(wallpaper)
    styles.replace([
        RESET_CSS,
        MATERIAL_SYMBOLS_CSS,
        layoutCss(grid, wallpaperUrl),
        WIDGETS_CSS,
        WINDOW_CSS,
        TASKBAR_CSS,
        CONTEXTMENU_CSS,
        DESKTOP_ENV_CSS,
    ].join('\n'))
}

const userPrefWallpaper = platform.userPref.getWallpaper()
applyCss({wallpaper: userPrefWallpaper || '/public/wp-11.jpg', grid: getCurrentLayout().grid})
applyWmSettings(readWmSettings())

const applyWindowManagerSettings = (settings: WmSettings) => {
    writeWmCurrent(settings)
    applyWmSettings(settings)
}

platform.register('set-window-manager-settings', applyWindowManagerSettings)
platform.host.registerCommand('set-window-manager-settings', applyWindowManagerSettings)

platform.register('set-window-manager-theme', applyTheme)
platform.host.registerCommand('set-window-manager-theme', applyTheme)

platform.register('get-window-manager-themes', readThemes)
platform.host.registerCommand('get-window-manager-themes', readThemes)

platform.register('set-wallpaper', (wallpaperUrl: string) => {
    applyCss({wallpaper: wallpaperUrl, grid: getCurrentLayout().grid});
    platform.userPref.setWallpaper(wallpaperUrl);
})

platform.register('add-wallpaper', (wallpaperUrl: string) => {
    platform.userPref.addWallpaper(wallpaperUrl);
})

platform.host.registerCommand('set-wallpaper', (wallpaperUrl: string) => {
    applyCss({wallpaper: wallpaperUrl, grid: getCurrentLayout().grid});
    platform.userPref.setWallpaper(wallpaperUrl);
})

platform.host.registerCommand('add-wallpaper', (wallpaperUrl: string) => {
    platform.userPref.addWallpaper(wallpaperUrl);
})

platform.register('remove-wallpaper', (wallpaperUrl: string) => {
    const activeWallpaper = platform.userPref.removeWallpaper(wallpaperUrl);
    if (activeWallpaper) applyCss({wallpaper: activeWallpaper, grid: getCurrentLayout().grid});
})

platform.host.registerCommand('remove-wallpaper', (wallpaperUrl: string) => {
    const activeWallpaper = platform.userPref.removeWallpaper(wallpaperUrl);
    if (activeWallpaper) applyCss({wallpaper: activeWallpaper, grid: getCurrentLayout().grid});
})

platform.register('set-wallpapers-dir', (dir: string) => {
    platform.userPref.setWallpapersDir(dir);
})

platform.host.registerCommand('set-wallpapers-dir', (dir: string) => {
    platform.userPref.setWallpapersDir(dir);
})

const applyLayout = (layoutId: string) => {
    writeCurrentLayoutId(layoutId)
    layoutSubject.next(layoutId)
    applyCss({wallpaper: platform.userPref.getWallpaper() || '/public/wp-11.jpg', grid: getCurrentLayout().grid})
}

platform.register('set-layout', applyLayout)
platform.host.registerCommand('set-layout', applyLayout)

type DesktopEnvDef = {
    id: string
    name: string
    layoutId: string
    themeId: string
    cssClass: string
    description: string
}

const DESKTOP_ENVS: DesktopEnvDef[] = [
    {
        id: 'macos',
        name: 'macOS',
        layoutId: 'default',
        themeId: 'ocean',
        cssClass: 'de-macos',
        description: 'Floating dock, traffic light buttons, glassmorphism',
    },
    {
        id: 'windows',
        name: 'Windows 11',
        layoutId: 'windows-bottom-bar',
        themeId: 'windows',
        cssClass: 'de-windows',
        description: 'Bottom taskbar, Fluent-style controls, Mica materials',
    },
    {
        id: 'linux',
        name: 'Linux (GNOME)',
        layoutId: 'linux-top-header',
        themeId: 'linux',
        cssClass: 'de-linux',
        description: 'Top header bar, GNOME-style controls, dark theme',
    },
]

const DE_PREF_KEY = 'desktop_env'

const ensureDeThemes = () => {
    const fs = platform.host.getFS()

    const windowsTheme = {
        name: 'Windows 11',
        appearance: {
            headerBackground: '#202020',
            headerColor: '#ffffff',
            windowBackground: 'rgba(32, 32, 32, 0.92)',
            taskbarBackground: 'rgba(32, 32, 32, 0.85)',
            taskbarSize: 48,
            accentColor: '#0078d4',
            borderRadius: 8,
            blur: 12,
            shadow: true,
        },
        behavior: { dblClickHeaderFullscreen: true, bringToFrontOnClick: true },
    }

    const linuxTheme = {
        name: 'Linux GNOME',
        appearance: {
            headerBackground: '#303030',
            headerColor: '#ffffff',
            windowBackground: 'rgba(36, 36, 36, 0.95)',
            taskbarBackground: 'rgba(36, 36, 36, 0.95)',
            taskbarSize: 40,
            accentColor: '#3584e4',
            borderRadius: 12,
            blur: 8,
            shadow: true,
        },
        behavior: { dblClickHeaderFullscreen: true, bringToFrontOnClick: true },
    }

    try {
        ensureDir(fs, WM_THEMES_DIR)
        if (!fs.existsSync(`${WM_THEMES_DIR}/windows.json`)) {
            writeJsonFile(fs, `${WM_THEMES_DIR}/windows.json`, windowsTheme)
        }
        if (!fs.existsSync(`${WM_THEMES_DIR}/linux.json`)) {
            writeJsonFile(fs, `${WM_THEMES_DIR}/linux.json`, linuxTheme)
        }
    } catch (err) {
        console.error('Failed to write DE themes', err)
    }
}

const applyDesktopEnv = (envId: string) => {
    const de = DESKTOP_ENVS.find(d => d.id === envId)
    if (!de) return

    ensureDeThemes()

    const root = platform.window.document.documentElement
    DESKTOP_ENVS.forEach(d => root.classList.remove(d.cssClass))
    root.classList.add(de.cssClass)

    applyTheme(de.themeId)
    applyLayout(de.layoutId)

    try {
        const fs = platform.host.getFS()
        const prefs = readJsonFileLocal('/user-preferences.json') || {}
        prefs[DE_PREF_KEY] = envId
        writeJsonFile(fs, '/user-preferences.json', prefs)
    } catch (_) {}
}

const getDesktopEnvs = () => DESKTOP_ENVS

const getCurrentDesktopEnv = (): string => {
    const prefs = readJsonFileLocal('/user-preferences.json')
    return prefs?.[DE_PREF_KEY] || 'macos'
}

const initDesktopEnv = () => {
    const envId = getCurrentDesktopEnv()
    const de = DESKTOP_ENVS.find(d => d.id === envId)
    if (de) {
        platform.window.document.documentElement.classList.add(de.cssClass)
    }
}
initDesktopEnv()

platform.register('set-desktop-env', applyDesktopEnv)
platform.host.registerCommand('set-desktop-env', applyDesktopEnv)
platform.register('get-desktop-envs', getDesktopEnvs)
platform.host.registerCommand('get-desktop-envs', getDesktopEnvs)
platform.register('get-current-desktop-env', getCurrentDesktopEnv)
platform.host.registerCommand('get-current-desktop-env', getCurrentDesktopEnv)

// Per-widget pixel positions (keyed by widget name), persisted so dragged
// widgets stay where the user left them.
const readWidgetPositions = (): Record<string, { top: number, left: number }> => {
    return readJsonFileLocal(WIDGET_POSITIONS_PATH) || {}
}

const writeWidgetPosition = (name: string, top: number, left: number) => {
    const positions = readWidgetPositions()
    positions[name] = { top, left }
    try {
        writeJsonFile(platform.host.getFS(), WIDGET_POSITIONS_PATH, positions, true)
    } catch (err) { /* best effort */ }
}

// Widgets hidden by default until the user enables them from Settings ->
// Widgets, even though their script is loaded/registered at boot.
// Only clock, memory, shortcuts are shown by default.
const DEFAULT_HIDDEN_WIDGETS = ['toolbar', 'public-ip', 'sticky-notes', 'rss']

const readEnabledWidgets = (): string[] | null => {
    const cfg = readJsonFileLocal(WIDGETS_CONFIG_PATH)
    if (cfg && Array.isArray(cfg.enabled)) return cfg.enabled
    return null
}

const enabledWidgetsSubject = new BehaviorSubject<string[] | null>(readEnabledWidgets())

const setEnabledWidgets = (enabled: string[]) => {
    try {
        writeJsonFile(platform.host.getFS(), WIDGETS_CONFIG_PATH, { enabled }, true)
    } catch (err) { /* best effort */ }
    enabledWidgetsSubject.next(enabled)
}

platform.register('set-enabled-widgets', setEnabledWidgets)
platform.host.registerCommand('set-enabled-widgets', setEnabledWidgets)

// Renders one container <div> per widget registered via
// `platform.host.registerWidget(...)` (e.g. files in `/etc/widgets/`).
// Each widget owns its container and is responsible for its own contents;
// if `render` returns a cleanup function, it's called when the widget is
// removed or this panel unmounts. The whole widget is draggable - its
// position is persisted to WIDGET_POSITIONS_PATH on drop.
const WidgetItem = ({ widget, savedPosition, defaultTop, panelRef }: {
    widget: import('@shared/index').WidgetDef
    savedPosition?: { top: number, left: number }
    defaultTop: number
    panelRef: React.RefObject<HTMLDivElement | null>
}) => {
    const ref = React.useRef<HTMLDivElement>(null)

    React.useEffect(() => {
        if (!ref.current) return;
        const el = ref.current

        if (savedPosition) {
            el.style.left = `${savedPosition.left}px`
            el.style.top = `${savedPosition.top}px`
            el.style.right = 'auto'
        } else {
            el.style.right = '0'
            el.style.top = `${defaultTop}px`
        }

        const cleanup = widget.render(el, {
            platform,
            onDestroy: (cb: Function) => {
                const existing = (el as any)._onDestroy ?? []
                existing.push(cb)
                ;(el as any)._onDestroy = existing
            },
        })

        // Distinguish a drag from a click on an interactive child (e.g. a
        // toolbar widget's buttons): pointer capture is set immediately on
        // pointerdown (so move/up keep reaching `el` even once the pointer
        // leaves its bounds), but dragging - and the resulting style/position
        // change - only kicks in once the pointer moves past a small
        // threshold. If it never does, releasing capture on pointerup re-fires
        // a click on the original target so the child's click handler runs.
        const DRAG_THRESHOLD = 4
        let pointerDown = false
        let dragging = false
        let downTarget: HTMLElement | null = null
        let startX = 0, startY = 0, origLeft = 0, origTop = 0

        const beginDrag = () => {
            dragging = true
            el.classList.add('dragging')
            const elRect = el.getBoundingClientRect()
            const panelRect = panelRef.current?.getBoundingClientRect()
            origLeft = elRect.left - (panelRect?.left ?? 0)
            origTop = elRect.top - (panelRect?.top ?? 0)
            el.style.left = `${origLeft}px`
            el.style.top = `${origTop}px`
            el.style.right = 'auto'
        }
        const onPointerDown = (e: PointerEvent) => {
            pointerDown = true
            downTarget = e.target as HTMLElement
            startX = e.clientX
            startY = e.clientY
            el.setPointerCapture(e.pointerId)
        }
        const onPointerMove = (e: PointerEvent) => {
            if (!pointerDown) return
            if (!dragging) {
                if (Math.abs(e.clientX - startX) < DRAG_THRESHOLD && Math.abs(e.clientY - startY) < DRAG_THRESHOLD) return
                beginDrag()
            }
            el.style.left = `${origLeft + (e.clientX - startX)}px`
            el.style.top = `${origTop + (e.clientY - startY)}px`
        }
        const onPointerUp = (e: PointerEvent) => {
            pointerDown = false
            el.releasePointerCapture(e.pointerId)
            if (!dragging) {
                downTarget?.click()
                return
            }
            dragging = false
            el.classList.remove('dragging')
            writeWidgetPosition(widget.name, parseFloat(el.style.top), parseFloat(el.style.left))
        }

        el.addEventListener('pointerdown', onPointerDown)
        el.addEventListener('pointermove', onPointerMove)
        el.addEventListener('pointerup', onPointerUp)

        return () => {
            el.removeEventListener('pointerdown', onPointerDown)
            el.removeEventListener('pointermove', onPointerMove)
            el.removeEventListener('pointerup', onPointerUp)
            const callbacks: Function[] = (el as any)._onDestroy ?? []
            callbacks.forEach(cb => cb())
            if (typeof cleanup === 'function') cleanup()
        }
    }, [widget])

    return <div className="widget" data-widget={widget.name} ref={ref}></div>
}

const WidgetsPanel = () => {
    const [widgetList, setWidgetList] = React.useState<Array<import('@shared/index').WidgetDef>>([])
    const [enabled, setEnabled] = React.useState<string[] | null>(enabledWidgetsSubject.getValue())
    const panelRef = React.useRef<HTMLDivElement>(null)
    const positions = React.useMemo(readWidgetPositions, [])

    React.useEffect(() => {
        const widgetsSub = platform.host.widgets$.subscribe(setWidgetList)
        const enabledSub = enabledWidgetsSubject.subscribe(setEnabled)
        return () => {
            widgetsSub.unsubscribe()
            enabledSub.unsubscribe()
        }
    }, [])

    const visibleWidgets = enabled
        ? widgetList.filter(w => enabled.includes(w.name) || w.meta?.['alwaysVisible'])
        : widgetList.filter(w => !DEFAULT_HIDDEN_WIDGETS.includes(w.name))

    if (!visibleWidgets.length) return null;

    return (
        <div className="widgets-panel" ref={panelRef}>
            {visibleWidgets.map((widget, i) => (
                <WidgetItem
                    key={widget.name}
                    widget={widget}
                    savedPosition={positions[widget.name]}
                    defaultTop={i * 100}
                    panelRef={panelRef}
                />
            ))}
        </div>
    )
}

const LayoutShell = (props: {
    contentRef: React.RefObject<HTMLDivElement | null>
    contextMenuRef: React.RefObject<HTMLDivElement | null>
    onCommandClick: (command: Command, ...args: unknown[]) => void
    onContextMenu: React.MouseEventHandler<HTMLDivElement>
    openFile: (file: FileType) => void
    showFileActionsHandler: (file: FileType, event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void
    contextMenuComponentRef: { current: any }
}) => {
    const [layoutId, setLayoutId] = React.useState(layoutSubject.getValue())

    React.useEffect(() => {
        const subscription = layoutSubject.subscribe(setLayoutId)
        return () => subscription.unsubscribe()
    }, [])

    const layouts = readLayouts()
    const currentLayout = layouts.find(l => l.id === layoutId) || layouts[0] || DEFAULT_LAYOUTS[0]
    const { slot, vertical, align } = currentLayout.commands

    // Only render slot containers that the active layout actually places in its
    // grid-template-areas. Rendering an unused .header/.left-nav/.right-nav/.footer
    // div would make it an unassigned grid item, which the browser auto-places into
    // extra implicit rows/columns and pushes the real content off-screen.
    const usedAreas = new Set(currentLayout.grid.areas.match(/[\w-]+/g) ?? [])

    const commands = <Taskbar onCommandClick={props.onCommandClick} vertical={vertical} align={align} />

    return (
        <>
            {usedAreas.has('header') ? (
                <div className="header">
                    {slot === 'header' ? commands : null}
                </div>
            ) : null}
            {usedAreas.has('left-nav') ? (
                <div className="left-nav">
                    {slot === 'left-nav' ? commands : null}
                </div>
            ) : null}
            <div className="content-area" ref={props.contentRef} onContextMenu={props.onContextMenu}>
                <div className={DESKTOP_CONTAINER_CLASS}>
                    <ListDirComponent openFile={props.openFile} showFileActions={props.showFileActionsHandler} customClass='desktop-icons' />
                </div>
                <WidgetsPanel />
                <div className={WINDOWS_CONTAINER_CLASS}></div>
            </div>
            {usedAreas.has('right-nav') ? (
                <div className="right-nav">
                    {slot === 'right-nav' ? commands : null}
                </div>
            ) : null}
            {usedAreas.has('footer') ? (
                <div className="footer">
                    {slot === 'footer' ? commands : null}
                </div>
            ) : null}
            {slot === 'toolbar' ? (
                <div className='toolbar'>
                    {commands}
                </div>
            ) : null}
            <div className='contextmenu' ref={props.contextMenuRef}>
                <ContextMenu componentRef={obj => props.contextMenuComponentRef.current = obj} />
            </div>
        </>
    )
}

export const render = (container: HTMLElement) => {
    platform.host.addCSSStyleSheet(styles)

    const contentRef = React.createRef<HTMLDivElement>();

    const windowManager = new WindowManager(contentRef)

    const onCommandClick = (command: Command, ...args: unknown[]) => {
        windowManager.createWindow(command.name, ...args)
    }




    platform.register('open-window', onCommandClick)

    const root = createRoot(container)
    const contextMenuRef = React.createRef<HTMLDivElement>()
    // registerContextMenu(container, contextMenuRef)
    container.addEventListener('click', ev => {
        const clickTarget = ev.target as HTMLDivElement;
        const contextTarget = contextMenuRef.current as HTMLDivElement;
        if (!contextTarget) return;


        if (!contextTarget.contains(clickTarget)) {
            contextTarget.style.display = 'none';
        }
    })

    const openFile = (file: FileType) => {
        platform.host.exec(platform, file.path)
    }

    const contextMenuItems: Array<ContextMenuItem> = [
        // {id: 'edit_file', type:'action', title: 'Edit'},
        // {id: 'open_file', type:'action', title: 'Open'},
        // {id: 'delete_file', type:'action', title: 'Delete'},
    ]

    const contextMenuComponentRef = ({
        current: {
            setItems: (items: Array<ContextMenuItem>) => { },
            setOnClick: (callback: (item: ContextMenuItem) => void) => { }
        }
    })

    const showFileActionsHandler = (file: FileType, event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        const items: Array<ContextMenuItem> = [
            { id: 'edit_file',   type: 'action', title: 'Edit',   cmd: `service('001-core.layout', 'open-window') (command('ui.notepad'), '${file.path}')` },
            { id: 'open_file',   type: 'action', title: 'Open',   cmd: `service('001-core.layout', 'open-window') (command('ui.iframe'), '${file.path}')` },
            { id: 'delete_file', type: 'action', title: 'Delete', cmd: `service('root', 'fs')('rm', '${file.path}')` },
        ]
        if (file.type === 'file') {
            const ext = file.name.split('.').pop()?.toLowerCase() || ''
            const registered = platform.host.getCommandsForExtension(ext)
            const owChildren = registered.map(app => ({
                id: `ow_${app.name}`, type: 'action' as const, title: app.title,
                cmd: `service('001-core.layout','open-window')(command('${app.name}'),'${file.path}')`,
            }))
            owChildren.push({ id: 'ow_browser', type: 'action' as const, title: 'Browser', cmd: `service('001-core.layout','open-window')(command('ui.iframe'),'${file.path}')` })
            items.push({ id: 'divider_ow', type: 'divider', title: '' })
            items.push({ id: 'open_with', type: 'group', title: 'Open with', children: owChildren })
        }
        showContextMenuHandler(event.clientX, event.clientY, items)
    }


    const showContextMenuHandler = (x: number, y: number, items: Array<ContextMenuItem>) => {
        if (!contextMenuRef.current) return;

        contextMenuComponentRef.current.setItems(items);
        contextMenuComponentRef.current.setOnClick(item => {
            contextMenuRef.current!.style.display = 'none';
            if (item.cmd) {
                platform.host.execCommand(item.cmd, platform)
            }
        });

        contextMenuRef.current.style.display = 'block';
        contextMenuRef.current.style.top = `${y}px`
        contextMenuRef.current.style.left = `${x}px`

    }

    platform.register('show-context-menu', showContextMenuHandler)


    const onCommandClickHandler = (command: Command, ...args: string[]) => {
        platform.host.execCommand(`service('001-core.layout', 'open-window') (command('${command.name}')${args.length ? ',' : ''} ${args.map(x => "'" + x + "'").join(', ')})`, platform)

    }

    const onContextMenu: React.MouseEventHandler<HTMLDivElement>  = (event) => {
        if(event.target !== contentRef.current) return;
        event.preventDefault()
        showContextMenuHandler(event.clientX, event.clientY, [
            {
                type: 'action',
                id: '1',
                title: 'Explorer',
                cmd: `service('001-core.layout', 'open-window') (command('explorer'))`
            },
            {
                type: 'action',
                id: '4',
                title: 'Settings',
                cmd: `command('ui.settings')`
            },
            {
                type: 'action',
                id: '0',
                title: 'XTerm',
               cmd: `command('ui.terminal')`
            },
            {
                type: 'action',
                id: '2',
                title: 'Portfolio',
                cmd: `service('001-core.layout', 'open-window') (command('ui.iframe'), '/home/user1/index.html')`
            },
            {
                type: 'action',
                id: '3',
                title: 'Toggle Fullscreen',
                cmd: `service('root', 'exec') ('/usr/bin/fullscreen.js');`
            },
            {
                type: 'action',
                id: '5',
                title: 'VsCode (password:demo)',
                cmd: `service('root', 'exec') ('/home/user1/projects/VSCode.html');`
            },
            {
                type: 'action',
                id: '7',
                title: 'Dashboard',
                cmd: `service('001-core.layout', 'open-window') (command('ui.dashboard'))`
            },
            {
                type: 'action',
                id: '6',
                title: 'Add Desktop',
                cmd: `platform.host.callCommand('add-desktop')`
            },
        ])
    }
    root.render(
        <LayoutShell
            contentRef={contentRef}
            contextMenuRef={contextMenuRef}
            onCommandClick={onCommandClick}
            onContextMenu={onContextMenu}
            openFile={openFile}
            showFileActionsHandler={showFileActionsHandler}
            contextMenuComponentRef={contextMenuComponentRef}
        />
    )

}


// TODO: convert registerContextMenu to ReactHook, to prevent multiple addEventListener
const registerContextMenu = (container: HTMLElement, ref: React.RefObject<HTMLDivElement>) => {
    container.addEventListener('contextmenu', event => {
        event.preventDefault();
        // console.log(event)
        if (ref.current) {
            ref.current.style.display = 'block'
            ref.current.style.top = `${event.clientY}px`
            ref.current.style.left = `${event.clientX}px`
        }
    })
}


platform.events$.pipe(filter(x => x.type === 'loaded')).subscribe(
    event => {
        const container = platform.window.document.createElement('div')
        container.classList.add('layout-default')
        platform.host.appendDomElement(container)
        render(container)
    }
)

platform.events$.pipe(filter(x => x.type === 'exit')).subscribe(
    event => {
        console.log(event)
    }
)
