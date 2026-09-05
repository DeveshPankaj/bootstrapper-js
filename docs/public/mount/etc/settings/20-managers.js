// Settings > Managers page — switch window manager and desktop styles.
const React = platform.getService('React')
const { utils } = platform.getService('settings')
const { fs } = utils

const MANAGERS_PATH = '/etc/managers.json'
const WM_OPTIONS = [
    { id: 'default',  label: 'Default',        icon: 'tune',                desc: 'Built-in header with snap zones and full customisation.' },
    { id: 'classic',  label: 'Classic (macOS)', icon: 'radio_button_checked',desc: 'Traffic-light circles left, centred title — macOS look.' },
    { id: 'minimal',  label: 'Minimal (Win)',   icon: 'crop_square',         desc: 'Title left, square ─ □ ✕ controls right — Windows look.' },
    { id: 'ubuntu',   label: 'Ubuntu (GNOME)',  icon: 'fiber_manual_record', desc: 'App icon + title left, coloured circles right — GNOME look.' },
    { id: 'glass',    label: 'Glass',           icon: 'blur_on',             desc: 'Frosted-glass translucent header with dot controls.' },
    { id: 'tiling',   label: 'Tiling',          icon: 'view_quilt',          desc: 'Auto-tiles windows in a grid — no manual sizing needed.' },
]

const DOCK_OPTIONS = [
    { id: 'default', label: 'Default',      icon: 'dock_to_bottom', desc: 'Dark blur-glass bar — sandboxed app, IPC-only.' },
    { id: 'macos',   label: 'macOS Style',  icon: 'dock',           desc: 'Frosted floating pill with magnification feel.' },
    { id: 'none',    label: 'None (built-in)', icon: 'indeterminate_check_box', desc: 'Use the compiled taskbar (always visible, not sandboxed).' },
]

const readManagers = () => {
    try {
        return JSON.parse(fs.readFileSync(MANAGERS_PATH, 'utf-8'))
    } catch (_) {
        return { windowManager: 'default', dockManager: 'none' }
    }
}

const writeManagers = (cfg) => {
    if (!fs.existsSync('/etc')) fs.mkdirSync('/etc', { recursive: true })
    fs.writeFileSync(MANAGERS_PATH, JSON.stringify(cfg, null, 2))
}

const OptionList = ({ options, activeId, onSelect }) =>
    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        options.map(opt =>
            React.createElement('button', {
                key: opt.id,
                style: {
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', textAlign: 'left', borderRadius: 6,
                    border: activeId === opt.id
                        ? '1.5px solid var(--accent, #0a84ff)'
                        : '1.5px solid transparent',
                    background: activeId === opt.id
                        ? 'color-mix(in srgb, var(--accent, #0a84ff) 12%, transparent)'
                        : 'rgba(128,128,128,0.08)',
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
                    style: { marginLeft: 'auto', fontSize: 16, color: 'var(--accent, #0a84ff)', flexShrink: 0 },
                }, 'check_circle'),
            )
        )
    )

const ManagersSettings = () => {
    const [cfg, setCfg] = React.useState(readManagers)

    const update = (patch) => {
        const next = { ...cfg, ...patch }
        setCfg(next)
        writeManagers(next)
    }

    const openDock = (id) => {
        if (id === 'none') return
        const path = `/opt/apps/dock/${id}.html`
        if (!fs.existsSync(path)) { alert('Dock file not found: ' + path); return }
        platform.host.execCommand(
            `service('001-core.layout','open-window')(command('ui.sandboxed-app'),'${path}')`,
            platform
        )
    }

    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },

        React.createElement('p', { className: 'hint', style: { margin: '0 0 4px' } },
            'Window manager style applies to windows opened after switching. Dock manager opens a sandboxed app — existing dock stays until closed.'
        ),

        React.createElement('p', { className: 'muted-small', style: { marginBottom: 4 } }, 'WINDOW MANAGER'),
        React.createElement(OptionList, {
            options: WM_OPTIONS,
            activeId: cfg.windowManager,
            onSelect: (id) => update({ windowManager: id }),
        }),

        React.createElement('p', { className: 'muted-small', style: { margin: '16px 0 4px' } }, 'DOCK MANAGER'),
        React.createElement(OptionList, {
            options: DOCK_OPTIONS,
            activeId: cfg.dockManager,
            onSelect: (id) => { update({ dockManager: id }); openDock(id); },
        }),

        React.createElement('p', { className: 'hint', style: { margin: '12px 0 0' } },
            'WM files: /opt/wm/<id>.js — export createHeader (and optionally createContainer, setupWindow). ' +
            'Dock files: /opt/apps/dock/<id>.html — sandboxed, uses window.ipc for window info.'
        ),

        React.createElement('p', { className: 'muted-small', style: { margin: '20px 0 6px' } }, 'VFS CONFIGURATION FILES'),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
            [
                { path: '/opt/desktop/manager.js', label: 'Desktop icons renderer', desc: 'Controls how desktop icons are shown. Export render(container, api).' },
                { path: '/etc/contextmenu.json',   label: 'Desktop right-click menu', desc: 'JSON array of { id, type, title, cmd } items for the desktop context menu.' },
                { path: '/etc/taskbar.json',        label: 'Taskbar pinned apps', desc: 'JSON { pinned: ["command-name", ...] } to control which apps appear in the dock.' },
            ].map(({ path, label, desc }) =>
                React.createElement('div', {
                    key: path,
                    style: {
                        background: 'rgba(128,128,128,0.07)',
                        borderRadius: 6,
                        padding: '6px 10px',
                        cursor: 'pointer',
                    },
                    onClick: () => platform.host.execCommand(
                        `service('001-core.layout','open-window')(command('ui.notepad'),'${path}')`,
                        platform
                    ),
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
    const ReactDOM = platform.getService('ReactDOM')
    const root = ReactDOM.createRoot(container)
    root.render(React.createElement(ManagersSettings))
    return () => setTimeout(() => root.unmount(), 0)
}, {
    title: 'Window Manager',
    icon: 'window',
    color: '#636366',
})
