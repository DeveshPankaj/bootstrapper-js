const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')

const STATUS_COLORS = {
  active: '#34c759',
  activating: '#ffcc00',
  deactivating: '#ffcc00',
  inactive: '#8e8e93',
  failed: '#ff3b30',
}

const ServicesEditor = () => {
  const [units, setUnits] = React.useState([])
  const [expanded, setExpanded] = React.useState(null)
  const [journal, setJournal] = React.useState([])

  const refresh = () => {
    setUnits(platform.host.callCommand('systemd.list') ?? [])
    if (expanded) setJournal(platform.host.callCommand('systemd.journal', expanded, 20) ?? [])
  }

  React.useEffect(() => {
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [expanded])

  const runAction = (cmd, name) => {
    platform.host.callCommand(cmd, name)
    refresh()
  }

  const toggleLog = (name) => {
    if (expanded === name) { setExpanded(null); return }
    setExpanded(name)
    setJournal(platform.host.callCommand('systemd.journal', name, 20) ?? [])
  }

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">Services</h1>
      <p className="settings-page-subtitle">
        Manage systemd-style units from <code>/etc/systemd/system</code>. Create or edit
        <code>.service</code> unit files directly (via the file explorer or a terminal editor),
        then press Refresh - or run <code>systemctl daemon-reload</code> in a terminal - to pick
        up changes.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="settings-btn" onClick={refresh}>Refresh</button>
      </div>

      <div className="settings-group">
        <div className="settings-group-body">
          {units.map(u => (
            <div key={u.name}>
              <div className="settings-row" style={{ alignItems: 'center' }}>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                  background: STATUS_COLORS[u.status] || '#8e8e93', marginRight: 10,
                }}></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{u.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.65 }}>{u.description || '(no description)'}</div>
                </div>
                <span style={{ fontSize: 11, opacity: 0.6, marginRight: 10, textTransform: 'capitalize' }}>{u.status}</span>
                <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
                  <input
                    type="checkbox"
                    checked={u.enabled}
                    onChange={() => runAction(u.enabled ? 'systemd.disable' : 'systemd.enable', u.name)}
                  />
                  enabled
                </label>
                {(u.status === 'active' || u.status === 'activating')
                  ? <button className="settings-btn" style={{ fontSize: 12, marginRight: 4 }} onClick={() => runAction('systemd.stop', u.name)}>Stop</button>
                  : <button className="settings-btn" style={{ fontSize: 12, marginRight: 4 }} onClick={() => runAction('systemd.start', u.name)}>Start</button>}
                <button className="settings-btn" style={{ fontSize: 12, marginRight: 4 }} onClick={() => runAction('systemd.restart', u.name)}>Restart</button>
                <button className="settings-btn" style={{ fontSize: 12 }} onClick={() => toggleLog(u.name)}>{expanded === u.name ? 'Hide Log' : 'Log'}</button>
              </div>
              {expanded === u.name && (
                <div style={{
                  background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '8px 10px',
                  margin: '4px 0 10px', fontFamily: 'monospace', fontSize: 11,
                  maxHeight: 160, overflowY: 'auto',
                }}>
                  {journal.length
                    ? journal.map((l, i) => <div key={i}>{l}</div>)
                    : <span style={{ opacity: 0.5 }}>No log output yet.</span>}
                  {u.lastError ? <div style={{ color: '#ff6961', marginTop: 4 }}>Error: {u.lastError}</div> : null}
                </div>
              )}
            </div>
          ))}
          {units.length === 0 && <p className="settings-hint">No unit files found in /etc/systemd/system.</p>}
        </div>
      </div>

      <p className="settings-hint" style={{ marginTop: '1rem' }}>
        Units enabled here autostart at boot (equivalent to <code>WantedBy=multi-user.target</code>).
        The terminal's <code>systemctl</code> command performs the same actions from the command line.
      </p>
    </div>
  )
}

platform.getService('settings').registerSection('22-services', (container) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(ServicesEditor))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'Services',
  icon: 'dns',
  color: '#34c759',
})
