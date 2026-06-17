const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')

const WM_VARS = [
  { key: 'headerBg',      label: 'Header background', cssVar: '--wm-header-bg',    type: 'color' },
  { key: 'headerColor',   label: 'Header text',       cssVar: '--wm-header-color', type: 'color' },
  { key: 'windowBg',      label: 'Window background', cssVar: '--wm-window-bg',    type: 'color' },
  { key: 'accent',        label: 'Accent color',      cssVar: '--wm-accent',       type: 'color' },
  { key: 'borderRadius',  label: 'Border radius (px)',cssVar: '--wm-radius',        type: 'number', min: 0, max: 32, unit: 'px' },
  { key: 'blur',          label: 'Blur (px)',         cssVar: '--wm-blur',          type: 'number', min: 0, max: 40, unit: 'px' },
  { key: 'shadow',        label: 'Shadow',            cssVar: '--wm-shadow',        type: 'text' },
]

const readCurrent = () => {
  const fs = platform.host.getFS()
  try { return JSON.parse(fs.readFileSync('/etc/wm/current.json', 'utf8')) } catch (_) { return { appearance: {} } }
}

const ThemeBuilder = () => {
  const [current, setCurrent] = React.useState(readCurrent)
  const [themeName, setThemeName] = React.useState('')
  const [saved, setSaved] = React.useState('')

  const appearance = current.appearance || {}

  const applyVar = (cssVar, value) => {
    document.documentElement.style.setProperty(cssVar, value)
  }

  const updateKey = (key, cssVar, unit, value) => {
    const fullValue = unit ? `${value}${unit}` : value
    const next = { ...current, appearance: { ...appearance, [key]: unit ? Number(value) : value } }
    setCurrent(next)
    applyVar(cssVar, fullValue)
    // Write to current.json live
    try {
      platform.host.callCommand('set-window-manager-settings', next)
    } catch (_) {}
  }

  const saveAsTheme = () => {
    const name = themeName.trim()
    if (!name) { setSaved('Enter a theme name first'); return }
    const fs = platform.host.getFS()
    const themeObj = { name, appearance, behavior: current.behavior || {} }
    try {
      fs.writeFileSync(`/etc/wm/themes/${name}.json`, JSON.stringify(themeObj, null, 2))
      setSaved(`Saved as "${name}"`)
      setThemeName('')
      setTimeout(() => setSaved(''), 3000)
    } catch (e) { setSaved('Error: ' + e.message) }
  }

  const getValue = (key, type) => {
    const v = appearance[key]
    if (v === undefined) {
      // Read from CSS
      const css = getComputedStyle(document.documentElement).getPropertyValue(
        WM_VARS.find(x => x.key === key)?.cssVar || ''
      ).trim()
      return css || ''
    }
    return type === 'number' ? String(v) : v
  }

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">Theme Builder</h1>
      <p className="settings-page-subtitle">Live-edit window manager colors and styles. Changes apply instantly and persist to <code>/etc/wm/current.json</code>.</p>

      <div className="settings-group">
        <div className="settings-group-body">
          {WM_VARS.map(({ key, label, cssVar, type, min, max, unit }) => (
            <div key={key} className="settings-row" style={{ alignItems: 'center' }}>
              <div className="settings-row-text" style={{ flex: 1 }}>
                <div className="settings-row-title">{label}</div>
              </div>
              {type === 'color' ? (
                <input
                  type="color"
                  value={getValue(key, type) || '#000000'}
                  onChange={e => updateKey(key, cssVar, null, e.target.value)}
                  style={{ width: 48, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }}
                />
              ) : type === 'number' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="range" min={min} max={max}
                    value={getValue(key, type) || min}
                    onChange={e => updateKey(key, cssVar, unit, e.target.value)}
                    style={{ width: 120 }}
                  />
                  <span style={{ minWidth: 36, fontSize: 13 }}>{getValue(key, type) || min}{unit}</span>
                </div>
              ) : (
                <input
                  className="settings-input"
                  style={{ maxWidth: 240 }}
                  value={getValue(key, type) || ''}
                  onChange={e => updateKey(key, cssVar, null, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="settings-group" style={{ marginTop: '1rem' }}>
        <div className="settings-group-title">Save as New Theme</div>
        <div className="settings-group-body">
          <div className="settings-row" style={{ alignItems: 'center' }}>
            <input
              className="settings-input"
              style={{ flex: 1, marginRight: 8 }}
              value={themeName}
              onChange={e => setThemeName(e.target.value)}
              placeholder="Theme name (e.g. my-theme)"
              onKeyDown={e => e.key === 'Enter' && saveAsTheme()}
            />
            <button className="settings-btn primary" onClick={saveAsTheme}>Save</button>
          </div>
          {saved ? <p className="settings-hint" style={{ marginTop: 4 }}>{saved}</p> : null}
        </div>
      </div>

      <p className="settings-hint">Themes are saved to <code>/etc/wm/themes/</code> and appear in the Window Manager → Themes section.</p>
    </div>
  )
}

platform.getService('settings').registerSection('14-theme-builder', (container) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(ThemeBuilder))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'Theme Builder',
  icon: 'palette',
  color: '#bf5af2',
})
