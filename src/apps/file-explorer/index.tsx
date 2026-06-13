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

    const styles = new win.CSSStyleSheet()
    styles.replace(`
        html, body {
            margin: 0;
            padding:0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
            height: 100svh;
            background: #fff;
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
        }

        * {
            box-sizing: border-box;
        }

        .file-explorer {
            color: #1d1d1f;
            background: #fff;
        }

        .file-explorer > header {
            background: linear-gradient(#f7f7f7, #ececec);
            color: #333;
            padding: .5rem .75rem;
            display: flex;
            align-items: center;
            gap: .75rem;
            border-bottom: 1px solid #d4d4d4;
        }

        .toolbar-nav-buttons {
            display: flex;
            align-items: center;
            gap: .15rem;
            flex-shrink: 0;
        }

        .toolbar-nav-buttons .material-symbols-outlined {
            padding: .25rem;
            border-radius: 6px;
            cursor: pointer;
            color: #555;
        }

        .toolbar-nav-buttons .material-symbols-outlined.disabled {
            color: #ccc;
            cursor: default;
        }

        .toolbar-nav-buttons .material-symbols-outlined:not(.disabled):hover {
            background: rgba(0, 0, 0, 0.08);
        }

        .breadcrumbs {
            flex-grow: 1;
            display: flex;
            align-items: center;
            gap: .15rem;
            overflow: hidden;
            white-space: nowrap;
            font-size: 13px;
            color: #555;
            min-width: 0;
        }

        .breadcrumbs > span.crumb {
            padding: .2rem .5rem;
            border-radius: 5px;
            cursor: pointer;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .breadcrumbs > span.crumb:hover {
            background: rgba(0, 0, 0, 0.06);
        }

        .breadcrumbs > span.crumb.current {
            font-weight: 600;
            color: #1d1d1f;
        }

        .breadcrumbs > span.sep {
            color: #aaa;
            font-size: 11px;
            flex-shrink: 0;
        }

        .toolbar-actions {
            display: flex;
            align-items: center;
            gap: .15rem;
            flex-shrink: 0;
        }

        .toolbar-actions .material-symbols-outlined {
            cursor: pointer;
            padding: .25rem;
            border-radius: 6px;
            color: #555;
        }

        .toolbar-actions .material-symbols-outlined:hover {
            background: rgba(0, 0, 0, 0.08);
        }

        .file-explorer-body {
            display: flex;
            flex-grow: 1;
            min-height: 0;
        }

        .file-explorer-nav {
            flex: 0 0 11rem;
            background: #f6f6f6;
            border-right: 1px solid #e2e2e2;
            overflow: auto;
            padding: .6rem .5rem;
        }

        .file-explorer-nav .nav-section-title {
            font-size: 11px;
            font-weight: 600;
            color: #9a9a9e;
            text-transform: uppercase;
            letter-spacing: .04em;
            padding: .4rem .5rem .3rem;
        }

        .file-explorer-nav > div {
            display: flex;
            align-items: center;
            gap: .55rem;
            padding: .35rem .5rem;
            border-radius: 6px;
            cursor: pointer;
            white-space: nowrap;
            font-size: 13px;
            color: #333;
        }

        .file-explorer-nav > div .material-symbols-outlined {
            font-size: 18px;
            color: #6aa9f4;
        }

        .file-explorer-nav > div:hover {
            background: rgba(0, 0, 0, 0.05);
        }

        .file-explorer-nav > div.active {
            background: #cfe6ff;
            color: #0b5fcc;
            font-weight: 500;
        }

        .file-explorer-nav > div.active .material-symbols-outlined {
            color: #1f7bf0;
        }

        .dir-list {
            flex-grow: 1;
            overflow: auto;
            background: #ffffff;
            display: flex;
            flex-direction: column;
        }

        .dir-list-files {
            flex-grow: 1;
        }

        .file-explorer-status {
            flex-shrink: 0;
            margin-top: auto;
            border-top: 1px solid #e2e2e2;
            background: #f6f6f6;
            color: #8a8a8e;
            font-size: 11px;
            padding: .25rem .75rem;
        }

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

    const goTo = (path: string, { pushHistory = true }: { pushHistory?: boolean } = {}) => {
        const normalized = normalizePath(path)
        if (!fs.existsSync(normalized)) fs.mkdirSync(normalized, { recursive: true })
        dirRef.current = normalized

        if (pushHistory) {
            const history = historyRef.current.slice(0, historyIndexRef.current + 1)
            history.push(normalized)
            historyRef.current = history
            historyIndexRef.current = history.length - 1
        }

        refresh()
    }

    const open = (file: string) => {
        const selectedFilePath = normalizePath(dirRef.current.endsWith('/') ? `${dirRef.current}${file}` : `${dirRef.current}/${file}`);
        const stat = fs.statSync(selectedFilePath);

        if (stat.isDirectory()) {
            goTo(selectedFilePath)
        }

        else {
            platform.host.exec(platform, selectedFilePath)
        }
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
    const showFileActionsHandler = (file: FileType, event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        const openContextMenu = platform.host.getService('001-core.layout', 'show-context-menu') as Function;
        if (!openContextMenu) return;
        const rect = props.getBoundingClientRect()


        const actions = [];
        file.path = file.path.replace(/\/\//g, '/')
        const stats = fs.statSync(file.path)
        if (stats.isFile()) {
            actions.push({ id: 'edit_file', type: 'action', title: 'Edit', cmd: `service('001-core.layout', 'open-window') (command('ui.notepad'), '${file.path}')` })
            actions.push({ id: 'open_file', type: 'action', title: 'Open', cmd: `service('001-core.layout', 'open-window') (command('ui.iframe'), '${file.path}')` })
            actions.push({ id: 'delete_file', type: 'action', title: 'Delete', cmd: `service('root', 'fs')('rm', '${file.path}')` })
        }

        else {
            actions.push({ id: 'open_file', type: 'action', title: 'Open in explorer', cmd: `service('001-core.layout', 'open-window') (command('ui.file-explorer'), '${file.path}')` })
            actions.push({ id: 'delete_file', type: 'action', title: 'Delete', cmd: `service('root', 'fs')('rmdir', '${file.path}')` })
        }

        openContextMenu(event.clientX + rect.x, event.clientY + rect.y, actions)
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
        event.dataTransfer.dropEffect = event.dataTransfer.types.includes('application/x-vfs-path') ? 'move' : 'copy'
    }

    // Handles a drop onto `targetDir` - either moving an item dragged from an explorer
    // window (`application/x-vfs-path`), or importing files/folders dragged from the OS.
    const handleDrop = (event: React.DragEvent, targetDir: string) => {
        event.preventDefault()
        event.stopPropagation()

        const vfsPath = event.dataTransfer.getData('application/x-vfs-path')
        if (vfsPath) {
            moveEntry(vfsPath, targetDir)
            refresh()
            return
        }

        importExternalDrop(event.dataTransfer, targetDir)
            .then(refresh)
            .catch(err => console.error('Failed to import dropped files', err))
    }

    const breadcrumbs = getBreadcrumbs(dirRef.current)

    return (
        <div style={{ display: 'flex', height: '100%', flexDirection: 'column' }} className="file-explorer">
            <header>
                <div className="toolbar-nav-buttons">
                    <span
                        className={`material-symbols-outlined ${historyIndexRef.current <= 0 ? 'disabled' : ''}`}
                        onClick={goBack}
                        aria-label="back"
                        title="back"
                    >arrow_back_ios</span>
                    <span
                        className={`material-symbols-outlined ${historyIndexRef.current >= historyRef.current.length - 1 ? 'disabled' : ''}`}
                        onClick={goForward}
                        aria-label="forward"
                        title="forward"
                    >arrow_forward_ios</span>
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
                    <ListDirComponent key={dirRef.current} dir={dirRef.current} openFile={openFile} showFileActions={showFileActionsHandler} handleDragOver={handleDragOver} handleDrop={handleDrop} />
                    <div className="file-explorer-status">{dirList.length} item{dirList.length === 1 ? '' : 's'}</div>
                </section>
            </div>
        </div>
    )
}

const ListDirComponent = ({ dir, openFile, showFileActions, handleDragOver, handleDrop }: { dir?: string, openFile: (file: FileType) => void, showFileActions: (file: FileType, event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void, handleDragOver: (event: React.DragEvent) => void, handleDrop: (event: React.DragEvent, targetDir: string) => void }) => {
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
        '.': '/usr/share/icons/folder-icon.png',
        '': '/usr/share/icons/invalid-file-icon.png'
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

    const [selected, setSelected] = React.useState<string | null>(null)

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
            try {
                const data = fs.readFileSync(path)
                const blob = new Blob([data], { type: path.endsWith('.webp') ? 'image/webp' : 'image/png' })
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
            padding: .75rem;
            display: flex;
            gap: .25rem;
            flex-wrap: wrap;
            align-content: flex-start;
        }

        .${DESKTOP_CONTAINER_CLASS}-files .file-item {
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: .35rem;
            width: 5.5rem;
            padding: .4rem .25rem;
            border-radius: 8px;
            cursor: pointer;
            user-select: none;
        }

        .${DESKTOP_CONTAINER_CLASS}-files .file-item:hover {
            background: rgba(0, 90, 255, 0.06);
        }

        .${DESKTOP_CONTAINER_CLASS}-files .file-item.selected {
            background: rgba(0, 122, 255, 0.16);
        }

        .${DESKTOP_CONTAINER_CLASS}-files .file-item.selected .file-name {
            background: #0a84ff;
            color: #fff;
        }

        .${DESKTOP_CONTAINER_CLASS}-files .file-item.drag-over {
            background: rgba(10, 132, 255, 0.18);
            outline: 2px dashed #0a84ff;
            outline-offset: -2px;
        }

        .${DESKTOP_CONTAINER_CLASS}-files.drag-over {
            outline: 2px dashed #0a84ff;
            outline-offset: -4px;
            background: rgba(10, 132, 255, 0.04);
        }

        .${DESKTOP_CONTAINER_CLASS}-files .file {
            box-sizing: border-box;
            display: inline-block;
            width: 3rem;
            height: 3rem;
            overflow: hidden;
            cursor: pointer;
        }

        .${DESKTOP_CONTAINER_CLASS}-files .file-name {
            font-size: 12px;
            color: #1d1d1f;
            text-align: center;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 100%;
            padding: 1px 5px;
            border-radius: 4px;
        }

        `);

        appendStyleSheet(doc, styles)
        doc.adoptedStyleSheets
    }, []);

    const rightClickHandler = (file: FileType, event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        event.preventDefault();
        setSelected(file.path)
        const customEvent = new CustomEvent('showmenu', { detail: {} });
        event.target.dispatchEvent(customEvent);
        showFileActions(file, event)
    }

    const [dragOverPath, setDragOverPath] = React.useState<string | null>(null)
    const [mainDragOver, setMainDragOver] = React.useState(false)

    const dragStartHandler = (file: FileType, event: React.DragEvent) => {
        event.dataTransfer.setData('application/x-vfs-path', file.path)
        event.dataTransfer.effectAllowed = 'move'
    }

    return (
        <main
            className={`${DESKTOP_CONTAINER_CLASS}-files ${mainDragOver ? 'drag-over' : ''}`}
            ref={containerRef}
            onDragOver={ev => { handleDragOver(ev); setMainDragOver(true) }}
            onDragLeave={() => setMainDragOver(false)}
            onDrop={ev => { setMainDragOver(false); handleDrop(ev, dir!) }}
        >
            {
                files.map(file => (
                    <div
                        key={file.path}
                        className={`file-item ${selected === file.path ? 'selected' : ''} ${dragOverPath === file.path ? 'drag-over' : ''}`}
                        draggable
                        onDragStart={ev => dragStartHandler(file, ev)}
                        onDragOver={file.type === 'dir' ? (ev => { handleDragOver(ev); setDragOverPath(file.path) }) : undefined}
                        onDragLeave={file.type === 'dir' ? (() => setDragOverPath(null)) : undefined}
                        onDrop={file.type === 'dir' ? (ev => { setDragOverPath(null); handleDrop(ev, file.path) }) : undefined}
                        onClick={() => setSelected(file.path)}
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
