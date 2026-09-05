// Desktop icon manager — VFS-configurable desktop icon renderer.
// Loaded and mounted by the layout kernel on boot; exports { render }.
// Edit this file in the file explorer to customise the desktop view.
//
// API: render(container, api) where api = { openFile, showFileActions }
// Return a cleanup function (or nothing) from render.

const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')

const DESKTOP_DIR = '/home/user1'

const EXT_ICON_MAP = {
    '.js':    '/(sw)/usr/share/icons/js-icon.png',
    '.ts':    '/(sw)/usr/share/icons/ts-icon.png',
    '.proj':  '/(sw)/usr/share/icons/game-icon.png',
    '.html':  '/(sw)/usr/share/icons/html-icon.png',
    '.png':   '/(sw)/usr/share/icons/png-icon.png',
    '.jpg':   '/(sw)/usr/share/icons/png-icon.png',
    '.jpeg':  '/(sw)/usr/share/icons/png-icon.png',
    '.gif':   '/(sw)/usr/share/icons/png-icon.png',
    '.webp':  '/(sw)/usr/share/icons/png-icon.png',
    '.svg':   '/(sw)/usr/share/icons/png-icon.png',
    '.bmp':   '/(sw)/usr/share/icons/png-icon.png',
    '.ico':   '/(sw)/usr/share/icons/png-icon.png',
    '.avif':  '/(sw)/usr/share/icons/png-icon.png',
    '.run':   '/(sw)/usr/share/icons/bash.png',
    '.md':    '/(sw)/usr/share/icons/note-icon.webp',
    '.json':  '/(sw)/usr/share/icons/json.png',
    '.db':    '/(sw)/usr/share/icons/db-icon.svg',
    '.sqlite':'/(sw)/usr/share/icons/db-icon.svg',
    '.sqlite3':'/(sw)/usr/share/icons/db-icon.svg',
    '.ipynb': '/(sw)/usr/share/icons/ipynb-icon.png',
    '.mp3':   '/(sw)/usr/share/icons/audio-icon.png',
    '.wav':   '/(sw)/usr/share/icons/audio-icon.png',
    '.ogg':   '/(sw)/usr/share/icons/audio-icon.png',
    '.flac':  '/(sw)/usr/share/icons/audio-icon.png',
    '.m4a':   '/(sw)/usr/share/icons/audio-icon.png',
    '.aac':   '/(sw)/usr/share/icons/audio-icon.png',
    '.opus':  '/(sw)/usr/share/icons/audio-icon.png',
    '.mp4':   '/(sw)/usr/share/icons/video-icon.svg',
    '.mkv':   '/(sw)/usr/share/icons/video-icon.svg',
    '.webm':  '/(sw)/usr/share/icons/video-icon.svg',
    '.':      '/(sw)/usr/share/icons/folder-icon.png',
    '':       '/(sw)/usr/share/icons/invalid-file-icon.png',
}

const IMAGE_EXTS = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg','.bmp','.ico','.avif'])

const getExt = (name) => {
    const dot = name.lastIndexOf('.')
    if (dot === -1) return ''
    return name.slice(dot).toLowerCase()
}

const getIconUrl = (file) => {
    if (file.type === 'dir') return EXT_ICON_MAP['.']
    const ext = getExt(file.name)
    if (IMAGE_EXTS.has(ext)) return `/(sw)${file.path}`
    return EXT_ICON_MAP[ext] || EXT_ICON_MAP['']
}

const readDir = () => {
    const fs = platform.host.getFS()
    try {
        return fs.readdirSync(DESKTOP_DIR, {}).map(name => ({
            name,
            path: `${DESKTOP_DIR}/${name}`,
            type: fs.statSync(`${DESKTOP_DIR}/${name}`).isDirectory() ? 'dir' : 'file',
            meta: { ext: getExt(name) },
        }))
    } catch (_) { return [] }
}

const DesktopIcons = ({ onOpen, onContextMenu }) => {
    const [files, setFiles] = React.useState(readDir)
    const [selected, setSelected] = React.useState(null)

    return React.createElement('div', {
        className: 'vfs-desktop-icons',
        onClick: (e) => {
            if (e.target.classList.contains('vfs-desktop-icons')) setSelected(null)
        },
    },
        files.map(file =>
            React.createElement('div', {
                key: file.path,
                className: 'vfs-desktop-icon' + (selected === file.path ? ' selected' : ''),
                onClick: (e) => { e.stopPropagation(); setSelected(file.path) },
                onDoubleClick: (e) => { e.stopPropagation(); setSelected(null); onOpen(file) },
                onContextMenu: (e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(file, e) },
            },
                React.createElement('div', {
                    className: 'vfs-desktop-icon-img',
                    style: {
                        backgroundImage: `url('${getIconUrl(file)}')`,
                        backgroundSize: 'contain',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'center',
                    },
                }),
                React.createElement('span', { className: 'vfs-desktop-icon-label' }, file.name)
            )
        )
    )
}

const DESKTOP_CSS = `
.vfs-desktop-icons {
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 0.5rem;
    padding: 0.75rem;
    width: min-content;
    max-height: 100%;
    overflow: hidden;
    pointer-events: auto;
}
.vfs-desktop-icon {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    width: 72px;
    transition: background 0.1s;
    user-select: none;
}
.vfs-desktop-icon:hover { background: rgba(255,255,255,0.12); }
.vfs-desktop-icon.selected { background: rgba(10,132,255,0.25); outline: 1.5px solid rgba(10,132,255,0.6); }
.vfs-desktop-icon-img {
    width: 48px;
    height: 48px;
    flex-shrink: 0;
}
.vfs-desktop-icon-label {
    color: #fff;
    font-size: 11px;
    text-align: center;
    word-break: break-all;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.2;
    max-width: 68px;
    text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    mix-blend-mode: normal;
}
`

export const render = (container, api) => {
    const styleEl = document.createElement('style')
    styleEl.textContent = DESKTOP_CSS
    container.appendChild(styleEl)

    const mountEl = document.createElement('div')
    mountEl.style.cssText = 'width:100%;height:100%;'
    container.appendChild(mountEl)

    const root = ReactDOM.createRoot(mountEl)
    root.render(React.createElement(DesktopIcons, {
        onOpen: (file) => api.openFile(file),
        onContextMenu: (file, e) => api.showFileActions(file, e),
    }))

    return () => {
        setTimeout(() => root.unmount(), 0)
        styleEl.remove()
        mountEl.remove()
    }
}
