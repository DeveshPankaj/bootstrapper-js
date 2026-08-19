const platform = window.platform;
const fs = platform.host.getFS();

// BrowserFS recursive mkdir doesn't reliably create multi-level paths; do it manually.
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
    platform.host.execCommand(
      "service('001-core.layout', 'open-window') (command('ui.colleps'))",
      platform
    );
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.src = '/(sw)/opt/apps/colleps/colleps.html';
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#0d0d14;';
  body.appendChild(iframe);

  if (props) {
    props.setTitle('Colleps');
    props.setWindowView(true);
  }

  iframe.addEventListener('load', () => {
    const bridge = {
      readFile:  (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } },
      writeFile: (p, d) => { try { fs.writeFileSync(p, d); return true; } catch { return false; } },
      listDir:   (p) => { try { return fs.readdirSync(p); } catch { return []; } },
      existsDir: (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } },
      mkDir:     (p) => { try { mkdirpSync(p); return true; } catch { return false; } },
    };
    if (iframe.contentWindow.__collepsInit) iframe.contentWindow.__collepsInit(bridge);
  });
};

platform.host.registerCommand('ui.colleps', run, {
  title: 'Colleps',
  icon: 'grid_view',
  fullScreen: false,
  callable: true,
});
