// Settings > Apps page — lets users choose the default file explorer.
const React = platform.getService('React')
const { utils } = platform.getService('settings')
const { fs } = utils

const PREFS_PATH = '/user-preferences.json'

const readPrefs = () => {
  try { return JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8') || '{}') } catch (_) { return {} }
}
const writePrefs = (prefs) => {
  fs.writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2))
}

const EXPLORER_OPTIONS = [
  { value: 'explorer',      label: 'Standard',        desc: 'Default macOS-style file browser.' },
  { value: 'explorer-sifi', label: 'Minimal',          desc: 'Clean light theme with warm-beige accents.' },
]

const AppsSettings = () => {
  const prefs = readPrefs()
  const [selected, setSelected] = React.useState(prefs.default_explorer || 'explorer')
  const [saved, setSaved] = React.useState(false)

  const save = (value) => {
    setSelected(value)
    const updated = { ...readPrefs(), default_explorer: value }
    writePrefs(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">Apps</h1>

      <div className="settings-section">
        <h2 className="settings-section-title">Default File Explorer</h2>
        <p style={{fontSize:13,color:'#666',marginBottom:'1rem',marginTop:0}}>
          Takes effect on next page reload.
        </p>

        <div style={{display:'flex',flexDirection:'column',gap:'.5rem'}}>
          {EXPLORER_OPTIONS.map(opt => (
            <label key={opt.value}
              style={{
                display:'flex',alignItems:'flex-start',gap:'.75rem',
                padding:'.65rem .85rem',borderRadius:6,cursor:'pointer',
                border:`1.5px solid ${selected===opt.value?'#b09070':'#e8e8e8'}`,
                background:selected===opt.value?'#faf6f1':'#fff',
                transition:'border-color .15s,background .15s',
              }}>
              <input type="radio" name="default_explorer" value={opt.value}
                checked={selected===opt.value}
                onChange={()=>save(opt.value)}
                style={{marginTop:2,accentColor:'#b09070'}} />
              <div>
                <div style={{fontWeight:500,fontSize:13.5,color:'#1c1c1e'}}>{opt.label}</div>
                <div style={{fontSize:12,color:'#888',marginTop:2}}>{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>

        {saved && (
          <p style={{fontSize:12,color:'#888',marginTop:'.75rem'}}>
            Saved. Reload the page to apply.
          </p>
        )}
      </div>
    </div>
  )
}

platform.getService('settings').registerSection('apps', (container, { onDestroy }) => {
  const { createRoot } = platform.getService('ReactDOM')
  const root = createRoot(container)
  root.render(<AppsSettings />)
  onDestroy(() => root.unmount())
}, {
  title: 'Apps',
  icon: 'apps',
})
