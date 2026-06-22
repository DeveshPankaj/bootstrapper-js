// All Apps Listing — searchable grid of all registered commands
// Accessible via command('ui.app-launcher') or desktop right-click
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')

const AppLauncher = () => {
  const [commands, setCommands] = React.useState([])
  const [filter, setFilter] = React.useState('')
  const inputRef = React.useRef(null)

  React.useEffect(() => {
    // Collect all registered commands from host internals
    const cmds = []
    const seen = new Set()
    try {
      const hostCmds = platform.host._commands || []
      for (const cmd of hostCmds) {
        if (cmd.meta?.callable === false) continue
        if (seen.has(cmd.name)) continue
        seen.add(cmd.name)
        // Skip system/internal commands without titles
        if (!cmd.meta?.title && cmd.name.startsWith('_')) continue
        cmds.push({
          name: cmd.name,
          title: cmd.meta?.title || cmd.name,
          icon: cmd.meta?.icon || 'apps',
          description: cmd.meta?.description || '',
        })
      }
    } catch (_) {}
    setCommands(cmds.sort((a, b) => a.title.localeCompare(b.title)))
    // Focus search input
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const visible = filter
    ? commands.filter(c => c.title.toLowerCase().includes(filter.toLowerCase()) || c.name.toLowerCase().includes(filter.toLowerCase()))
    : commands

  const launch = (name) => {
    try { platform.host.callCommand(name) }
    catch (e) { platform.host.callCommand('notify', { title: 'Error launching ' + name, body: e.message || String(e), duration: 3000 }) }
  }

  const cardStyle = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 6, padding: '14px 10px', borderRadius: 12,
    background: 'rgba(127,127,127,0.08)', cursor: 'pointer', transition: 'background 0.15s',
    textAlign: 'center', minWidth: 80,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 16, boxSizing: 'border-box', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="material-symbols-outlined" style={{ opacity: 0.5 }}>search</span>
        <input
          ref={inputRef}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 18, color: 'inherit' }}
          placeholder="Search apps…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && visible.length === 1) launch(visible[0].name)
            if (e.key === 'Escape') setFilter('')
          }}
        />
        {filter && <button style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: 18 }} onClick={() => setFilter('')}>✕</button>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
          {visible.map(cmd => (
            <div
              key={cmd.name}
              style={cardStyle}
              onClick={() => launch(cmd.name)}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(127,127,127,0.18)'}
              onMouseOut={e => e.currentTarget.style.background = 'rgba(127,127,127,0.08)'}
              title={cmd.name}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 28, opacity: 0.85 }}>{cmd.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.3, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cmd.title}</span>
            </div>
          ))}
        </div>
        {visible.length === 0 && (
          <div style={{ textAlign: 'center', opacity: 0.4, marginTop: 40 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48 }}>search_off</span>
            <p>No apps matching "{filter}"</p>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, opacity: 0.4, textAlign: 'center' }}>{visible.length} app{visible.length !== 1 ? 's' : ''}</div>
    </div>
  )
}

const run = (body, props) => {
  if (!body) {
    platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.app-launcher'))", platform)
    return
  }
  props.setTitle('All Apps')
  body.style.cssText = 'margin:0;height:100%;overflow:hidden;'
  const root = ReactDOM.createRoot(body)
  root.render(React.createElement(AppLauncher))
  props.onDestroy(() => setTimeout(() => root.unmount(), 0))
}

platform.host.registerCommand('ui.app-launcher', run, { title: 'All Apps', icon: 'apps' })
