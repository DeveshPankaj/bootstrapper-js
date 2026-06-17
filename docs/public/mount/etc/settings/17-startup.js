const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')

const INITD_PATH = '/home/user1/initd.run'

// Known apps that can be auto-launched on boot
const KNOWN_APPS = [
  { name: 'ui.file-explorer', label: 'File Explorer', icon: 'folder_open' },
  { name: 'ui.terminal', label: 'Terminal', icon: 'terminal' },
  { name: 'ui.settings', label: 'Settings', icon: 'settings' },
  { name: 'ui.notepad', label: 'Notepad', icon: 'edit_note' },
  { name: 'ui.task-manager', label: 'Task Manager', icon: 'bar_chart' },
  { name: 'ui.imageviewer', label: 'Image Viewer', icon: 'image' },
  { name: 'ui.bookmarks', label: 'Bookmarks', icon: 'bookmarks' },
]

const LAUNCH_PREFIX = "service('001-core.layout', 'open-window') (command('"
const LAUNCH_SUFFIX = "'))"

const parseInitd = (content) => {
  const lines = content.split('\n')
  const enabled = new Set()
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const m = t.match(/command\('([^']+)'\)/)
    if (m) enabled.add(m[1])
  }
  return enabled
}

const buildInitdLine = (name) => `${LAUNCH_PREFIX}${name}${LAUNCH_SUFFIX}`

const StartupApps = () => {
  const fs = platform.host.getFS()

  const readInitd = () => {
    try { return fs.readFileSync(INITD_PATH, 'utf8') } catch (_) { return '' }
  }

  const [content, setContent] = React.useState(readInitd)
  const enabled = React.useMemo(() => parseInitd(content), [content])
  const [saved, setSaved] = React.useState('')

  const toggle = (name) => {
    const current = readInitd()
    const lines = current.split('\n')
    if (enabled.has(name)) {
      // Remove line
      const next = lines.filter(l => !l.includes(`command('${name}')`)).join('\n')
      fs.writeFileSync(INITD_PATH, next)
      setContent(next)
    } else {
      // Add line
      const next = current.trimEnd() + '\n' + buildInitdLine(name) + '\n'
      fs.writeFileSync(INITD_PATH, next)
      setContent(next)
    }
    setSaved('Saved')
    setTimeout(() => setSaved(''), 2000)
  }

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">Startup Apps</h1>
      <p className="settings-page-subtitle">Choose which apps open automatically on boot. Changes write to <code>/home/user1/initd.run</code>.</p>

      <div className="settings-group">
        <div className="settings-group-body">
          {KNOWN_APPS.map(app => (
            <div key={app.name} className="settings-row" style={{ alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ marginRight: 10, opacity: 0.7 }}>{app.icon}</span>
              <div className="settings-row-text" style={{ flex: 1 }}>
                <div className="settings-row-title">{app.label}</div>
                <div className="settings-row-subtitle">{app.name}</div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={enabled.has(app.name)}
                  onChange={() => toggle(app.name)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
              </label>
            </div>
          ))}
        </div>
      </div>

      {saved ? <p className="settings-hint">{saved}</p> : null}

      <div className="settings-group" style={{ marginTop: '1rem' }}>
        <div className="settings-group-title">initd.run contents</div>
        <div className="settings-group-body">
          <textarea
            style={{ width: '100%', minHeight: 120, fontFamily: 'monospace', fontSize: 12, background: 'rgba(0,0,0,0.1)', border: '1px solid rgba(127,127,127,0.3)', borderRadius: 6, padding: '8px', color: 'inherit', boxSizing: 'border-box' }}
            value={content}
            onChange={e => { setContent(e.target.value); fs.writeFileSync(INITD_PATH, e.target.value) }}
          />
        </div>
      </div>
    </div>
  )
}

platform.getService('settings').registerSection('17-startup', (container) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(StartupApps))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'Startup Apps',
  icon: 'rocket_launch',
  color: '#ff9f0a',
})
