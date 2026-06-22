// Spotlight Search — global keyboard-driven search overlay
// Injected into the main document at boot; triggered by Ctrl+K / Cmd+K.
// This file runs in the main document context (not inside an iframe).

const platform = window.platform;
const fs = platform.host.getFS();

// ── CSS injection ─────────────────────────────────────────────────────────────
(function injectStyles() {
  if (document.getElementById('__spotlight-css__')) return;
  const style = document.createElement('style');
  style.id = '__spotlight-css__';
  style.textContent = `
    @font-face {
      font-family: 'Material Symbols Outlined';
      font-style: normal;
      font-weight: 100 700;
      src: url(https://fonts.gstatic.com/s/materialsymbolsoutlined/v138/kJEhBvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oFsLjBuVY.woff2) format('woff2');
    }
    .sp-mat-icon {
      font-family: 'Material Symbols Outlined';
      font-weight: normal;
      font-style: normal;
      line-height: 1;
      letter-spacing: normal;
      text-transform: none;
      display: inline-block;
      white-space: nowrap;
      word-wrap: normal;
      direction: ltr;
      -webkit-font-feature-settings: 'liga';
      -webkit-font-smoothing: antialiased;
    }

    #__spotlight-overlay__ {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      animation: __sp-fade-in__ 0.12s ease;
    }

    @keyframes __sp-fade-in__ {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    #__spotlight-card__ {
      max-width: 560px;
      width: 90%;
      margin-top: 8%;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.25);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: __sp-slide-in__ 0.14s ease;
    }

    @keyframes __sp-slide-in__ {
      from { transform: translateY(-10px); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
    }

    #__spotlight-input__ {
      width: 100%;
      border: none;
      outline: none;
      padding: 0.85rem 1.1rem 0.85rem 2.8rem;
      font-size: 15px;
      font-family: inherit;
      border-bottom: 1px solid #f0ede9;
      background: transparent;
      color: #1c1c1e;
      box-sizing: border-box;
    }

    #__spotlight-input-wrap__ {
      position: relative;
      flex-shrink: 0;
    }

    #__spotlight-input-icon__ {
      position: absolute;
      left: 0.9rem;
      top: 50%;
      transform: translateY(-50%);
      font-size: 18px;
      color: #aaa;
      pointer-events: none;
    }

    #__spotlight-results__ {
      overflow-y: auto;
      max-height: 400px;
    }

    .sp-section-header {
      padding: 8px 14px 4px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1.2px;
      text-transform: uppercase;
      color: #bbb;
      background: #fafaf9;
      border-bottom: 1px solid #f5f2ef;
    }

    .sp-result-item {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 9px 14px;
      cursor: pointer;
      transition: background 0.1s;
      border-bottom: 1px solid #f9f7f5;
    }

    .sp-result-item:last-child {
      border-bottom: none;
    }

    .sp-result-item:hover,
    .sp-result-item.sp-focused {
      background: #f0ede9;
    }

    .sp-result-icon {
      font-size: 19px;
      color: #7a6a58;
      flex-shrink: 0;
      width: 22px;
      text-align: center;
    }

    .sp-result-body {
      flex: 1;
      min-width: 0;
    }

    .sp-result-title {
      font-size: 13.5px;
      font-weight: 500;
      color: #1c1c1e;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sp-result-sub {
      font-size: 11px;
      color: #999;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sp-category-badge {
      font-size: 10.5px;
      padding: 2px 8px;
      border-radius: 10px;
      background: #f0ede9;
      color: #7a6a58;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .sp-empty {
      padding: 28px 14px;
      text-align: center;
      color: #bbb;
      font-size: 13px;
    }
  `;
  document.head.appendChild(style);
})();

// ── State ─────────────────────────────────────────────────────────────────────
let _overlayEl = null;
let _inputEl = null;
let _resultsEl = null;
let _focusedIndex = -1;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAllCommands() {
  try {
    // Subscribe immediately — BehaviorSubject emits synchronously on subscribe
    let cmds = [];
    const sub = platform.host.commands$.subscribe(list => { cmds = list || []; });
    try { sub.unsubscribe(); } catch (_) {}
    return cmds;
  } catch (_) {
    return [];
  }
}

function searchVfsFiles(query) {
  const results = [];
  const q = query.toLowerCase();
  const dirsToScan = ['/home/user1', '/etc'];
  for (const dir of dirsToScan) {
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (entry.toLowerCase().includes(q)) {
          results.push({ name: entry, path: `${dir}/${entry}` });
          if (results.length >= 10) return results;
        }
      }
    } catch (_) {}
  }
  return results;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function makeEl(tag, attrs, text) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v);
  }
  if (text != null) el.textContent = text;
  return el;
}

function icon(name) {
  const span = makeEl('span', { class: 'sp-mat-icon sp-result-icon' }, name);
  return span;
}

// ── Render results ────────────────────────────────────────────────────────────

