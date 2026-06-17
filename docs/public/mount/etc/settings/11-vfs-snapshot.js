const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { utils } = platform.getService('settings')
const { fs, origin } = utils

const walkVfs = (dir, results = []) => {
  try {
    for (const name of fs.readdirSync(dir)) {
      const path = `${dir}/${name}`.replace(/\/\//g, '/')
      try {
        if (fs.statSync(path).isDirectory()) walkVfs(path, results)
        else results.push(path)
      } catch (_) {}
    }
  } catch (_) {}
  return results
}

const toBase64 = (data) => {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data.buffer || data)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

const VfsSnapshot = () => {
  const [exporting, setExporting] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [status, setStatus] = React.useState('')

  const exportSnapshot = async () => {
    if (!confirm('Export entire virtual filesystem as a JSON snapshot? This may take a few seconds for large filesystems.')) return
    setExporting(true)
    setStatus('Scanning files…')
    try {
      const paths = walkVfs('/')
      setStatus(`Exporting ${paths.length} files…`)
      const snapshot = []
      for (const path of paths) {
        try {
          const data = fs.readFileSync(path)
          snapshot.push({ path, dataBase64: toBase64(data) })
        } catch (_) {}
      }
      const json = JSON.stringify(snapshot, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vfs-snapshot-${new Date().toISOString().slice(0,10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setStatus(`Exported ${snapshot.length} files.`)
    } catch (err) {
      setStatus(`Export failed: ${err.message}`)
    }
    setExporting(false)
  }

  const importSnapshot = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!confirm(`Import snapshot "${file.name}"? This will overwrite matching files in the virtual filesystem.`)) return
    setImporting(true)
    setStatus('Reading snapshot…')
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const snapshot = JSON.parse(reader.result)
        setStatus(`Writing ${snapshot.length} files…`)
        let count = 0
        for (const entry of snapshot) {
          try {
            const dir = entry.path.slice(0, entry.path.lastIndexOf('/')) || '/'
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            const bytes = Uint8Array.from(atob(entry.dataBase64), c => c.charCodeAt(0))
            fs.writeFileSync(entry.path, Buffer.from(bytes))
            count++
          } catch (_) {}
        }
        setStatus(`Imported ${count} files. Reloading…`)
        setTimeout(() => platform.window.top.location.reload(), 1200)
      } catch (err) {
        setStatus(`Import failed: ${err.message}`)
        setImporting(false)
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">VFS Snapshot</h1>
      <p className="settings-page-subtitle">Back up or restore the entire virtual filesystem as a portable JSON file.</p>

      <h3 className="settings-section-title">Export</h3>
      <div className="settings-group">
        <div className="settings-group-body">
          <div className="settings-row" style={{ alignItems: 'center' }}>
            <div className="settings-row-text">
              <div className="settings-row-title">Download snapshot</div>
              <div className="settings-row-subtitle">{exporting ? status : 'Save all files as vfs-snapshot-YYYY-MM-DD.json'}</div>
            </div>
            <button className="settings-btn" onClick={exportSnapshot} disabled={exporting || importing}>
              {exporting ? 'Exporting…' : 'Export'}
            </button>
          </div>
        </div>
      </div>

      <h3 className="settings-section-title">Import</h3>
      <div className="settings-group">
        <div className="settings-group-body">
          <div className="settings-row" style={{ alignItems: 'center' }}>
            <div className="settings-row-text">
              <div className="settings-row-title">Restore from snapshot</div>
              <div className="settings-row-subtitle">{importing ? status : 'Load a previously exported snapshot JSON. The page reloads after restore.'}</div>
            </div>
            <label className="settings-btn" style={{ cursor: 'pointer' }}>
              {importing ? 'Importing…' : 'Import'}
              <input type="file" accept=".json" style={{ display: 'none' }} disabled={exporting || importing} onChange={importSnapshot} />
            </label>
          </div>
        </div>
      </div>

      <p className="settings-hint">
        Snapshots include every file in the virtual filesystem. They are stored entirely
        in your browser's download folder / local disk &mdash; nothing is sent to a server.
        Use this to migrate between browsers or as a manual backup before major changes.
      </p>
    </div>
  )
}

platform.getService('settings').registerSection('11-vfs-snapshot', (container, api) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(VfsSnapshot))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'VFS Snapshot',
  icon: 'save',
  color: '#007aff',
})
