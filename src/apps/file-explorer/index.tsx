import React from "react";
import { Platform, UICallbackProps } from "@shared/index";
import { createRoot } from "react-dom/client";

import { FileType } from '@shared/types';
import { DESKTOP_PATH, appendStyleSheet, getFileExtension, mountLocalDirectory } from "@shared/utils";
import { DESKTOP_CONTAINER_CLASS } from "../../core/window-manager";

const MOUNT_PATH = '/mnt';

const NAV_SHORTCUTS = [
    { label: 'Home', path: DESKTOP_PATH, icon: 'home' },
    { label: 'Mounted', path: MOUNT_PATH, icon: 'drive_folder_upload' },
    { label: 'Root', path: '/', icon: 'dns' },
];

// Resolves `.`/`..`/`//` segments without delegating to fs.realpathSync, since
// MountableFileSystem's realpathSync returns paths relative to the mounted
// filesystem's own root (e.g. realpathSync('/tmp') => '/') instead of the
// global path.
const normalizePath = (path: string) => {
    const parts = path.split('/').filter(p => p && p !== '.')
    const result: string[] = []
    for (const part of parts) {
        if (part === '..') result.pop()
        else result.push(part)
    }
    return '/' + result.join('/')
}

// Splits a normalized path into breadcrumb segments, each carrying the
// absolute path it represents (Finder-style path bar).
const getBreadcrumbs = (path: string) => {
    const parts = path.split('/').filter(Boolean)
    const crumbs: Array<{ name: string, path: string }> = [{ name: 'Root', path: '/' }]
    let acc = ''
    for (const part of parts) {
        acc += `/${part}`
        crumbs.push({ name: part, path: acc })
    }
    return crumbs
}

const platform = Platform.getInstance()

// Context-menu entries (audit KRN-3/WIN-2/APP-1, decisions.md D9): what an entry
// does is a function over values — the layout's ContextMenuItem `onSelect` —
// so no file name is ever turned into DSL source.
type MenuEntry = { id: string, title: string, run: () => unknown } | { id: string, divider: true }
// Explicit "Run" of a .js/.run file through host.runFile (which asks for
// confirmation outside /bin, /usr/bin and /opt/apps); failures become a
// notification. Mirrors runScript in opt/apps/file-explorer/main.js.
const runScript = (path: string) => {
    const report = (e: any) => platform.host.callCommand('notify', {
        title: 'Run failed', body: `${path.split('/').pop()}: ${(e && e.message) || e}`, duration: 4000,
    })
    try {
        const result: any = platform.host.runFile(platform, path, [path.split('/').slice(0, -1).join('/') || '/'])
        if (result && typeof result.catch === 'function') result.catch(report)
        return result
    } catch (e) { report(e) }
}

const toContextMenuItems = (entries: MenuEntry[]) => entries.map(entry =>
    'divider' in entry
        ? { id: entry.id, type: 'divider', title: '' }
        : { id: entry.id, type: 'action', title: entry.title, onSelect: entry.run })

