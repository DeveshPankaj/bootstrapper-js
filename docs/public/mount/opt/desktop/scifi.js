// Desktop icons variant: "Sci-Fi HUD" — angular glowing frames, scanline
// overlay, targeting-reticle corner brackets. Selected from Settings >
// Managers > Desktop Icons. See /opt/desktop/manager.js for the plugin
// contract this follows (render(container, api), optional
// getSettingsSchema/applySetting for the live settings panel).

const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')

const DESKTOP_DIR = '/home/user1'
const ORDER_PATH = `${DESKTOP_DIR}/.desktop-order.json`
const SETTINGS_PATH = '/etc/desktop/scifi.json'

const EXT_ICON_MAP = {
    '.js': 'terminal', '.ts': 'terminal', '.html': 'language', '.json': 'data_object',
    '.md': 'description', '.png': 'image', '.jpg': 'image', '.jpeg': 'image',
    '.gif': 'image', '.webp': 'image', '.svg': 'image', '.run': 'bolt',
    '.mp3': 'graphic_eq', '.wav': 'graphic_eq', '.mp4': 'movie', '.mkv': 'movie',
    '.db': 'database', '.ipynb': 'science', '': 'draft',
}
const getExt = (name) => { const i = name.lastIndexOf('.'); return i === -1 ? '' : name.slice(i).toLowerCase() }

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

const liveSettings = { glowColor: '#37e6ff', scanlines: true, pulse: true, ...readSettings() }
const listeners = new Set()
const notify = () => listeners.forEach(cb => cb())

const HudIcons = ({ onOpen, onContextMenu }) => {
    const [files, setFiles] = React.useState(readDir)
    const [order, setOrder] = React.useState(readOrder)
    const [selected, setSelected] = React.useState(null)
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

    return React.createElement('div', {
        className: 'sf-grid' + (liveSettings.pulse ? ' sf-pulse' : ''),
        style: { '--sf-glow': liveSettings.glowColor },
    },
        liveSettings.scanlines && React.createElement('div', { className: 'sf-scanlines' }),
        sorted.map(file => React.createElement('div', {
            key: file.path,
            className: 'sf-icon' + (selected === file.path ? ' selected' : ''),
            draggable: true,
            onDragStart: (e) => { dragSrc.current = file.name; e.dataTransfer.effectAllowed = 'move' },
            onDragOver: (e) => e.preventDefault(),
            onDrop: (e) => onDrop(e, file.name),
            onClick: (e) => { e.stopPropagation(); setSelected(file.path) },
            onDoubleClick: () => onOpen(file),
            onContextMenu: (e) => { e.preventDefault(); onContextMenu(file, e) },
        },
            React.createElement('span', { className: 'sf-corner sf-corner-tl' }),
            React.createElement('span', { className: 'sf-corner sf-corner-br' }),
            React.createElement('div', { className: 'sf-hex' },
                React.createElement('span', { className: 'material-symbols-outlined sf-icon-glyph' },
                    file.type === 'dir' ? 'folder_open' : (EXT_ICON_MAP[file.meta.ext] || 'draft')),
            ),
            React.createElement('span', { className: 'sf-label' }, file.name),
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
.sf-grid {
  position: relative; display: flex; flex-direction: column; flex-wrap: wrap;
  align-content: flex-start; gap: 14px; padding: 16px; height: 100%; overflow: hidden;
}
.sf-scanlines {
  position: absolute; inset: 0; pointer-events: none; z-index: 0;
  background: repeating-linear-gradient(to bottom, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 3px);
  mix-blend-mode: overlay;
}
.sf-icon {
  position: relative; width: 76px; display: flex; flex-direction: column; align-items: center; gap: 6px;
  cursor: pointer; user-select: none; padding: 6px 4px; z-index: 1;
}
.sf-hex {
  width: 52px; height: 52px; display: flex; align-items: center; justify-content: center;
  background: rgba(10, 20, 24, 0.55);
  clip-path: polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%);
  border: 1.5px solid var(--sf-glow, #37e6ff);
  box-shadow: 0 0 6px var(--sf-glow, #37e6ff), inset 0 0 10px rgba(55,230,255,0.15);
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}
.sf-icon:hover .sf-hex { transform: scale(1.08); box-shadow: 0 0 14px var(--sf-glow, #37e6ff), inset 0 0 14px rgba(55,230,255,0.25); }
.sf-icon.selected .sf-hex { background: color-mix(in srgb, var(--sf-glow, #37e6ff) 22%, rgba(10,20,24,0.55)); }
.sf-icon-glyph { font-size: 24px; color: var(--sf-glow, #37e6ff); text-shadow: 0 0 6px var(--sf-glow, #37e6ff); }
.sf-label {
  font-family: 'Courier New', monospace; font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--sf-glow, #37e6ff); text-shadow: 0 0 4px rgba(55,230,255,0.6);
  max-width: 74px; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sf-corner {
  position: absolute; width: 8px; height: 8px; border-color: var(--sf-glow, #37e6ff); opacity: 0; transition: opacity 0.15s ease;
}
.sf-icon:hover .sf-corner, .sf-icon.selected .sf-corner { opacity: 0.9; }
.sf-corner-tl { top: -2px; left: -2px; border-top: 2px solid; border-left: 2px solid; }
.sf-corner-br { bottom: 2px; right: -2px; border-bottom: 2px solid; border-right: 2px solid; }
.sf-pulse .sf-hex { animation: sf-glow-pulse 2.4s ease-in-out infinite; }
@keyframes sf-glow-pulse {
  0%, 100% { box-shadow: 0 0 6px var(--sf-glow, #37e6ff), inset 0 0 10px rgba(55,230,255,0.15); }
  50% { box-shadow: 0 0 14px var(--sf-glow, #37e6ff), inset 0 0 16px rgba(55,230,255,0.3); }
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
    root.render(React.createElement(HudIcons, {
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
        { key: 'glowColor', label: 'Glow color', type: 'color', value: liveSettings.glowColor },
        { key: 'scanlines', label: 'Scanline overlay', type: 'toggle', value: liveSettings.scanlines },
        { key: 'pulse', label: 'Pulse animation', type: 'toggle', value: liveSettings.pulse },
    ]
}

export const applySetting = (key, value) => {
    liveSettings[key] = value
    notify()
}
