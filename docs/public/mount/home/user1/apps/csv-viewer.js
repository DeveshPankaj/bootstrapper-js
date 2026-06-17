// CSV Viewer — renders .csv files as a sortable table
// Opened via appExtMap for .csv extension or command('ui.csv-viewer')
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')

const parseCSV = (text) => {
  const rows = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    // Handle quoted fields
    const fields = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQ = !inQ }
      else if (line[i] === ',' && !inQ) { fields.push(cur); cur = '' }
      else cur += line[i]
    }
    fields.push(cur)
    rows.push(fields)
  }
  return rows
}

const CsvViewer = ({ filepath }) => {
  const [rows, setRows] = React.useState([])
  const [sortCol, setSortCol] = React.useState(-1)
  const [sortAsc, setSortAsc] = React.useState(true)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (!filepath) return
    try {
      const text = platform.host.getFS().readFileSync(filepath, 'utf8')
      setRows(parseCSV(text))
    } catch (e) { setError(e.message || String(e)) }
  }, [filepath])

  if (error) return <div style={{ padding: 16, color: '#ff3b30' }}>{error}</div>
  if (!rows.length) return <div style={{ padding: 16, opacity: 0.5 }}>Loading…</div>

  const headers = rows[0]
  let data = rows.slice(1)

  if (sortCol >= 0) {
    data = [...data].sort((a, b) => {
      const va = a[sortCol] || '', vb = b[sortCol] || ''
      const na = parseFloat(va), nb = parseFloat(vb)
      const cmp = !isNaN(na) && !isNaN(nb) ? na - nb : va.localeCompare(vb)
      return sortAsc ? cmp : -cmp
    })
  }

  const toggleSort = (col) => {
    if (sortCol === col) setSortAsc(a => !a)
    else { setSortCol(col); setSortAsc(true) }
  }

  const thStyle = { padding: '6px 10px', textAlign: 'left', fontSize: 12, fontWeight: 600, background: 'rgba(127,127,127,0.12)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }
  const tdStyle = { padding: '4px 10px', fontSize: 12, borderBottom: '1px solid rgba(127,127,127,0.1)', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }

  return (
    <div style={{ height: '100%', overflowAuto: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '6px 10px', fontSize: 12, opacity: 0.6, borderBottom: '1px solid rgba(127,127,127,0.15)' }}>
        {filepath.split('/').pop()} — {data.length} rows × {headers.length} columns
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'auto' }}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} style={thStyle} onClick={() => toggleSort(i)}>
                  {h} {sortCol === i ? (sortAsc ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(127,127,127,0.04)' }}>
                {headers.map((_, ci) => <td key={ci} style={tdStyle} title={row[ci]}>{row[ci]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const run = (body, props, filepath) => {
  if (!body) {
    platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.csv-viewer'))", platform)
    return
  }
  const name = (filepath || 'CSV').split('/').pop()
  props.setTitle(name)
  body.style.cssText = 'margin:0;height:100%;overflow:hidden;display:flex;flex-direction:column;'
  const root = ReactDOM.createRoot(body)
  root.render(React.createElement(CsvViewer, { filepath: filepath || '' }))
  props.onDestroy(() => setTimeout(() => root.unmount(), 0))
}

platform.host.registerCommand('ui.csv-viewer', run, { title: 'CSV Viewer', icon: 'table_chart' })
