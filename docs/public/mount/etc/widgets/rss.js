// RSS Reader Widget — fetches and displays headlines from configurable feed URLs
// Feeds stored in /home/user1/rss-feeds.json
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')

const FEEDS_FILE = '/home/user1/rss-feeds.json'
const fs = platform.host.getFS()

const readFeeds = () => {
  try { return JSON.parse(fs.readFileSync(FEEDS_FILE, 'utf8')) } catch (_) { return [] }
}
const writeFeeds = (list) => { fs.writeFileSync(FEEDS_FILE, JSON.stringify(list, null, 2)) }

const parseRSS = (text) => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'text/xml')
  const title = doc.querySelector('channel > title')?.textContent || 'Feed'
  const items = Array.from(doc.querySelectorAll('item')).slice(0, 8).map(item => ({
    title: item.querySelector('title')?.textContent?.trim() || '(no title)',
    link: item.querySelector('link')?.textContent?.trim() || '',
    date: item.querySelector('pubDate')?.textContent || '',
  }))
  return { title, items }
}

const openUrl = (url) => {
  try { platform.host.callCommand('ui.iframe', url) } catch (_) { window.open(url, '_blank') }
}

const RSSWidget = () => {
  const [feeds, setFeeds] = React.useState(readFeeds)
  const [feedData, setFeedData] = React.useState({}) // url -> { title, items, loading, error }
  const [activeFeed, setActiveFeed] = React.useState(null)
  const [newUrl, setNewUrl] = React.useState('')
  const [showAdd, setShowAdd] = React.useState(false)

  const fetchFeed = async (url) => {
    setFeedData(prev => ({ ...prev, [url]: { ...(prev[url] || {}), loading: true, error: null } }))
    try {
      // Try direct fetch (works for CORS-open feeds)
      const resp = await fetch(url)
      const text = await resp.text()
      const parsed = parseRSS(text)
      setFeedData(prev => ({ ...prev, [url]: { ...parsed, loading: false, error: null } }))
    } catch (e) {
      setFeedData(prev => ({ ...prev, [url]: { title: url, items: [], loading: false, error: 'CORS or network error' } }))
    }
  }

  React.useEffect(() => {
    for (const url of feeds) fetchFeed(url)
    if (feeds.length > 0 && !activeFeed) setActiveFeed(feeds[0])
  }, [feeds.join(',')])

  const addFeed = () => {
    const url = newUrl.trim()
    if (!url || feeds.includes(url)) { setNewUrl(''); setShowAdd(false); return }
    const next = [...feeds, url]
    setFeeds(next); writeFeeds(next)
    setActiveFeed(url)
    setNewUrl(''); setShowAdd(false)
  }

  const removeFeed = (url) => {
    const next = feeds.filter(f => f !== url)
    setFeeds(next); writeFeeds(next)
    if (activeFeed === url) setActiveFeed(next[0] || null)
  }

  const active = activeFeed ? (feedData[activeFeed] || {}) : {}

  const headerStyle = { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid rgba(127,127,127,0.2)', marginBottom: 4 }
  const tabStyle = (url) => ({
    fontSize: 11, padding: '2px 8px', borderRadius: 20, cursor: 'pointer',
    background: url === activeFeed ? 'rgba(127,127,127,0.25)' : 'transparent',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 100,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 4 }}>
      <div style={headerStyle}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, opacity: 0.7 }}>rss_feed</span>
        <div style={{ flex: 1, display: 'flex', gap: 4, overflowX: 'auto' }}>
          {feeds.map(url => {
            const d = feedData[url]
            return (
              <div key={url} title={url} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <div style={tabStyle(url)} onClick={() => setActiveFeed(url)}>{d?.title || url.split('/')[2] || url}</div>
                <span style={{ fontSize: 12, cursor: 'pointer', opacity: 0.5 }} onClick={() => removeFeed(url)}>✕</span>
              </div>
            )
          })}
        </div>
        <span className="material-symbols-outlined" style={{ fontSize: 16, cursor: 'pointer', opacity: 0.7 }} onClick={() => setShowAdd(s => !s)}>
          {showAdd ? 'close' : 'add'}
        </span>
      </div>

      {showAdd && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <input
            style={{ flex: 1, fontSize: 11, padding: '3px 6px', background: 'rgba(127,127,127,0.1)', border: '1px solid rgba(127,127,127,0.3)', borderRadius: 6, color: 'inherit', outline: 'none' }}
            placeholder="RSS feed URL…"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addFeed()}
            autoFocus
          />
          <button style={{ fontSize: 11, padding: '3px 8px', cursor: 'pointer', borderRadius: 6, border: '1px solid rgba(127,127,127,0.3)', background: 'rgba(127,127,127,0.1)', color: 'inherit' }} onClick={addFeed}>Add</button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!activeFeed && feeds.length === 0 && (
          <div style={{ textAlign: 'center', opacity: 0.4, padding: '12px 0', fontSize: 12 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32 }}>rss_feed</span>
            <p style={{ margin: 4 }}>Click + to add an RSS feed</p>
          </div>
        )}
        {active.loading && <div style={{ fontSize: 12, opacity: 0.5, padding: 8 }}>Loading…</div>}
        {active.error && <div style={{ fontSize: 11, color: '#ff3b30', padding: '4px 0' }}>{active.error}</div>}
        {(active.items || []).map((item, i) => (
          <div
            key={i}
            style={{ padding: '4px 0', borderBottom: '1px solid rgba(127,127,127,0.1)', cursor: item.link ? 'pointer' : 'default' }}
            onClick={() => item.link && openUrl(item.link)}
          >
            <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{item.title}</div>
            {item.date && <div style={{ fontSize: 10, opacity: 0.5, marginTop: 1 }}>{new Date(item.date).toLocaleDateString()}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

platform.host.registerWidget('rss', (container, api) => {
  container.style.padding = '0'
  container.style.overflow = 'hidden'
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(RSSWidget))
  api.onDestroy(() => setTimeout(() => root.unmount(), 0))
}, { title: 'RSS Reader', icon: 'rss_feed', defaultWidth: 260, defaultHeight: 280 })
