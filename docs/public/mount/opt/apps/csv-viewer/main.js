const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')

const parseCSV = (text) => {
  const rows = []
  let fields = [], cur = '', inQ = false
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i]
    if (i === text.length || (ch === '\n' && !inQ)) {
      fields.push(cur)
      if (fields.some(f => f.trim())) rows.push(fields)
      fields = []; cur = ''; inQ = false
    } else if (ch === '"') {
      if (inQ && text[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (ch === ',' && !inQ) {
      fields.push(cur); cur = ''
    } else if (ch !== '\r') {
      cur += ch
    }
  }
  return rows
}

const serializeCSV = (headers, data) => {
  const esc = (f) => {
    const s = String(f ?? '')
    return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  return [headers, ...data].map(row => row.map(esc).join(',')).join('\n')
}

const CsvViewer = ({ filepath }) => {
  const [rows, setRows] = React.useState([])
  const [sortCol, setSortCol] = React.useState(-1)
  const [sortAsc, setSortAsc] = React.useState(true)
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [colFilters, setColFilters] = React.useState({})
  const [error, setError] = React.useState('')
  const [saveStatus, setSaveStatus] = React.useState('')

  React.useEffect(() => {
    if (!filepath) return
    try {
      const text = platform.host.getFS().readFileSync(filepath, 'utf8')
      setRows(parseCSV(text))
    } catch (e) { setError(e.message || String(e)) }
  }, [filepath])

  if (!filepath) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: 0.4, fontFamily: 'system-ui, sans-serif' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 52 }}>table_chart</span>
      <div style={{ fontSize: 14, fontWeight: 600 }}>No file open</div>
      <div style={{ fontSize: 12 }}>Open a .csv file from the file manager</div>
    </div>
  )
  if (error) return (
    <div style={{ padding: 20, color: '#dc2626', fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>
      <strong>Error loading file:</strong> {error}
    </div>
  )
  if (!rows.length) return (
    <div style={{ padding: 20, opacity: 0.5, fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>Loading…</div>
  )

  const headers = rows[0]
  const totalRows = rows.length - 1
  let data = rows.slice(1)

  // Column filters
  const activeColFilters = Object.entries(colFilters).filter(([, v]) => v.trim())
  if (activeColFilters.length) {
    data = data.filter(row =>
      activeColFilters.every(([ci, val]) =>
        String(row[+ci] ?? '').toLowerCase().includes(val.toLowerCase())
      )
    )
  }

  // Global search
  if (globalFilter.trim()) {
    const q = globalFilter.toLowerCase()
    data = data.filter(row => row.some(c => String(c ?? '').toLowerCase().includes(q)))
  }

  const filteredCount = data.length

  // Sort
  if (sortCol >= 0) {
    data = [...data].sort((a, b) => {
      const va = String(a[sortCol] ?? ''), vb = String(b[sortCol] ?? '')
      const na = parseFloat(va), nb = parseFloat(vb)
      const cmp = !isNaN(na) && !isNaN(nb) ? na - nb : va.localeCompare(vb)
      return sortAsc ? cmp : -cmp
    })
  }

  const toggleSort = (col) => {
    if (sortCol === col) {
      if (sortAsc) setSortAsc(false)
      else { setSortCol(-1); setSortAsc(true) }
    } else { setSortCol(col); setSortAsc(true) }
  }

  const setColFilter = (ci, val) => {
    setColFilters(prev => {
      const next = { ...prev }
      if (val) next[ci] = val; else delete next[ci]
      return next
    })
  }

  const clearAll = () => {
    setGlobalFilter(''); setColFilters({}); setSortCol(-1); setSortAsc(true)
  }

  const saveFile = () => {
    if (!filepath) return
    setSaveStatus('saving')
    try {
      platform.host.getFS().writeFileSync(filepath, serializeCSV(headers, data))
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(''), 2200)
    } catch (e) {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus(''), 3000)
    }
  }

  // Detect numeric columns for right-align
  const numericCols = new Set(
    headers.map((_, ci) => {
      const sample = data.slice(0, 40).filter(r => r[ci] != null && String(r[ci]).trim() !== '')
      if (!sample.length) return -1
      return sample.filter(r => !isNaN(parseFloat(r[ci])) && isFinite(r[ci])).length / sample.length > 0.75 ? ci : -1
    }).filter(ci => ci >= 0)
  )

  const hasActiveFilters = globalFilter.trim() || activeColFilters.length || sortCol >= 0

  // Styles
  const TH = {
    padding: '7px 10px', fontWeight: 600, fontSize: 12,
    borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e8ecf0',
    whiteSpace: 'nowrap', userSelect: 'none', position: 'sticky', top: 0,
    background: '#f8fafc'
  }
  const TD = {
    padding: '4px 10px', fontSize: 12, borderBottom: '1px solid #f1f5f9',
    borderRight: '1px solid #f1f5f9', whiteSpace: 'nowrap',
    maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis'
  }
  const saveColors = { saved: '#16a34a', error: '#dc2626', saving: '#6b7280', '': '#2563eb' }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#ffffff', color: '#1e293b' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#64748b' }}>table_chart</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
          {filepath.split('/').pop()}
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: 6, fontSize: 13, color: '#94a3b8', pointerEvents: 'none' }}>search</span>
          <input type="text" placeholder="Search all columns…" value={globalFilter} onChange={e => setGlobalFilter(e.target.value)}
            style={{ paddingLeft: 22, paddingRight: globalFilter ? 22 : 8, paddingTop: 4, paddingBottom: 4, fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 6, outline: 'none', width: 180, background: '#fff', color: '#334155' }} />
          {globalFilter && (
            <button onClick={() => setGlobalFilter('')}
              style={{ position: 'absolute', right: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12, padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
            </button>
          )}
        </div>
        {hasActiveFilters && (
          <button onClick={clearAll} title="Clear filters &amp; sort"
            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#64748b' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>filter_alt_off</span>
            Clear
          </button>
        )}
        <button onClick={saveFile} disabled={saveStatus === 'saving'} title="Save current view to file"
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, background: saveColors[saveStatus], color: '#fff', cursor: saveStatus === 'saving' ? 'wait' : 'pointer', opacity: saveStatus === 'saving' ? 0.7 : 1, transition: 'background 0.2s' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            {saveStatus === 'saved' ? 'check_circle' : saveStatus === 'error' ? 'error' : 'save'}
          </span>
          {saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Failed' : 'Save'}
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'auto' }}>
          <thead>
            {/* Column headers */}
            <tr>
              <th style={{ ...TH, width: 36, top: 0, zIndex: 2, textAlign: 'center', color: '#94a3b8', background: '#f1f5f9', borderRight: '2px solid #e2e8f0', fontSize: 10 }}>#</th>
              {headers.map((h, ci) => (
                <th key={ci} onClick={() => toggleSort(ci)}
                  style={{ ...TH, top: 0, zIndex: 2, cursor: 'pointer', background: sortCol === ci ? '#eff6ff' : '#f8fafc', textAlign: numericCols.has(ci) ? 'right' : 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: numericCols.has(ci) ? 'flex-end' : 'flex-start' }}>
                    <span style={{ color: sortCol === ci ? '#1d4ed8' : '#334155', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h || '(empty)'}</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 12, flexShrink: 0, color: sortCol === ci ? '#1d4ed8' : '#cbd5e1', transition: 'color 0.15s' }}>
                      {sortCol === ci ? (sortAsc ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
            {/* Filter row */}
            <tr>
              <td style={{ padding: '3px 4px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', borderRight: '2px solid #e2e8f0', textAlign: 'center', position: 'sticky', top: 37 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 13, color: activeColFilters.length ? '#f59e0b' : '#cbd5e1' }}>filter_alt</span>
              </td>
              {headers.map((_, ci) => (
                <td key={ci} style={{ padding: '3px 4px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 37 }}>
                  <input type="text" placeholder="Filter…" value={colFilters[ci] || ''} onChange={e => setColFilter(ci, e.target.value)}
                    style={{ width: '100%', padding: '2px 5px', fontSize: 11, border: colFilters[ci] ? '1px solid #3b82f6' : '1px solid #e2e8f0', borderRadius: 4, outline: 'none', background: colFilters[ci] ? '#eff6ff' : '#fff', color: '#334155', boxSizing: 'border-box' }} />
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={headers.length + 1} style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                No rows match the current filters.
                {' '}<span onClick={clearAll} style={{ color: '#3b82f6', cursor: 'pointer', textDecoration: 'underline' }}>Clear all</span>
              </td></tr>
            ) : data.map((row, ri) => (
              <tr key={ri}
                style={{ background: ri % 2 === 0 ? '#ffffff' : '#f8fafc', cursor: 'default' }}
                onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                onMouseLeave={e => e.currentTarget.style.background = ri % 2 === 0 ? '#ffffff' : '#f8fafc'}>
                <td style={{ ...TD, textAlign: 'right', color: '#94a3b8', borderRight: '2px solid #e2e8f0', fontVariantNumeric: 'tabular-nums', fontSize: 10, userSelect: 'none', padding: '4px 6px' }}>{ri + 1}</td>
                {headers.map((_, ci) => (
                  <td key={ci} title={String(row[ci] ?? '')}
                    style={{ ...TD, textAlign: numericCols.has(ci) ? 'right' : 'left', fontVariantNumeric: numericCols.has(ci) ? 'tabular-nums' : 'normal', color: sortCol === ci ? '#1d4ed8' : '#1e293b' }}>
                    {String(row[ci] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 12px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 11, color: '#64748b', flexShrink: 0 }}>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {filteredCount < totalRows
            ? <><strong style={{ color: '#334155' }}>{filteredCount}</strong> of {totalRows} rows</>
            : <><strong style={{ color: '#334155' }}>{totalRows}</strong> row{totalRows !== 1 ? 's' : ''}</>
          }
        </span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>{headers.length} columns</span>
        {sortCol >= 0 && <>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{ color: '#2563eb' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 11, verticalAlign: 'middle' }}>{sortAsc ? 'arrow_upward' : 'arrow_downward'}</span>
            {' '}{headers[sortCol]}
          </span>
        </>}
        {activeColFilters.length > 0 && <>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{ color: '#d97706' }}>{activeColFilters.length} filter{activeColFilters.length > 1 ? 's' : ''}</span>
        </>}
        {globalFilter && <>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{ color: '#d97706' }}>"{globalFilter}"</span>
        </>}
        <div style={{ flex: 1 }} />
        {saveStatus === 'saved' && <span style={{ color: '#16a34a', fontSize: 11 }}>✓ Saved</span>}
      </div>
    </div>
  )
}

const ICON_FONT_CSS = `
@font-face{font-family:'Material Symbols Outlined';font-style:normal;font-weight:100 700;
src:url(https://fonts.gstatic.com/s/materialsymbolsoutlined/v138/kJEhBvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oFsLjBuVY.woff2) format('woff2');}
.material-symbols-outlined{font-family:'Material Symbols Outlined';font-weight:normal;font-style:normal;
font-size:24px;line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;white-space:nowrap;
word-wrap:normal;direction:ltr;-webkit-font-smoothing:antialiased;}`

const run = (body, props, filepath) => {
  if (!body) {
    platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.csv-viewer'))", platform)
    return
  }
  const doc = body.ownerDocument
  if (!doc.querySelector('style[data-csv-icons]')) {
    const s = doc.createElement('style')
    s.setAttribute('data-csv-icons', '1')
    s.textContent = ICON_FONT_CSS
    doc.head.appendChild(s)
  }
  const name = (filepath || 'Spreadsheet').split('/').pop()
  props.setTitle(name)
  body.style.cssText = 'margin:0;height:100%;overflow:hidden;display:flex;flex-direction:column;'
  const root = ReactDOM.createRoot(body)
  root.render(React.createElement(CsvViewer, { filepath: filepath || '' }))
  props.onDestroy(() => setTimeout(() => root.unmount(), 0))
  props.setWindowView(true)
}

platform.host.registerCommand('ui.csv-viewer', run, { title: 'Spreadsheet', icon: 'table_chart', fileExtensions: ['.csv', '.tsv'] })
