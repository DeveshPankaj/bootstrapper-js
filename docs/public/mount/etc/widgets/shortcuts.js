const platform = window.platform;
const fs = platform.host.getFS();

const KEYBINDINGS_FILE = '/etc/keybindings.json';
const WM_SETTINGS_PATH = '/etc/wm/current.json';

const MODIFIER_SYMBOL = { Meta: '⌘', Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift' };

const codeToLabel = (code) => {
  if (!code) return '?';
  if (code === 'Space') return 'Space';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = { Comma: ',', Period: '.', Slash: '/', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backslash: '\\' };
  return map[code] || code;
};

const formatKey = (binding) => {
  const mods = (binding.modifiers || []).map(m => MODIFIER_SYMBOL[m] || m);
  const keyLabel = binding.code ? codeToLabel(binding.code) : (binding.key === ' ' ? 'Space' : (binding.key || '?').toUpperCase());
  return [...mods, keyLabel].join('+');
};

const readKeybindings = () => {
  try {
    if (fs.existsSync(KEYBINDINGS_FILE))
      return JSON.parse(fs.readFileSync(KEYBINDINGS_FILE, 'utf-8'));
  } catch (_) {}
  return [
    { code: 'Space', modifiers: ['Alt'], label: 'Open Spotlight' },
    { code: 'KeyF',  modifiers: ['Alt'], label: 'Open Files' },
    { code: 'KeyT',  modifiers: ['Alt'], label: 'Open Terminal' },
    { code: 'KeyS',  modifiers: ['Alt'], label: 'Open Settings' },
  ];
};

const readWmBehavior = () => {
  try {
    const raw = JSON.parse(fs.readFileSync(WM_SETTINGS_PATH, 'utf-8'));
    return raw.behavior || {};
  } catch (_) { return {}; }
};

const STATIC_SECTIONS = [
  {
    title: 'Desktop',
    items: [
      { key: 'Right-click', label: 'Context menu' },
      { key: 'Middle-click', label: 'Close window' },
    ],
  },
  {
    title: 'File Explorer',
    items: [
      { key: 'Double-click', label: 'Open file / folder' },
      { key: 'Right-click',  label: 'File actions' },
      { key: 'Drag',         label: 'Move / import' },
      { key: 'Tab',          label: 'Complete path (terminal)' },
    ],
  },
];

platform.host.registerWidget('shortcuts', (container, api) => {
  const styles = platform.host.createCSSStyleSheet();
  styles.replaceSync(`
    .cb-shortcuts {
      font-family: 'Courier New', 'Consolas', monospace;
      font-size: 11.5px;
      line-height: 1.55;
      color: #c8cdd3;
      padding: 0.9rem 1.1rem 0.8rem;
      min-width: 210px;
      user-select: none;
    }
    .cb-shortcuts-title {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #6fbfff;
      margin-bottom: 0.15rem;
    }
    .cb-section-header {
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #6fbfff;
      margin-top: 0.8rem;
      margin-bottom: 0.1rem;
    }
    .cb-rule {
      border: none;
      border-top: 1px solid rgba(111, 191, 255, 0.25);
      margin: 0.1rem 0 0.3rem;
    }
    .cb-row {
      display: flex;
      align-items: baseline;
      gap: 0;
      margin: 0;
    }
    .cb-key {
      color: #f0c060;
      min-width: 90px;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .cb-sep {
      color: rgba(200,205,211,0.3);
      margin: 0 4px;
    }
    .cb-label {
      color: #a8b0ba;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `);
  platform.host.addCSSStyleSheet(styles);
  api.onDestroy(() => platform.host.removeCSSStyleSheet(styles));

  const render = () => {
    container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'cb-shortcuts';

    const titleEl = document.createElement('div');
    titleEl.className = 'cb-shortcuts-title';
    titleEl.textContent = 'Keyboard Shortcuts';
    root.appendChild(titleEl);

    const mainRule = document.createElement('hr');
    mainRule.className = 'cb-rule';
    root.appendChild(mainRule);

    // User-configured keybindings
    const bindings = readKeybindings();
    for (const b of bindings) {
      const row = document.createElement('div');
      row.className = 'cb-row';
      const keyEl = document.createElement('span');
      keyEl.className = 'cb-key';
      keyEl.textContent = formatKey(b);
      const sep = document.createElement('span');
      sep.className = 'cb-sep';
      sep.textContent = '·';
      const labelEl = document.createElement('span');
      labelEl.className = 'cb-label';
      labelEl.textContent = b.label || b.command || '';
      row.appendChild(keyEl);
      row.appendChild(sep);
      row.appendChild(labelEl);
      root.appendChild(row);
    }

    // WM behavior hints
    const behavior = readWmBehavior();
    const wmItems = [];
    if (behavior.dblClickHeaderFullscreen !== false)
      wmItems.push({ key: 'Dbl-click title', label: 'Toggle fullscreen' });
    if (behavior.bringToFrontOnClick !== false)
      wmItems.push({ key: 'Click window', label: 'Bring to front' });

    if (wmItems.length) {
      const wmHeader = document.createElement('div');
      wmHeader.className = 'cb-section-header';
      wmHeader.textContent = 'Windows';
      root.appendChild(wmHeader);
      const wmRule = document.createElement('hr');
      wmRule.className = 'cb-rule';
      root.appendChild(wmRule);
      for (const item of wmItems) {
        const row = document.createElement('div');
        row.className = 'cb-row';
        const keyEl = document.createElement('span');
        keyEl.className = 'cb-key';
        keyEl.textContent = item.key;
        const sep = document.createElement('span');
        sep.className = 'cb-sep';
        sep.textContent = '·';
        const labelEl = document.createElement('span');
        labelEl.className = 'cb-label';
        labelEl.textContent = item.label;
        row.appendChild(keyEl);
        row.appendChild(sep);
        row.appendChild(labelEl);
        root.appendChild(row);
      }
    }

    // Static sections
    for (const section of STATIC_SECTIONS) {
      const header = document.createElement('div');
      header.className = 'cb-section-header';
      header.textContent = section.title;
      root.appendChild(header);
      const rule = document.createElement('hr');
      rule.className = 'cb-rule';
      root.appendChild(rule);
      for (const item of section.items) {
        const row = document.createElement('div');
        row.className = 'cb-row';
        const keyEl = document.createElement('span');
        keyEl.className = 'cb-key';
        keyEl.textContent = item.key;
        const sep = document.createElement('span');
        sep.className = 'cb-sep';
        sep.textContent = '·';
        const labelEl = document.createElement('span');
        labelEl.className = 'cb-label';
        labelEl.textContent = item.label;
        row.appendChild(keyEl);
        row.appendChild(sep);
        row.appendChild(labelEl);
        root.appendChild(row);
      }
    }

    container.appendChild(root);
  };

  render();
  // Re-render when keybindings are reloaded
  const sub = platform.host.commands$.subscribe(() => render());
  api.onDestroy(() => sub.unsubscribe());
}, {
  title: 'Shortcuts',
});
