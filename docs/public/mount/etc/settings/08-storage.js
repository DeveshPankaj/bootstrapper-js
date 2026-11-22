// Settings > Storage page. See /opt/apps/settings/main.html for the shared
// `'settings'` service (registerSection / utils) this registers against.
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { utils } = platform.getService('settings')
const { fs, origin, FS_BACKEND_STORAGE_KEY, FS_BACKEND_QUERY_PARAM, FS_BACKEND_OPTIONS } = utils

const META_FILE_SERVER_PATH = '/public/mount/meta.json'
const DEFAULT_META_URL = `${origin}${META_FILE_SERVER_PATH}`
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const HEX64 = /^[0-9a-f]{64}$/
const MAX_ENTRIES = 5000
const { normalizePath } = platform.host.pathPolicy

// The force-reload source: empty means this site. Otherwise a site running this OS
// (its /public/mount/meta.json is used) or a meta.json URL; https, or http on this
// machine. Never saved, so nothing can quietly point it elsewhere.
const resolveSource = (input) => {
  const text = String(input || '').trim()
  if (!text) return { url: DEFAULT_META_URL, isDefault: true }
  let u
  try { u = new URL(text) } catch (_) { return { error: 'Enter a full address, e.g. https://example.com' } }
  if (u.username || u.password) return { error: 'Addresses with a user name or password are not allowed.' }
  const local = LOCAL_HOSTS.has(u.hostname)
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && (local || u.origin === origin)))) {
    return { error: 'Use an https:// address (http:// only for localhost).' }
  }
  u.hash = ''
  if (!/\.json$/i.test(u.pathname)) u.pathname = u.pathname.replace(/\/+$/, '') + META_FILE_SERVER_PATH
  const url = u.toString()
  return { url, isDefault: url === DEFAULT_META_URL, origin: u.origin }
}

