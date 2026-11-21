// WosIPC — event-based message bus for sandboxed iframes
// Load via: <script src="/(sw)/usr/lib/ipc.js"></script>
// Or:       const { ipc } = await import('/(sw)/usr/lib/ipc.js');
// (the kernel also inlines it into the docks' and ui.sandboxed-app's srcdoc)
// Then use: await ipc.fs.readText('/path'), await ipc.call('wm.getWindows')
//
// The bus (src/kernel/ipc-bus.ts) runs on the OS window and answers only frames the
// kernel registered, within their policy — anything else gets no reply, so calls
// reject after TIMEOUT_MS instead of hanging. Requests go up the ancestor chain
// (parent … top) until the OS window answers — so a frame nested inside a window or
// an app reaches it too — and from then on only to that window. Responses are
// accepted only from it (or, before it is known, from an ancestor) and must match a
// pending random id; events only from the OS (an ancestor, or a same-origin OS realm
// such as the layout).

(function () {
  const TIMEOUT_MS = 30000;
  const pending = new Map();
  const listeners = new Map();
  let kernel = null;        // the window that answered first
  let kernelOrigin = null;

  const ancestors = () => {
    const list = [];
    try {
      for (let w = window; w !== w.parent && list.length < 32;) { w = w.parent; list.push(w); }
    } catch (_) {}
    return list;
  };
  const isAncestor = (win) => !!win && ancestors().includes(win);
  // Origins of the windows above us (Chromium/WebKit) plus the OS window's, once known.
  const isOsOrigin = (origin) => {
    if (!origin || origin === 'null') return false;
    if (origin === kernelOrigin) return true;
    try {
      const list = window.location.ancestorOrigins;
      if (list) for (let i = 0; i < list.length; i++) if (list[i] === origin) return true;
    } catch (_) {}
    return false;
  };
  const randomId = () => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return 'wos-' + Array.from(bytes, (b) => (b + 256).toString(16).slice(1)).join('');
  };

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'wos-ipc-response') {
      if (kernel ? e.source !== kernel : !isAncestor(e.source)) return;
      const cb = pending.get(d.id);
      if (!cb) return;
      pending.delete(d.id);
      clearTimeout(cb.timer);
      if (!kernel) { kernel = e.source; kernelOrigin = e.origin; }
      d.error ? cb.reject(new Error(d.error)) : cb.resolve(d.result);
    } else if (d.type === 'wos-ipc-event') {
      if (typeof d.event !== 'string') return;
      if (e.source !== kernel && !isAncestor(e.source) && !isOsOrigin(e.origin)) return;
      (listeners.get(d.event) || []).slice().forEach((h) => {
        try { h(d.data); } catch (err) { console.error('[ipc] event handler failed:', err); }
      });
    }
  });

  const ipc = {
    call(event, data) {
      return new Promise((resolve, reject) => {
        const id = randomId();
        const timer = setTimeout(() => {
          if (pending.delete(id)) reject(new Error(`IPC timeout: ${event} (not answered — is this frame registered?)`));
        }, TIMEOUT_MS);
        pending.set(id, { resolve, reject, timer });
        const msg = { type: 'wos-ipc', id, event, data };
        const targets = kernel ? [kernel] : ancestors();
        if (!targets.length) targets.push(window);
        for (const t of targets) { try { t.postMessage(msg, '*'); } catch (_) {} }
      });
    },
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(handler);
    },
    off(event, handler) {
      const arr = (listeners.get(event) || []).filter(h => h !== handler);
      listeners.set(event, arr);
    },
    fs: {
      read:     (path) => ipc.call('fs.read',     { path }),
      readText: (path) => ipc.call('fs.readText',  { path }),
      write:    (path, content) => ipc.call('fs.write', { path, content }),
      list:     (path) => ipc.call('fs.list',     { path }),
      exists:   (path) => ipc.call('fs.exists',   { path }),
      mkdir:    (path) => ipc.call('fs.mkdir',    { path }),
      rm:       (path) => ipc.call('fs.rm',       { path }),
      stat:     (path) => ipc.call('fs.stat',     { path }),
    },
    // Opens a file this frame may read in the system editor (Notepad).
    editor: {
      open: (path) => ipc.call('editor.open', { path }),
    },
  };

  window.ipc = ipc;
  if (typeof module !== 'undefined') module.exports = { ipc };
})();
