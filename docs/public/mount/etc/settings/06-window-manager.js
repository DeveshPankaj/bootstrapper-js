// Settings > Window Manager page: themes, appearance, behavior, and saving the
// current look as a theme. See /opt/apps/settings/main.html for the shared
// `'settings'` service (registerSection / utils) this registers against.
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { utils } = platform.getService('settings')
const { fs, DEFAULT_WM_SETTINGS, WM_SETTINGS_PATH, WM_THEMES_DIR, ColorAlphaInput } = utils

// Appearance mode for glass apps and windows (src/system/appearance.ts).
const APPEARANCE_MODES = [
  { id: 'system', label: 'System', icon: 'brightness_auto' },
  { id: 'dark',   label: 'Dark',   icon: 'dark_mode' },
  { id: 'light',  label: 'Light',  icon: 'light_mode' },
  { id: 'time',   label: 'Time',   icon: 'schedule' },
]

const AppearanceModeControl = () => {
  const read = () => {
    try { return platform.host.callCommand('get-appearance-mode') || {} } catch (_) { return {} }
  }
  const [mode, setMode] = React.useState(() => read().mode || 'system')
  const [appearance, setAppearance] = React.useState(() => platform.host.getAppearance?.() || 'dark')
  React.useEffect(() => {
    const sub = platform.host.appearance$?.subscribe(setAppearance)
    return () => sub?.unsubscribe()
  }, [])
  const choose = (id) => {
    try { if (platform.host.callCommand('set-appearance-mode', id) !== false) setMode(id) } catch (_) {}
  }
  const index = Math.max(0, APPEARANCE_MODES.findIndex(m => m.id === mode))
  const hint = {
    system: `Follows your device's setting (now ${appearance}).`,
    time: `Light from 7:00 to 19:00, dark the rest of the day (now ${appearance}).`,
  }[mode]
  return (
    <>
      <div className="vs-segmented" role="radiogroup" aria-label="Appearance mode" style={{ '--count': APPEARANCE_MODES.length, '--index': index }}>
        <div className="vs-segmented-thumb" />
        {APPEARANCE_MODES.map(m => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            className={`vs-segment ${mode === m.id ? 'active' : ''}`}
            onClick={() => choose(m.id)}
          >
            <span className="material-symbols-outlined">{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>
      <p className="settings-hint" style={{ margin: '0.55rem 0.25rem 0', minHeight: '1.2em' }}>{hint || ''}</p>
    </>
  )
}

const WindowManagerSettings = () => {
  const readWmSettings = () => {
    try {
      const raw = JSON.parse(fs.readFileSync(WM_SETTINGS_PATH, 'utf-8'))
      return {
        appearance: { ...DEFAULT_WM_SETTINGS.appearance, ...raw.appearance },
        behavior: { ...DEFAULT_WM_SETTINGS.behavior, ...raw.behavior },
      }
    } catch (err) {
      return DEFAULT_WM_SETTINGS
    }
  }

  const readThemes = () => {
    try {
      if (!fs.existsSync(WM_THEMES_DIR)) return []
      return fs.readdirSync(WM_THEMES_DIR)
        .filter(f => f.endsWith('.json'))
        .map(file => {
          const id = file.replace(/\.json$/, '')
          let raw = {}
          try { raw = JSON.parse(fs.readFileSync(`${WM_THEMES_DIR}/${file}`, 'utf-8')) } catch (err) {}
          return {
            id,
            name: raw.name || id,
            appearance: { ...DEFAULT_WM_SETTINGS.appearance, ...raw.appearance },
          }
        })
    } catch (err) {
      return []
    }
  }

  const [settings, setSettings] = React.useState(readWmSettings)
  const [themes, setThemes] = React.useState(readThemes)
  // current.json keeps the active theme's display name; match it to a theme file.
  const [currentThemeId, setCurrentThemeId] = React.useState(() => {
    try {
      const name = String(JSON.parse(fs.readFileSync(WM_SETTINGS_PATH, 'utf-8')).name || '').toLowerCase()
      return readThemes().find(t => t.id === name || String(t.name).toLowerCase() === name)?.id
    } catch (err) {
      return undefined
    }
  })
  const [themeName, setThemeName] = React.useState('')
  const [saveMessage, setSaveMessage] = React.useState('')

  const persist = (next) => {
    setSettings(next)
    setCurrentThemeId(undefined)
    if (!fs.existsSync('/etc/wm')) fs.mkdirSync('/etc/wm', { recursive: true })
    fs.writeFileSync(WM_SETTINGS_PATH, JSON.stringify(next, null, 2))
    platform.host.callCommand('set-window-manager-settings', next)
  }

  const selectTheme = (theme) => {
    platform.host.callCommand('set-window-manager-theme', theme.id)
    setCurrentThemeId(theme.id)
    setSettings(readWmSettings())
  }

  const setAppearance = (key, value) => {
    persist({ ...settings, appearance: { ...settings.appearance, [key]: value } })
  }

  const setBehavior = (key, value) => {
    persist({ ...settings, behavior: { ...settings.behavior, [key]: value } })
  }

  const resetToDefaults = () => persist(DEFAULT_WM_SETTINGS)

  // Saves the current appearance + behavior as /etc/wm/themes/<id>.json. The id is
  // a slug of the typed name (letters, digits, dashes), so the name can't point the
  // file anywhere else. Shipped themes are refreshed from the server on boot, so a
  // name that's already taken is refused rather than overwritten.
  const saveAsTheme = () => {
    const name = themeName.trim().slice(0, 40)
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    if (!id) { setSaveMessage('Enter a theme name (letters or digits).'); return }
    if (themes.some(t => t.id === id)) { setSaveMessage(`A theme called "${id}" already exists. Pick another name.`); return }
    try {
      if (!fs.existsSync(WM_THEMES_DIR)) fs.mkdirSync(WM_THEMES_DIR, { recursive: true })
      fs.writeFileSync(`${WM_THEMES_DIR}/${id}.json`, JSON.stringify({ name, appearance: settings.appearance, behavior: settings.behavior }, null, 2))
      platform.host.callCommand('set-window-manager-theme', id)
      setThemes(readThemes())
      setCurrentThemeId(id)
      setThemeName('')
      setSaveMessage(`Saved as "${name}".`)
    } catch (err) {
      setSaveMessage(`Could not save: ${err && err.message || err}`)
    }
  }

  const themeCardStyle = (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.65rem 0.9rem',
    margin: '0.4rem 0',
    borderRadius: '16px',
    cursor: 'pointer',
    background: active ? 'var(--vs-fill-3)' : 'var(--vs-fill)',
    boxShadow: active ? 'inset 0 0 0 1.5px var(--vs-selected-rim)' : 'inset 0 0 0 1px var(--vs-stroke)',
    transition: 'background 0.18s',
  })

  const swatchStyle = (appearance) => ({
    width: '2.5rem',
    height: '1.6rem',
    borderRadius: `${Math.min(appearance.borderRadius, 8)}px`,
    background: appearance.windowBackground,
    border: `2px solid ${appearance.headerBackground}`,
    outline: `2px solid ${appearance.accentColor}`,
    flexShrink: 0,
  })

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">Window Manager</h1>
      <p className="settings-page-subtitle">Customize the appearance and behavior of application windows.</p>

      <h3 className="settings-section-title">Themes</h3>
      <AppearanceModeControl />
      <div style={{ height: '0.9rem' }} />
      <div className="settings-group">
        <div className="settings-group-body" style={{padding: '0.6rem 0.8rem', display: 'block'}}>
          {themes.map(theme => (
            <div key={theme.id} style={themeCardStyle(theme.id === currentThemeId)} onClick={() => selectTheme(theme)}>
              <div style={swatchStyle(theme.appearance)} />
              <strong>{theme.name}</strong>
              {theme.id === currentThemeId ? <span style={{marginLeft: 'auto', color: 'var(--vs-text-2)', fontSize: '0.85rem'}}>Active</span> : null}
            </div>
          ))}
        </div>
      </div>

      <h3 className="settings-section-title">Appearance</h3>
      <div className="settings-group">
        <div className="settings-group-body">
          <div className="settings-row">
            <span className="settings-row-label">Title bar background</span>
            <input type="color" value={settings.appearance.headerBackground} onChange={e => setAppearance('headerBackground', e.target.value)} />
          </div>
          <div className="settings-row">
            <span className="settings-row-label">Title bar text color</span>
            <input type="color" value={settings.appearance.headerColor} onChange={e => setAppearance('headerColor', e.target.value)} />
          </div>
          <div className="settings-row">
            <span className="settings-row-label">Window background</span>
            <ColorAlphaInput value={settings.appearance.windowBackground} onChange={v => setAppearance('windowBackground', v)} />
          </div>
          <div className="settings-row">
            <span className="settings-row-label">Taskbar background</span>
            <ColorAlphaInput value={settings.appearance.taskbarBackground} onChange={v => setAppearance('taskbarBackground', v)} />
          </div>
          <div className="settings-row">
            <span className="settings-row-label">Taskbar size ({settings.appearance.taskbarSize}px)</span>
            <input type="range" min="40" max="96" value={settings.appearance.taskbarSize} onChange={e => setAppearance('taskbarSize', Number(e.target.value))} />
          </div>
          <div className="settings-row">
            <span className="settings-row-label">Accent color</span>
            <input type="color" value={settings.appearance.accentColor} onChange={e => setAppearance('accentColor', e.target.value)} />
          </div>
          <div className="settings-row">
            <span className="settings-row-label">Corner radius ({settings.appearance.borderRadius}px)</span>
            <input type="range" min="0" max="24" value={settings.appearance.borderRadius} onChange={e => setAppearance('borderRadius', Number(e.target.value))} />
          </div>
          <div className="settings-row">
            <span className="settings-row-label">Background blur ({settings.appearance.blur}px)</span>
            <input type="range" min="0" max="40" value={settings.appearance.blur} onChange={e => setAppearance('blur', Number(e.target.value))} />
          </div>
          <div className="settings-row">
            <span className="settings-row-label">Drop shadow</span>
            <input type="checkbox" checked={settings.appearance.shadow} onChange={e => setAppearance('shadow', e.target.checked)} />
          </div>
        </div>
      </div>

      <h3 className="settings-section-title">Behavior</h3>
      <div className="settings-group">
        <div className="settings-group-body">
          <div className="settings-row">
            <span className="settings-row-label">Double-click title bar to toggle fullscreen</span>
            <input type="checkbox" checked={settings.behavior.dblClickHeaderFullscreen} onChange={e => setBehavior('dblClickHeaderFullscreen', e.target.checked)} />
          </div>
          <div className="settings-row">
            <span className="settings-row-label">Bring window to front on click</span>
            <input type="checkbox" checked={settings.behavior.bringToFrontOnClick} onChange={e => setBehavior('bringToFrontOnClick', e.target.checked)} />
          </div>
        </div>
      </div>

      <h3 className="settings-section-title">Save as Theme</h3>
      <div className="settings-group">
        <div className="settings-group-body">
          <div className="settings-row" style={{ alignItems: 'center' }}>
            <input
              className="settings-input"
              style={{ flex: 1, marginRight: 8 }}
              value={themeName}
              maxLength={40}
              onChange={e => { setThemeName(e.target.value); setSaveMessage('') }}
              onKeyDown={e => e.key === 'Enter' && saveAsTheme()}
              placeholder="Theme name, e.g. My Theme"
            />
            <button className="settings-btn primary" onClick={saveAsTheme}>Save</button>
          </div>
        </div>
      </div>
      {saveMessage ? <p className="settings-hint" style={{ marginTop: 4 }}>{saveMessage}</p> : null}

      <div style={{ marginTop: '1rem' }}>
        <button className="settings-btn" onClick={resetToDefaults}>Reset to defaults</button>
      </div>

      <p className="settings-hint">
        Selecting a theme or changing a setting writes the active settings to{' '}
        <code>/etc/wm/current.json</code>, which applies to windows immediately. Themes are
        individual files in <code>/etc/wm/themes/</code>. The window title bar style, the dock and
        the desktop icons are under Settings &rsaquo; Managers.
      </p>
    </div>
  )
}

platform.getService('settings').registerSection('06-window-manager', (container, api) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(WindowManagerSettings))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'Window Manager',
  icon: 'palette',
  color: '#ff453a',
})
