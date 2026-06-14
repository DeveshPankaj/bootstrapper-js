// Settings > Window Manager page. See /home/user1/settings.html for the
// shared `'settings'` service (registerSection / utils) this registers against.
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { utils } = platform.getService('settings')
const { fs, DEFAULT_WM_SETTINGS, WM_SETTINGS_PATH, WM_THEMES_DIR, ColorAlphaInput } = utils

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
  const [themes] = React.useState(readThemes)
  const [currentThemeId, setCurrentThemeId] = React.useState(() => {
    try {
      return JSON.parse(fs.readFileSync(WM_SETTINGS_PATH, 'utf-8')).name?.toLowerCase()
    } catch (err) {
      return undefined
    }
  })

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

  const themeCardStyle = (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.6rem 0.8rem',
    margin: '0.4rem 0',
    border: active ? '2px solid #0a84ff' : '1px solid #e5e5ea',
    borderRadius: '10px',
    cursor: 'pointer',
    background: active ? '#eaf2ff' : 'white',
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
      <div className="settings-group">
        <div className="settings-group-body" style={{padding: '0.6rem 0.8rem', display: 'block'}}>
          {themes.map(theme => (
            <div key={theme.id} style={themeCardStyle(theme.id === currentThemeId)} onClick={() => selectTheme(theme)}>
              <div style={swatchStyle(theme.appearance)} />
              <strong>{theme.name}</strong>
              {theme.id === currentThemeId ? <span style={{marginLeft: 'auto', color: '#0a84ff'}}>(active)</span> : null}
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

      <div style={{ marginTop: '1rem' }}>
        <button className="settings-btn" onClick={resetToDefaults}>Reset to defaults</button>
      </div>

      <p className="settings-hint">
        Selecting a theme or changing a toggle writes the active settings to{' '}
        <code>/etc/wm/current.json</code>, which applies to windows immediately. Themes are stored as
        individual files in <code>/etc/wm/themes/</code> &mdash; add your own JSON files there to make
        them available here. For deeper customization (e.g. new window behaviors), edit{' '}
        <code>/opt/window-manager.js</code> in the file explorer &mdash; it is re-loaded every time a
        window is opened.
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