// Same rules as the kernel's meta.json bootstrap (src/kernel/vfs.ts): a target is an
// absolute, normalised vfs path; a source is a plain path under the meta.json's own
// folder (no URLs, '..', query/fragment characters or backslashes).
const entryTarget = (path) => {
  if (typeof path !== 'string' || !path.startsWith('/') || path === '/') return null
  try { return normalizePath(path) === path ? path : null } catch (_) { return null }
}
const entrySource = (file, base) => {
  if (typeof file !== 'string' || file === '') return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(file) || file.startsWith('//') || /[?#%\\]/.test(file)) return null
  if (file.split('/').includes('..')) return null
  let rel
  try { rel = normalizePath(file.startsWith('/') ? file : `/${file}`) } catch (_) { return null }
  if (rel === '/') return null
  const url = new URL(rel.slice(1), base).toString()
  return url.startsWith(base) ? url : null
}
const sha256Hex = async (buf) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join('')

const StorageSettings = () => {
  const active = localStorage.getItem(FS_BACKEND_STORAGE_KEY) || 'indexeddb'
  const [selected, setSelected] = React.useState(active)
  const [reloadingFiles, setReloadingFiles] = React.useState(false)
  const [reloadStatus, setReloadStatus] = React.useState('')
  const [source, setSource] = React.useState(DEFAULT_META_URL)
  const resolved = resolveSource(source)

  const apply = () => {
    localStorage.setItem(FS_BACKEND_STORAGE_KEY, selected)
    const top = platform.window.top
    const url = new URL(top.location.href)
    url.searchParams.set(FS_BACKEND_QUERY_PARAM, selected)
    top.location.href = url.toString()
  }

  const forceReloadAllFiles = async () => {
    const src = resolveSource(source)
    if (src.error) { setReloadStatus(src.error); return }
    const ok = src.isDefault
      ? confirm(
        'This will re-download every file listed in meta.json from the server, ' +
        'overwriting any local edits (including user-editable files under /home/user1, ' +
        '/etc, /opt), then reload the page. Continue?')
      : confirm(
        `Load the default files from ${src.origin}?\n\n` +
        'They overwrite your copies, and some of them are code that runs when the desktop starts ' +
        '(widgets, cron jobs, the startup script, preinstalled apps). Only use a source you trust.\n\n' +
        'Files this site ships as system files (/bin, /usr, /etc/settings, system apps) are ' +
        'restored from this site the next time it starts.')
    if (!ok) return

    setReloadingFiles(true)
    setReloadStatus('Fetching meta.json...')
    try {
      const res = await fetch(src.url, { cache: 'no-cache', credentials: 'omit' })
      if (!res.ok) throw new Error(`meta.json: HTTP ${res.status}`)
      const metaFiles = await res.json()
      if (!Array.isArray(metaFiles) || metaFiles.length > MAX_ENTRIES) throw new Error('meta.json is not a list of files')
      const base = new URL('./', src.url).toString()

      const jobs = []
      let skipped = 0
      for (const item of metaFiles) {
        const target = entryTarget(item && item.path)
        const url = entrySource(item && item.file, base)
        if (!target || !url) { skipped++; continue }
        if (!src.isDefault && target === '/meta.json') continue // the kernel restores it from this site
        jobs.push({ target, url, sha256: item && HEX64.test(item.sha256) ? item.sha256 : null })
      }

      let done = 0, written = 0
      const failed = []
      const next = async () => {
        for (let job; (job = jobs.shift());) {
          try {
            const r = await fetch(job.url, { cache: 'no-cache', credentials: 'omit' })
            if (!r.ok) throw new Error(`HTTP ${r.status}`)
            const data = await r.arrayBuffer()
            if (job.sha256 && (await sha256Hex(data)) !== job.sha256) throw new Error('sha256 does not match meta.json')
            const dir = job.target.slice(0, job.target.lastIndexOf('/')) || '/'
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(job.target, Buffer.from(data))
            written++
          } catch (err) {
            failed.push(job.target)
            console.error(`Failed to reload ${job.target}`, err)
          }
          done++
          setReloadStatus(`Reloading files (${done}/${done + jobs.length})...`)
        }
      }
      await Promise.all(Array.from({ length: 6 }, next))

      if (!written) throw new Error(failed.length ? `none of the ${failed.length} files could be downloaded` : 'meta.json lists no files')
      if (skipped || failed.length) console.warn(`[force reload] ${skipped} entries skipped, ${failed.length} failed`, failed)
      try { fs.unlinkSync('/etc/pkg/uninstalled.json') } catch (_) {}
      // Let the writes reach IndexedDB before the page goes away.
      setReloadStatus('Saving...')
      if (typeof fs.whenFlushed === 'function') await fs.whenFlushed()
      setReloadStatus('Reloading page...')
      platform.window.top.location.reload()
    } catch (err) {
      setReloadingFiles(false)
      const cors = err instanceof TypeError ? ' (is the address reachable, and does it allow cross-origin requests?)' : ''
      setReloadStatus(`Failed: ${err.message}${cors}`)
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
                {opt.id === active ? <span style={{marginLeft: '0.5rem', color: 'var(--vs-text-2)', fontWeight: 400}}>(active)</span> : null}
                <div style={{fontSize: '0.8rem', color: 'var(--vs-text-2)'}}>{opt.desc}</div>
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
        localStorage. Opening a link with <code>?{FS_BACKEND_QUERY_PARAM}=indexeddb</code> or{' '}
        <code>?{FS_BACKEND_QUERY_PARAM}=localstorage</code> asks you to confirm before it switches the backend
        (nothing is asked when it names the backend already in use, and declining keeps the current one);
        switching here never asks. Each backend keeps its own
        separate copy of the filesystem &mdash; switching does not move or merge files between them.
      </p>

      <h3 className="settings-section-title">Default Files</h3>
      <div className="settings-group">
        <div className="settings-group-body">
          <div className="settings-row" style={{flexDirection: 'column', alignItems: 'stretch', gap: '0.45rem'}}>
            <label className="settings-row-title" htmlFor="force-reload-source">Source</label>
            <input
              id="force-reload-source"
              className="settings-input"
              type="url"
              spellCheck={false}
              value={source}
              placeholder={DEFAULT_META_URL}
              disabled={reloadingFiles}
              onChange={e => { setSource(e.target.value); setReloadStatus('') }}
            />
            <div className="settings-row-subtitle" style={{wordBreak: 'normal', color: resolved.error ? 'var(--vs-danger)' : undefined}}>
              {resolved.error
                ? resolved.error
                : resolved.isDefault
                  ? 'This site (default). Leave empty to use it.'
                  : `Another source: ${resolved.url}`}
            </div>
          </div>
          <div className="settings-row" style={{alignItems: 'center'}}>
            <div className="settings-row-text">
              <div className="settings-row-title">Force reload all default files</div>
              <div className="settings-row-subtitle" style={{wordBreak: 'normal'}}>
                {reloadStatus || 'Re-download every default file from the source above and reload the page.'}
              </div>
            </div>
            <button className="settings-btn" onClick={forceReloadAllFiles} disabled={reloadingFiles || !!resolved.error}>
              {reloadingFiles ? 'Reloading...' : 'Force Reload'}
            </button>
          </div>
        </div>
      </div>
      <p className="settings-hint">
        Re-fetches every file listed in <code>meta.json</code> from the source, overwriting the current
        copy in the virtual filesystem &mdash; including user-editable files such as those under{' '}
        <code>/home/user1</code>, <code>/etc</code> and <code>/opt</code>. Use this to pick up app
        updates or to discard local edits and restore the shipped defaults. The page reloads automatically
        once finished.
      </p>
      <p className="settings-hint">
        The source can be another site running this desktop (e.g. <code>http://localhost:8080</code>; its{' '}
        <code>/public/mount/meta.json</code> is used) or a <code>meta.json</code> address. It must allow
        cross-origin requests (GitHub Pages does). Files it ships as system files that this site also
        ships (<code>/bin</code>, <code>/usr</code>, <code>/etc/settings</code>, system apps) are restored
        from this site the next time it starts; everything else keeps the loaded copy.
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
