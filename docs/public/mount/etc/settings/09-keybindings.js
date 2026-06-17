const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { utils } = platform.getService('settings')
const { fs } = utils

const KEYBINDINGS_FILE = '/etc/keybindings.json'

// Default bindings use Alt (not Meta/Cmd) to avoid OS-level capture on macOS.
// `code` is the physical key code (e.g. 'KeyF', 'Space') so Alt+letter works on
// Mac where e.key transforms to Unicode chars (Alt+F → 'ƒ') but e.code stays 'KeyF'.
const DEFAULT_BINDINGS = [
  { id: 'spotlight', code: 'Space', modifiers: ['Alt'], command: 'spotlight',   label: 'Open Spotlight' },
  { id: 'explorer',  code: 'KeyF',  modifiers: ['Alt'], command: 'explorer',    label: 'Open Files' },
  { id: 'terminal',  code: 'KeyT',  modifiers: ['Alt'], command: 'ui.terminal', label: 'Open Terminal' },
  { id: 'settings',  code: 'KeyS',  modifiers: ['Alt'], command: 'ui.settings', label: 'Open Settings' },
]

const MODIFIER_LABELS = { Meta: '⌘', Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift' }

const codeToLabel = (code) => {
  if (!code) return '?'
  if (code === 'Space') return 'Space'
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  const map = { Comma: ',', Period: '.', Slash: '/', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backslash: '\\' }
  return map[code] || code
}

const readBindings = () => {
  try {
    if (fs.existsSync(KEYBINDINGS_FILE)) return JSON.parse(fs.readFileSync(KEYBINDINGS_FILE, 'utf-8'))
  } catch (_) {}
  return DEFAULT_BINDINGS
}

const saveBindings = (bindings) => {
  try { fs.writeFileSync(KEYBINDINGS_FILE, JSON.stringify(bindings, null, 2)) } catch (_) {}
}

const KeyCapture = ({ value, onChange }) => {
  const [capturing, setCapturing] = React.useState(false)
  const displayCode = value?.code || value?.key
  const label = value
    ? [...(value.modifiers || []).map(m => MODIFIER_LABELS[m] || m), codeToLabel(displayCode)].join('+')
    : 'None'

  const onKeyDown = (e) => {
    e.preventDefault()
    if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return
    const modifiers = []
    if (e.metaKey) modifiers.push('Meta')
    if (e.ctrlKey) modifiers.push('Ctrl')
    if (e.altKey) modifiers.push('Alt')
    if (e.shiftKey) modifiers.push('Shift')
    onChange({ code: e.code, modifiers })
    setCapturing(false)
  }

  return capturing ? (
    <input
      autoFocus
      style={{ width: 100, textAlign: 'center', borderRadius: 6, border: '2px solid #0a84ff', padding: '2px 6px', fontSize: 13 }}
      placeholder="Press keys…"
      onKeyDown={onKeyDown}
      onBlur={() => setCapturing(false)}
      readOnly
    />
  ) : (
    <button
      className="settings-btn"
      onClick={() => setCapturing(true)}
      style={{ minWidth: 80, fontFamily: 'monospace' }}
    >{label}</button>
  )
}

const KeybindingsSettings = () => {
  const [bindings, setBindings] = React.useState(readBindings)

  const update = (id, shortcut) => {
    const next = bindings.map(b => b.id === id ? { ...b, ...shortcut } : b)
    setBindings(next)
    saveBindings(next)
    platform.host.callCommand('reload-keybindings')
  }

  const resetToDefaults = () => {
    setBindings(DEFAULT_BINDINGS)
    saveBindings(DEFAULT_BINDINGS)
    platform.host.callCommand('reload-keybindings')
  }

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">Keyboard Shortcuts</h1>
      <p className="settings-page-subtitle">Click a shortcut to remap it. Changes take effect immediately.</p>

      <div className="settings-group">
        <div className="settings-group-body">
          {bindings.map(binding => (
            <div key={binding.id} className="settings-row" style={{ alignItems: 'center' }}>
              <div className="settings-row-text" style={{ flex: 1 }}>
                <div className="settings-row-title">{binding.label}</div>
                <div className="settings-row-subtitle">command: {binding.command}</div>
              </div>
              <KeyCapture
                value={{ code: binding.code, modifiers: binding.modifiers }}
                onChange={(shortcut) => update(binding.id, shortcut)}
              />
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <button className="settings-btn" onClick={resetToDefaults}>Reset to defaults</button>
      </div>

      <p className="settings-hint">
        Bindings use Alt to avoid OS-level interception. Saved to <code>{KEYBINDINGS_FILE}</code>.
      </p>
    </div>
  )
}

platform.getService('settings').registerSection('09-keybindings', (container, api) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(KeybindingsSettings))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'Keyboard Shortcuts',
  icon: 'keyboard',
  color: '#ff9f0a',
})
