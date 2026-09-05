// Settings > Managers — window manager style, dock manager, desktop environment.
// Merged from 04b-desktop-env.js; that section is now empty.
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
]

const DOCK_OPTIONS = [
    { id: 'none',    label: 'None (built-in)', icon: 'indeterminate_check_box', desc: 'Use the compiled taskbar — always visible, not sandboxed.' },
    { id: 'default', label: 'Default',         icon: 'dock_to_bottom',          desc: 'Dark blur-glass bar — sandboxed, IPC-only.' },
    { id: 'macos',   label: 'macOS Style',     icon: 'dock',                    desc: 'Frosted floating pill with icon magnification.' },
]

const readManagers = () => {
    try { return JSON.parse(fs.readFileSync(MANAGERS_PATH, 'utf-8')) }
    catch (_) { return { windowManager: 'default', dockManager: 'none' } }
}

const writeManagers = (cfg) => {
    if (!fs.existsSync('/etc')) fs.mkdirSync('/etc', { recursive: true })
    fs.writeFileSync(MANAGERS_PATH, JSON.stringify(cfg, null, 2))
}

const openDock = (id) => {
    // Delegates to the compiled open-vfs-dock command which injects a fixed iframe.
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

// ─── Desktop Environment picker ───────────────────────────────────────────────

const DE_PREVIEWS = {
    macos:   { icon: 'laptop_mac',      gradient: 'linear-gradient(135deg,#667eea,#764ba2)', taskbar: 'bottom-center', buttons: 'left-circles' },
    windows: { icon: 'desktop_windows', gradient: 'linear-gradient(135deg,#0078d4,#005a9e)', taskbar: 'bottom-full',   buttons: 'right-icons'  },
    linux:   { icon: 'terminal',        gradient: 'linear-gradient(135deg,#3584e4,#1c71d8)', taskbar: 'top-full',      buttons: 'right-circles' },
}

const PreviewCard = ({ de, isActive, onClick }) => {
    const p = DE_PREVIEWS[de.id] || DE_PREVIEWS.macos
    const circle = (c) => React.createElement('div', { style: { width: 5, height: 5, borderRadius: '50%', background: c } })
    const square = () => React.createElement('div', { style: { width: 6, height: 6, borderRadius: de.id === 'linux' ? '50%' : '1px', background: 'rgba(255,255,255,0.3)' } })

    return React.createElement('div', {
        onClick,
        style: {
            cursor: 'pointer', borderRadius: 12,
            border: isActive ? '2px solid #0a84ff' : '2px solid rgba(255,255,255,0.08)',
            overflow: 'hidden', background: '#1a1a1a', transition: 'border-color .2s',
        },
    },
        React.createElement('div', {
            style: { height: 120, background: p.gradient, position: 'relative', display: 'flex', flexDirection: 'column', padding: 8 },
        },
            p.taskbar === 'top-full' && React.createElement('div', {
                style: { height: 14, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', padding: '0 6px', gap: 3, fontSize: 7, color: 'rgba(255,255,255,0.7)' },
            }, 'Activities', React.createElement('span', { style: { flex: 1 } })),
            React.createElement('div', { style: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 8 } },
                React.createElement('div', {
                    style: { width: '70%', height: '80%', background: 'rgba(255,255,255,0.15)', borderRadius: de.id === 'linux' ? 8 : de.id === 'windows' ? 4 : 6, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
                },
                    React.createElement('div', {
                        style: { height: 14, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', padding: '0 4px', justifyContent: p.buttons === 'left-circles' ? 'flex-start' : 'flex-end', gap: 2 },
                    }, p.buttons === 'left-circles' ? [circle('#ff5f57'), circle('#febc2e'), circle('#28c840')] : [square(), square(), square()])
                )
            ),
            (p.taskbar === 'bottom-center' || p.taskbar === 'bottom-full') && React.createElement('div', {
                style: { height: 16, background: 'rgba(0,0,0,0.4)', borderRadius: p.taskbar === 'bottom-center' ? 8 : 0, margin: p.taskbar === 'bottom-center' ? '0 auto' : 0, width: p.taskbar === 'bottom-center' ? '50%' : '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '0 6px' },
            }, [1,2,3,4].map(i => React.createElement('div', { key: i, style: { width: 8, height: 8, borderRadius: 2, background: 'rgba(255,255,255,0.4)' } }))),
        ),
        React.createElement('div', { style: { padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 } },
            React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 20, background: p.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } }, p.icon),
            React.createElement('div', {},
                React.createElement('div', { style: { fontWeight: 600, fontSize: '0.85rem' } }, de.name),
                React.createElement('div', { style: { fontSize: '0.72rem', opacity: 0.5, marginTop: 2 } }, de.description),
            ),
            isActive && React.createElement('span', { className: 'material-symbols-outlined', style: { marginLeft: 'auto', color: '#0a84ff', fontSize: 18 } }, 'check_circle'),
        ),
    )
}

// ─── Layout picker ─────────────────────────────────────────────────────────────

const LayoutSection = () => {
    const readLayouts = () => { try { return JSON.parse(fs.readFileSync('/etc/wm/layouts.json', 'utf-8')).layouts ?? [] } catch (_) { return [] } }
    const readCurrentLayout = () => { try { return JSON.parse(fs.readFileSync('/etc/wm/config.json', 'utf-8')).layout ?? 'default' } catch (_) { return 'default' } }
    const [layouts] = React.useState(readLayouts)
    const [currentLayout, setCurrentLayout] = React.useState(readCurrentLayout)

    const onSelectLayout = (id) => { setCurrentLayout(id); platform.host.callCommand('set-layout', id) }

    return React.createElement(React.Fragment, null,
        React.createElement('p', { className: 'muted-small', style: { margin: '16px 0 6px' } }, 'LAYOUT'),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
            layouts.map(layout =>
                React.createElement('div', {
                    key: layout.id,
                    style: {
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                        background: layout.id === currentLayout ? 'color-mix(in srgb,#0a84ff 12%,transparent)' : 'rgba(128,128,128,0.08)',
                        border: layout.id === currentLayout ? '1.5px solid #0a84ff' : '1.5px solid transparent',
                    },
                    onClick: () => onSelectLayout(layout.id),
                },
                    React.createElement('span', { style: { fontSize: 13 } }, layout.name),
                    layout.id === currentLayout && React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 16, color: '#0a84ff' } }, 'check_circle'),
                )
            ),
        ),
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

    // DE state
    const envs = platform.host.callCommand('get-desktop-envs') || []
    const [currentEnv, setCurrentEnv] = React.useState(() => platform.host.callCommand('get-current-desktop-env'))

    // WM appearance state
    const readWmSettings = () => {
        try {
            const raw = JSON.parse(fs.readFileSync(WM_SETTINGS_PATH, 'utf-8'))
            return { appearance: { ...DEFAULT_WM_SETTINGS.appearance, ...raw.appearance }, behavior: { ...DEFAULT_WM_SETTINGS.behavior, ...raw.behavior } }
        } catch (_) { return DEFAULT_WM_SETTINGS }
    }
    const [wmSettings, setWmSettings] = React.useState(readWmSettings)

    const onSelectDE = (envId) => {
        setCurrentEnv(envId)
        platform.host.callCommand('set-desktop-env', envId)
        setWmSettings(readWmSettings())
    }

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

        // ── Desktop Environment ──
        React.createElement('p', { className: 'hint', style: { margin: '0 0 6px' } },
            'Pick a desktop environment preset, then fine-tune layout, theme, and window style below.'
        ),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12, marginBottom: 8 } },
            envs.map(de => React.createElement(PreviewCard, { key: de.id, de, isActive: de.id === currentEnv, onClick: () => onSelectDE(de.id) }))
        ),

        // ── Layout ──
        React.createElement(LayoutSection),

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
