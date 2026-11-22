// Settings > Managers — window title bar style, dock manager, desktop icons.
// (Themes, colors and window behavior: 06-window-manager.js.)
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { utils } = platform.getService('settings')
const { fs } = utils

// ─── Managers config (WM style + dock) ────────────────────────────────────────

const MANAGERS_PATH = '/etc/managers.json'

const WM_OPTIONS = [
    { id: 'default',  label: 'Default',        icon: 'tune',                desc: 'Built-in header with snap zones and full customisation.' },
    { id: 'classic',  label: 'Classic (macOS)', icon: 'radio_button_checked',desc: 'Traffic-light circles left, centred title — macOS look.' },
    { id: 'minimal',  label: 'Minimal (Win)',   icon: 'crop_square',         desc: 'Title left, square ─ □ ✕ controls right — Windows look.' },
    { id: 'ubuntu',   label: 'Ubuntu (GNOME)',  icon: 'fiber_manual_record', desc: 'App icon + title left, coloured circles right — GNOME look.' },
    { id: 'glass',    label: 'Glass',           icon: 'blur_on',             desc: 'Frosted-glass translucent header with dot controls.' },
    { id: 'tiling',   label: 'Tiling',          icon: 'view_quilt',          desc: 'Auto-tiles windows in a grid — no manual sizing needed.' },
    { id: 'canvas',   label: 'Canvas',          icon: 'gesture',             desc: 'Infinite scrollable canvas — click a partial window to bring it into view.' },
]

const DOCK_OPTIONS = [
    { id: 'none',    label: 'None',            icon: 'indeterminate_check_box', desc: 'No dock — desktop only, without any taskbar or launcher bar.' },
    { id: 'default', label: 'Default',         icon: 'dock_to_bottom',          desc: 'Dark floating pill — sandboxed, IPC-only.' },
    { id: 'macos',   label: 'macOS Style',     icon: 'dock',                    desc: 'Frosted full-width bar with icon magnification and labels.' },
    { id: 'windows', label: 'Windows 11',      icon: 'desktop_windows',         desc: 'Dark centered icon bar — Windows 11 taskbar look.' },
    { id: 'gnome',   label: 'GNOME',           icon: 'apps',                    desc: 'Dark full-width bar, left-aligned, active-app label.' },
    { id: 'sidebar', label: 'Sidebar',         icon: 'dock_to_left',            desc: 'Vertical icon dock on the left edge — elementary/Plank style.' },
    { id: 'minimal', label: 'Minimal',         icon: 'minimize',                desc: 'Tiny monochrome pill that fades to near-invisible until the cursor gets close.' },
]

// Desktop-icon variants — /opt/desktop/<id>.js for every id but 'default',
// which uses /opt/desktop/manager.js. Like the window-chrome styles
// (/opt/wm/<id>.js) and /opt/window-manager.js, they run from the copy that
// ships with the build (/public/mount/...), never from the vfs copy, which is
// view-only (decisions.md D1; src/system/static-code.ts). See
// src/core/layout/index.tsx's DesktopMount/openVfsDesktop for the hot-swap.
const DESKTOP_OPTIONS = [
    { id: 'none',          label: 'None',           icon: 'indeterminate_check_box', desc: 'No desktop icons — a completely empty desktop.' },
    { id: 'default',       label: 'Default',       icon: 'grid_view',       desc: 'Classic desktop icon grid — drag to reorder, double-click to open.' },
    { id: 'windows-tiles', label: 'Windows Tiles',  icon: 'apps',            desc: 'Colourful Live-Tile-style squares with big icons.' },
    { id: 'scifi',         label: 'Sci-Fi HUD',     icon: 'hexagon',         desc: 'Glowing hexagon frames, scanlines, targeting-reticle corners.' },
    { id: 'interactive',   label: 'Interactive',    icon: 'touch_app',       desc: 'Icons magnify and tilt toward the cursor, with a click ripple.' },
]

const readManagers = () => {
    try { return JSON.parse(fs.readFileSync(MANAGERS_PATH, 'utf-8')) }
    catch (_) { return { windowManager: 'default', dockManager: 'default', desktopManager: 'default' } }
}

const writeManagers = (cfg) => {
    if (!fs.existsSync('/etc')) fs.mkdirSync('/etc', { recursive: true })
    fs.writeFileSync(MANAGERS_PATH, JSON.stringify(cfg, null, 2))
}

const openDock = (id) => {
    platform.host.callCommand('open-vfs-dock', id)
}

const openDesktop = (id) => {
    platform.host.callCommand('open-vfs-desktop', id)
}

