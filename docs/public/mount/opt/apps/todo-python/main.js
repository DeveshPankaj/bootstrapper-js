const platform = window.platform;
const _APP_DIR = platform._appDir || '/opt/apps/todo-python';
const TODO_HTML = `/(sw)${_APP_DIR}/todo.html`;
const ENTRY_FILE = 'todo.py';
const DATA_DIR = '/home/user1/.local/share/todo-python';
const DATA_FILE = DATA_DIR + '/todos.json';

// BrowserFS's mkdirSync(dir, {recursive:true}) doesn't reliably create
// multi-level paths (confirmed: throws ENOENT on '/home/user1/.local' when
// both it and 'share' are missing) — create each segment by hand instead,
// same workaround used by colleps/pkg-manager's main.js.
const fs = platform.host.getFS();
const mkdirpSync = (dirPath) => {
  const parts = dirPath.split('/').filter(Boolean);
  let cur = '';
  for (const part of parts) {
    cur += '/' + part;
    try { fs.mkdirSync(cur); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
};

const run = (body, props) => {
  if (!body) {
    platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.py-todo'))", platform);
    return;
  }
  Object.assign(body.style, { margin: '0', padding: '0', overflow: 'hidden', height: '100%' });
  const iframe = document.createElement('iframe');
  iframe.src = TODO_HTML;
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
  body.appendChild(iframe);

  // Bridge for Python (running inside this plain, same-origin iframe) to
  // persist todos to the real vfs, and to pull in sibling .py files so the
  // entry point can `import` them like a normal local Python package —
  // main.js already has synchronous fs access via platform.host.getFS(),
  // so no async AppSDK/postMessage layer is needed here (unlike sandboxed
  // apps' props.proxyFs).
  iframe.addEventListener('load', () => {
    iframe.contentWindow.__todoFS = {
      load: function() {
        try { return fs.readFileSync(DATA_FILE, 'utf8'); }
        catch (e) { return null; }
      },
      save: function(json) {
        try {
          if (!fs.existsSync(DATA_DIR)) mkdirpSync(DATA_DIR);
          fs.writeFileSync(DATA_FILE, json);
        } catch (e) { console.warn('[todo-python] failed to save todos:', e); }
      },
      // Every other .py file living alongside the entry point, so it can
      // `import <name>` it as a normal module — see todo.py importing
      // storage.py for persistence.
      listModules: function() {
        try {
          return fs.readdirSync(_APP_DIR)
            .filter((n) => n.endsWith('.py') && n !== ENTRY_FILE)
            .map((n) => ({ name: n, content: fs.readFileSync(_APP_DIR + '/' + n, 'utf8') }));
        } catch (e) { return []; }
      },
    };
  });

  props.setWindowView(true);
};

platform.host.registerCommand('ui.py-todo', run, {
  title: 'Python Todo',
  icon: 'checklist',
  description: 'A simple todo list app with its UI and logic written in Python, run in-browser via Pyodide.',
  category: 'Tools',
});
