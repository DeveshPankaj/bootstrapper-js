// Diff viewer — side-by-side line-diff of two vfs text files
// Opened via: command('ui.diff') with optional args [fileA, fileB]
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')

const fs = platform.host.getFS()

const computeDiff = (a, b) => {
  const linesA = a.split('\n')
  const linesB = b.split('\n')
  // Simple LCS-based diff
  const n = linesA.length, m = linesB.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      dp[i][j] = linesA[i - 1] === linesB[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])

  const result = []
  let i = n, j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      result.unshift({ type: 'same', a: linesA[i - 1], b: linesB[j - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', a: '', b: linesB[j - 1] })
      j--
    } else {
      result.unshift({ type: 'removed', a: linesA[i - 1], b: '' })
      i--
    }
  }
  return result
}

const rowBg = { same: 'transparent', added: 'rgba(50,205,50,0.12)', removed: 'rgba(255,59,48,0.12)' }
const rowBgB = { same: 'transparent', added: 'rgba(50,205,50,0.12)', removed: 'rgba(0,0,0,0.06)' }

const FilePicker = ({ label, value, onChange }) => {
  const [open, setOpen] = React.useState(false)
  const [dir, setDir] = React.useState('/home/user1')
  const [entries, setEntries] = React.useState([])

  React.useEffect(() => {
    if (!open) return
    try { setEntries(fs.readdirSync(dir)) } catch (_) { setEntries([]) }
  }, [open, dir])

  if (!open) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 13 }}>{label}:</span>
      <code style={{ flex: 1, fontSize: 12, opacity: 0.7 }}>{value || '(none)'}</code>
      <button className="settings-btn" onClick={() => setOpen(true)}>Browse</button>
    </div>
  )

  return (
    <div style={{ border: '1px solid rgba(127,127,127,0.3)', borderRadius: 8, padding: 8 }}>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>{label} — {dir}</div>
      <div style={{ maxHeight: 160, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
        {entries.map(e => {
          const full = `${dir}/${e}`
          let isDir = false
          try { isDir = fs.statSync(full).isDirectory() } catch (_) {}
          return (
            <div key={e} style={{ padding: '2px 4px', cursor: 'pointer', borderRadius: 4, background: 'transparent' }}
              onClick={() => isDir ? setDir(full) : (onChange(full), setOpen(false))}
              onMouseOver={ev => ev.currentTarget.style.background = 'rgba(127,127,127,0.15)'}
              onMouseOut={ev => ev.currentTarget.style.background = 'transparent'}
            >
              {isDir ? '📁 ' : '📄 '}{e}
            </div>
          )
        })}
      </div>
      <button className="settings-btn" style={{ marginTop: 6, fontSize: 12 }} onClick={() => setOpen(false)}>Cancel</button>
    </div>
  )
}

const DiffApp = ({ fileA: initA = '', fileB: initB = '' }) => {
  const [fileA, setFileA] = React.useState(initA)
  const [fileB, setFileB] = React.useState(initB)
  const [diff, setDiff] = React.useState(null)
  const [error, setError] = React.useState('')

  const runDiff = () => {
    setError('')
    try {
      const a = fs.readFileSync(fileA, 'utf8')
      const b = fs.readFileSync(fileB, 'utf8')
      setDiff(computeDiff(a, b))
    } catch (e) { setError(e.message || String(e)) }
  }

  React.useEffect(() => { if (fileA && fileB) runDiff() }, [fileA, fileB])

  const added = diff ? diff.filter(r => r.type === 'added').length : 0
  const removed = diff ? diff.filter(r => r.type === 'removed').length : 0

  const cellStyle = { padding: '1px 6px', whiteSpace: 'pre', fontFamily: 'monospace', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px', boxSizing: 'border-box', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
        <FilePicker label="File A" value={fileA} onChange={setFileA} />
        <FilePicker label="File B" value={fileB} onChange={setFileB} />
      </div>
      {error && <div style={{ color: '#ff3b30', fontSize: 12 }}>{error}</div>}
      {diff && (
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          <span style={{ color: '#34c759' }}>+{added}</span> additions &nbsp;
          <span style={{ color: '#ff3b30' }}>−{removed}</span> deletions
        </div>
      )}
      {diff && (
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid rgba(127,127,127,0.2)', borderRadius: 6 }}>
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(127,127,127,0.2)', background: 'rgba(127,127,127,0.08)', fontSize: 11, padding: '4px 6px' }}>
            <div style={{ flex: 1 }}>{fileA.split('/').pop()}</div>
            <div style={{ width: 1, background: 'rgba(127,127,127,0.3)', margin: '0 4px' }} />
            <div style={{ flex: 1 }}>{fileB.split('/').pop()}</div>
          </div>
          {diff.map((row, i) => (
            <div key={i} style={{ display: 'flex', borderBottom: '1px solid rgba(127,127,127,0.05)' }}>
              <div style={{ ...cellStyle, background: rowBg[row.type] }}>{row.type === 'removed' ? '− ' : row.type === 'same' ? '  ' : '  '}{row.a}</div>
              <div style={{ width: 1, background: 'rgba(127,127,127,0.2)' }} />
              <div style={{ ...cellStyle, background: rowBgB[row.type] }}>{row.type === 'added' ? '+ ' : row.type === 'same' ? '  ' : '  '}{row.b}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const run = (body, props, fileA, fileB) => {
  if (!body) {
    platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.diff'))", platform)
    return
  }
  props.setTitle('Diff Viewer')
  body.style.cssText = 'margin:0;height:100%;overflow:hidden;display:flex;flex-direction:column;'
  const root = ReactDOM.createRoot(body)
  root.render(React.createElement(DiffApp, { fileA: fileA || '', fileB: fileB || '' }))
  props.onDestroy(() => setTimeout(() => root.unmount(), 0))
}

platform.host.registerCommand('ui.diff', run, { title: 'Diff Viewer', icon: 'difference' })
