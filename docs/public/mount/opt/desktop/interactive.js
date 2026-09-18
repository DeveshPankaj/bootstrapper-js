// Desktop icons variant: "Interactive" — icons magnify and tilt toward the
// cursor as it nears (dock-magnification style, applied to the desktop
// instead of a taskbar), plus a small click ripple. Selected from
// Settings > Managers > Desktop Icons. See /opt/desktop/manager.js for the
// plugin contract this follows (render(container, api), optional
// getSettingsSchema/applySetting for the live settings panel).

const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')

const DESKTOP_DIR = '/home/user1'
const ORDER_PATH = `${DESKTOP_DIR}/.desktop-order.json`
const SETTINGS_PATH = '/etc/desktop/interactive.json'

const EXT_ICON_MAP = {
    '.js': 'code', '.ts': 'code', '.html': 'html', '.json': 'data_object',
    '.md': 'description', '.png': 'image', '.jpg': 'image', '.jpeg': 'image',
    '.gif': 'image', '.webp': 'image', '.svg': 'image', '.run': 'terminal',
    '.mp3': 'music_note', '.wav': 'music_note', '.mp4': 'movie', '.mkv': 'movie',
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

const liveSettings = { magnify: true, strength: 1.5, tilt: true, ...readSettings() }
const listeners = new Set()
const notify = () => listeners.forEach(cb => cb())

// Distance-based scale falloff, like a dock magnification curve: icons
// within RADIUS of the cursor scale up, tapering to 1 at the edge.
const RADIUS = 110

const InteractiveIcons = ({ onOpen, onContextMenu }) => {
    const [files, setFiles] = React.useState(readDir)
    const [order, setOrder] = React.useState(readOrder)
    const [selected, setSelected] = React.useState(null)
    const [ripples, setRipples] = React.useState([])
    const [, forceRender] = React.useReducer(x => x + 1, 0)
    const dragSrc = React.useRef(null)
    const gridRef = React.useRef(null)
    const iconRefs = React.useRef(new Map())
    const [mouse, setMouse] = React.useState(null)

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

    const onGridMouseMove = (e) => {
        if (!liveSettings.magnify && !liveSettings.tilt) return
        const rect = gridRef.current.getBoundingClientRect()
        setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
    const onGridMouseLeave = () => setMouse(null)

    const spawnRipple = (e, path) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const id = Date.now() + Math.random()
        setRipples(r => [...r, { id, x: e.clientX - rect.left, y: e.clientY - rect.top, path }])
        setTimeout(() => setRipples(r => r.filter(x => x.id !== id)), 550)
    }

    const iconStyle = (path) => {
        if (!mouse) return {}
        const el = iconRefs.current.get(path)
        if (!el) return {}
        const rect = el.getBoundingClientRect()
        const gridRect = gridRef.current.getBoundingClientRect()
        const cx = rect.left - gridRect.left + rect.width / 2
        const cy = rect.top - gridRect.top + rect.height / 2
        const dx = mouse.x - cx, dy = mouse.y - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > RADIUS) return {}
        const falloff = 1 - dist / RADIUS
        const scale = liveSettings.magnify ? 1 + falloff * (liveSettings.strength - 1) : 1
        const rotY = liveSettings.tilt ? -(dx / RADIUS) * falloff * 14 : 0
        const rotX = liveSettings.tilt ? (dy / RADIUS) * falloff * 14 : 0
        return {
            transform: `perspective(300px) scale(${scale}) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(${-falloff * 6}px)`,
            zIndex: Math.round(falloff * 10) + 1,
        }
    }

    return React.createElement('div', {
        ref: gridRef,
        className: 'ix-grid',
        onMouseMove: onGridMouseMove,
        onMouseLeave: onGridMouseLeave,
    },
        sorted.map(file => React.createElement('div', {
            key: file.path,
            ref: (el) => { if (el) iconRefs.current.set(file.path, el); else iconRefs.current.delete(file.path) },
            className: 'ix-icon' + (selected === file.path ? ' selected' : ''),
            style: iconStyle(file.path),
            draggable: true,
            onDragStart: (e) => { dragSrc.current = file.name; e.dataTransfer.effectAllowed = 'move' },
            onDragOver: (e) => e.preventDefault(),
            onDrop: (e) => onDrop(e, file.name),
            onClick: (e) => { e.stopPropagation(); setSelected(file.path); spawnRipple(e, file.path) },
            onDoubleClick: () => onOpen(file),
            onContextMenu: (e) => { e.preventDefault(); onContextMenu(file, e) },
        },
            React.createElement('div', { className: 'ix-icon-box' },
                React.createElement('span', { className: 'material-symbols-outlined ix-icon-glyph' },
                    file.type === 'dir' ? 'folder' : (EXT_ICON_MAP[file.meta.ext] || 'draft')),
                ripples.filter(r => r.path === file.path).map(r =>
                    React.createElement('span', { key: r.id, className: 'ix-ripple', style: { left: r.x, top: r.y } })
                ),
            ),
            React.createElement('span', { className: 'ix-label' }, file.name),
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
.ix-grid {
  display: flex; flex-direction: column; flex-wrap: wrap; align-content: flex-start;
  gap: 18px 10px; padding: 16px; height: 100%; overflow: hidden;
}
.ix-icon {
  width: 74px; display: flex; flex-direction: column; align-items: center; gap: 5px;
  cursor: pointer; user-select: none; transition: transform 0.12s cubic-bezier(.34,1.56,.64,1);
  transform-origin: center bottom;
}
.ix-icon-box {
  position: relative; width: 52px; height: 52px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  background: rgba(255,255,255,0.08); backdrop-filter: blur(2px);
  box-shadow: 0 2px 6px rgba(0,0,0,0.25);
}
.ix-icon.selected .ix-icon-box { background: rgba(10,132,255,0.3); outline: 1.5px solid rgba(10,132,255,0.7); }
.ix-icon-glyph { font-size: 28px; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.5); }
.ix-label {
  font-size: 11px; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.7);
  max-width: 74px; text-align: center; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;
}
.ix-ripple {
  position: absolute; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%;
  background: rgba(255,255,255,0.65); pointer-events: none;
  animation: ix-ripple-anim 0.55s ease-out forwards;
}
@keyframes ix-ripple-anim {
  from { transform: scale(1); opacity: 0.8; }
  to { transform: scale(9); opacity: 0; }
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
    root.render(React.createElement(InteractiveIcons, {
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
        { key: 'magnify', label: 'Cursor magnification', type: 'toggle', value: liveSettings.magnify },
        { key: 'strength', label: 'Magnification strength', type: 'range', value: liveSettings.strength, min: 1, max: 2.5, step: 0.1 },
        { key: 'tilt', label: '3D tilt toward cursor', type: 'toggle', value: liveSettings.tilt },
    ]
}

export const applySetting = (key, value) => {
    liveSettings[key] = value
    notify()
}