const OptionList = ({ options, activeId, onSelect }) =>
    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        options.map(opt =>
            React.createElement('button', {
                key: opt.id,
                style: {
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', textAlign: 'left', borderRadius: 16, border: 'none',
                    boxShadow: activeId === opt.id
                        ? 'inset 0 0 0 1.5px var(--vs-selected-rim)'
                        : 'inset 0 0 0 1px var(--vs-stroke)',
                    background: activeId === opt.id ? 'var(--vs-fill-3)' : 'var(--vs-fill)',
                    color: 'inherit', font: 'inherit',
                    cursor: 'pointer', width: '100%',
                },
                onClick: () => onSelect(opt.id),
            },
                React.createElement('span', {
                    className: 'material-symbols-outlined',
                    style: { fontSize: 20, opacity: 0.7, flexShrink: 0 },
                }, opt.icon),
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 1 } },
                    React.createElement('span', { style: { fontWeight: 500, fontSize: 13 } }, opt.label),
                    React.createElement('span', { style: { fontSize: 11, opacity: 0.6 } }, opt.desc),
                ),
                activeId === opt.id && React.createElement('span', {
                    className: 'material-symbols-outlined',
                    style: { marginLeft: 'auto', fontSize: 18, color: 'var(--vs-text)', flexShrink: 0 },
                }, 'check_circle'),
            )
        )
    )

// ─── Generic per-variant settings panel ────────────────────────────────────────
// Shared by dock and desktop-icon variants: polls `getCmd` for the active
// variant's live schema (an array of { key, label, type, value, ... }, as
// registered by the variant module itself — see get-dock-schema/
// get-desktop-schema in src/core/layout/index.tsx) and pushes edits through
// `setCmd`, which persists them and re-applies live without a remount.

const SchemaSettingsPanel = ({ getCmd, setCmd, emptyMessage }) => {
    const [schema, setSchema] = React.useState([])

    const refreshSchema = () => {
        try {
            const result = platform.host.callCommand(getCmd)
            setSchema(result && result.schema ? result.schema : [])
        } catch (_) {}
    }

    React.useEffect(() => {
        refreshSchema()
        // Re-read when the active variant changes its schema registration.
        const tid = setInterval(refreshSchema, 2000)
        return () => clearInterval(tid)
    }, [getCmd])

    if (!schema.length) {
        return React.createElement('p', { className: 'hint', style: { margin: '6px 0' } }, emptyMessage)
    }

    const setSetting = (key, value) => {
        setSchema(prev => prev.map(e => e.key === key ? { ...e, value } : e))
        platform.host.callCommand(setCmd, { key, value })
    }

    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        schema.map(entry =>
            React.createElement('div', {
                key: entry.key,
                style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 14, background: 'var(--vs-fill)', boxShadow: 'inset 0 0 0 1px var(--vs-stroke)' },
            },
                React.createElement('span', { style: { fontSize: 12, opacity: 0.8 } }, entry.label),
                entry.type === 'color'
                    ? React.createElement('input', {
                        type: 'color',
                        value: entry.value,
                        onChange: e => setSetting(entry.key, e.target.value),
                    })
                    : entry.type === 'toggle'
                    ? React.createElement('input', {
                        type: 'checkbox',
                        checked: !!entry.value,
                        onChange: e => setSetting(entry.key, e.target.checked),
                    })
                    : entry.type === 'range'
                    ? React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                        React.createElement('input', {
                            type: 'range',
                            min: entry.min ?? 0, max: entry.max ?? 1, step: entry.step ?? 0.1,
                            value: entry.value,
                            onChange: e => setSetting(entry.key, Number(e.target.value)),
                            style: { width: 100 },
                        }),
                        React.createElement('span', { style: { fontSize: 11, minWidth: 28, textAlign: 'right', opacity: 0.6 } }, entry.value),
                    )
                    : entry.type === 'select'
                    ? React.createElement('select', {
                        value: entry.value,
                        onChange: e => setSetting(entry.key, e.target.value),
                        style: { fontSize: 12 },
                    }, (entry.options || []).map(o => React.createElement('option', { key: o, value: o }, o)))
                    : null
            )
        )
    )
}

// ─── Main component ────────────────────────────────────────────────────────────

