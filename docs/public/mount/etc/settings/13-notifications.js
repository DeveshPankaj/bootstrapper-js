const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')

const NotificationsSettings = () => {
  const [title, setTitle] = React.useState('Hello!')
  const [body, setBody] = React.useState('This is a test notification.')
  const [duration, setDuration] = React.useState(4000)

  const send = () => {
    platform.host.callCommand('notify', { title, body, duration })
  }

  const onKey = (e) => { if (e.key === 'Enter') send() }

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">Notifications</h1>
      <p className="settings-page-subtitle">
        Test the notification system. Toasts appear in the bottom-right corner and dismiss automatically.
      </p>

      <div className="settings-group">
        <div className="settings-group-body">
          <div className="settings-row" style={{ alignItems: 'center' }}>
            <div className="settings-row-text" style={{ flex: 1 }}>
              <div className="settings-row-title">Title</div>
            </div>
            <input
              className="settings-input"
              style={{ maxWidth: 240 }}
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={onKey}
              placeholder="Notification title"
            />
          </div>
          <div className="settings-row" style={{ alignItems: 'center' }}>
            <div className="settings-row-text" style={{ flex: 1 }}>
              <div className="settings-row-title">Body</div>
            </div>
            <input
              className="settings-input"
              style={{ maxWidth: 240 }}
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={onKey}
              placeholder="Notification body (optional)"
            />
          </div>
          <div className="settings-row" style={{ alignItems: 'center' }}>
            <div className="settings-row-text" style={{ flex: 1 }}>
              <div className="settings-row-title">Duration</div>
              <div className="settings-row-subtitle">{(duration / 1000).toFixed(1)}s</div>
            </div>
            <input
              type="range"
              min={1000} max={10000} step={500}
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              style={{ width: 160 }}
            />
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <button className="settings-btn primary" onClick={send}>Send Notification</button>
      </div>

      <p className="settings-hint">
        Call from any vfs script or widget:<br />
        <code>{"platform.host.callCommand('notify', { title, body, duration })"}</code>
      </p>
    </div>
  )
}

platform.getService('settings').registerSection('13-notifications', (container) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(NotificationsSettings))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'Notifications',
  icon: 'notifications',
  color: '#ff9f0a',
})
