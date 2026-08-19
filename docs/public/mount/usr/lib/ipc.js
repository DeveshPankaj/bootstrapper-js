// WosIPC — event-based message bus for sandboxed iframes
// Load via: <script src="/(sw)/usr/lib/ipc.js"></script>
// Or:       const { ipc } = await import('/(sw)/usr/lib/ipc.js');
// Then use: await ipc.fs.readText('/path'), await ipc.call('command.call', { name, args })

(function () {
  const pending = new Map();
  let counter = 0;
  const listeners = new Map();

  window.addEventListener('message', (e) => {
    if (!e.data) return;
    if (e.data.type === 'wos-ipc-response') {
      const cb = pending.get(e.data.id);
      if (!cb) return;
      pending.delete(e.data.id);
      e.data.error ? cb.reject(new Error(e.data.error)) : cb.resolve(e.data.result);
    } else if (e.data.type === 'wos-ipc-event') {
      (listeners.get(e.data.event) || []).forEach(h => h(e.data.data));
    }
  });

  const ipc = {
    call(event, data) {
      return new Promise((resolve, reject) => {
        const id = `wos-${++counter}`;
        pending.set(id, { resolve, reject });
        const target = window !== window.parent ? window.parent : window.top;
        target.postMessage({ type: 'wos-ipc', id, event, data }, '*');
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
  };

  window.ipc = ipc;
  if (typeof module !== 'undefined') module.exports = { ipc };
})();
