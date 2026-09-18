// Desktop icons variant: "Windows Tiles" — colorful Live-Tile-style grid.
// Selected from Settings > Managers > Desktop Icons. See
// /opt/desktop/manager.js for the full plugin contract; this file follows
// the same shape (render(container, api)) plus the optional
// getSettingsSchema/applySetting hooks that give this variant a live panel
// in Settings > Managers.

const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')

const DESKTOP_DIR = '/home/user1'
const ORDER_PATH = `${DESKTOP_DIR}/.desktop-order.json`
const SETTINGS_PATH = '/etc/desktop/windows-tiles.json'

const TILE_COLORS = ['#0078d4', '#e81123', '#107c10', '#5c2d91', '#ff8c00', '#008272', '#c239b3', '#00b7c3']

const EXT_ICON_MAP = {
    '.js': 'code', '.ts': 'code', '.html': 'html', '.json': 'data_object',
    '.md': 'description', '.png': 'image', '.jpg': 'image', '.jpeg': 'image',
    '.gif': 'image', '.webp': 'image', '.svg': 'image', '.run': 'terminal',
    '.mp3': 'music_note', '.wav': 'music_note', '.mp4': 'movie', '.mkv': 'movie',
    '.db': 'database', '.ipynb': 'science', '': 'draft',
}
const getExt = (name) => { const i = name.lastIndexOf('.'); return i === -1 ? '' : name.slice(i).toLowerCase() }
const colorFor = (name) => TILE_COLORS[Math.abs([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % TILE_COLORS.length]

const readDir = () => {
    const fs = platform.host.getFS()
    try {
        return fs.readdirSync(DESKTOP_DIR, {}).map(name => ({
            name, path: `${DESKTOP_DIR}/${name}`,
            type: fs.statSync(`${DESKTOP_DIR}/${name}`).isDirectory() ? 'dir' : 'file',
            meta: { ext: getExt(name) },
        }))
    } catch (_) { return [] }
}
const readOrder = () => { try { return JSON.parse(platform.host.getFS().readFileSync(ORDER_PATH, 'utf-8')) } catch { return [] } }
const saveOrder = (names) => { try { platform.host.getFS().writeFileSync(ORDER_PATH, JSON.stringify(names)) } catch (_) {} }
const readSettings = () => { try { return JSON.parse(platform.host.getFS().readFileSync(SETTINGS_PATH, 'utf-8')) } catch { return {} } }

// Live-mutated by applySetting() so already-rendered tiles react without a
// remount - each TileGrid instance re-subscribes to this on every render.
const liveSettings = { tileSize: 96, showLabels: true, ...readSettings() }
const listeners = new Set()
const notify = () => listeners.forEach(cb => cb())

const TilesGrid = ({ onOpen, onContextMenu }) => {
    const [files, setFiles] = React.useState(readDir)
    const [order, setOrder] = React.useState(readOrder)
    const [, forceRender] = React.useReducer(x => x + 1, 0)
    const dragSrc = React.useRef(null)

    React.useEffect(() => {
        listeners.add(forceRender)
        return () => listeners.delete(forceRender)
    }, [])

    const sorted = React.useMemo(() => {
        if (!order.length) return files
        return [...files].sort((a, b) => {
            const ia = order.indexOf(a.name), ib = order.indexOf(b.name)
            if (ia === -1 && ib === -1) return 0
            if (ia === -1) return 1
            if (ib === -1) return -1
            return ia - ib
        })
    }, [files, order])

    const onDrop = (e, targetName) => {
        e.preventDefault()
        const src = dragSrc.current
        if (!src || src === targetName) return
        const names = sorted.map(f => f.name)
        const from = names.indexOf(src), to = names.indexOf(targetName)
        if (from === -1 || to === -1) return
        names.splice(from, 1); names.splice(to, 0, src)
        saveOrder(names); setOrder(names)
    }

    const size = liveSettings.tileSize

    return React.createElement('div', { className: 'wt-grid', style: { '--wt-size': `${size}px` } },
        sorted.map(file => React.createElement('div', {
            key: file.path,
            className: 'wt-tile',
            style: { background: file.type === 'dir' ? '#5f6368' : colorFor(file.name) },
            draggable: true,
            onDragStart: (e) => { dragSrc.current = file.name; e.dataTransfer.effectAllowed = 'move' },
            onDragOver: (e) => e.preventDefault(),
            onDrop: (e) => onDrop(e, file.name),
            onDoubleClick: () => onOpen(file),
            onContextMenu: (e) => { e.preventDefault(); onContextMenu(file, e) },
        },
            React.createElement('span', { className: 'material-symbols-outlined wt-tile-icon' },
                file.type === 'dir' ? 'folder' : (EXT_ICON_MAP[file.meta.ext] || 'draft')),
            liveSettings.showLabels && React.createElement('span', { className: 'wt-tile-label' }, file.name),
        ))
    )
}

const CSS = `
@font-face {
  font-family: 'Material Symbols Outlined';
  font-style: normal; font-weight: 100 700;
  src: url(https://fonts.gstatic.com/s/materialsymbolsoutlined/v138/kJEhBvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oFsLjBuVY.woff2) format('woff2');
}
.material-symbols-outlined { font-family: 'Material Symbols Outlined'; font-weight: normal; font-style: normal; line-height: 1; -webkit-font-smoothing: antialiased; }
.wt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, var(--wt-size, 96px));
  grid-auto-rows: var(--wt-size, 96px);
  gap: 8px; padding: 12px; height: 100%; overflow: auto; align-content: start;
}
.wt-tile {
  position: relative; border-radius: 4px; cursor: pointer; user-select: none;
  display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-end;
  padding: 8px; color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.35);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.wt-tile:hover { transform: translateY(-2px) scale(1.03); box-shadow: 0 6px 16px rgba(0,0,0,0.4); }
.wt-tile-icon { position: absolute; top: 10px; left: 10px; font-size: 26px; opacity: 0.95; }
.wt-tile-label {
  font-size: 11px; font-weight: 500; line-height: 1.25; max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px 2px rgba(0,0,0,0.4);
}
`

export const render = (container, api) => {
    const styleEl = document.createElement('style')
    styleEl.textContent = CSS
    container.appendChild(styleEl)

    const mountEl = document.createElement('div')
    mountEl.style.cssText = 'width:100%;height:100%;'
    container.appendChild(mountEl)

    const root = ReactDOM.createRoot(mountEl)
    root.render(React.createElement(TilesGrid, {
        onOpen: (file) => api.openFile(file),
        onContextMenu: (file, e) => api.showFileActions(file, e),
    }))

    return () => {
        setTimeout(() => root.unmount(), 0)
        styleEl.remove()
        mountEl.remove()
    }
}

export const getSettingsSchema = (stored) => {
    Object.assign(liveSettings, stored)
    return [
        { key: 'tileSize', label: 'Tile size', type: 'range', value: liveSettings.tileSize, min: 64, max: 160, step: 8 },
        { key: 'showLabels', label: 'Show labels', type: 'toggle', value: liveSettings.showLabels },
    ]
}

export const applySetting = (key, value) => {
    liveSettings[key] = value
    notify()
}
