// Settings > Managers page — switch window manager and desktop styles.
const React = platform.getService('React')
const { utils } = platform.getService('settings')
const { fs } = utils

const MANAGERS_PATH = '/etc/managers.json'
const WM_OPTIONS = [
    { id: 'default',  label: 'Default',        icon: 'tune',          desc: 'Built-in header with snap zones and full customisation.' },
    { id: 'classic',  label: 'Classic (macOS)', icon: 'radio_button_checked', desc: 'Traffic-light circles left, centred title — macOS look.' },
    { id: 'minimal',  label: 'Minimal (Win)',   icon: 'crop_square',   desc: 'Title left, square ─ □ ✕ controls right — Windows look.' },
    { id: 'ubuntu',   label: 'Ubuntu (GNOME)',  icon: 'fiber_manual_record', desc: 'App icon + title left, coloured circles right — GNOME look.' },
    { id: 'glass',    label: 'Glass',           icon: 'blur_on',       desc: 'Frosted-glass translucent header with dot controls.' },
]

const readManagers = () => {
    try {
        return JSON.parse(fs.readFileSync(MANAGERS_PATH, 'utf-8'))
    } catch (_) {
        return { windowManager: 'default' }
    }
}

const writeManagers = (cfg) => {
    if (!fs.existsSync('/etc')) fs.mkdirSync('/etc', { recursive: true })
    fs.writeFileSync(MANAGERS_PATH, JSON.stringify(cfg, null, 2))
}

const ManagersSettings = () => {
    const [cfg, setCfg] = React.useState(readManagers)

    const selectWm = (id) => {
        const next = { ...cfg, windowManager: id }
        setCfg(next)
        writeManagers(next)
    }

    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },

        React.createElement('p', { className: 'hint', style: { margin: '0 0 4px' } },
            'Window manager style applies to windows opened after switching — existing windows keep their current chrome until they are closed and reopened.'
        ),

        React.createElement('p', { className: 'muted-small', style: { marginBottom: 4 } }, 'WINDOW MANAGER'),

        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
            WM_OPTIONS.map(opt =>
                React.createElement('button', {
                    key: opt.id,
                    className: cfg.windowManager === opt.id ? 'active' : '',
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        textAlign: 'left',
                        borderRadius: 6,
                        border: cfg.windowManager === opt.id
                            ? '1.5px solid var(--accent, #0a84ff)'
                            : '1.5px solid transparent',
                        background: cfg.windowManager === opt.id
                            ? 'color-mix(in srgb, var(--accent, #0a84ff) 12%, transparent)'
                            : 'rgba(128,128,128,0.08)',
                        cursor: 'pointer',
                        width: '100%',
                    },
                    onClick: () => selectWm(opt.id),
                },
                    React.createElement('span', {
                        className: 'material-symbols-outlined',
                        style: { fontSize: 20, opacity: 0.7, flexShrink: 0 },
                    }, opt.icon),
                    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 1 } },
                        React.createElement('span', { style: { fontWeight: 500, fontSize: 13 } }, opt.label),
                        React.createElement('span', { style: { fontSize: 11, opacity: 0.6 } }, opt.desc),
                    ),
                    cfg.windowManager === opt.id && React.createElement('span', {
                        className: 'material-symbols-outlined',
                        style: { marginLeft: 'auto', fontSize: 16, color: 'var(--accent, #0a84ff)', flexShrink: 0 },
                    }, 'check_circle'),
                )
            )
        ),

        React.createElement('p', { className: 'hint', style: { margin: '12px 0 0' } },
            'Custom WM files live in /opt/wm/<id>.js — create your own by exporting createHeader (and optionally createContainer) from a file there, then add an entry here.'
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
