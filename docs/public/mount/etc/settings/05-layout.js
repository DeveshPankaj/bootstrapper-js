// Settings > Layout page. See /home/user1/settings.html for the shared
// `'settings'` service (registerSection / utils) this registers against.
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { utils } = platform.getService('settings')
const { fs } = utils

const Layout = () => {
  const readLayouts = () => {
    try {
      return JSON.parse(fs.readFileSync('/etc/wm/layouts.json', 'utf-8')).layouts ?? []
    } catch (err) {
      return []
    }
  }

  const readCurrentLayout = () => {
    try {
      return JSON.parse(fs.readFileSync('/etc/wm/config.json', 'utf-8')).layout ?? 'default'
    } catch (err) {
      return 'default'
    }
  }

  const [layouts] = React.useState(readLayouts);
  const [currentLayout, setCurrentLayout] = React.useState(readCurrentLayout);

  const onSelectLayout = (layoutId) => {
    setCurrentLayout(layoutId);
    platform.host.callCommand('set-layout', layoutId);
  };

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">Layout</h1>
      <p className="settings-page-subtitle">Choose how the desktop, taskbar and windows are arranged.</p>
      <div className="settings-group">
        <div className="settings-group-body">
          {layouts.map(layout => (
            <div key={layout.id} className="settings-row" style={{cursor: 'pointer'}} onClick={() => onSelectLayout(layout.id)}>
              <div className="settings-row-text">
                <div className="settings-row-title">{layout.name}</div>
              </div>
              {layout.id === currentLayout && <span className="material-symbols-outlined" style={{color: '#0a84ff'}}>check</span>}
            </div>
          ))}
        </div>
      </div>
      <p className="settings-hint">
        Layouts are stored in <code>/etc/wm/layouts.json</code> and the active layout in <code>/etc/wm/config.json</code> — edit these files directly to customize or add new layouts.
      </p>
    </div>
  )
}

platform.getService('settings').registerSection('05-layout', (container, api) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(Layout))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'Layout',
  icon: 'dashboard',
  color: '#0a84ff',
})