function renderResults(query) {
  if (!_resultsEl) return;
  _resultsEl.innerHTML = '';
  _focusedIndex = -1;

  if (!query.trim()) {
    // Show hint
    const empty = makeEl('div', { class: 'sp-empty' }, 'Type to search apps and files…');
    _resultsEl.appendChild(empty);
    return;
  }

  const q = query.toLowerCase();

  // ── App results ──────────────────────────────────────────────────────────
  const allCmds = getAllCommands();
  const seen = new Set();
  const appResults = [];
  for (const cmd of allCmds) {
    if (cmd.meta?.callable === false) continue;
    if (seen.has(cmd.name)) continue;
    seen.add(cmd.name);
    const title = cmd.meta?.title || cmd.name;
    if (
      title.toLowerCase().includes(q) ||
      cmd.name.toLowerCase().includes(q) ||
      (cmd.meta?.category || '').toLowerCase().includes(q)
    ) {
      appResults.push(cmd);
      if (appResults.length >= 6) break;
    }
  }

  // ── File results ─────────────────────────────────────────────────────────
  const fileResults = searchVfsFiles(query).slice(0, 4);

  if (appResults.length === 0 && fileResults.length === 0) {
    const empty = makeEl('div', { class: 'sp-empty' }, `No results for "${query}"`);
    _resultsEl.appendChild(empty);
    return;
  }

  const allItems = []; // track all focusable items

  // ── Render apps ──────────────────────────────────────────────────────────
  if (appResults.length > 0) {
    _resultsEl.appendChild(makeEl('div', { class: 'sp-section-header' }, 'Apps'));
    for (const cmd of appResults) {
      const title = cmd.meta?.title || cmd.name;
      const category = cmd.meta?.category || '';
      const iconName = cmd.meta?.icon || 'apps';

      const item = makeEl('div', { class: 'sp-result-item' });
      item.appendChild(icon(iconName));

      const body = makeEl('div', { class: 'sp-result-body' });
      body.appendChild(makeEl('div', { class: 'sp-result-title' }, title));
      item.appendChild(body);

      if (category) {
        item.appendChild(makeEl('span', { class: 'sp-category-badge' }, category));
      }

      item.addEventListener('click', () => {
        closeSpotlight();
        try { platform.host.callCommand(cmd.name); } catch (_) {}
      });

      allItems.push(item);
      _resultsEl.appendChild(item);
    }
  }

  // ── Render files ─────────────────────────────────────────────────────────
  if (fileResults.length > 0) {
    _resultsEl.appendChild(makeEl('div', { class: 'sp-section-header' }, 'Files'));
    for (const file of fileResults) {
      const item = makeEl('div', { class: 'sp-result-item' });
      item.appendChild(icon('insert_drive_file'));

      const body = makeEl('div', { class: 'sp-result-body' });
      body.appendChild(makeEl('div', { class: 'sp-result-title' }, file.name));
      body.appendChild(makeEl('div', { class: 'sp-result-sub' }, file.path));
      item.appendChild(body);

      item.addEventListener('click', () => {
        closeSpotlight();
        try { platform.host.exec(platform, file.path); } catch (_) {}
      });

      allItems.push(item);
      _resultsEl.appendChild(item);
    }
  }

  // Store items on results element for keyboard nav
  _resultsEl._items = allItems;
}

function setFocus(index) {
  const items = _resultsEl?._items;
  if (!items || items.length === 0) return;
  if (_focusedIndex >= 0 && _focusedIndex < items.length) {
    items[_focusedIndex].classList.remove('sp-focused');
  }
  _focusedIndex = Math.max(0, Math.min(items.length - 1, index));
  const focused = items[_focusedIndex];
  focused.classList.add('sp-focused');
  focused.scrollIntoView({ block: 'nearest' });
}

function activateFocused() {
  const items = _resultsEl?._items;
  if (!items || _focusedIndex < 0 || _focusedIndex >= items.length) return;
  items[_focusedIndex].click();
}

// ── Open / close ──────────────────────────────────────────────────────────────

function closeSpotlight() {
  if (!_overlayEl) return;
  _overlayEl.remove();
  _overlayEl = null;
  _inputEl = null;
  _resultsEl = null;
  _focusedIndex = -1;
}

function openSpotlight() {
  // Toggle
  if (_overlayEl) {
    closeSpotlight();
    return;
  }

  // Overlay
  const overlay = makeEl('div', { id: '__spotlight-overlay__' });
  _overlayEl = overlay;

  // Close on outside click
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closeSpotlight();
  });

  // Card
  const card = makeEl('div', { id: '__spotlight-card__' });
  overlay.appendChild(card);

  // Input wrapper
  const inputWrap = makeEl('div', { id: '__spotlight-input-wrap__' });
  const inputIcon = makeEl('span', { class: 'sp-mat-icon', id: '__spotlight-input-icon__' }, 'search');
  inputWrap.appendChild(inputIcon);

  const input = makeEl('input', { id: '__spotlight-input__', type: 'text', placeholder: 'Search apps and files…' });
  _inputEl = input;
  inputWrap.appendChild(input);
  card.appendChild(inputWrap);

  // Results
  const results = makeEl('div', { id: '__spotlight-results__' });
  _resultsEl = results;
  card.appendChild(results);

  // Show initial hint
  renderResults('');

  // Input events
  input.addEventListener('input', () => renderResults(input.value));

  input.addEventListener('keydown', (e) => {
    const items = _resultsEl?._items || [];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocus(_focusedIndex < 0 ? 0 : _focusedIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocus(_focusedIndex <= 0 ? 0 : _focusedIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (_focusedIndex >= 0 && items.length > 0) {
        activateFocused();
      } else if (items.length === 1) {
        items[0].click();
      }
    } else if (e.key === 'Escape') {
      closeSpotlight();
    }
  });

  document.body.appendChild(overlay);

  // Focus input after paint
  requestAnimationFrame(() => { input.focus(); });
}

// ── Global keyboard shortcut ──────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    e.stopPropagation();
    openSpotlight();
  }
});

// ── Register command ──────────────────────────────────────────────────────────
platform.host.registerCommand('ui.spotlight', () => openSpotlight(), {
  callable: true,
  icon: 'search',
  title: 'Spotlight Search',
  category: 'System',
});
