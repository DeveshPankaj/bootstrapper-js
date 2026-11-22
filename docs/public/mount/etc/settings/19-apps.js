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
  { value: 'explorer',      appId: 'file-explorer', label: 'Standard', desc: 'Default macOS-style file browser.' },
  { value: 'explorer-sifi', appId: 'explorer-sifi', label: 'Minimal',  desc: 'Clean light theme with warm-beige accents.' },
]

const isAppInstalled = (commandName) => {
  return !!platform.host.getCommand(commandName)
}

// the search term travels as a value, never as DSL source (audit KRN-3)
const openAppManager = (searchTerm) => {
  platform.host.openWindow('ui.pkg-manager', searchTerm)
}

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
        <p className="settings-page-subtitle" style={{marginBottom:'1rem'}}>
          Takes effect on next page reload.
        </p>

        <div style={{display:'flex',flexDirection:'column',gap:'.5rem'}}>
          {EXPLORER_OPTIONS.map(opt => {
            const installed = isAppInstalled(opt.value)
            return (
              <label key={opt.value}
                style={{
                  display:'flex',alignItems:'flex-start',gap:'.85rem',
                  padding:'.8rem 1rem',borderRadius:16,
                  cursor: installed ? 'pointer' : 'default',
                  boxShadow: installed && selected===opt.value ? 'inset 0 0 0 1.5px var(--vs-selected-rim)' : 'inset 0 0 0 1px var(--vs-stroke)',
                  background: installed && selected===opt.value ? 'var(--vs-fill-3)' : 'var(--vs-fill)',
                  opacity: installed ? 1 : 0.7,
                  transition:'background .15s',
                }}>
                <input type="radio" name="default_explorer" value={opt.value}
                  checked={selected===opt.value}
                  disabled={!installed}
                  onChange={()=> installed && save(opt.value)}
                  style={{marginTop:2}} />
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:'0.95rem',color: installed ? 'var(--vs-text)' : 'var(--vs-text-2)'}}>{opt.label}</div>
                  <div style={{fontSize:'0.82rem',color:'var(--vs-text-2)',marginTop:2}}>{opt.desc}</div>
                  {!installed && (
                    <div style={{fontSize:'0.8rem',color:'var(--vs-link)',marginTop:6,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:4}}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); openAppManager(opt.appId) }}>
                      <span className="material-symbols-outlined" style={{fontSize:14}}>download</span>
                      Install from App Manager
                    </div>
                  )}
                </div>
              </label>
            )
          })}
        </div>

        {saved && (
          <p style={{fontSize:'0.82rem',color:'var(--vs-text-2)',marginTop:'.75rem'}}>
            Saved. Reload the page to apply.
          </p>
        )}
      </div>
    </div>
  )
}

platform.getService('settings').registerSection('19-apps', (container, { onDestroy }) => {
  const { createRoot } = platform.getService('ReactDOM')
  const root = createRoot(container)
  root.render(<AppsSettings />)
  onDestroy(() => root.unmount())
}, {
  title: 'Apps',
  icon: 'apps',
})
