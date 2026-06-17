const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')

const CRONTAB_PATH = '/etc/crontab'

// Parse a single cron line: "min hour dayOfMonth month dayOfWeek command"
const parseLine = (line) => {
  const t = line.trim()
  if (!t || t.startsWith('#')) return null
  const parts = t.split(/\s+/)
  if (parts.length < 6) return null
  return { min: parts[0], hour: parts[1], dom: parts[2], month: parts[3], dow: parts[4], command: parts.slice(5).join(' '), raw: t }
}

const formatEntry = (e) => `${e.min} ${e.hour} ${e.dom} ${e.month} ${e.dow} ${e.command}`

const BLANK = { min: '*', hour: '*', dom: '*', month: '*', dow: '*', command: '' }

const CronEditor = () => {
  const fs = platform.host.getFS()

  const readCron = () => {
    try { return fs.readFileSync(CRONTAB_PATH, 'utf8') } catch (_) { return '' }
  }

  const [raw, setRaw] = React.useState(readCron)
  const [editing, setEditing] = React.useState(null) // index of entry being edited, or 'new'
  const [form, setForm] = React.useState(BLANK)
  const [msg, setMsg] = React.useState('')

  const entries = React.useMemo(() => {
    const lines = raw.split('\n')
    const result = []
    for (const line of lines) {
      const e = parseLine(line)
      if (e) result.push(e)
    }
    return result
  }, [raw])

  const save = (newEntries) => {
    const lines = raw.split('\n').filter(l => {
      const t = l.trim()
      return !t || t.startsWith('#')
    })
    const newContent = [...lines, ...newEntries.map(formatEntry)].join('\n') + '\n'
    fs.writeFileSync(CRONTAB_PATH, newContent)
    setRaw(newContent)
    setMsg('Saved')
    setTimeout(() => setMsg(''), 2000)
  }

  const deleteEntry = (idx) => {
    const next = entries.filter((_, i) => i !== idx)
    save(next)
  }

  const startEdit = (idx) => {
    setEditing(idx)
    setForm({ ...entries[idx] })
  }

  const startNew = () => {
    setEditing('new')
    setForm({ ...BLANK })
  }

  const commitEdit = () => {
    if (!form.command.trim()) { setMsg('Command is required'); return }
    const next = editing === 'new'
      ? [...entries, form]
      : entries.map((e, i) => i === editing ? form : e)
    save(next)
    setEditing(null)
  }

  const field = (key, label, placeholder, width = 60) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: width }}>
      <label style={{ fontSize: 11, opacity: 0.6 }}>{label}</label>
      <input
        className="settings-input"
        style={{ width }}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
      />
    </div>
  )

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">Cron Job Editor</h1>
      <p className="settings-page-subtitle">Visual editor for <code>/etc/crontab</code>. Use <code>*</code> for "every".</p>

      <div className="settings-group">
        <div className="settings-group-body">
          {entries.map((e, i) => (
            <div key={i} className="settings-row" style={{ alignItems: 'center', fontFamily: 'monospace', fontSize: 12 }}>
              <div style={{ flex: 1 }}>
                <span style={{ opacity: 0.5, marginRight: 8 }}>{e.min} {e.hour} {e.dom} {e.month} {e.dow}</span>
                <span>{e.command}</span>
              </div>
              <button className="settings-btn" style={{ fontSize: 12, marginRight: 4 }} onClick={() => startEdit(i)}>Edit</button>
              <button className="settings-btn" style={{ fontSize: 12 }} onClick={() => deleteEntry(i)}>Delete</button>
            </div>
          ))}
          {entries.length === 0 && <p className="settings-hint">No cron entries yet.</p>}
        </div>
      </div>

      {editing !== null && (
        <div className="settings-group" style={{ marginTop: '1rem' }}>
          <div className="settings-group-title">{editing === 'new' ? 'New Entry' : 'Edit Entry'}</div>
          <div className="settings-group-body">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
              {field('min', 'Minute', '*', 60)}
              {field('hour', 'Hour', '*', 60)}
              {field('dom', 'Day (month)', '*', 80)}
              {field('month', 'Month', '*', 60)}
              {field('dow', 'Day (week)', '*', 80)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <label style={{ fontSize: 11, opacity: 0.6 }}>Command</label>
              <input
                className="settings-input"
                style={{ maxWidth: 400 }}
                value={form.command}
                onChange={e => setForm(f => ({ ...f, command: e.target.value }))}
                placeholder="e.g. command('spotlight')"
                onKeyDown={e => e.key === 'Enter' && commitEdit()}
              />
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button className="settings-btn primary" onClick={commitEdit}>Save</button>
              <button className="settings-btn" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: '1rem' }}>
        <button className="settings-btn primary" onClick={startNew}>+ Add Entry</button>
      </div>

      {msg ? <p className="settings-hint" style={{ marginTop: 8 }}>{msg}</p> : null}

      <p className="settings-hint" style={{ marginTop: '1rem' }}>Cron runs entries on the schedule stored in <code>/etc/crontab</code>. The cron daemon reads the file on each tick.</p>
    </div>
  )
}

platform.getService('settings').registerSection('18-cron', (container) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(CronEditor))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'Cron Jobs',
  icon: 'schedule',
  color: '#5856d6',
})
