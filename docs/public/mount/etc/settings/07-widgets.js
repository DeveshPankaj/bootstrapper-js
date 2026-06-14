// Settings > Widgets page. See /home/user1/settings.html for the shared
// `'settings'` service (registerSection / utils) this registers against.
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { utils } = platform.getService('settings')
const { WidgetPreview, readAvailableWidgets, readEnabledWidgetNames } = utils

const Widgets = () => {
  const available = React.useMemo(readAvailableWidgets, [])
  const [registeredWidgets, setRegisteredWidgets] = React.useState([])
  const [enabled, setEnabledState] = React.useState(() => readEnabledWidgetNames(available))

  React.useEffect(() => {
    const sub = platform.host.widgets$.subscribe(setRegisteredWidgets)
    return () => sub.unsubscribe()
  }, [])

  const toggle = (name) => {
    const next = enabled.includes(name) ? enabled.filter(n => n !== name) : [...enabled, name]
    setEnabledState(next)
    platform.host.callCommand('set-enabled-widgets', next)
  }

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">Widgets</h1>
      <p className="settings-page-subtitle">Choose which desktop widgets are shown. Drag a widget on the desktop to move it.</p>
      <div className="settings-group">
        <div className="settings-group-body">
          {available.map(name => {
            const widget = registeredWidgets.find(w => w.name === name)
            return (
              <div key={name} className="settings-row" style={{alignItems: 'center'}}>
                <div className="settings-row-text">
                  <div className="settings-row-title">{widget?.meta?.title ?? name}</div>
                  {widget ? <WidgetPreview widget={widget} /> : (
                    <div className="settings-row-subtitle">Not registered</div>
                  )}
                </div>
                <input type="checkbox" checked={enabled.includes(name)} onChange={() => toggle(name)} disabled={!widget} />
              </div>
            )
          })}
          {!available.length && (
            <div className="settings-row">
              <span className="settings-row-label">No widget scripts found in /etc/widgets/.</span>
            </div>
          )}
        </div>
      </div>
      <p className="settings-hint">
        Widgets are scripts in <code>/etc/widgets/</code>, loaded at boot. Enabled widgets appear on
        the desktop and can be dragged anywhere &mdash; positions are saved to{' '}
        <code>/etc/widgets/positions.json</code>, and which widgets are shown is saved to{' '}
        <code>/etc/widgets/config.json</code>.
      </p>
    </div>
  )
}

platform.getService('settings').registerSection('07-widgets', (container, api) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(Widgets))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'Widgets',
  icon: 'widgets',
  color: '#30d158',
})
