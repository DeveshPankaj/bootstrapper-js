const platform = window.platform;
const _APP_DIR = platform._appDir || '/opt/apps/notebook';
const NOTEBOOK_HTML = `/(sw)${_APP_DIR}/notebook.html`;

const run = (body, props, filePath) => {
  if (!body) {
    platform.host.execCommand(
      "service('001-core.layout','open-window')(command('ui.notebook'))",
      platform
    );
    return;
  }

  Object.assign(body.style, { margin: '0', padding: '0', overflow: 'hidden', height: '100%' });

  const iframe = document.createElement('iframe');
  iframe.src = NOTEBOOK_HTML;
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
  body.appendChild(iframe);

  const filename = filePath ? filePath.split('/').pop() : 'Untitled.ipynb';
  props.setTitle(filename);
  props.setWindowView(true);

  iframe.addEventListener('load', () => {
    const fs = platform.host.getFS();

    const bridge = {
      readFile(path) {
        try { return fs.readFileSync(path, 'utf8'); } catch { return null; }
      },
      writeFile(path, content) {
        try {
          const dir = path.slice(0, path.lastIndexOf('/'));
          if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path, content, 'utf8');
          return true;
        } catch (e) {
          console.error('[notebook] writeFile', e);
          return false;
        }
      },
      existsFile(path) {
        try { return fs.existsSync(path); } catch { return false; }
      },
      // setTitle persists because props is a plain JS object (not a Pyodide borrowed proxy)
      setTitle(t) { props.setTitle(t); },
      initialFile: filePath || null,
    };

    iframe.contentWindow.__nbBridge = bridge;
    // Trigger app init now that the bridge is ready
    if (typeof iframe.contentWindow.__nbInit === 'function') {
      iframe.contentWindow.__nbInit(bridge);
    }
  });
};

platform.host.registerCommand('ui.notebook', run, {
  title: 'Notebook',
  icon: 'menu_book',
  description: 'Jupyter-style Python notebook — run cells, render markdown, read/write .ipynb files',
  category: 'Development',
  fileExtensions: ['.ipynb'],
});