const ManagersSettings = () => {
    const [cfg, setCfg] = React.useState(readManagers)

    const update = (patch) => {
        const next = { ...cfg, ...patch }
        setCfg(next)
        writeManagers(next)
    }

    // Colors, themes and window behavior live in Settings › Window Manager; this
    // page picks the components themselves.
    return React.createElement('div', { className: 'settings-page', style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        React.createElement('h1', { className: 'settings-page-title' }, 'Managers'),
        React.createElement('p', { className: 'settings-page-subtitle' },
            'Pick the window title bar style, the dock and the desktop icons. Colors and themes are under Window Manager.'
        ),

        // ── Window Manager style ──
        React.createElement('p', { className: 'muted-small', style: { margin: '12px 0 4px' } }, 'WINDOW CHROME'),
        React.createElement('p', { className: 'hint', style: { margin: '0 0 6px' } },
            'Applies to windows opened after switching.'
        ),
        React.createElement(OptionList, {
            options: WM_OPTIONS,
            activeId: cfg.windowManager,
            onSelect: (id) => update({ windowManager: id }),
        }),

        // ── Dock Manager ──
        React.createElement('p', { className: 'muted-small', style: { margin: '16px 0 4px' } }, 'DOCK'),
        React.createElement('p', { className: 'hint', style: { margin: '0 0 6px' } },
            'Sandboxed dock apps render as a fixed bar at the bottom. Switching replaces the current dock immediately.'
        ),
        React.createElement(OptionList, {
            options: DOCK_OPTIONS,
            activeId: cfg.dockManager,
            onSelect: (id) => { update({ dockManager: id }); openDock(id) },
        }),

        cfg.dockManager && cfg.dockManager !== 'none' && React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 14, background: 'var(--vs-fill)', boxShadow: 'inset 0 0 0 1px var(--vs-stroke)', marginTop: 6 },
        },
            React.createElement('div', null,
                React.createElement('div', { style: { fontSize: 12, fontWeight: 500 } }, 'Occupy bottom space'),
                React.createElement('div', { style: { fontSize: 11, opacity: 0.55, marginTop: 2 } }, 'Reserve dock height so windows never go behind the dock. Disable for overlay/transparent docks.'),
            ),
            React.createElement('input', {
                type: 'checkbox',
                checked: cfg.occupyBottom === true,
                onChange: e => {
                    update({ occupyBottom: e.target.checked })
                    platform.host.callCommand('set-dock-occupy', e.target.checked)
                },
                style: { width: 16, height: 16, cursor: 'pointer', flexShrink: 0 },
            }),
        ),

        // ── Active dock settings ──
        React.createElement('p', { className: 'muted-small', style: { margin: '16px 0 4px' } }, 'DOCK SETTINGS'),
        React.createElement(SchemaSettingsPanel, {
            getCmd: 'get-dock-schema', setCmd: 'set-dock-setting',
            emptyMessage: 'No active dock or dock has no configurable settings.',
        }),

        // ── Desktop icons ──
        React.createElement('p', { className: 'muted-small', style: { margin: '16px 0 4px' } }, 'DESKTOP ICONS'),
        React.createElement('p', { className: 'hint', style: { margin: '0 0 6px' } },
            'How files in your home directory render on the desktop. Switching applies immediately.'
        ),
        React.createElement(OptionList, {
            options: DESKTOP_OPTIONS,
            activeId: cfg.desktopManager || 'default',
            onSelect: (id) => { update({ desktopManager: id }); openDesktop(id) },
        }),

        // ── Active desktop-icon variant settings ──
        React.createElement('p', { className: 'muted-small', style: { margin: '16px 0 4px' } }, 'DESKTOP ICON SETTINGS'),
        React.createElement(SchemaSettingsPanel, {
            getCmd: 'get-desktop-schema', setCmd: 'set-desktop-setting',
            emptyMessage: 'This desktop icon variant has no configurable settings.',
        }),

        // ── VFS config files ──
        React.createElement('p', { className: 'muted-small', style: { margin: '20px 0 6px' } }, 'VFS CONFIGURATION FILES'),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
            [
                { path: '/opt/desktop/manager.js', label: 'Desktop icons ("Default" variant)', desc: 'Reference copy, view-only: desktop variants run from the copy that ships with the build, so editing this file changes nothing. Pick a different variant above.' },
                { path: '/etc/contextmenu.json',   label: 'Desktop context menu',   desc: 'JSON array of { id, type, title, cmd } items.' },
                { path: '/etc/taskbar.json',        label: 'Taskbar pinned apps',    desc: 'JSON { pinned: ["command-name", ...] }.' },
                { path: '/opt/window-manager.js',  label: 'WM behavior script',     desc: 'Reference copy, view-only: per-window event wiring runs from the copy that ships with the build, loaded once at startup — editing this file changes nothing.' },
            ].map(({ path, label, desc }) =>
                React.createElement('div', {
                    key: path,
                    style: { background: 'var(--vs-fill)', boxShadow: 'inset 0 0 0 1px var(--vs-stroke)', borderRadius: 14, padding: '10px 14px', cursor: 'pointer' },
                    // the path travels as a value, never as DSL source (audit KRN-3)
                    onClick: () => platform.host.openWindow('ui.notepad', path),
                    title: 'Open in editor',
                },
                    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                        React.createElement('span', { style: { fontWeight: 500, fontSize: 12 } }, label),
                        React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 14, opacity: 0.5 } }, 'edit'),
                    ),
                    React.createElement('span', { style: { fontSize: 11, opacity: 0.55 } }, path),
                    React.createElement('span', { style: { fontSize: 11, opacity: 0.45, marginTop: 2, display: 'block' } }, desc),
                )
            )
        ),
    )
}

platform.getService('settings').registerSection('20-managers', (container, api) => {
    const root = ReactDOM.createRoot(container)
    root.render(React.createElement(ManagersSettings))
    return () => setTimeout(() => root.unmount(), 0)
}, {
    title: 'Managers',
    icon: 'window',
    color: '#636366',
})
