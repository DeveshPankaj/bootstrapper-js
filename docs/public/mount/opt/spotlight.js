// Spotlight-style launcher — opens on Cmd/Ctrl+Space, searches commands + vfs files.
// Re-read and re-executed on every boot via initd.run / /.initd.run.
const React = platform.getService('React')
const { createRoot } = platform.getService('ReactDOM')
const fs = platform.host.getFS()

const HOME = '/home/user1'
const SEARCH_DIRS = [HOME, '/bin', '/usr/bin', '/etc/settings']

const collectFiles = (dir, depth = 0) => {
  if (depth > 3) return []
  const results = []
  try {
    for (const name of fs.readdirSync(dir)) {
      const path = `${dir}/${name}`
      try {
        const stat = fs.statSync(path)
        if (stat.isDirectory()) results.push(...collectFiles(path, depth + 1))
        else results.push({ label: name, subtitle: path, type: 'file', path })
      } catch (_) {}
    }
  } catch (_) {}
  return results
}

const buildIndex = () => {
  const items = []
  // Registered commands (dedup by name, skip callable:false internals)
  try {
    const cmds = (platform.host.commands$ && platform.host.commands$.getValue) ? platform.host.commands$.getValue() : []
    const seen = new Set()
    for (const cmd of cmds) {
      if (cmd.meta?.callable === false) continue
      if (seen.has(cmd.name)) continue
      seen.add(cmd.name)
      items.push({ label: cmd.meta?.title || cmd.name, subtitle: `command: ${cmd.name}`, type: 'command', cmd })
    }
  } catch (_) {}
  // VFS files
  for (const dir of SEARCH_DIRS) items.push(...collectFiles(dir))
  return items
}

let overlayRoot = null
let overlayContainer = null

const Spotlight = ({ onClose }) => {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState([])
  const [selected, setSelected] = React.useState(0)
  const inputRef = React.useRef(null)
  const indexRef = React.useRef(null)

  React.useEffect(() => { inputRef.current?.focus() }, [])

  const getIndex = () => {
    if (!indexRef.current) indexRef.current = buildIndex()
    return indexRef.current
  }

  React.useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const q = query.toLowerCase()
    const matches = getIndex().filter(item => item.label.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q)).slice(0, 10)
    setResults(matches)
    setSelected(0)
  }, [query])

  const run = (item) => {
    onClose()
    setTimeout(() => {
      try {
        if (item.type === 'command') item.cmd.exec()
        else platform.host.exec(platform, item.path)
      } catch (err) { console.error('spotlight exec error', err) }
    }, 80)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter' && results[selected]) { e.preventDefault(); run(results[selected]) }
  }

  const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 999998,
    background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    paddingTop: '18vh',
  }
  const boxStyle = {
    background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)',
    borderRadius: 16, boxShadow: '0 12px 48px rgba(0,0,0,0.35)',
    width: 520, maxWidth: '90vw', overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  }
  const inputStyle = {
    width: '100%', border: 'none', outline: 'none', background: 'transparent',
    padding: '18px 20px', fontSize: 20, color: '#111',
  }
  const itemStyle = (active) => ({
    padding: '10px 20px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
    background: active ? '#0a84ff' : 'transparent', color: active ? '#fff' : '#222',
  })

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={boxStyle} onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          style={inputStyle}
          placeholder="Search commands, files…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {results.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.1)', maxHeight: 340, overflow: 'auto' }}>
            {results.map((item, i) => (
              <div key={i} style={itemStyle(i === selected)} onMouseEnter={() => setSelected(i)} onClick={() => run(item)}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{item.label}</span>
                <span style={{ fontSize: 11, opacity: 0.65, marginTop: 1 }}>{item.subtitle}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const openSpotlight = () => {
  if (overlayContainer) return
  const topDocument = platform.window.top.document
  overlayContainer = topDocument.createElement('div')
  Object.assign(overlayContainer.style, { position: 'fixed', inset: '0', zIndex: '999997', pointerEvents: 'none' })
  overlayContainer.style.pointerEvents = 'auto'
  topDocument.body.appendChild(overlayContainer)
  overlayRoot = createRoot(overlayContainer)
  const close = () => {
    overlayRoot.unmount()
    overlayContainer.remove()
    overlayContainer = null
    overlayRoot = null
  }
  overlayRoot.render(React.createElement(Spotlight, { onClose: close }))
}

platform.host.registerCommand('spotlight', openSpotlight, { icon: 'search', title: 'Spotlight' })
