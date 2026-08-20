const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { utils } = platform.getService('settings')
const { fs } = utils

const KEYBINDINGS_FILE = '/etc/keybindings.json'

// Detect OS to pick conflict-free default modifier(s).
// macOS  : Alt (Option) alone — no browser/OS conflicts with Alt+letter on Mac.
// Windows: Alt+Shift — avoids legacy browser Alt-menu shortcuts (Alt+F opens File
//          menu in Firefox, Alt+T opens Tools). Bare Alt+Shift switches keyboard
//          layout on Windows, but Alt+Shift+<key> is not intercepted.
// Linux  : Alt alone — WM shortcuts (Alt+Space, Alt+F2, Alt+F4) are intercepted at
//          the compositor level before JS events fire, so browser JS Alt+key is safe.
const _os = (() => {
  try {
    const p = (navigator.userAgentData || {}).platform || navigator.platform || ''
    if (/win/i.test(p)) return 'windows'
    if (/mac/i.test(p)) return 'mac'
    return 'linux'
  } catch (_) { return 'linux' }
})()

const PRIMARY_MODS = _os === 'windows' ? ['Alt', 'Shift'] : ['Alt']

const DEFAULT_BINDINGS = [
  { id: 'spotlight', code: 'Space', modifiers: PRIMARY_MODS, command: 'spotlight',   label: 'Open Spotlight' },
  { id: 'explorer',  code: 'KeyF',  modifiers: PRIMARY_MODS, command: 'explorer',    label: 'Open Files' },
  { id: 'terminal',  code: 'KeyT',  modifiers: PRIMARY_MODS, command: 'ui.terminal', label: 'Open Terminal' },
  { id: 'settings',  code: 'KeyS',  modifiers: PRIMARY_MODS, command: 'ui.settings', label: 'Open Settings' },
]

// Display symbols per OS — Mac uses ⌥/⇧ glyphs; Windows/Linux use text labels.
const MODIFIER_LABELS = _os === 'mac'
  ? { Meta: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' }
  : { Meta: 'Win', Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift' }

const MODIFIER_SEP = _os === 'mac' ? '' : '+'

const codeToLabel = (code) => {
  if (!code) return '?'
  if (code === 'Space') return 'Space'
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  const map = { Comma: ',', Period: '.', Slash: '/', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backslash: '\\' }
  return map[code] || code
}

const formatShortcut = (modifiers, code) => {
  const mods = (modifiers || []).map(m => MODIFIER_LABELS[m] || m)
  const key = codeToLabel(code)
  return [...mods, key].join(MODIFIER_SEP)
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
  const label = value
    ? formatShortcut(value.modifiers, value.code || value.key)
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
    React.createElement('input', {
      autoFocus: true,
      style: { width: 110, textAlign: 'center', borderRadius: 6, border: '2px solid #0a84ff', padding: '2px 6px', fontSize: 13 },
      placeholder: 'Press keys…',
      onKeyDown,
      onBlur: () => setCapturing(false),
      readOnly: true,
    })
  ) : (
    React.createElement('button', {
      className: 'settings-btn',
      onClick: () => setCapturing(true),
      style: { minWidth: 90, fontFamily: 'monospace' },
    }, label)
  )
}

const osLabel = _os === 'mac' ? 'macOS (⌥ Option)' : _os === 'windows' ? 'Windows (Alt+Shift)' : 'Linux (Alt)'
const hintModifier = _os === 'mac' ? '⌥ (Option)' : _os === 'windows' ? 'Alt+Shift' : 'Alt'

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

  return React.createElement('div', { className: 'settings-page' },
    React.createElement('h1', { className: 'settings-page-title' }, 'Keyboard Shortcuts'),
    React.createElement('p', { className: 'settings-page-subtitle' },
      'Click a shortcut to remap it. Changes take effect immediately.'
    ),
    React.createElement('div', { className: 'settings-group' },
      React.createElement('div', { className: 'settings-group-body' },
        bindings.map(binding =>
          React.createElement('div', { key: binding.id, className: 'settings-row', style: { alignItems: 'center' } },
            React.createElement('div', { className: 'settings-row-text', style: { flex: 1 } },
              React.createElement('div', { className: 'settings-row-title' }, binding.label),
              React.createElement('div', { className: 'settings-row-subtitle' }, 'command: ', binding.command)
            ),
            React.createElement(KeyCapture, {
              value: { code: binding.code, modifiers: binding.modifiers },
              onChange: (shortcut) => update(binding.id, shortcut),
            })
          )
        )
      )
    ),
    React.createElement('div', { style: { marginTop: '1rem' } },
      React.createElement('button', { className: 'settings-btn', onClick: resetToDefaults }, 'Reset to defaults')
    ),
    React.createElement('p', { className: 'settings-hint' },
      `Detected OS: ${osLabel}. Defaults use ${hintModifier} to avoid OS and browser conflicts. Saved to `,
      React.createElement('code', null, KEYBINDINGS_FILE),
      '.'
    )
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
