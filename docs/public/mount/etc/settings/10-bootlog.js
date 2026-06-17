const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')

const BootLog = () => {
  const log = platform.window.top.__bootLog || []

  if (!log.length) {
    return (
      <div className="settings-page">
        <h1 className="settings-page-title">Boot Log</h1>
        <p className="settings-page-subtitle">No boot log data available. Reload the page to capture a fresh boot.</p>
      </div>
    )
  }

  const total = log.reduce((s, e) => s + (e.durationMs || 0), 0)

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">Boot Log</h1>
      <p className="settings-page-subtitle">Startup phases from the most recent boot. Reload the page to refresh.</p>

      <div className="settings-group">
        <div className="settings-group-body">
          {log.map((entry, i) => (
            <div key={i} className="settings-row" style={{ alignItems: 'center', gap: '0.5rem' }}>
              <div className="settings-row-text" style={{ flex: 1 }}>
                <div className="settings-row-title" style={{ color: entry.error ? '#ff453a' : undefined }}>{entry.label}</div>
                {entry.error ? <div className="settings-row-subtitle" style={{ color: '#ff453a' }}>{entry.error}</div> : null}
              </div>
              <span style={{
                fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums',
                color: entry.durationMs > 1000 ? '#ff9f0a' : '#666',
                minWidth: '4rem', textAlign: 'right',
              }}>
                {entry.durationMs}ms
              </span>
            </div>
          ))}
          <div className="settings-row" style={{ borderTop: '1px solid #e5e5ea', marginTop: '0.25rem', paddingTop: '0.25rem' }}>
            <div className="settings-row-text" style={{ flex: 1 }}>
              <div className="settings-row-title" style={{ fontWeight: 600 }}>Total</div>
            </div>
            <span style={{ fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums', fontWeight: 600, minWidth: '4rem', textAlign: 'right' }}>{total}ms</span>
          </div>
        </div>
      </div>

      <p className="settings-hint">
        Boot phases are recorded in <code>window.__bootLog</code> during startup. Yellow = over 1s.
        Reload the page to capture a fresh sequence.
      </p>
    </div>
  )
}

platform.getService('settings').registerSection('10-bootlog', (container, api) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(BootLog))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'Boot Log',
  icon: 'rocket_launch',
  color: '#34c759',
})
