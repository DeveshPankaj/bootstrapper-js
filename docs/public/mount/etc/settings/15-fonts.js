const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')

const SYSTEM_FONTS = [
  { label: 'System default', value: '' },
  { label: 'Inter', value: "'Inter', sans-serif", google: 'Inter' },
  { label: 'Roboto', value: "'Roboto', sans-serif", google: 'Roboto' },
  { label: 'Nunito', value: "'Nunito', sans-serif", google: 'Nunito' },
  { label: 'Fira Sans', value: "'Fira+Sans', sans-serif", google: 'Fira+Sans' },
  { label: 'IBM Plex Sans', value: "'IBM+Plex+Sans', sans-serif", google: 'IBM+Plex+Sans' },
]

const MONO_FONTS = [
  { label: 'Courier New (default)', value: 'Courier New, monospace' },
  { label: 'Fira Code', value: "'Fira+Code', monospace", google: 'Fira+Code' },
  { label: 'JetBrains Mono', value: "'JetBrains+Mono', monospace", google: 'JetBrains+Mono' },
  { label: 'Source Code Pro', value: "'Source+Code+Pro', monospace", google: 'Source+Code+Pro' },
  { label: 'Inconsolata', value: "'Inconsolata', monospace", google: 'Inconsolata' },
]

const PREFS_PATH = '/user-preferences.json'

const readPrefs = () => {
  const fs = platform.host.getFS()
  try { return JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8')) } catch (_) { return {} }
}

const writePrefs = (prefs) => {
  const fs = platform.host.getFS()
  fs.writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2))
}

const loadGoogleFont = (family) => {
  if (!family) return
  const id = `gfont-${family.replace(/\+/g, '-')}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;600&display=swap`
  document.head.appendChild(link)
}

const FontSettings = () => {
  const prefs = React.useMemo(readPrefs, [])
  const [uiFont, setUiFont] = React.useState(prefs.uiFont || '')
  const [monoFont, setMonoFont] = React.useState(prefs.monoFont || 'Courier New, monospace')

  const applyUiFont = (value) => {
    setUiFont(value)
    document.documentElement.style.setProperty('--app-font', value || '')
    const prefs = readPrefs()
    writePrefs({ ...prefs, uiFont: value })
    const chosen = SYSTEM_FONTS.find(f => f.value === value)
    if (chosen?.google) loadGoogleFont(chosen.google)
  }

  const applyMonoFont = (value) => {
    setMonoFont(value)
    document.documentElement.style.setProperty('--app-mono-font', value)
    const prefs = readPrefs()
    writePrefs({ ...prefs, monoFont: value })
    const chosen = MONO_FONTS.find(f => f.value === value)
    if (chosen?.google) loadGoogleFont(chosen.google)
  }

  // Apply saved fonts on mount
  React.useEffect(() => {
    if (uiFont) { document.documentElement.style.setProperty('--app-font', uiFont); const f = SYSTEM_FONTS.find(x => x.value === uiFont); if (f?.google) loadGoogleFont(f.google) }
    if (monoFont) { document.documentElement.style.setProperty('--app-mono-font', monoFont); const f = MONO_FONTS.find(x => x.value === monoFont); if (f?.google) loadGoogleFont(f.google) }
  }, [])

  const sampleStyle = { fontFamily: uiFont || 'inherit', padding: '6px 10px', border: '1px solid rgba(127,127,127,0.3)', borderRadius: 6, marginTop: 6, fontSize: 14 }
  const monoStyle = { fontFamily: monoFont || 'monospace', padding: '6px 10px', border: '1px solid rgba(127,127,127,0.3)', borderRadius: 6, marginTop: 6, fontSize: 13 }

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">Fonts</h1>
      <p className="settings-page-subtitle">Choose fonts for the desktop UI and terminal. Changes apply instantly.</p>

      <div className="settings-group">
        <div className="settings-group-title">Desktop UI Font</div>
        <div className="settings-group-body">
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <select className="settings-input" value={uiFont} onChange={e => applyUiFont(e.target.value)} style={{ maxWidth: 260 }}>
              {SYSTEM_FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <div style={sampleStyle}>The quick brown fox jumps over the lazy dog.</div>
          </div>
        </div>
      </div>

      <div className="settings-group" style={{ marginTop: '1rem' }}>
        <div className="settings-group-title">Terminal / Monospace Font</div>
        <div className="settings-group-body">
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <select className="settings-input" value={monoFont} onChange={e => applyMonoFont(e.target.value)} style={{ maxWidth: 260 }}>
              {MONO_FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <div style={monoStyle}>$ echo "Hello, terminal!" → 0x1a 0xff</div>
          </div>
        </div>
      </div>

      <p className="settings-hint">Fonts are loaded from Google Fonts and saved to <code>/user-preferences.json</code>. The terminal reads <code>--app-mono-font</code> on next open.</p>
    </div>
  )
}

platform.getService('settings').registerSection('15-fonts', (container) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(FontSettings))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'Fonts',
  icon: 'text_fields',
  color: '#34c759',
})
