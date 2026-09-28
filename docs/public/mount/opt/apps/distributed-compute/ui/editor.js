// ui/editor.js — a small code-editor wrapper.
//
// Uses CodeMirror 5 (classic, non-module UMD build loaded from a CDN by
// main.html via plain <script> tags, the same convention already used in this
// codebase for xterm.js in the terminal app — see CLAUDE.md's Terminal
// section) when it loaded successfully, or falls back to a plain monospace
// <textarea> if the CDN script didn't load (offline dev, blocked network,
// etc.) so the app is never left without a way to edit code.
export function createEditor(container, initialValue) {
  if (typeof window.CodeMirror === 'function') {
    const cm = window.CodeMirror(container, {
      value: initialValue || '',
      mode: 'javascript',
      theme: 'default',
      lineNumbers: true,
      indentUnit: 2,
      tabSize: 2,
      viewportMargin: Infinity,
    });
    return {
      kind: 'codemirror',
      getValue: () => cm.getValue(),
      setValue: (v) => cm.setValue(v || ''),
      refresh: () => cm.refresh(),
    };
  }

  const textarea = document.createElement('textarea');
  textarea.className = 'plain-editor';
  textarea.spellcheck = false;
  textarea.value = initialValue || '';
  container.appendChild(textarea);
  return {
    kind: 'textarea',
    getValue: () => textarea.value,
    setValue: (v) => { textarea.value = v || ''; },
    refresh: () => {},
  };
}
