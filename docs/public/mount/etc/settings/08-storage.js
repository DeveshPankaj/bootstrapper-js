// Settings > Storage page. See /home/user1/settings.html for the shared
// `'settings'` service (registerSection / utils) this registers against.
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { utils } = platform.getService('settings')
const { fs, origin, FS_BACKEND_STORAGE_KEY, FS_BACKEND_QUERY_PARAM, FS_BACKEND_OPTIONS } = utils

const META_FILE_SERVER_PATH = '/public/mount/meta.json'

const StorageSettings = () => {
  const active = localStorage.getItem(FS_BACKEND_STORAGE_KEY) || 'indexeddb'
  const [selected, setSelected] = React.useState(active)
  const [reloadingFiles, setReloadingFiles] = React.useState(false)
  const [reloadStatus, setReloadStatus] = React.useState('')

  const apply = () => {
    localStorage.setItem(FS_BACKEND_STORAGE_KEY, selected)
    const top = platform.window.top
    const url = new URL(top.location.href)
    url.searchParams.set(FS_BACKEND_QUERY_PARAM, selected)
    top.location.href = url.toString()
  }

  const forceReloadAllFiles = async () => {
    if (!confirm(
      'This will re-download every file listed in meta.json from the server, ' +
      'overwriting any local edits (including user-editable files under /home/user1, ' +
      '/etc, /opt), then reload the page. Continue?'
    )) return

    setReloadingFiles(true)
    setReloadStatus('Fetching meta.json...')
    try {
      const metaFiles = await (await fetch(`${origin}${META_FILE_SERVER_PATH}`)).json()
      for (let i = 0; i < metaFiles.length; i++) {
        const item = metaFiles[i]
        setReloadStatus(`Reloading ${item.path} (${i + 1}/${metaFiles.length})...`)
        try {
          const fileUrl = item.file.startsWith('http')
            ? item.file
            : `${origin}/public/mount${item.file.startsWith('/') ? '' : '/'}${item.file}`
          const fileData = await (await fetch(fileUrl)).arrayBuffer()
          const dir = item.path.slice(0, item.path.lastIndexOf('/')) || '/'
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(item.path, Buffer.from(fileData))
        } catch (err) {
          console.error(`Failed to reload ${item.path}`, err)
        }
      }
      setReloadStatus('Reloading page...')
      platform.window.top.location.reload()
    } catch (err) {
      setReloadingFiles(false)
      setReloadStatus(`Failed: ${err.message}`)
    }
  }

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">Storage</h1>
      <p className="settings-page-subtitle">Choose where the virtual filesystem is persisted. Switching reloads the desktop.</p>

      <div className="settings-group">
        <div className="settings-group-body" style={{padding: '0.6rem 0.8rem', display: 'block'}}>
          {FS_BACKEND_OPTIONS.map(opt => (
            <label key={opt.id} style={{display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.5rem 0', cursor: 'pointer'}}>
              <input type="radio" name="fs-backend" checked={selected === opt.id} onChange={() => setSelected(opt.id)} style={{marginTop: '0.2rem'}} />
              <span>
                <strong>{opt.label}</strong>
                {opt.id === active ? <span style={{marginLeft: '0.5rem', color: '#0a84ff'}}>(active)</span> : null}
                <div style={{fontSize: '0.8rem', color: '#666'}}>{opt.desc}</div>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div style={{marginTop: '1rem'}}>
        <button className="settings-btn" onClick={apply} disabled={selected === active}>Switch &amp; Reload</button>
      </div>

      <p className="settings-hint">
        The active backend is stored under the <code>{FS_BACKEND_STORAGE_KEY}</code> key in this browser's
        localStorage, and can be overridden by adding <code>?{FS_BACKEND_QUERY_PARAM}=indexeddb</code> or{' '}
        <code>?{FS_BACKEND_QUERY_PARAM}=localstorage</code> to the page URL. Each backend keeps its own
        separate copy of the filesystem &mdash; switching does not move or merge files between them.
      </p>

      <h3 className="settings-section-title">Default Files</h3>
      <div className="settings-group">
        <div className="settings-group-body">
          <div className="settings-row" style={{alignItems: 'center'}}>
            <div className="settings-row-text">
              <div className="settings-row-title">Force reload all default files</div>
              <div className="settings-row-subtitle">
                {reloadingFiles ? reloadStatus : 'Re-download every default file from the server and reload the page.'}
              </div>
            </div>
            <button className="settings-btn" onClick={forceReloadAllFiles} disabled={reloadingFiles}>
              {reloadingFiles ? 'Reloading...' : 'Force Reload'}
            </button>
          </div>
        </div>
      </div>
      <p className="settings-hint">
        Re-fetches every file listed in <code>meta.json</code> from the server, overwriting the current
        copy in the virtual filesystem &mdash; including user-editable files such as those under{' '}
        <code>/home/user1</code>, <code>/etc</code> and <code>/opt</code>. Use this to pick up app
        updates or to discard local edits and restore the shipped defaults. The page reloads automatically
        once finished.
      </p>
    </div>
  )
}

platform.getService('settings').registerSection('08-storage', (container, api) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(StorageSettings))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'Storage',
  icon: 'storage',
  color: '#5856d6',
})
