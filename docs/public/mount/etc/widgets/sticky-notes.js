const React = platform.getService('React')
const { createRoot } = platform.getService('ReactDOM')

const NOTES_FILE = '/home/user1/sticky-notes.json'
const fs = platform.host.getFS()

const COLORS = ['#fef08a', '#86efac', '#93c5fd', '#fca5a5', '#d8b4fe', '#fdba74']

// File format: { notes: [...], direction: 'row'|'column' }
// Handles legacy format where the file was a plain array.
const readData = () => {
  try {
    if (fs.existsSync(NOTES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(NOTES_FILE, 'utf-8'))
      if (Array.isArray(parsed)) return { notes: parsed, direction: 'row' }
      return { notes: parsed.notes ?? [], direction: parsed.direction ?? 'row' }
    }
  } catch (_) {}
  return { notes: [{ id: 1, text: 'Hello! Edit me.', color: '#fef08a' }], direction: 'row' }
}

const saveData = (notes, direction) => {
  try { fs.writeFileSync(NOTES_FILE, JSON.stringify({ notes, direction }, null, 4)) } catch (_) {}
}

let nextId = Date.now()

const StickyNotesWidget = () => {
  const initial = readData()
  const [notes, setNotes] = React.useState(initial.notes)
  const [direction, setDirection] = React.useState(initial.direction)

  const updateNotes = (next) => { setNotes(next); saveData(next, direction) }

  const toggleDirection = () => {
    const next = direction === 'row' ? 'column' : 'row'
    setDirection(next)
    saveData(notes, next)
  }

  const addNote = () => {
    const next = [...notes, { id: nextId++, text: '', color: COLORS[Math.floor(Math.random() * COLORS.length)] }]
    setNotes(next); saveData(next, direction)
  }

  const deleteNote = (id) => {
    const next = notes.filter(n => n.id !== id)
    setNotes(next); saveData(next, direction)
  }

  const updateText = (id, text) => {
    const next = notes.map(n => n.id === id ? { ...n, text } : n)
    setNotes(next); saveData(next, direction)
  }

  const cycleColor = (id) => {
    const note = notes.find(n => n.id === id)
    if (!note) return
    const idx = (COLORS.indexOf(note.color) + 1) % COLORS.length
    const next = notes.map(n => n.id === id ? { ...n, color: COLORS[idx] } : n)
    setNotes(next); saveData(next, direction)
  }

  const isRow = direction === 'row'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', padding: '0.45rem 0.9rem',
        background: 'rgba(0,0,0,0.08)', flexShrink: 0,
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, letterSpacing: '0.05em', textTransform: 'uppercase', flex: 1 }}>
          Sticky Notes
        </span>
        <button
          onClick={toggleDirection}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px',
            color: '#555', display: 'flex', alignItems: 'center',
          }}
          title={isRow ? 'Switch to column layout' : 'Switch to grid layout'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            {isRow ? 'view_agenda' : 'grid_view'}
          </span>
        </button>
        <button
          onClick={addNote}
          style={{
            background: 'rgba(0,0,0,0.12)', border: 'none', borderRadius: '50%',
            width: 22, height: 22, cursor: 'pointer', fontSize: 17,
            color: '#333', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginLeft: 4,
          }}
          title="New note"
        >+</button>
      </div>
      <div style={{
        display: 'flex',
        flexDirection: isRow ? 'row' : 'column',
        flexWrap: isRow ? 'wrap' : 'nowrap',
        gap: 8, padding: 8,
      }}>
        {notes.map(note => (
          <div
            key={note.id}
            style={{
              width: isRow ? 180 : '100%',
              minHeight: 120,
              background: note.color, borderRadius: 8,
              boxShadow: '2px 3px 10px rgba(0,0,0,0.18)',
              display: 'flex', flexDirection: 'column',
              fontSize: 13, overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', padding: '3px 6px', background: 'rgba(0,0,0,0.08)', gap: 4 }}>
              <span onClick={() => cycleColor(note.id)} style={{ cursor: 'pointer', fontSize: 12 }} title="Change color">🎨</span>
              <span style={{ flex: 1 }} />
              <span onClick={() => deleteNote(note.id)} style={{ cursor: 'pointer', fontSize: 12, opacity: 0.6 }} title="Delete">✕</span>
            </div>
            <textarea
              value={note.text}
              onChange={e => updateText(note.id, e.target.value)}
              style={{
                flex: 1, resize: 'none', border: 'none', background: 'transparent',
                padding: '6px 8px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                minHeight: 96,
              }}
              placeholder="Write a note..."
            />
          </div>
        ))}
      </div>
    </div>
  )
}

platform.host.registerWidget('sticky-notes', (container) => {
  container.style.padding = '0'
  container.style.overflow = 'hidden'
  const root = createRoot(container)
  root.render(React.createElement(StickyNotesWidget))
  return () => root.unmount()
}, { title: 'Sticky Notes' })
