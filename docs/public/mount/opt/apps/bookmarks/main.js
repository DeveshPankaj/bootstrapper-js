// URL Launcher / Bookmarks — saved list of URLs that open in ui.iframe windows
// Registered as command('ui.bookmarks')
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')

const BOOKMARKS_FILE = '/home/user1/bookmarks.json'
const fs = platform.host.getFS()

const readBookmarks = () => {
  try { return JSON.parse(fs.readFileSync(BOOKMARKS_FILE, 'utf8')) }
  catch (_) { return [] }
}

const writeBookmarks = (list) => {
  fs.writeFileSync(BOOKMARKS_FILE, JSON.stringify(list, null, 2))
}

const getFavicon = (url) => {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32` }
  catch (_) { return null }
}

const BookmarksApp = () => {
  const [items, setItems] = React.useState(readBookmarks)
  const [form, setForm] = React.useState({ title: '', url: '' })
  const [editing, setEditing] = React.useState(null)
  const [showAdd, setShowAdd] = React.useState(false)

  const persist = (list) => { setItems(list); writeBookmarks(list) }

  // A bookmark opens in a Browser window: the URL travels as a value to ui.iframe (which
  // gives cross-origin pages a restrictive sandbox and no referrer). If that fails, a new
  // tab that can't reach this window — noopener,noreferrer, so the site gets no
  // window.opener to post IPC messages to (audit APP-9). http(s) only: bookmarks.json is
  // writable by other apps, so a stored javascript:/data: URL is never opened.
  const openUrl = (url) => {
    let parsed
    try { parsed = new URL(url) } catch (_) { parsed = null }
    if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
      try { platform.host.callCommand('notify', { title: 'Bookmark not opened', body: `Only http(s) links can be opened: ${String(url).slice(0, 80)}`, duration: 4000 }) } catch (_) {}
      return
    }
    try { platform.host.openWindow('ui.iframe', parsed.href) }
    catch (_) { window.top.open(parsed.href, '_blank', 'noopener,noreferrer') }
  }

  const add = () => {
    if (!form.url.trim()) return
    const url = form.url.startsWith('http') ? form.url : 'https://' + form.url
    const newItem = { id: Date.now(), title: form.title.trim() || url, url }
    persist([...items, newItem])
    setForm({ title: '', url: '' })
    setShowAdd(false)
  }

  const remove = (id) => persist(items.filter(b => b.id !== id))

  const startEdit = (item) => { setEditing(item.id); setForm({ title: item.title, url: item.url }) }

  const commitEdit = () => {
    if (!form.url.trim()) return
    const url = form.url.startsWith('http') ? form.url : 'https://' + form.url
    persist(items.map(b => b.id === editing ? { ...b, title: form.title.trim() || url, url } : b))
    setEditing(null)
    setForm({ title: '', url: '' })
  }

  const cardStyle = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(127,127,127,0.08)', marginBottom: 6, cursor: 'pointer' }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, flex: 1, fontSize: 18, fontWeight: 600 }}>Bookmarks</h2>
        <button className="settings-btn primary" onClick={() => setShowAdd(s => !s)}>+ Add</button>
      </div>

      {showAdd && (
        <div style={{ background: 'rgba(127,127,127,0.1)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
            <input className="settings-input" placeholder="Title (optional)" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <input className="settings-input" placeholder="URL (e.g. https://example.com)" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} onKeyDown={e => e.key === 'Enter' && add()} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="settings-btn primary" onClick={add}>Add</button>
              <button className="settings-btn" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 && !showAdd && (
        <div style={{ textAlign: 'center', opacity: 0.5, marginTop: 40 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48 }}>bookmarks</span>
          <p>No bookmarks yet. Click "+ Add" to save your first URL.</p>
        </div>
      )}

      {items.map(item => editing === item.id ? (
        <div key={item.id} style={{ ...cardStyle, flexDirection: 'column', alignItems: 'stretch', cursor: 'default' }}>
          <input className="settings-input" placeholder="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <input className="settings-input" placeholder="URL" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} onKeyDown={e => e.key === 'Enter' && commitEdit()} />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="settings-btn primary" onClick={commitEdit}>Save</button>
            <button className="settings-btn" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div key={item.id} style={cardStyle} onClick={() => openUrl(item.url)}>
          {getFavicon(item.url) && <img src={getFavicon(item.url)} width={20} height={20} style={{ borderRadius: 4, flexShrink: 0 }} onError={e => { e.target.style.visibility = 'hidden'; }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
            <div style={{ fontSize: 11, opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.url}</div>
          </div>
          <button className="settings-btn" style={{ flexShrink: 0, fontSize: 11 }} onClick={e => { e.stopPropagation(); startEdit(item) }}>Edit</button>
          <button className="settings-btn" style={{ flexShrink: 0, fontSize: 11 }} onClick={e => { e.stopPropagation(); remove(item.id) }}>✕</button>
        </div>
      ))}
    </div>
  )
}

const run = (body, props) => {
  if (!body) {
    platform.host.openWindow('ui.bookmarks')
    return
  }
  props.setTitle('Bookmarks')
  props.setWindowView(true)
  body.style.cssText = 'margin:0;height:100%;overflow:hidden;'
  const root = ReactDOM.createRoot(body)
  root.render(React.createElement(BookmarksApp))
  props.onDestroy(() => setTimeout(() => root.unmount(), 0))
}

platform.host.registerCommand('ui.bookmarks', run, { title: 'Bookmarks', icon: 'bookmarks' })
