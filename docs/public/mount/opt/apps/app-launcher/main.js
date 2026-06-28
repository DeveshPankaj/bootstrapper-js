const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const fs = platform.host.getFS()

const FONT_CSS = `
@font-face {
  font-family: 'Material Symbols Outlined';
  font-style: normal;
  font-weight: 100 700;
  src: url(https://fonts.gstatic.com/s/materialsymbolsoutlined/v138/kJEhBvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oFsLjBuVY.woff2) format('woff2');
}
.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal; font-style: normal; font-size: 24px;
  line-height: 1; letter-spacing: normal; text-transform: none;
  display: inline-block; white-space: nowrap; word-wrap: normal;
  direction: ltr; -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
}
`

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
.al-root {
  display: flex; flex-direction: column; height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  color: #e4e4e7; background: #18181b; overflow: hidden;
}
.al-search {
  display: flex; align-items: center; gap: 10px; padding: 14px 16px;
  border-bottom: 1px solid #27272a;
}
.al-search input {
  flex: 1; background: transparent; border: none; outline: none;
  font-size: 17px; color: #e4e4e7;
}
.al-search input::placeholder { color: #52525b; }
.al-grid {
  flex: 1; overflow-y: auto; padding: 12px;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 6px;
  align-content: start;
}
.al-card {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 5px; padding: 12px 6px; border-radius: 10px; cursor: pointer;
  transition: background 0.12s; text-align: center;
}
.al-card:hover { background: rgba(99,102,241,0.12); }
.al-card .material-symbols-outlined { font-size: 28px; opacity: 0.85; }
.al-card-label {
  font-size: 10.5px; font-weight: 500; line-height: 1.3; max-width: 78px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.8;
}
.al-empty {
  text-align: center; opacity: 0.35; margin-top: 48px;
}
.al-status {
  font-size: 10.5px; opacity: 0.35; text-align: center; padding: 8px;
  border-top: 1px solid #27272a;
}
`

const AppLauncher = () => {
  const [commands, setCommands] = React.useState([])
  const [filter, setFilter] = React.useState('')
  const inputRef = React.useRef(null)

  React.useEffect(() => {
    const collect = (hostCmds) => {
      const seen = new Set()
      const cmds = []
      for (const cmd of hostCmds) {
        if (cmd.meta?.callable === false) continue
        if (seen.has(cmd.name)) continue
        seen.add(cmd.name)
        if (!cmd.meta?.title) continue
        cmds.push({
          name: cmd.name,
          title: cmd.meta.title || cmd.name,
          icon: cmd.meta.icon || 'apps',
        })
      }
      return cmds.sort((a, b) => a.title.localeCompare(b.title))
    }

    const sub = platform.host.commands$.subscribe(all => setCommands(collect(all)))
    setTimeout(() => inputRef.current?.focus(), 100)
    return () => sub.unsubscribe()
  }, [])

  const visible = filter
    ? commands.filter(c => c.title.toLowerCase().includes(filter.toLowerCase()) || c.name.toLowerCase().includes(filter.toLowerCase()))
    : commands

  const launch = (name) => {
    try { platform.host.callCommand(name) }
    catch (e) { console.error('launch error', name, e) }
  }

  return (
    <div className="al-root">
      <div className="al-search">
        <span className="material-symbols-outlined" style={{ fontSize: 20, opacity: 0.4 }}>search</span>
        <input ref={inputRef} placeholder="Search apps…" value={filter} onChange={e => setFilter(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && visible.length >= 1) launch(visible[0].name)
            if (e.key === 'Escape') setFilter('')
          }} />
        {filter && <span className="material-symbols-outlined" style={{ fontSize: 18, opacity: 0.4, cursor: 'pointer' }}
          onClick={() => setFilter('')}>close</span>}
      </div>
      <div className="al-grid">
        {visible.map(cmd => (
          <div key={cmd.name} className="al-card" onClick={() => launch(cmd.name)} title={cmd.name}>
            <span className="material-symbols-outlined">{cmd.icon}</span>
            <span className="al-card-label">{cmd.title}</span>
          </div>
        ))}
        {visible.length === 0 && (
          <div className="al-empty" style={{ gridColumn: '1 / -1' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, display: 'block', marginBottom: 8 }}>search_off</span>
            No apps matching "{filter}"
          </div>
        )}
      </div>
      <div className="al-status">{visible.length} app{visible.length !== 1 ? 's' : ''}</div>
    </div>
  )
}

const run = (body, props, ...rest) => {
  if (!body) {
    platform.host.execCommand("service('001-core.layout','open-window')(command('ui.app-launcher'))", platform)
    return
  }
  const doc = body.ownerDocument
  const win = doc.defaultView
  const styles = new win.CSSStyleSheet()
  styles.replaceSync(FONT_CSS + CSS)
  doc.adoptedStyleSheets = [...(doc.adoptedStyleSheets || []), styles]

  props.setTitle('All Apps')
  props.setWindowView(true)
  body.style.cssText = 'margin:0;height:100%;overflow:hidden;'
  const root = ReactDOM.createRoot(body)
  root.render(React.createElement(AppLauncher))
  props.onDestroy(() => setTimeout(() => root.unmount(), 0))
}

platform.host.registerCommand('ui.app-launcher', run, { title: 'All Apps', icon: 'apps', category: 'System' })
