import { BehaviorSubject, filter } from 'rxjs'
import { Command, Platform } from '@shared/index'
import { createRoot } from 'react-dom/client'
import React from 'react'
import { Taskbar } from './commands'
import { ContextMenu, ContextMenuItem } from './contextmenu'
import { DESKTOP_CONTAINER_CLASS, WINDOWS_CONTAINER_CLASS, WindowManager } from '../window-manager'
import { FileType } from '../../shared/types'
import { ListDirComponent } from '../../apps/file-explorer/desktop'
import { Header } from './header'

const platform = Platform.getInstance()

const styles = platform.host.createCSSStyleSheet()
// document.body.requestFullscreen()

// Layout presets are stored in the virtual filesystem (standard Linux config
// location: /etc/wm) so they can be edited either through Settings or by
// directly editing the JSON files.
const LAYOUTS_PATH = '/etc/wm/layouts.json'
const LAYOUT_CONFIG_PATH = '/etc/wm/config.json'
const WM_CURRENT_PATH = '/etc/wm/current.json'
const WM_THEMES_DIR = '/etc/wm/themes'
const WM_DEFAULT_THEME_PATH = `${WM_THEMES_DIR}/dark.json`

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

const readJsonFile = (path: string): any | null => {
    const fs = platform.host.getFS()
    try {
        if (fs.existsSync(path)) return JSON.parse(fs.readFileSync(path, 'utf-8') as string)
    } catch (err) { console.error(err) }
    return null
}

const mergeWmSettings = (raw: any): WmSettings => ({
    appearance: { ...DEFAULT_WM_SETTINGS.appearance, ...raw?.appearance },
    behavior: { ...DEFAULT_WM_SETTINGS.behavior, ...raw?.behavior },
})

const writeWmCurrent = (raw: any) => {
    const fs = platform.host.getFS()
    if (!fs.existsSync('/etc/wm')) fs.mkdirSync('/etc/wm', { recursive: true })
    fs.writeFileSync(WM_CURRENT_PATH, JSON.stringify(raw, null, 2))
}

