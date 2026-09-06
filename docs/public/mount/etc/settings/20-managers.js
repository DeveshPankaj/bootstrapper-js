// Settings > Managers — window manager style, dock manager, desktop environment.
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { utils } = platform.getService('settings')
const { fs, DEFAULT_WM_SETTINGS, WM_SETTINGS_PATH, WM_THEMES_DIR, ColorAlphaInput } = utils

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
]

const readManagers = () => {
    try { return JSON.parse(fs.readFileSync(MANAGERS_PATH, 'utf-8')) }
    catch (_) { return { windowManager: 'default', dockManager: 'default' } }
}

const writeManagers = (cfg) => {
    if (!fs.existsSync('/etc')) fs.mkdirSync('/etc', { recursive: true })
    fs.writeFileSync(MANAGERS_PATH, JSON.stringify(cfg, null, 2))
}

const openDock = (id) => {
    platform.host.callCommand('open-vfs-dock', id)
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

// ─── Dock settings panel ───────────────────────────────────────────────────────

const DockSettingsPanel = () => {
    const [schema, setSchema] = React.useState([])
    const [dockId, setDockId] = React.useState('')

    const refreshSchema = () => {
        try {
            const result = platform.host.callCommand('get-dock-schema')
            if (result && result.schema && result.schema.length) {
                setSchema(result.schema)
                setDockId(result.dockId)
            }
        } catch (_) {}
    }

    React.useEffect(() => {
        refreshSchema()
        // Re-read when dock changes its schema registration.
        const tid = setInterval(refreshSchema, 2000)
        return () => clearInterval(tid)
    }, [])

    if (!schema.length) {
        return React.createElement('p', { className: 'hint', style: { margin: '6px 0' } },
            'No active dock or dock has no configurable settings.'
        )
    }

    const setSetting = (key, value) => {
        setSchema(prev => prev.map(e => e.key === key ? { ...e, value } : e))
        platform.host.callCommand('set-dock-setting', { key, value })
    }

    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        schema.map(entry =>
            React.createElement('div', {
                key: entry.key,
                style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderRadius: 6, background: 'rgba(128,128,128,0.05)' },
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

// ─── Appearance / theme picker ─────────────────────────────────────────────────

const AppearanceSection = ({ settings, setAppearance, setBehavior, resetToDefaults }) => {
    const readThemes = () => {
        try {
            if (!fs.existsSync(WM_THEMES_DIR)) return []
            return fs.readdirSync(WM_THEMES_DIR).filter(f => f.endsWith('.json')).map(file => {
                const id = file.replace(/\.json$/, '')
                let raw = {}
                try { raw = JSON.parse(fs.readFileSync(`${WM_THEMES_DIR}/${file}`, 'utf-8')) } catch (_) {}
                return { id, name: raw.name || id, appearance: { ...DEFAULT_WM_SETTINGS.appearance, ...raw.appearance } }
            })
        } catch (_) { return [] }
    }
    const [themes] = React.useState(readThemes)
    const [currentThemeId, setCurrentThemeId] = React.useState(() => {
        try { return JSON.parse(fs.readFileSync(WM_SETTINGS_PATH, 'utf-8')).name?.toLowerCase() } catch (_) { return undefined }
    })

    const selectTheme = (theme) => { platform.host.callCommand('set-window-manager-theme', theme.id); setCurrentThemeId(theme.id) }

    return React.createElement(React.Fragment, null,
        React.createElement('p', { className: 'muted-small', style: { margin: '16px 0 6px' } }, 'THEME'),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
            themes.map(theme =>
                React.createElement('div', {
                    key: theme.id,
                    style: {
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        borderRadius: 6, cursor: 'pointer',
                        border: theme.id === currentThemeId ? '1.5px solid #0a84ff' : '1.5px solid transparent',
                        background: theme.id === currentThemeId ? 'color-mix(in srgb,#0a84ff 12%,transparent)' : 'rgba(128,128,128,0.08)',
                    },
                    onClick: () => selectTheme(theme),
                },
                    React.createElement('div', { style: { width: 32, height: 20, borderRadius: Math.min(theme.appearance.borderRadius, 6), background: theme.appearance.windowBackground, border: `2px solid ${theme.appearance.headerBackground}`, outline: `2px solid ${theme.appearance.accentColor}`, flexShrink: 0 } }),
                    React.createElement('span', { style: { fontSize: 13 } }, theme.name),
                    theme.id === currentThemeId && React.createElement('span', { className: 'material-symbols-outlined', style: { marginLeft: 'auto', fontSize: 16, color: '#0a84ff' } }, 'check_circle'),
                )
            ),
        ),

        React.createElement('p', { className: 'muted-small', style: { margin: '16px 0 6px' } }, 'APPEARANCE'),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
            [
                ['Title bar background', 'color',    'headerBackground', null],
                ['Title bar text',       'color',    'headerColor',      null],
                ['Window background',    'alpha',    'windowBackground', null],
                ['Taskbar background',   'alpha',    'taskbarBackground',null],
                ['Taskbar size',         'range',    'taskbarSize',      [40,96]],
                ['Accent color',         'color',    'accentColor',      null],
                ['Corner radius',        'range',    'borderRadius',     [0,24]],
                ['Background blur',      'range',    'blur',             [0,40]],
            ].map(([label, type, key, range]) =>
                React.createElement('div', { key, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderRadius: 6, background: 'rgba(128,128,128,0.05)' } },
                    React.createElement('span', { style: { fontSize: 12, opacity: 0.8 } }, `${label}${range ? ` (${settings.appearance[key]}${key === 'taskbarSize' ? 'px' : key === 'blur' ? 'px' : 'px'})` : ''}`),
                    type === 'alpha'
                        ? React.createElement(ColorAlphaInput, { value: settings.appearance[key], onChange: v => setAppearance(key, v) })
                        : React.createElement('input', {
                            type: type === 'range' ? 'range' : 'color',
                            min: range?.[0], max: range?.[1],
                            value: settings.appearance[key],
                            onChange: e => setAppearance(key, type === 'range' ? Number(e.target.value) : e.target.value),
                            style: { width: type === 'range' ? 120 : 'auto' },
                        })
                )
            ),
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderRadius: 6, background: 'rgba(128,128,128,0.05)' } },
                React.createElement('span', { style: { fontSize: 12, opacity: 0.8 } }, 'Drop shadow'),
                React.createElement('input', { type: 'checkbox', checked: settings.appearance.shadow, onChange: e => setAppearance('shadow', e.target.checked) }),
            ),
        ),

        React.createElement('p', { className: 'muted-small', style: { margin: '16px 0 6px' } }, 'BEHAVIOR'),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
            [
                ['Double-click title bar to fullscreen', 'dblClickHeaderFullscreen'],
                ['Bring to front on click',              'bringToFrontOnClick'],
            ].map(([label, key]) =>
                React.createElement('div', { key, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderRadius: 6, background: 'rgba(128,128,128,0.05)' } },
                    React.createElement('span', { style: { fontSize: 12, opacity: 0.8 } }, label),
                    React.createElement('input', { type: 'checkbox', checked: settings.behavior[key], onChange: e => setBehavior(key, e.target.checked) }),
                )
            ),
        ),

        React.createElement('div', { style: { marginTop: 12 } },
            React.createElement('button', { className: 'settings-btn', onClick: resetToDefaults }, 'Reset to defaults'),
        ),
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

    // WM appearance state
    const readWmSettings = () => {
        try {
            const raw = JSON.parse(fs.readFileSync(WM_SETTINGS_PATH, 'utf-8'))
            return { appearance: { ...DEFAULT_WM_SETTINGS.appearance, ...raw.appearance }, behavior: { ...DEFAULT_WM_SETTINGS.behavior, ...raw.behavior } }
        } catch (_) { return DEFAULT_WM_SETTINGS }
    }
    const [wmSettings, setWmSettings] = React.useState(readWmSettings)

    const persistWm = (next) => {
        setWmSettings(next)
        if (!fs.existsSync('/etc/wm')) fs.mkdirSync('/etc/wm', { recursive: true })
        fs.writeFileSync(WM_SETTINGS_PATH, JSON.stringify(next, null, 2))
        platform.host.callCommand('set-window-manager-settings', next)
    }
    const setAppearance = (key, value) => persistWm({ ...wmSettings, appearance: { ...wmSettings.appearance, [key]: value } })
    const setBehavior   = (key, value) => persistWm({ ...wmSettings, behavior:   { ...wmSettings.behavior,   [key]: value } })
    const resetToDefaults = () => persistWm(DEFAULT_WM_SETTINGS)

    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },

        // ── Theme + Appearance ──
        React.createElement(AppearanceSection, { settings: wmSettings, setAppearance, setBehavior, resetToDefaults }),

        // ── Window Manager style ──
        React.createElement('p', { className: 'muted-small', style: { margin: '20px 0 4px' } }, 'WINDOW CHROME'),
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
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 6, background: 'rgba(128,128,128,0.05)', marginTop: 6 },
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
        React.createElement(DockSettingsPanel),

        // ── VFS config files ──
        React.createElement('p', { className: 'muted-small', style: { margin: '20px 0 6px' } }, 'VFS CONFIGURATION FILES'),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
            [
                { path: '/opt/desktop/manager.js', label: 'Desktop icons renderer', desc: 'Export render(container, api). Edit to customise desktop icons.' },
                { path: '/etc/contextmenu.json',   label: 'Desktop context menu',   desc: 'JSON array of { id, type, title, cmd } items.' },
                { path: '/etc/taskbar.json',        label: 'Taskbar pinned apps',    desc: 'JSON { pinned: ["command-name", ...] }.' },
                { path: '/opt/window-manager.js',  label: 'WM behavior script',     desc: 'Per-window event wiring; re-read on every new window.' },
            ].map(({ path, label, desc }) =>
                React.createElement('div', {
                    key: path,
                    style: { background: 'rgba(128,128,128,0.07)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' },
                    onClick: () => platform.host.execCommand(`service('001-core.layout','open-window')(command('ui.notepad'),'${path}')`, platform),
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