const fullScreenCallbackRef = {
    current: (...args: any[]) => { }
}
const resizeCallbackRef = {
    current: (...args: any[]) => { }
}
platform.register('fullscreen', (...args: any[]) => fullScreenCallbackRef.current(...args))
platform.register('resize', (...args: any[]) => resizeCallbackRef.current(...args))
platform.host.registerCommand('ui.file-explorer', (body: HTMLBodyElement, props: UICallbackProps, file: FileType) => {
    const container = platform.window.document.createElement('div')
    if (typeof file === 'string') {
        const fs = platform.host.getFS()
        file = {
            name: (file as string).split('/').at(-1)!,
            path: file,
            meta: { ext: getFileExtension(file) },
            type: fs.statSync(file).isDirectory() ? 'dir' : 'file'
        }
    }

    if (!file) {
        file = {
            name: '',
            path: '/',
            meta: { ext: '.' },
            type: 'dir'
        }
    }

    body.appendChild(container)
    const win = body.ownerDocument.defaultView!

    // Spatial glass look, light or dark (Settings › Window Manager › Themes › Mode).
    const windowProps = props as UICallbackProps & { setWindowMaterial?: (material: string) => void }
    if (typeof windowProps.setWindowMaterial === 'function') windowProps.setWindowMaterial('glass')
    const docEl = body.ownerDocument.documentElement
    const appearanceSub = platform.host.appearance$?.subscribe(a => docEl.setAttribute('data-appearance', a))
    win.addEventListener('pagehide', () => appearanceSub?.unsubscribe())

    const styles = new win.CSSStyleSheet()
    styles.replace(`
        /* Spatial glass look (same tokens as Settings, /opt/apps/settings/main.html).
           The window paints the frosted material (props.setWindowMaterial('glass'));
           this page is transparent. data-appearance comes from platform.host.appearance$. */
        :root {
            --vs-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, "Segoe UI", Helvetica, Arial, sans-serif;
            --vs-text: rgba(255, 255, 255, 0.96);
            --vs-text-2: rgba(255, 255, 255, 0.66);
            --vs-text-3: rgba(255, 255, 255, 0.44);
            --vs-fill: rgba(255, 255, 255, 0.075);
            --vs-fill-2: rgba(255, 255, 255, 0.13);
            --vs-fill-3: rgba(255, 255, 255, 0.21);
            --vs-recessed: rgba(0, 0, 0, 0.20);
            --vs-stroke: rgba(255, 255, 255, 0.13);
            --vs-separator: rgba(255, 255, 255, 0.09);
            --vs-sidebar: rgba(255, 255, 255, 0.045);
            --vs-selected-rim: rgba(255, 255, 255, 0.6);
            --vs-strong: rgba(255, 255, 255, 0.94);
            --vs-on-strong: #1c1c1e;
            --vs-scroll: rgba(255, 255, 255, 0.22);
            --vs-dialog-bg: rgba(54, 54, 60, 0.88);
            --vs-danger: #ff7a70;
            --vs-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        :root[data-appearance="light"] {
            --vs-text: rgba(0, 0, 0, 0.86);
            --vs-text-2: rgba(0, 0, 0, 0.56);
            --vs-text-3: rgba(0, 0, 0, 0.38);
            --vs-fill: rgba(255, 255, 255, 0.50);
            --vs-fill-2: rgba(0, 0, 0, 0.06);
            --vs-fill-3: rgba(255, 255, 255, 0.88);
            --vs-recessed: rgba(0, 0, 0, 0.06);
            --vs-stroke: rgba(0, 0, 0, 0.07);
            --vs-separator: rgba(0, 0, 0, 0.08);
            --vs-sidebar: rgba(255, 255, 255, 0.28);
            --vs-selected-rim: rgba(0, 0, 0, 0.22);
            --vs-strong: #1c1c1e;
            --vs-on-strong: #ffffff;
            --vs-scroll: rgba(0, 0, 0, 0.22);
            --vs-dialog-bg: rgba(246, 246, 249, 0.92);
            --vs-danger: #d70015;
        }

        html, body {
            margin: 0;
            padding: 0;
            font-family: var(--vs-font);
            height: 100svh;
            background: transparent;
            color: var(--vs-text);
            -webkit-font-smoothing: antialiased;
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
            font-size: 20px;
            line-height: 1;
            letter-spacing: normal;
            text-transform: none;
            display: inline-block;
            white-space: nowrap;
            word-wrap: normal;
            direction: ltr;
            -webkit-font-feature-settings: 'liga';
            -webkit-font-smoothing: antialiased;
            font-variation-settings: 'FILL' 0, 'wght' 300;
        }

        * {
            box-sizing: border-box;
            scrollbar-width: thin;
            scrollbar-color: var(--vs-scroll) transparent;
        }
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-thumb { background: var(--vs-scroll); border-radius: 999px; border: 3px solid transparent; background-clip: padding-box; }
        ::-webkit-scrollbar-track { background: transparent; }

        .file-explorer {
            color: var(--vs-text);
            background: transparent;
        }

        .file-explorer > header {
            display: flex;
            align-items: center;
            gap: .6rem;
            padding: .6rem .8rem;
            background: transparent;
            border-bottom: 1px solid var(--vs-separator);
        }

        /* Round glass buttons */
        .toolbar-nav-buttons,
        .toolbar-actions {
            display: flex;
            align-items: center;
            gap: .3rem;
            flex-shrink: 0;
        }

        .toolbar-nav-buttons .material-symbols-outlined,
        .toolbar-actions .material-symbols-outlined {
            width: 2rem;
            height: 2rem;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            background: var(--vs-fill-2);
            box-shadow: inset 0 0 0 1px var(--vs-stroke);
            color: var(--vs-text);
            font-size: 19px;
            cursor: pointer;
            transition: background .18s var(--vs-ease), transform .18s var(--vs-ease);
        }

        .toolbar-nav-buttons .material-symbols-outlined:not(.disabled):hover,
        .toolbar-actions .material-symbols-outlined:not(.disabled):hover {
            background: var(--vs-fill-3);
        }

        .toolbar-nav-buttons .material-symbols-outlined:not(.disabled):active,
        .toolbar-actions .material-symbols-outlined:not(.disabled):active {
            transform: scale(.94);
        }

        .toolbar-nav-buttons .material-symbols-outlined.disabled,
        .toolbar-actions .material-symbols-outlined.disabled {
            opacity: .35;
            cursor: default;
        }

        .toolbar-actions .material-symbols-outlined.active,
        .toolbar-actions .material-symbols-outlined.active:not(.disabled):hover {
            background: var(--vs-strong);
            color: var(--vs-on-strong);
            box-shadow: none;
        }

        /* Path bar: a recessed capsule */
        .breadcrumbs {
            flex-grow: 1;
            display: flex;
            align-items: center;
            gap: .1rem;
            height: 2.1rem;
            padding: 0 .35rem;
            border-radius: 999px;
            background: var(--vs-recessed);
            box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12);
            overflow: hidden;
            white-space: nowrap;
            font-size: 13px;
            color: var(--vs-text-2);
            min-width: 0;
        }

        .breadcrumbs > span.crumb {
            padding: .22rem .6rem;
            border-radius: 999px;
            cursor: pointer;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .breadcrumbs > span.crumb:hover {
            background: var(--vs-fill-2);
        }

        .breadcrumbs > span.crumb.current {
            font-weight: 600;
            color: var(--vs-text);
        }

        .breadcrumbs > span.sep {
            color: var(--vs-text-3);
            font-size: 15px;
            flex-shrink: 0;
        }

        .explorer-search {
            flex: 1;
            display: flex;
            align-items: center;
            gap: .4rem;
            min-width: 0;
        }

        .explorer-search-input {
            flex: 1;
            min-width: 0;
            height: 2.1rem;
            padding: 0 .9rem;
            border: 0;
            border-radius: 999px;
            background: var(--vs-recessed);
            box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12);
            color: var(--vs-text);
            font: inherit;
            font-size: 13px;
            outline: none;
        }
        .explorer-search-input::placeholder { color: var(--vs-text-3); }
        .explorer-search-input:focus { box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12), 0 0 0 2px var(--vs-selected-rim); }

        .explorer-search-close {
            cursor: pointer;
            color: var(--vs-text-2);
            font-size: 18px;
        }

        .explorer-search-results {
            position: absolute;
            inset: 0;
            z-index: 10;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            padding: .6rem;
            background: var(--vs-dialog-bg);
            backdrop-filter: blur(30px) saturate(170%);
            -webkit-backdrop-filter: blur(30px) saturate(170%);
        }
        .explorer-search-empty { padding: 1rem; color: var(--vs-text-3); font-size: 13px; }
        .explorer-search-result {
            display: flex;
            align-items: center;
            gap: .55rem;
            padding: .45rem .65rem;
            border-radius: 12px;
            cursor: pointer;
            font-size: 13px;
        }
        .explorer-search-result:hover { background: var(--vs-fill-2); }
        .explorer-search-result .material-symbols-outlined { font-size: 17px; color: var(--vs-text-2); }
        .explorer-search-result .result-name { font-weight: 500; }
        .explorer-search-result .result-path {
            font-size: 11px;
            color: var(--vs-text-3);
            margin-left: auto;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 60%;
        }

        .file-explorer-body {
            display: flex;
            flex-grow: 1;
            min-height: 0;
        }

        /* Details pane */
        .file-explorer-details {
            flex: 0 0 14rem;
            background: var(--vs-sidebar);
            border-left: 1px solid var(--vs-separator);
            overflow: auto;
            padding: .95rem;
            font-size: 12px;
            color: var(--vs-text);
        }

        .file-explorer-details h4 {
            margin: 0 0 .85rem;
            font-size: 11px;
            font-weight: 600;
            color: var(--vs-text-3);
            text-transform: uppercase;
            letter-spacing: .06em;
        }

        .file-explorer-details .details-empty {
            color: var(--vs-text-3);
            font-size: 12px;
            padding-top: 1rem;
            text-align: center;
        }

        .file-explorer-details .details-thumb {
            width: 100%;
            height: 8rem;
            border-radius: 14px;
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
            background-color: var(--vs-fill);
            box-shadow: inset 0 0 0 1px var(--vs-stroke);
            margin-bottom: .85rem;
        }

        .file-explorer-details .details-name {
            font-weight: 600;
            font-size: 13px;
            word-break: break-all;
            margin-bottom: .85rem;
        }

        .file-explorer-details .details-row {
            display: flex;
            flex-direction: column;
            gap: 2px;
            margin-bottom: .65rem;
        }

        .file-explorer-details .details-row .details-label {
            color: var(--vs-text-3);
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: .05em;
        }

        .file-explorer-details .details-row .details-value {
            word-break: break-all;
            font-size: 12px;
        }

        .file-explorer-details .details-multi-list {
            max-height: 12rem;
            overflow-y: auto;
            border-top: 1px solid var(--vs-separator);
            padding-top: .5rem;
            display: flex;
            flex-direction: column;
            gap: .3rem;
        }

        .file-explorer-details .details-multi-item {
            font-size: 12px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .file-explorer-details .details-multi-item .material-symbols-outlined {
            color: var(--vs-text-2);
        }

        /* Sidebar */
        .file-explorer-nav {
            flex: 0 0 11.5rem;
            background: var(--vs-sidebar);
            border-right: 1px solid var(--vs-separator);
            overflow: auto;
            padding: .8rem .55rem;
        }

        .file-explorer-nav .nav-section-title {
            font-size: 11px;
            font-weight: 600;
            color: var(--vs-text-3);
            text-transform: uppercase;
            letter-spacing: .06em;
            padding: .3rem .65rem .5rem;
        }

        .file-explorer-nav > div {
            display: flex;
            align-items: center;
            gap: .6rem;
            padding: .45rem .65rem;
            margin-bottom: 2px;
            border-radius: 12px;
            cursor: pointer;
            white-space: nowrap;
            font-size: 13px;
            color: var(--vs-text);
            transition: background .18s var(--vs-ease);
        }

        .file-explorer-nav > div .material-symbols-outlined {
            font-size: 19px;
            color: var(--vs-text-2);
        }

        .file-explorer-nav > div:hover {
            background: var(--vs-fill);
        }

        .file-explorer-nav > div.active {
            background: var(--vs-fill-3);
            box-shadow: inset 0 0 0 1px var(--vs-stroke), 0 1px 3px rgba(0, 0, 0, 0.06);
            font-weight: 600;
        }

        .file-explorer-nav > div.active .material-symbols-outlined {
            color: var(--vs-text);
        }

        .file-explorer-nav > div.nav-section-title:hover {
            background: none;
        }

        .dir-list {
            flex-grow: 1;
            overflow: auto;
            background: transparent;
            display: flex;
            flex-direction: column;
        }

        .dir-list-files {
            flex-grow: 1;
        }

        .file-explorer-status {
            flex-shrink: 0;
            margin-top: auto;
            border-top: 1px solid var(--vs-separator);
            background: transparent;
            color: var(--vs-text-3);
            font-size: 11px;
            padding: .3rem .9rem;
        }

        /* Properties dialog */
        .explorer-modal-overlay {
            position: absolute;
            inset: 0;
            z-index: 100;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.25);
        }
        .explorer-modal {
            min-width: 280px;
            max-width: 400px;
            padding: 1.4rem 1.5rem;
            border-radius: 22px;
            background: var(--vs-dialog-bg);
            backdrop-filter: blur(36px) saturate(170%);
            -webkit-backdrop-filter: blur(36px) saturate(170%);
            box-shadow: inset 0 0 0 1px var(--vs-stroke), 0 24px 60px rgba(0, 0, 0, 0.35);
            color: var(--vs-text);
            font-family: inherit;
        }
        .explorer-modal h3 {
            margin: 0 0 .9rem;
            padding-bottom: .75rem;
            font-size: 15px;
            border-bottom: 1px solid var(--vs-separator);
        }
        .explorer-modal table { width: 100%; font-size: 13px; border-collapse: collapse; }
        .explorer-modal tr { border-bottom: 1px solid var(--vs-separator); }
        .explorer-modal tr:last-child { border-bottom: 0; }
        .explorer-modal td { padding: .45rem .5rem; vertical-align: top; word-break: break-all; }
        .explorer-modal td.prop-key { color: var(--vs-text-2); font-weight: 500; white-space: nowrap; word-break: normal; }
        .explorer-modal .prop-error { color: var(--vs-danger); font-size: 13px; }
        .explorer-modal-actions { text-align: right; margin-top: 1rem; }
        .explorer-btn {
            padding: .45rem 1.2rem;
            border: 0;
            border-radius: 999px;
            background: var(--vs-strong);
            color: var(--vs-on-strong);
            font: inherit;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
        }
        .explorer-btn:hover { filter: brightness(1.08); }

    `)

    body.ownerDocument.adoptedStyleSheets.push(styles)

    const move = (diff: { [key in 'left' | 'right' | 'top' | 'bottom']?: number }) => {
        return () => {
            const rect = props.getBoundingClientRect()
            const dir = { left: 0, right: 0, top: 0, bottom: 0, ...diff }
            const newPosition = { ...rect, left: rect.left + dir.left, right: rect.right + dir.right, top: rect.top + dir.top, bottom: rect.bottom + dir.bottom }
            props.setBoundingClientRect(newPosition)
        }
    }

    move({ right: 100, left: 100, top: 100, bottom: 100 })();

    props.setWindowView(true)
    render(container, { ...props, file })
    fullScreenCallbackRef.current = props.toggleFullScreen
    resizeCallbackRef.current = props.setBoundingClientRect

}, { icon: 'folder', title: 'File explorer', fullScreen: false })