// Ensures /etc/wm/current.json exists, seeding it from themes/default.json,
// or failing that, from any other theme file found in /etc/wm/themes.
const ensureWmCurrent = (): any => {
    const fs = platform.host.getFS()
    const current = readJsonFile(WM_CURRENT_PATH)
    if (current) return current

    let seed = readJsonFile(WM_DEFAULT_THEME_PATH)
    if (!seed) {
        try {
            if (fs.existsSync(WM_THEMES_DIR)) {
                const files = (fs.readdirSync(WM_THEMES_DIR) as string[]).filter(f => f.endsWith('.json'))
                for (const file of files) {
                    seed = readJsonFile(`${WM_THEMES_DIR}/${file}`)
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
            const raw = readJsonFile(`${WM_THEMES_DIR}/${file}`)
            const merged = mergeWmSettings(raw)
            return { id, name: raw?.name || id, appearance: merged.appearance }
        })
    } catch (err) { console.error(err); return [] }
}

const applyTheme = (themeId: string): WmSettings => {
    const raw = readJsonFile(`${WM_THEMES_DIR}/${themeId}.json`) || DEFAULT_WM_SETTINGS
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
    root.style.setProperty('--wm-header-bg', appearance.headerBackground)
    root.style.setProperty('--wm-header-color', appearance.headerColor)
    root.style.setProperty('--wm-window-bg', appearance.windowBackground)
    root.style.setProperty('--wm-taskbar-bg', appearance.taskbarBackground)
    root.style.setProperty('--wm-taskbar-size', `${appearance.taskbarSize}px`)
    root.style.setProperty('--wm-accent', appearance.accentColor)
    root.style.setProperty('--wm-radius', `${appearance.borderRadius}px`)
    root.style.setProperty('--wm-blur', `${appearance.blur}px`)
    root.style.setProperty('--wm-shadow', appearance.shadow ? '0 8px 32px rgba(31, 38, 135, 0.37)' : 'none')
}

const readLayouts = (): Array<LayoutDef> => {
    const fs = platform.host.getFS()
    try {
        if (fs.existsSync(LAYOUTS_PATH)) {
            const parsed = JSON.parse(fs.readFileSync(LAYOUTS_PATH, 'utf-8') as string)
            if (Array.isArray(parsed.layouts) && parsed.layouts.length) return parsed.layouts
        }
    } catch (err) { console.error(err) }
    return DEFAULT_LAYOUTS
}

const readCurrentLayoutId = (): string => {
    const fs = platform.host.getFS()
    try {
        if (fs.existsSync(LAYOUT_CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(LAYOUT_CONFIG_PATH, 'utf-8') as string).layout || 'default'
        }
    } catch (err) { console.error(err) }
    return 'default'
}

const writeCurrentLayoutId = (layoutId: string) => {
    const fs = platform.host.getFS()
    if (!fs.existsSync('/etc/wm')) fs.mkdirSync('/etc/wm', { recursive: true })
    fs.writeFileSync(LAYOUT_CONFIG_PATH, JSON.stringify({ layout: layoutId }, null, 2))
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
    styles.replace(`
        html, body {
            margin: 0;
            padding:0;
            font-family: monospace;
            height: 100svh;
            overflow: hidden;
        }
    
        * {
            box-sizing: border-box;
        }
    
        @font-face {
            font-family: 'Material Symbols Outlined';
            font-style: normal;
            font-weight: 100 700;
            src: url(https://fonts.gstatic.com/s/materialsymbolsoutlined/v138/kJEhBvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oFsLjBuVY.woff2) format('woff2');
        }
        
        .material-symbols-outlined {
            font-family: 'Material Symbols Outlined';
            font-weight: normal;
            font-style: normal;
            font-size: 24px;
            line-height: 1;
            letter-spacing: normal;
            text-transform: none;
            display: inline-block;
            white-space: nowrap;
            word-wrap: normal;
            direction: ltr;
            -webkit-font-feature-settings: 'liga';
            -webkit-font-smoothing: antialiased;
        }
    
        .layout-default {
            // background: #292a2d;
            // color: #919191;
            // height: -webkit-fill-available;
            height: 100%;

            display: grid;
            grid-template-columns: ${grid.columns};
            grid-template-rows: ${grid.rows};
            // gap: 5px;
            grid-auto-flow: row;
            grid-template-areas: ${grid.areas};

            // background-image: url(/wp-8.jpeg);
            background-image: url(${wallpaperUrl});
            background-repeat: no-repeat;
            background-size: cover;
    
        }
        .header {
            grid-area: header;
        }
        .left-nav {
            grid-area: left-nav;
        }
        .content-area {
            grid-area: content-area;
            min-height: 0;
            min-width: 0;
            overflow: hidden;
        }

        .widgets-panel {
            position: absolute;
            top: 1rem;
            right: 1rem;
            bottom: 1rem;
            left: 1rem;
            z-index: 5;
            pointer-events: none;
        }

        .widgets-panel .widget {
            position: absolute;
            min-width: 9rem;
            pointer-events: auto;
            padding: 0.75rem 1rem;
            background: var(--wm-window-bg, rgba(255, 255, 255, 0.15));
            backdrop-filter: blur(var(--wm-blur, 10px));
            border-radius: var(--wm-radius, 8px);
            box-shadow: var(--wm-shadow, 0 8px 32px rgba(31, 38, 135, 0.37));
            color: var(--wm-header-color, #1d1d1f);
            cursor: grab;
            user-select: none;
        }

        .widgets-panel .widget.dragging {
            cursor: grabbing;
            opacity: 0.85;
            z-index: 10;
        }

        .widget-clock-time {
            font-size: 1.75rem;
            font-weight: 600;
            text-align: right;
        }

        .widget-clock-date {
            font-size: 0.8rem;
            opacity: 0.8;
            text-align: right;
        }

        .widget-public-ip-label {
            font-size: 0.7rem;
            opacity: 0.8;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .widget-public-ip-value {
            font-size: 1rem;
            font-weight: 600;
            text-align: right;
        }

        .widget-memory-label {
            font-size: 0.7rem;
            opacity: 0.8;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .widget-memory-value {
            font-size: 1rem;
            font-weight: 600;
            text-align: right;
        }

        .widget-memory-bar {
            margin-top: 0.4rem;
            width: 100%;
            height: 0.35rem;
            border-radius: 0.2rem;
            background: rgba(127, 127, 127, 0.3);
            overflow: hidden;
        }

        .widget-memory-bar-fill {
            height: 100%;
            width: 0%;
            background: var(--wm-accent, #0a84ff);
            border-radius: 0.2rem;
            transition: width 0.3s ease;
        }

        .widget-memory-sub {
            margin-top: 0.2rem;
            font-size: 0.7rem;
            opacity: 0.7;
            text-align: right;
        }

        .window > iframe {
            border: 0;
            flex-grow: 1;
            width: 100%;
            width: -webkit-fill-available;
            height: -webkit-fill-available;
        }
    
        .right-nav {
            grid-area: right-nav;
        }
        .footer {
            grid-area: footer;
        }
    
    
    
        .window {
            position: absolute;
            z-index: 9;
            background-color: #f1f1f1;
            text-align: center;
            display: flex;
            flex-direction: column;
            // border: 1px solid #d3d3d3;
    
            width: 50rem;
            height: 30rem;
            top: min(10%, 30rem);
            left: min(10%, 30rem);
    
            resize: both;
            overflow: hidden;
            border-radius: var(--wm-radius, 6px);


            // padding: 4px;
            background: var(--wm-window-bg, rgba(255, 255, 255, 0.15));
            backdrop-filter: blur(var(--wm-blur, 10px));
            box-shadow: var(--wm-shadow, rgba(31, 38, 135, 0.37) 0px 8px 32px);
            // border: 1px solid rgba(255, 255, 255, 0.18);
        }
        .window.hidden, .window.minimized {
            display: none;
        }

        .window.top {
            z-index: 10;
            outline: 1px solid var(--wm-accent, transparent);
        }
    
        .window::-webkit-resizer {
            background-color: transparent;
        }

        .window-resize-handle {
            position: absolute;
            z-index: 50;
        }
        .window-resize-handle.n  { top: 0; left: 6px; right: 6px; height: 5px; cursor: n-resize; }
        .window-resize-handle.s  { bottom: 0; left: 6px; right: 6px; height: 5px; cursor: s-resize; }
        .window-resize-handle.e  { right: 0; top: 6px; bottom: 6px; width: 5px; cursor: e-resize; }
        .window-resize-handle.w  { left: 0; top: 6px; bottom: 6px; width: 5px; cursor: w-resize; }
        .window-resize-handle.nw { top: 0; left: 0; width: 12px; height: 12px; cursor: nw-resize; }
        .window-resize-handle.ne { top: 0; right: 0; width: 12px; height: 12px; cursor: ne-resize; }
        .window-resize-handle.sw { bottom: 0; left: 0; width: 12px; height: 12px; cursor: sw-resize; }
        .window-resize-handle.se { bottom: 0; right: 0; width: 12px; height: 12px; cursor: se-resize; }
    
        .window.dragging {
            outline: 1px solid #d3d3d3;
            z-index: 200;
            box-shadow: rgb(255 255 255) 0px 0px 4px;
        }

        .snap-preview {
            position: fixed;
            z-index: 99;
            background: rgba(10, 132, 255, 0.12);
            border: 2px solid rgba(10, 132, 255, 0.45);
            border-radius: var(--wm-radius, 6px);
            pointer-events: none;
            transition: left 0.08s ease, top 0.08s ease, width 0.08s ease, height 0.08s ease;
        }
    
        .window.on-top {
            z-index: 100;
        }
    
        .window-header {
            padding: 7px;
            cursor: move;
            z-index: 9;
            background-color: var(--wm-header-bg, rgb(0 0 0));
            color: var(--wm-header-color, #fff);
            
            // position: absolute;
            // bottom: 100%;
            // width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .window-header > .title {
            display: inline-flex;
            align-items: center;
            gap: .5rem;
        }
    
        iframe.dragging {
            pointer-events: none;
        }
    
        .contextmenu {
            position: absolute;
            // background: white;
            display: none;
            z-index: 300;
    
            // padding: 10px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
            border: 1px solid rgba(255, 255, 255, 0.18);
        }
    
    
    
        .toolbar {
            position: absolute;
            bottom: 1rem;
            left: 50%;
            transform: translateX(-50%);
        }

        /* Windows 11 style taskbar: translucent pill of blurred glass that hosts
           pinned app launchers, running-window indicators and the settings icon. */
        .taskbar {
            display: flex;
            align-items: center;
            gap: 0.15rem;
            box-sizing: border-box;
            height: var(--wm-taskbar-size, 56px);
            padding: 0.3rem 0.6rem;
            background: var(--wm-taskbar-bg, rgba(255, 255, 255, 0.5));
            backdrop-filter: blur(var(--wm-blur, 10px));
            box-shadow: var(--wm-shadow, 0 8px 32px rgba(31, 38, 135, 0.37));
            border-radius: var(--wm-radius, 12px);
            color: var(--wm-header-color, #1d1d1f);
        }

        .header .taskbar, .footer .taskbar {
            width: 100%;
            border-radius: 0;
        }

        .left-nav .taskbar, .right-nav .taskbar {
            flex-direction: column;
            height: 100%;
            width: var(--wm-taskbar-size, 56px);
            border-radius: 0;
        }

        .taskbar-divider {
            width: 1px;
            height: 60%;
            background: currentColor;
            opacity: 0.2;
            margin: 0 0.3rem;
        }

        .left-nav .taskbar-divider, .right-nav .taskbar-divider {
            width: 60%;
            height: 1px;
            margin: 0.3rem 0;
        }

        .taskbar-spacer {
            flex: 1;
        }

        .taskbar-icon-button {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0.4rem;
            border-radius: 8px;
            cursor: pointer;
            color: var(--wm-header-color, #1d1d1f);
        }

        .taskbar-icon-button:hover, .taskbar-window-icon.active {
            background: rgba(127, 127, 127, 0.2);
        }

        .taskbar-window-icon.active::after {
            content: '';
            position: absolute;
            bottom: 2px;
            left: 50%;
            transform: translateX(-50%);
            width: 18px;
            height: 3px;
            border-radius: 2px;
            background: var(--wm-accent, #0a84ff);
        }

        .taskbar-window-icon.minimized::after {
            content: '';
            position: absolute;
            bottom: 2px;
            left: 50%;
            transform: translateX(-50%);
            width: 6px;
            height: 3px;
            border-radius: 2px;
            background: rgba(127, 127, 127, 0.6);
        }

        .taskbar-preview {
            position: absolute;
            bottom: calc(100% + 0.5rem);
            left: 50%;
            transform: translateX(-50%);
            display: none;
            flex-direction: column;
            align-items: center;
            background: var(--wm-window-bg, rgba(255, 255, 255, 0.85));
            backdrop-filter: blur(var(--wm-blur, 10px));
            border-radius: var(--wm-radius, 8px);
            box-shadow: var(--wm-shadow, 0 8px 32px rgba(31, 38, 135, 0.37));
            padding: 0.4rem;
            z-index: 50;
            pointer-events: none;
        }

        .taskbar-window-icon:hover .taskbar-preview {
            display: flex;
        }

        .taskbar-preview span {
            margin-top: 0.25rem;
            font-size: 0.75rem;
            white-space: nowrap;
        }

        .desktop-switcher {
            display: flex;
            align-items: center;
            gap: 0.3rem;
        }

        .left-nav .desktop-switcher, .right-nav .desktop-switcher {
            flex-direction: column;
        }

        .desktop-pill {
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 1.6rem;
            height: 1.6rem;
            padding: 0 0.3rem;
            border-radius: 6px;
            font-size: 0.8rem;
            cursor: pointer;
            color: var(--wm-header-color, #1d1d1f);
        }

        .desktop-pill:hover {
            background: rgba(127, 127, 127, 0.2);
        }

        .desktop-pill.active {
            background: var(--wm-accent, #0a84ff);
            color: #fff;
        }

        .desktop-context-menu {
            position: fixed;
            z-index: 100;
            background: var(--wm-window-bg, #fff);
            backdrop-filter: blur(var(--wm-blur, 10px));
            border-radius: var(--wm-radius, 8px);
            box-shadow: var(--wm-shadow, 0 8px 32px rgba(31, 38, 135, 0.37));
            color: var(--wm-header-color, #1d1d1f);
            overflow: hidden;
        }

        .desktop-context-menu button {
            display: block;
            width: 100%;
            padding: 0.5rem 1rem;
            border: none;
            background: transparent;
            color: inherit;
            font-size: 0.85rem;
            text-align: left;
            cursor: pointer;
        }

        .desktop-context-menu button:hover {
            background: rgba(127, 127, 127, 0.2);
        }

        .desktop-context-menu button:disabled {
            opacity: 0.4;
            cursor: default;
        }

        .window.desktop-hidden {
            display: none !important;
        }

        .overlay {
            // display: none;
            background: rgba(255, 255, 255, 0.30);
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 100;
            pointer-events: none;
        }
    
        .overlay>div {
            width: 10rem;
            height: 10rem;
            outline: 1px solid #00BCD4;
        }
    
        // .overlay {
        //     position:absolute;
        //     top:0;
        //     height: 100vh;
        //     -webkit-mask: radial-gradient(50px, #0000 100%, #000);
        //             mask: radial-gradient(50px, #0000 100%, #000);
        //     width: 100%;
        //     backdrop-filter: blur(10px);
        //     background:rgba(255, 0, 0, 0.1);
        //   }
    
    `)
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
    // console.log(wallpaperUrl)
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


// Per-widget pixel positions (keyed by widget name), persisted so dragged
// widgets stay where the user left them.
const WIDGET_POSITIONS_PATH = '/etc/widgets/positions.json'
// Which registered widgets are shown (`null` = show all - default before the
// user has touched Settings > Widgets).
const WIDGETS_CONFIG_PATH = '/etc/widgets/config.json'

const readWidgetPositions = (): Record<string, { top: number, left: number }> => {
    try {
        const fs = platform.host.getFS()
        return JSON.parse(fs.readFileSync(WIDGET_POSITIONS_PATH, 'utf-8'))
    } catch (err) {
        return {}
    }
}

const writeWidgetPosition = (name: string, top: number, left: number) => {
    const fs = platform.host.getFS()
    const positions = readWidgetPositions()
    positions[name] = { top, left }
    try {
        if (!fs.existsSync('/etc/widgets')) fs.mkdirSync('/etc/widgets', { recursive: true })
        fs.writeFileSync(WIDGET_POSITIONS_PATH, JSON.stringify(positions, null, 2))
    } catch (err) { /* best effort */ }
}

// Widgets hidden by default until the user enables them from Settings ->
// Widgets, even though their script is loaded/registered at boot.
// Only clock, memory, shortcuts are shown by default.
const DEFAULT_HIDDEN_WIDGETS = ['toolbar', 'public-ip', 'sticky-notes', 'rss']

const readEnabledWidgets = (): string[] | null => {
    try {
        const fs = platform.host.getFS()
        const cfg = JSON.parse(fs.readFileSync(WIDGETS_CONFIG_PATH, 'utf-8'))
        if (Array.isArray(cfg.enabled)) return cfg.enabled
    } catch (err) { /* fall through to default */ }
    return null
}

const enabledWidgetsSubject = new BehaviorSubject<string[] | null>(readEnabledWidgets())

const setEnabledWidgets = (enabled: string[]) => {
    const fs = platform.host.getFS()
    try {
        if (!fs.existsSync('/etc/widgets')) fs.mkdirSync('/etc/widgets', { recursive: true })
        fs.writeFileSync(WIDGETS_CONFIG_PATH, JSON.stringify({ enabled }, null, 2))
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
