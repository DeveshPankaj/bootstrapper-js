const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')

const PREFS_PATH = '/user-preferences.json'
const readPrefs = () => { try { return JSON.parse(platform.host.getFS().readFileSync(PREFS_PATH, 'utf8')) } catch (_) { return {} } }
const writePrefs = (p) => platform.host.getFS().writeFileSync(PREFS_PATH, JSON.stringify(p, null, 2))

const AppManager = () => {
  const [commands, setCommands] = React.useState([])
  const [filter, setFilter] = React.useState('')
  const [pinned, setPinned] = React.useState(() => readPrefs().pinnedApps || [])

  React.useEffect(() => {
    // Collect all registered commands from the host
    const cmds = []
    const seen = new Set()
    // host.commands is private, but we can probe by iterating known registrations
    // via platform.host internals — or list via the platform service registry
    try {
      const hostCmds = platform.host._commands || []
      for (const cmd of hostCmds) {
        if (seen.has(cmd.name)) continue
        seen.add(cmd.name)
        cmds.push({ name: cmd.name, title: cmd.meta?.title || cmd.name, icon: cmd.meta?.icon || 'apps', description: cmd.meta?.description || '' })
      }
    } catch (_) {}
    setCommands(cmds)
  }, [])

  const togglePin = (name) => {
    const prefs = readPrefs()
    const next = pinned.includes(name) ? pinned.filter(n => n !== name) : [...pinned, name]
    setPinned(next)
    writePrefs({ ...prefs, pinnedApps: next })
    platform.host.callCommand('notify', { title: pinned.includes(name) ? 'Unpinned' : 'Pinned', body: name, duration: 2000 })
  }

  const launch = (name) => {
    try { platform.host.callCommand(name) } catch (e) {
      platform.host.callCommand('notify', { title: 'Error', body: e.message || String(e), duration: 3000 })
    }
  }

  const visible = commands.filter(c => !filter || c.name.includes(filter) || c.title.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">App Manager</h1>
      <p className="settings-page-subtitle">All registered commands. Pin apps to the taskbar or launch them directly.</p>

      <input
        className="settings-input"
        style={{ marginBottom: '1rem', maxWidth: 320 }}
        placeholder="Filter apps…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />

      {visible.length === 0 && (
        <p className="settings-hint">No apps found{filter ? ` matching "${filter}"` : '. Commands register at boot — reload the page if the list is empty.'}.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {visible.map(cmd => (
          <div key={cmd.name} className="settings-row" style={{ alignItems: 'center', padding: '6px 0' }}>
            <span className="material-symbols-outlined" style={{ marginRight: 10, opacity: 0.7 }}>{cmd.icon}</span>
            <div className="settings-row-text" style={{ flex: 1 }}>
              <div className="settings-row-title">{cmd.title}</div>
              <div className="settings-row-subtitle">{cmd.name}</div>
            </div>
            <button
              className={`settings-btn${pinned.includes(cmd.name) ? ' primary' : ''}`}
              style={{ marginRight: 6, fontSize: 12 }}
              title={pinned.includes(cmd.name) ? 'Unpin from taskbar' : 'Pin to taskbar'}
              onClick={() => togglePin(cmd.name)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{pinned.includes(cmd.name) ? 'push_pin' : 'keep'}</span>
            </button>
            <button className="settings-btn" style={{ fontSize: 12 }} onClick={() => launch(cmd.name)}>Launch</button>
          </div>
        ))}
      </div>

      <p className="settings-hint">Pinned apps are stored in <code>/user-preferences.json</code>. Taskbar pin support requires the taskbar command list to read this preference.</p>
    </div>
  )
}

platform.getService('settings').registerSection('16-app-manager', (container) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(AppManager))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'App Manager',
  icon: 'apps',
  color: '#007aff',
})