const render = (container: HTMLElement, props: UICallbackProps & { file: FileType }) => {

    const root = createRoot(container)
    root.render(<App {...props} />)
}



const copyEntry = (fs: any, src: string, dest: string) => {
    const stat = fs.statSync(src)
    if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
        for (const name of fs.readdirSync(src)) copyEntry(fs, `${src}/${name}`, `${dest}/${name}`)
    } else {
        fs.writeFileSync(dest, fs.readFileSync(src))
    }
}

// Downloads a vfs file to the user's device: read raw bytes (works for both
// text and binary), wrap in a Blob, and trigger a real browser download via a
// temporary <a download> click. 100% local - no vfs network operations.
const downloadFile = (fs: any, path: string) => {
    try {
        const data = fs.readFileSync(path)
        const name = path.split('/').filter(Boolean).pop() || 'download'
        const blob = new Blob([data])
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e: any) {
        platform.host.callCommand('notify', { title: 'Download failed', body: e.message || String(e), duration: 4000 })
    }
}

// Human-readable file size, e.g. "3.4 KB".
const fmtBytes = (n: number): string => {
    if (n < 1024) return `${n} B`
    if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
    if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`
    return `${(n / 1073741824).toFixed(2)} GB`
}

// Right-side details panel for the currently selected file/folder. Image
// thumbnails use the same blob-URL treatment as the grid thumbnails below
// (the explorer renders inside an `about:blank` iframe, so `/(sw)/...`
// sub-resource URLs don't reach the SW).
const DETAILS_PREVIEW_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif'])
const DETAILS_PREVIEW_MIME: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.avif': 'image/avif',
}

const DetailsPanel = ({ paths }: { paths: string[] }) => {
    const fs = platform.host.getFS()
    const [thumbUrl, setThumbUrl] = React.useState<string | null>(null)

    const path = paths.length === 1 ? paths[0] : null

    let info: { stat: any, name: string, ext: string, isDir: boolean } | null = null
    if (path) {
        try {
            const stat = fs.statSync(path)
            const name = path.split('/').filter(Boolean).pop() || path
            info = { stat, name, ext: getFileExtension(name), isDir: stat.isDirectory() }
        } catch (_) { info = null }
    }

    const isPreviewable = !!(info && !info.isDir && DETAILS_PREVIEW_EXTS.has(info.ext))

    React.useEffect(() => {
        if (!isPreviewable || !path || !info) { setThumbUrl(null); return }
        let url: string | null = null
        try {
            const data = fs.readFileSync(path)
            const blob = new Blob([data], { type: DETAILS_PREVIEW_MIME[info.ext] || 'application/octet-stream' })
            url = URL.createObjectURL(blob)
            setThumbUrl(url)
        } catch (_) { setThumbUrl(null) }
        return () => { if (url) URL.revokeObjectURL(url) }
        // eslint-disable-next-line
    }, [path, isPreviewable])

    if (paths.length === 0) {
        return (
            <aside className="file-explorer-details">
                <h4>Details</h4>
                <div className="details-empty">Select a file or folder to see details</div>
            </aside>
        )
    }

    // Multi-selection summary: total count, combined size of files (folders'
    // contents are not recursed into), and a scrollable list of names.
    if (paths.length > 1) {
        let totalSize = 0
        const items = paths.map(p => {
            const name = p.split('/').filter(Boolean).pop() || p
            let isDir = false
            try {
                const stat = fs.statSync(p)
                isDir = stat.isDirectory()
                if (!isDir) totalSize += stat.size || 0
            } catch (_) {}
            return { path: p, name, isDir }
        })
        return (
            <aside className="file-explorer-details">
                <h4>Details</h4>
                <div className="details-row">
                    <span className="details-label">Selected</span>
                    <span className="details-value">{paths.length} items</span>
                </div>
                <div className="details-row">
                    <span className="details-label">Combined size</span>
                    <span className="details-value">{fmtBytes(totalSize)}</span>
                </div>
                <div className="details-row">
                    <span className="details-label">Names</span>
                </div>
                <div className="details-multi-list">
                    {items.map(it => (
                        <div key={it.path} className="details-multi-item">
                            <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>
                                {it.isDir ? 'folder' : 'insert_drive_file'}
                            </span>
                            {it.name}
                        </div>
                    ))}
                </div>
            </aside>
        )
    }

    if (!info) {
        return (
            <aside className="file-explorer-details">
                <h4>Details</h4>
                <div className="details-empty">Select a file or folder to see details</div>
            </aside>
        )
    }

    const { stat, name, ext, isDir } = info
    let childCount: number | null = null
    if (isDir) { try { childCount = fs.readdirSync(path!).length } catch (_) {} }

    return (
        <aside className="file-explorer-details">
            <h4>Details</h4>
            {thumbUrl && <div className="details-thumb" style={{ backgroundImage: `url('${thumbUrl}')` }} />}
            <div className="details-name">{name}</div>
            <div className="details-row">
                <span className="details-label">Path</span>
                <span className="details-value">{path}</span>
            </div>
            <div className="details-row">
                <span className="details-label">Type</span>
                <span className="details-value">{isDir ? 'Folder' : (ext ? `${ext.slice(1).toUpperCase()} file` : 'File')}</span>
            </div>
            {isDir ? (
                <div className="details-row">
                    <span className="details-label">Items</span>
                    <span className="details-value">{childCount === null ? '—' : `${childCount} item${childCount !== 1 ? 's' : ''}`}</span>
                </div>
            ) : (
                <div className="details-row">
                    <span className="details-label">Size</span>
                    <span className="details-value">{fmtBytes(stat.size || 0)}</span>
                </div>
            )}
            <div className="details-row">
                <span className="details-label">Modified</span>
                <span className="details-value">{stat.mtime ? new Date(stat.mtime).toLocaleString() : '—'}</span>
            </div>
        </aside>
    )
}

const App = (props: UICallbackProps & { file: FileType }) => {
    const fs = platform.host.getFS()
    const dirRef = React.useRef(props.file.path || '/')

    // Finder-style back/forward navigation history.
    const historyRef = React.useRef<string[]>([dirRef.current])
    const historyIndexRef = React.useRef(0)

    const [dirList, setDirList] = React.useState<Array<string>>(fs.readdirSync(dirRef.current || '/'))
    const [, forceUpdate] = React.useState(0)

    const refresh = () => {
        setDirList(fs.readdirSync(dirRef.current))
        forceUpdate(n => n + 1)
    }
    const refreshRef = React.useRef(refresh)
    refreshRef.current = refresh

    // Backends that fill in asynchronously (e.g. Remote Machines' /mnt/ssh/<machine> mirror) announce
    // changes with a 'vfs:changed' event on the top window ({ detail: { path } }); re-read the shown
    // folder when the change is in it, is it, or is its parent. Mirrored in opt/apps/file-explorer/main.js.
    React.useEffect(() => {
        const top = window.top
        if (!top) return
        const onChanged = (e: Event) => {
            const p = (e as CustomEvent<{ path?: string }>).detail?.path
            const dir = dirRef.current
            if (typeof p !== 'string' || !dir) return
            if (p === dir || p.startsWith(dir === '/' ? '/' : dir + '/') || dir.startsWith(p === '/' ? '/' : p + '/')) {
                try { refreshRef.current() } catch (_) { /* the folder went away; the next navigation shows it */ }
            }
        }
        top.addEventListener('vfs:changed', onChanged)
        return () => top.removeEventListener('vfs:changed', onChanged)
    }, [])

    const [propsFile, setPropsFile] = React.useState<string | null>(null)
    const setPropsFileRef = React.useRef(setPropsFile)
    setPropsFileRef.current = setPropsFile

    // Currently selected files/folders (lifted up from ListDirComponent so
    // the details panel can show it live) - a plain array, order not
    // significant for correctness (only for range-select anchoring, tracked
    // separately in ListDirComponent) - and whether the details panel is open.
    const [selectedPaths, setSelectedPaths] = React.useState<string[]>([])
    const [detailsOpen, setDetailsOpen] = React.useState(false)

    // Root element ref so Escape-to-clear-selection can be scoped to this
    // window/iframe's own document (each explorer window is its own iframe,
    // so a keydown listener on its ownerDocument only fires while that
    // specific window/iframe has focus).
    const rootRef = React.useRef<HTMLDivElement>(null)

    const cmdPrefix = React.useRef(`__e${Date.now().toString(36)}`)

    React.useEffect(() => {
        const k = cmdPrefix.current
        const regs = [
            platform.host.registerCommand(`${k}.show-properties`, (path: string) => { setPropsFileRef.current(path) }),
            platform.host.registerCommand(`${k}.download-file`, (path: string) => downloadFile(fs, path)),
            platform.host.registerCommand(`${k}.download-files`, (paths: string | string[]) => {
                const list = Array.isArray(paths) ? paths : [paths]
                let skipped = 0
                list.forEach(p => {
                    try {
                        if (fs.statSync(p).isDirectory()) { skipped++; return }
                        downloadFile(fs, p)
                    } catch (_) { skipped++ }
                })
                if (skipped) {
                    platform.host.callCommand('notify', {
                        title: 'Some items skipped',
                        body: `${skipped} folder${skipped !== 1 ? 's' : ''} skipped (folders can't be downloaded individually)`,
                        duration: 4000,
                    })
                }
            }),
            platform.host.registerCommand(`${k}.delete-files`, (paths: string | string[]) => {
                const list = Array.isArray(paths) ? paths : [paths]
                if (!list.length) return
                if (!confirm(`Delete ${list.length} item${list.length !== 1 ? 's' : ''}?`)) return
                const files_ = list.filter(p => { try { return !fs.statSync(p).isDirectory() } catch (_) { return false } })
                const dirs_ = list.filter(p => { try { return fs.statSync(p).isDirectory() } catch (_) { return false } })
                const fsService = platform.host.getService('root', 'fs') as Function
                try {
                    if (files_.length) fsService('rm', ...files_)
                    if (dirs_.length) fsService('rmdir', ...dirs_)
                } catch (e: any) {
                    platform.host.callCommand('notify', { title: 'Delete error', body: e.message || String(e), duration: 4000 })
                }
                setSelectedPaths([])
                refreshRef.current()
            }),
            platform.host.registerCommand(`${k}.copy-file`, (paths: string | string[]) => {
                (window.top as any).__vfsClipboard = { op: 'copy', paths: Array.isArray(paths) ? paths : [paths] }
                refreshRef.current()
            }),
            platform.host.registerCommand(`${k}.cut-file`, (paths: string | string[]) => {
                (window.top as any).__vfsClipboard = { op: 'cut', paths: Array.isArray(paths) ? paths : [paths] }
                refreshRef.current()
            }),
            platform.host.registerCommand(`${k}.paste-files`, () => {
                const cb = (window.top as any).__vfsClipboard
                if (!cb || !cb.paths.length) return
                const dir = dirRef.current
                for (const src of cb.paths) {
                    const name = src.split('/').filter(Boolean).pop()!
                    const dest = normalizePath(`${dir}/${name}`)
                    try {
                        if (cb.op === 'cut') { fs.renameSync(src, dest) }
                        else { copyEntry(fs, src, dest) }
                    } catch (e: any) { platform.host.callCommand('notify', { title: 'Paste failed', body: e.message, duration: 4000 }) }
                }
                if (cb.op === 'cut') (window.top as any).__vfsClipboard = null
                refreshRef.current()
            }),
            platform.host.registerCommand(`${k}.make-dir`, () => {
                const n = prompt('Folder name?'); if (!n) return
                try { fs.mkdirSync(`${dirRef.current}/${n}`, { recursive: true }); refreshRef.current() } catch (e: any) { alert(e.message) }
            }),
            platform.host.registerCommand(`${k}.make-file`, () => {
                const n = prompt('File name?'); if (!n) return
                try { fs.writeFileSync(`${dirRef.current}/${n}`, ''); refreshRef.current() } catch (e: any) { alert(e.message) }
            }),
            platform.host.registerCommand(`${k}.rename`, (path: string) => {
                const oldName = path.split('/').pop()!
                const dir     = path.split('/').slice(0, -1).join('/') || '/'
                const newName = prompt('New name:', oldName)
                if (!newName || newName.trim() === oldName) return
                const trimmed = newName.trim()
                if (/[/\\]/.test(trimmed)) { alert('Name cannot contain "/" or "\\".'); return }
                const newPath = normalizePath(`${dir}/${trimmed}`)
                if (fs.existsSync(newPath)) {
                    if (!confirm(`"${trimmed}" already exists. Overwrite?`)) return
                }
                try { fs.renameSync(path, newPath); refreshRef.current() }
                catch (e: any) { alert(`Rename failed: ${e.message}`) }
            }),
        ]
        return () => regs.forEach(r => r.remove())
    }, [])

    // Escape clears the current selection while this explorer window/iframe
    // has focus - scoped to this window's own document via ownerDocument
    // (each explorer window is its own iframe with its own document, so a
    // keydown listener here only fires while that iframe is the focused frame).
    React.useEffect(() => {
        const node = rootRef.current
        if (!node) return
        const doc = node.ownerDocument
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setSelectedPaths([])
        }
        doc.addEventListener('keydown', onKeyDown)
        return () => doc.removeEventListener('keydown', onKeyDown)
    }, [])

    const goTo = (path: string, { pushHistory = true }: { pushHistory?: boolean } = {}) => {
        const normalized = normalizePath(path)
        if (!fs.existsSync(normalized)) fs.mkdirSync(normalized, { recursive: true })
        dirRef.current = normalized
        setSelectedPaths([])

        if (pushHistory) {
            const history = historyRef.current.slice(0, historyIndexRef.current + 1)
            history.push(normalized)
            historyRef.current = history
            historyIndexRef.current = history.length - 1
        }

        refresh()
    }

    const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus'])

    const open = (file: string) => {
        const selectedFilePath = normalizePath(dirRef.current.endsWith('/') ? `${dirRef.current}${file}` : `${dirRef.current}/${file}`);
        const stat = fs.statSync(selectedFilePath);

        if (stat.isDirectory()) {
            goTo(selectedFilePath)
            return
        }

        const ext = getFileExtension(selectedFilePath)
        if (AUDIO_EXTS.has(ext)) {
            platform.host.openWindow('ui.audioplayer', selectedFilePath)
            return
        }

        platform.host.exec(platform, selectedFilePath)
    }

    const navigateTo = (path: string) => goTo(path)

    const goBack = () => {
        if (historyIndexRef.current <= 0) return
        historyIndexRef.current -= 1
        dirRef.current = historyRef.current[historyIndexRef.current]
        refresh()
    }

    const goForward = () => {
        if (historyIndexRef.current >= historyRef.current.length - 1) return
        historyIndexRef.current += 1
        dirRef.current = historyRef.current[historyIndexRef.current]
        refresh()
    }

    const goUp = () => {
        if (dirRef.current === '/') return
        const parent = normalizePath(dirRef.current.split('/').slice(0, -1).join('/')) || '/'
        goTo(parent)
    }

    const makeDirClick = () => {
        const dirName = prompt('Dir name?')
        if (!dirName) return;
        const dirPath = dirRef.current.endsWith('/') ? `${dirRef.current}${dirName}` : `${dirRef.current}/${dirName}`
        fs.mkdirSync(dirPath)
        refresh()
    }
    const makeFileClick = () => {
        const fileName = prompt('File name?')
        if (!fileName) return;
        const filePath = dirRef.current.endsWith('/') ? `${dirRef.current}${fileName}` : `${dirRef.current}/${fileName}`
        fs.writeFileSync(filePath, '')
        refresh()
    }

    const mountLocalFolderClick = async () => {
        if (!window.showDirectoryPicker) {
            alert('Mounting a local folder is not supported in this browser.')
            return
        }

        try {
            const dirHandle = await window.showDirectoryPicker()
            const targetPath = `${MOUNT_PATH}/${dirHandle.name}`
            await mountLocalDirectory(fs, dirHandle, targetPath)
            navigateTo(targetPath)
        } catch (error) {
            if ((error as Error)?.name !== 'AbortError') console.error(error)
        }
    }

    const openFile = (file: FileType) => {
        open(file.name)
    }
    const showFileActionsHandler = (file: FileType, event: React.MouseEvent<HTMLDivElement, MouseEvent>, selection?: string[]) => {
        const openContextMenu = platform.host.getService('001-core.layout', 'show-context-menu') as Function;
        if (!openContextMenu) return;
        const rect = props.getBoundingClientRect()
        const k = cmdPrefix.current
        const call = (name: string, ...values: unknown[]) => () => platform.host.callCommand(`${k}.${name}`, ...values)
        const fsService = (op: 'rm' | 'rmdir', path: string) => () => (platform.host.getService('root', 'fs') as Function)(op, path)

        // Batch actions for a multi-selection - shown instead of the single-item
        // action list below when the right-clicked item is part of a selection
        // of more than one item.
        if (Array.isArray(selection) && selection.length > 1) {
            const paths = [...selection]
            const hasFolder = paths.some(p => { try { return fs.statSync(p).isDirectory() } catch (_) { return false } })
            const batchActions: MenuEntry[] = [
                { id: 'download_selected', title: hasFolder ? 'Download files (skips folders)' : 'Download', run: call('download-files', paths) },
                { id: 'div_batch', divider: true },
                { id: 'delete_selected', title: `Delete ${paths.length} items`, run: call('delete-files', paths) },
            ]
            openContextMenu(event.clientX + rect.x, event.clientY + rect.y, toContextMenuItems(batchActions))
            return
        }

        const actions: MenuEntry[] = [];
        const path = file.path = normalizePath(file.path)
        const stats = fs.statSync(path)
        if (stats.isFile()) {
            actions.push({ id: 'edit_file', title: 'Edit', run: () => platform.host.openWindow('ui.notepad', path) })
            // Explicit Run (decisions.md D10) — mirrors opt/apps/file-explorer/main.js.
            // host.runFile confirms, naming the file, outside the system folders.
            if (/\.(js|run)$/i.test(path)) actions.push({ id: 'run_file', title: 'Run', run: () => runScript(path) })
            actions.push({ id: 'open_file', title: 'Open', run: () => platform.host.openWindow('ui.iframe', path) })
            actions.push({ id: 'download_file', title: 'Download', run: call('download-file', path) })
            actions.push({ id: 'delete_file', title: 'Delete', run: fsService('rm', path) })
            actions.push({ id: 'rename_file', title: 'Rename', run: call('rename', path) })
            actions.push({ id: 'copy_file', title: 'Copy', run: call('copy-file', path) })
            actions.push({ id: 'cut_file', title: 'Cut', run: call('cut-file', path) })
            actions.push({ id: 'props_file', title: 'Properties', run: call('show-properties', path) })
        }

        else {
            actions.push({ id: 'open_file', title: 'Open in explorer', run: () => platform.host.openWindow('ui.file-explorer', path) })
            actions.push({ id: 'delete_file', title: 'Delete', run: fsService('rmdir', path) })
            actions.push({ id: 'rename_dir', title: 'Rename', run: call('rename', path) })
            actions.push({ id: 'copy_dir', title: 'Copy', run: call('copy-file', path) })
            actions.push({ id: 'cut_dir', title: 'Cut', run: call('cut-file', path) })
            actions.push({ id: 'props_dir', title: 'Properties', run: call('show-properties', path) })
        }

        openContextMenu(event.clientX + rect.x, event.clientY + rect.y, toContextMenuItems(actions))
    }

    // --- Drag & drop: move files between explorer windows, and import files from the OS ---

    const isDescendantOrSame = (parentPath: string, childPath: string) => {
        const normalizedParent = normalizePath(parentPath)
        const normalizedChild = normalizePath(childPath)
        if (normalizedChild === normalizedParent) return true
        const prefix = normalizedParent.endsWith('/') ? normalizedParent : `${normalizedParent}/`
        return normalizedChild.startsWith(prefix)
    }

    const moveEntry = (sourcePath: string, targetDir: string) => {
        const normalizedSource = normalizePath(sourcePath)
        const name = normalizedSource.split('/').filter(Boolean).pop()!
        const destPath = normalizePath(`${targetDir}/${name}`)
        if (destPath === normalizedSource) return
        if (isDescendantOrSame(normalizedSource, destPath)) {
            alert('Cannot move a folder into itself.')
            return
        }
        if (fs.existsSync(destPath)) {
            if (!confirm(`"${name}" already exists in the destination. Overwrite?`)) return
            const stat = fs.statSync(destPath)
            if (stat.isDirectory()) fs.rmdirSync(destPath)
            else fs.unlinkSync(destPath)
        }
        try {
            fs.renameSync(normalizedSource, destPath)
        } catch (err) {
            console.error('Failed to move', normalizedSource, '->', destPath, err)
            alert(`Failed to move "${name}".`)
        }
    }

    // Recursively imports a dropped OS file/directory entry (File System Entry API).
    const importDroppedEntry = async (entry: any, targetDir: string): Promise<void> => {
        const destPath = normalizePath(`${targetDir}/${entry.name}`)
        if (entry.isDirectory) {
            if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true })
            const reader = entry.createReader()
            const readAllEntries = (): Promise<any[]> => new Promise((resolve, reject) => {
                const all: any[] = []
                const readBatch = () => {
                    reader.readEntries((batch: any[]) => {
                        if (batch.length === 0) { resolve(all); return }
                        all.push(...batch)
                        readBatch()
                    }, reject)
                }
                readBatch()
            })
            const children = await readAllEntries()
            for (const child of children) await importDroppedEntry(child, destPath)
        } else {
            const file: File = await new Promise((resolve, reject) => entry.file(resolve, reject))
            const buffer = await file.arrayBuffer()
            fs.writeFileSync(destPath, Buffer.from(buffer))
        }
    }

    const importDroppedFile = async (file: File, targetDir: string) => {
        const buffer = await file.arrayBuffer()
        fs.writeFileSync(normalizePath(`${targetDir}/${file.name}`), Buffer.from(buffer))
    }

    // Imports files/folders dragged in from the user's computer.
    const importExternalDrop = async (dataTransfer: DataTransfer, targetDir: string) => {
        const items = dataTransfer.items ? Array.from(dataTransfer.items) : []
        const entries = items
            .map(item => (typeof (item as any).webkitGetAsEntry === 'function' ? (item as any).webkitGetAsEntry() : null))
            .filter(Boolean)

        if (entries.length > 0) {
            for (const entry of entries) await importDroppedEntry(entry, targetDir)
        } else {
            const droppedFiles = Array.from(dataTransfer.files || [])
            for (const file of droppedFiles) await importDroppedFile(file, targetDir)
        }
    }

    const handleDragOver = (event: React.DragEvent) => {
        event.preventDefault()
        event.stopPropagation()
        const isVfsMove = event.dataTransfer.types.includes('application/x-vfs-path')
            || event.dataTransfer.types.includes('application/x-vfs-paths')
        event.dataTransfer.dropEffect = isVfsMove ? 'move' : 'copy'
    }

    // Handles a drop onto `targetDir` - either moving item(s) dragged from an explorer
    // window (`application/x-vfs-paths` for a multi-selection drag, `application/x-vfs-path`
    // for a single item), importing a file from FS.html (`application/x-fs-export`),
    // or importing files/folders dragged from the OS.
    const handleDrop = (event: React.DragEvent, targetDir: string) => {
        event.preventDefault()
        event.stopPropagation()

        const vfsPathsJson = event.dataTransfer.getData('application/x-vfs-paths')
        if (vfsPathsJson) {
            let paths: string[] = []
            try { paths = JSON.parse(vfsPathsJson) } catch (_) {}
            if (Array.isArray(paths) && paths.length) {
                paths.forEach(p => moveEntry(p, targetDir))
                setSelectedPaths([])
                refresh()
                return
            }
        }

        const vfsPath = event.dataTransfer.getData('application/x-vfs-path')
        if (vfsPath) {
            moveEntry(vfsPath, targetDir)
            refresh()
            return
        }

        // File dragged from FS.html — data is in window.top.__fsDrop
        const fsExport = event.dataTransfer.getData('application/x-fs-export')
        if (fsExport) {
            const drop = (window.top as any)?.__fsDrop
            if (drop) {
                try {
                    const destPath = `${targetDir}/${drop.name}`.replace(/\/+/g, '/')
                    const content = drop.binary ? Buffer.from(drop.content) : drop.content
                    fs.writeFileSync(destPath, content)
                    refresh()
                } catch (e) { console.error('FS export import failed', e) }
            }
            return
        }

        importExternalDrop(event.dataTransfer, targetDir)
            .then(refresh)
            .catch(err => console.error('Failed to import dropped files', err))
    }

    const showDirActionsHandler = (event: React.MouseEvent) => {
        const openContextMenu = platform.host.getService('001-core.layout', 'show-context-menu') as Function
        if (!openContextMenu) return
        const rect = props.getBoundingClientRect()
        const k = cmdPrefix.current
        const actions: MenuEntry[] = [
            { id: 'paste',    title: 'Paste',      run: () => platform.host.callCommand(`${k}.paste-files`) },
            { id: 'new_dir',  title: 'New Folder', run: () => platform.host.callCommand(`${k}.make-dir`) },
            { id: 'new_file', title: 'New File',   run: () => platform.host.callCommand(`${k}.make-file`) },
        ]
        openContextMenu(event.clientX + rect.x, event.clientY + rect.y, toContextMenuItems(actions))
    }

    const breadcrumbs = getBreadcrumbs(dirRef.current)

    const selectedFilePaths = selectedPaths.filter(p => {
        try { return fs.statSync(p).isFile() } catch (_) { return false }
    })
    const canDownloadSelected = selectedFilePaths.length > 0
    const downloadSelected = () => {
        if (!canDownloadSelected) return
        selectedFilePaths.forEach(p => downloadFile(fs, p))
        if (selectedFilePaths.length !== selectedPaths.length) {
            platform.host.callCommand('notify', {
                title: 'Some items skipped',
                body: `${selectedPaths.length - selectedFilePaths.length} folder(s) skipped (folders can't be downloaded individually)`,
                duration: 4000,
            })
        }
    }

    return (
        <div ref={rootRef} style={{ display: 'flex', height: '100%', flexDirection: 'column', position: 'relative' }} className="file-explorer">
            <header>
                <div className="toolbar-nav-buttons">
                    <span
                        className={`material-symbols-outlined ${historyIndexRef.current <= 0 ? 'disabled' : ''}`}
                        onClick={goBack}
                        aria-label="back"
                        title="back"
                    >chevron_left</span>
                    <span
                        className={`material-symbols-outlined ${historyIndexRef.current >= historyRef.current.length - 1 ? 'disabled' : ''}`}
                        onClick={goForward}
                        aria-label="forward"
                        title="forward"
                    >chevron_right</span>
                    <span
                        className={`material-symbols-outlined ${dirRef.current === '/' ? 'disabled' : ''}`}
                        onClick={goUp}
                        aria-label="up"
                        title="enclosing folder"
                    >arrow_upward</span>
                </div>

                <div className="breadcrumbs">
                    {breadcrumbs.map((crumb, idx) => (
                        <React.Fragment key={crumb.path}>
                            {idx > 0 ? <span className="sep material-symbols-outlined">chevron_right</span> : null}
                            <span
                                className={`crumb ${crumb.path === dirRef.current ? 'current' : ''}`}
                                onClick={() => navigateTo(crumb.path)}
                                title={crumb.path}
                            >
                                {idx === 0 ? <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle' }}>dns</span> : crumb.name}
                            </span>
                        </React.Fragment>
                    ))}
                </div>

                <div className="toolbar-actions">
                    <span className="material-symbols-outlined" onClick={makeDirClick} aria-label="create_new_folder" title="create folder">create_new_folder</span>
                    <span className="material-symbols-outlined" onClick={makeFileClick} aria-label="create_file" title="create file">post_add</span>
                    <span className="material-symbols-outlined" onClick={mountLocalFolderClick} aria-label="mount_local_folder" title="mount local folder">drive_folder_upload</span>
                    <span
                        className={`material-symbols-outlined ${canDownloadSelected ? '' : 'disabled'}`}
                        onClick={downloadSelected}
                        aria-label="download"
                        title="download selected file(s)"
                    >download</span>
                    <span
                        className={`material-symbols-outlined ${detailsOpen ? 'active' : ''}`}
                        onClick={() => setDetailsOpen(o => !o)}
                        aria-label="details"
                        title="toggle details panel"
                    >info</span>
                </div>
            </header>
            <div className="file-explorer-body">
                <nav className="file-explorer-nav">
                    <div className="nav-section-title">Favorites</div>
                    {NAV_SHORTCUTS.map(item => (
                        <div
                            key={item.path}
                            className={dirRef.current === item.path ? 'active' : ''}
                            onClick={() => navigateTo(item.path)}
                            onDragOver={handleDragOver}
                            onDrop={ev => handleDrop(ev, item.path)}
                        >
                            <span className="material-symbols-outlined">{item.icon}</span>
                            <span>{item.label}</span>
                        </div>
                    ))}
                </nav>
                <section className="dir-list">
                    <ListDirComponent key={dirRef.current} dir={dirRef.current} openFile={openFile} showFileActions={showFileActionsHandler} showDirActions={showDirActionsHandler} handleDragOver={handleDragOver} handleDrop={handleDrop} selectedPaths={selectedPaths} onSelect={setSelectedPaths} />
                    <div className="file-explorer-status">{dirList.length} item{dirList.length === 1 ? '' : 's'}</div>
                </section>
                {detailsOpen && <DetailsPanel paths={selectedPaths} />}
            </div>
            {propsFile && (() => {
                let stat: any = null; try { stat = fs.statSync(propsFile) } catch (_) {}
                const name = propsFile.split('/').filter(Boolean).pop() || propsFile
                const location = propsFile.split('/').slice(0, -1).join('/') || '/'
                const ext = getFileExtension(propsFile)
                const isDir = stat && stat.isDirectory()
                const typeLabel = isDir ? 'Folder' : (ext ? ext.slice(1).toUpperCase() + ' File' : 'File')
                let sizeLabel = '—'
                if (stat) {
                    if (isDir) { try { sizeLabel = fs.readdirSync(propsFile).length + ' items' } catch (_) {} }
                    else { const b = stat.size; sizeLabel = b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB` }
                }
                const mtime = stat && stat.mtime ? new Date(stat.mtime).toLocaleString() : '—'
                return (
                    <div className="explorer-modal-overlay" onClick={() => setPropsFile(null)}>
                        <div className="explorer-modal" onClick={e => e.stopPropagation()}>
                            <h3 style={{ wordBreak: 'break-all' }}>{name}</h3>
                            <table><tbody>
                                {[['Name', name], ['Location', location], ['Type', typeLabel], isDir ? ['Contents', sizeLabel] : ['Size', sizeLabel], ['Modified', mtime]].map(([k, v]) => (
                                    <tr key={k}>
                                        <td className="prop-key">{k}</td>
                                        <td>{v}</td>
                                    </tr>
                                ))}
                            </tbody></table>
                            <div className="explorer-modal-actions">
                                <button className="explorer-btn" onClick={() => setPropsFile(null)}>Close</button>
                            </div>
                        </div>
                    </div>
                )
            })()}
        </div>
    )
}

const ListDirComponent = ({ dir, openFile, showFileActions, showDirActions, handleDragOver, handleDrop, selectedPaths, onSelect }: { dir?: string, openFile: (file: FileType) => void, showFileActions: (file: FileType, event: React.MouseEvent<HTMLDivElement, MouseEvent>, selection?: string[]) => void, showDirActions?: (event: React.MouseEvent) => void, handleDragOver: (event: React.DragEvent) => void, handleDrop: (event: React.DragEvent, targetDir: string) => void, selectedPaths: string[], onSelect: (paths: string[]) => void }) => {
    dir ??= DESKTOP_PATH;

    const extIconMap: Record<string, string> = {
        '.js': '/usr/share/icons/js-icon.png',
        '.ts': '/usr/share/icons/ts-icon.png',
        '.proj': '/usr/share/icons/game-icon.png',
        '.html': '/usr/share/icons/html-icon.png',
        '.png': '/usr/share/icons/png-icon.png',
        '.jpg': '/usr/share/icons/png-icon.png',
        '.jpeg': '/usr/share/icons/png-icon.png',
        '.gif': '/usr/share/icons/png-icon.png',
        '.webp': '/usr/share/icons/png-icon.png',
        '.svg': '/usr/share/icons/png-icon.png',
        '.bmp': '/usr/share/icons/png-icon.png',
        '.ico': '/usr/share/icons/png-icon.png',
        '.avif': '/usr/share/icons/png-icon.png',
        '.run': '/usr/share/icons/bash.png',
        '.md': '/usr/share/icons/note-icon.webp',
        '.json': '/usr/share/icons/json.png',
        '.db': '/usr/share/icons/db-icon.svg',
        '.sqlite': '/usr/share/icons/db-icon.svg',
        '.sqlite3': '/usr/share/icons/db-icon.svg',
        '.ipynb': '/usr/share/icons/ipynb-icon.png',
        '.mp3': '/usr/share/icons/audio-icon.png',
        '.wav': '/usr/share/icons/audio-icon.png',
        '.ogg': '/usr/share/icons/audio-icon.png',
        '.flac': '/usr/share/icons/audio-icon.png',
        '.m4a': '/usr/share/icons/audio-icon.png',
        '.aac': '/usr/share/icons/audio-icon.png',
        '.opus': '/usr/share/icons/audio-icon.png',
        '.mp4': '/usr/share/icons/video-icon.svg',
        '.mkv': '/usr/share/icons/video-icon.svg',
        '.webm': '/usr/share/icons/video-icon.svg',
        '.': '/usr/share/icons/folder-icon.png',
        '': '/usr/share/icons/invalid-file-icon.png',
        ...(platform.host.getFileTypeIcons?.() ?? {}),
    }

    const imageExtensions = new Set([
        '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif',
    ])

    const imageMimeTypes: Record<string, string> = {
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

    const fs = platform.host.getFS()
    const ls: Array<FileType> = fs.readdirSync(dir, {}).map(x => ({
        name: x as string,
        path: `${dir}/${x}`,
        type: fs.statSync(`${dir}/${x}`).isDirectory() ? 'dir' : 'file',
        meta: { ext: getFileExtension(x as string) }
    }));

    const files: Array<FileType> = [...ls]

    // Selection is lifted up to the parent App (so the details panel can
    // react to it live) instead of local state. `selectedPaths` is a plain
    // array; `selectedSet` is just a membership-check convenience for
    // rendering.
    const selectedSet = new Set(selectedPaths)

    // Anchor for shift-click range selection - the index (in current visual/
    // sort order) of the last item clicked without Shift. Local to this
    // component (which remounts, via its `key={dir}` in App, on every
    // directory change) so the anchor naturally resets when navigating.
    const lastClickedIndexRef = React.useRef<number | null>(null)

    // Standard file-manager click semantics:
    // - plain click: select just this item.
    // - Ctrl/Cmd-click: toggle this item's membership in the selection.
    // - Shift-click: select the contiguous range from the last plain/ctrl
    //   click to this item, in the current visual order.
    const handleItemClick = (file: FileType, index: number, event: React.MouseEvent) => {
        event.stopPropagation()
        const isToggle = event.metaKey || event.ctrlKey
        const isRange = event.shiftKey

        if (isRange && lastClickedIndexRef.current !== null) {
            const start = Math.min(lastClickedIndexRef.current, index)
            const end = Math.max(lastClickedIndexRef.current, index)
            onSelect(files.slice(start, end + 1).map(f => f.path))
            return
        }

        if (isToggle) {
            const next = new Set(selectedPaths)
            if (next.has(file.path)) next.delete(file.path)
            else next.add(file.path)
            onSelect(Array.from(next))
            lastClickedIndexRef.current = index
            return
        }

        onSelect([file.path])
        lastClickedIndexRef.current = index
    }

    // Image thumbnails are generated as blob URLs read straight from the
    // virtual fs instead of `/(sw)<path>` - the explorer renders inside an
    // `about:blank` window iframe, which has no service-worker controller, so
    // sub-resource fetches (CSS background-image) to `/(sw)/...` never reach
    // the SW's fetch handler (unlike `<iframe src="/(sw)/...">` navigations,
    // which the SW intercepts regardless of the embedding document's controller).
    const [thumbnails, setThumbnails] = React.useState<Record<string, string>>({})
    const filesKey = files.map(f => f.path).join(' ')
    React.useEffect(() => {
        const urls: string[] = []
        const next: Record<string, string> = {}
        files.forEach(file => {
            if (file.type !== 'file' || !imageExtensions.has(file.meta.ext as string)) return;
            try {
                const data = fs.readFileSync(file.path)
                const blob = new Blob([data], { type: imageMimeTypes[file.meta.ext as string] || 'application/octet-stream' })
                const url = URL.createObjectURL(blob)
                next[file.path] = url
                urls.push(url)
            } catch (err) {
                console.error('Failed to load thumbnail for', file.path, err)
            }
        })
        setThumbnails(next)
        return () => urls.forEach(url => URL.revokeObjectURL(url))
    }, [filesKey])

    // File-type icons live in the virtual fs under /usr/share/icons (see
    // extIconMap above) and, for the same reason as the thumbnails above, are
    // loaded as blob URLs rather than referenced via `/(sw)/...` paths.
    const [iconUrls, setIconUrls] = React.useState<Record<string, string>>({})
    React.useEffect(() => {
        const urls: string[] = []
        const next: Record<string, string> = {}
        Object.entries(extIconMap).forEach(([ext, path]) => {
            if (path.startsWith('data:')) {
                next[ext] = path;
                return;
            }
            try {
                const data = fs.readFileSync(path)
                const blob = new Blob([data], { type: path.endsWith('.webp') ? 'image/webp' : path.endsWith('.svg') ? 'image/svg+xml' : 'image/png' })
                const url = URL.createObjectURL(blob)
                next[ext] = url
                urls.push(url)
            } catch (err) {
                console.error('Failed to load icon for', ext, err)
            }
        })
        setIconUrls(next)
        return () => urls.forEach(url => URL.revokeObjectURL(url))
    }, [])

    const containerRef = React.useRef<HTMLElement>(null)
    React.useLayoutEffect(() => {
        if (!containerRef.current) return;
        const doc = containerRef.current.ownerDocument;
        const styles = new doc.defaultView!.CSSStyleSheet();

        styles.replaceSync(`

        .${DESKTOP_CONTAINER_CLASS}-files {
            padding: .9rem;
            display: flex;
            gap: .35rem;
            flex-wrap: wrap;
            align-content: flex-start;
        }

        .${DESKTOP_CONTAINER_CLASS}-files .file-item {
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: .4rem;
            width: 5.75rem;
            padding: .55rem .3rem .45rem;
            border-radius: 16px;
            cursor: pointer;
            user-select: none;
            transition: background .15s;
        }

        .${DESKTOP_CONTAINER_CLASS}-files .file-item:hover {
            background: var(--vs-fill, rgba(0, 90, 255, 0.06));
        }

        .${DESKTOP_CONTAINER_CLASS}-files .file-item.selected {
            background: var(--vs-fill-3, rgba(0, 122, 255, 0.16));
            box-shadow: inset 0 0 0 1px var(--vs-stroke, transparent), 0 1px 3px rgba(0, 0, 0, 0.06);
        }

        .${DESKTOP_CONTAINER_CLASS}-files .file-item.selected .file-name {
            font-weight: 600;
        }

        .${DESKTOP_CONTAINER_CLASS}-files .file-item.drag-over {
            background: var(--vs-fill-2, rgba(10, 132, 255, 0.18));
            outline: 2px dashed var(--vs-selected-rim, #0a84ff);
            outline-offset: -2px;
        }

        .${DESKTOP_CONTAINER_CLASS}-files.drag-over {
            outline: 2px dashed var(--vs-selected-rim, #0a84ff);
            outline-offset: -6px;
            border-radius: 18px;
            background: var(--vs-fill, rgba(10, 132, 255, 0.04));
        }

        .${DESKTOP_CONTAINER_CLASS}-files .file {
            box-sizing: border-box;
            display: inline-block;
            width: 3rem;
            height: 3rem;
            overflow: hidden;
            cursor: pointer;
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.18));
        }

        .${DESKTOP_CONTAINER_CLASS}-files .file-name {
            font-size: 12px;
            color: var(--vs-text, #1d1d1f);
            text-align: center;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 100%;
            padding: 1px 5px;
            border-radius: 6px;
        }

        .${DESKTOP_CONTAINER_CLASS}-files .file-item.cut {
            opacity: 0.45;
        }

        `);

        appendStyleSheet(doc, styles)
        doc.adoptedStyleSheets
    }, []);

    const rightClickHandler = (file: FileType, event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        event.preventDefault();
        event.stopPropagation();
        // Right-clicking an item that's already part of a multi-selection keeps
        // the whole selection (so batch actions apply); right-clicking anything
        // else replaces the selection with just that item, as before.
        const keepSelection = selectedPaths.length > 1 && selectedSet.has(file.path)
        if (!keepSelection) {
            onSelect([file.path])
            lastClickedIndexRef.current = files.findIndex(f => f.path === file.path)
        }
        const effectiveSelection = keepSelection ? selectedPaths : [file.path]
        const customEvent = new CustomEvent('showmenu', { detail: {} });
        event.target.dispatchEvent(customEvent);
        showFileActions(file, event, effectiveSelection)
    }

    const [dragOverPath, setDragOverPath] = React.useState<string | null>(null)
    const [mainDragOver, setMainDragOver] = React.useState(false)

    const dragStartHandler = (file: FileType, event: React.DragEvent) => {
        // Dragging an item that's part of the current multi-selection carries
        // the whole selection along; dragging a non-selected item (even while
        // other items are selected) only drags that one item.
        const isMultiDrag = selectedPaths.length > 1 && selectedSet.has(file.path)
        if (isMultiDrag) {
            event.dataTransfer.setData('application/x-vfs-paths', JSON.stringify(selectedPaths))
        }
        // Always set the singular path too - the item actually under the
        // pointer - so other single-file drop targets (audio player, desktop,
        // fs-inspector) keep working exactly as before for both single- and
        // multi-drag.
        event.dataTransfer.setData('application/x-vfs-path', file.path)
        event.dataTransfer.effectAllowed = 'move'
        if (window.top) (window.top as any).__vfsDragPath = file.path
    }

    const clipboard = (window.top as any)?.__vfsClipboard
    const cutPaths = clipboard?.op === 'cut' ? new Set<string>(clipboard.paths) : new Set<string>()

    return (
        <main
            className={`${DESKTOP_CONTAINER_CLASS}-files ${mainDragOver ? 'drag-over' : ''}`}
            ref={containerRef}
            onClick={() => { onSelect([]); lastClickedIndexRef.current = null }}
            onContextMenu={ev => { ev.preventDefault(); showDirActions && showDirActions(ev) }}
            onDragOver={ev => { handleDragOver(ev); setMainDragOver(true) }}
            onDragLeave={() => setMainDragOver(false)}
            onDrop={ev => { setMainDragOver(false); handleDrop(ev, dir!) }}
        >
            {
                files.map((file, index) => (
                    <div
                        key={file.path}
                        className={`file-item ${selectedSet.has(file.path) ? 'selected' : ''} ${cutPaths.has(file.path) ? 'cut' : ''} ${dragOverPath === file.path ? 'drag-over' : ''}`}
                        draggable
                        onDragStart={ev => dragStartHandler(file, ev)}
                        onDragOver={file.type === 'dir' ? (ev => { handleDragOver(ev); setDragOverPath(file.path) }) : undefined}
                        onDragLeave={file.type === 'dir' ? (() => setDragOverPath(null)) : undefined}
                        onDrop={file.type === 'dir' ? (ev => { setDragOverPath(null); handleDrop(ev, file.path) }) : undefined}
                        onClick={ev => handleItemClick(file, index, ev)}
                        onDoubleClick={() => openFile(file)}
                        onContextMenu={ev => rightClickHandler(file, ev)}
                    >
                        <div className={`file`} data-ext={file.meta.ext} style={{ backgroundImage: `url('${file.type === 'file' && imageExtensions.has(file.meta.ext as string) && thumbnails[file.path] ? thumbnails[file.path] : iconUrls[file.meta.ext as string] ?? iconUrls[''] ?? ''}')`, backgroundRepeat: 'no-repeat', backgroundSize: 'cover', backgroundPosition: 'center center' }}></div>
                        <span className="file-name">{file.name}</span>
                    </div>
                ))
            }
        </main>
    )
}
