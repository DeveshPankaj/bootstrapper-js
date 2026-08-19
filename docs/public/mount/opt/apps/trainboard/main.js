const platform = window.platform;
const fs = platform.host.getFS();

const run = (body, props) => {
  if (!body) {
    platform.host.execCommand(
      "service('001-core.layout', 'open-window') (command('ui.trainboard'))",
      platform
    );
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.src = '/(sw)/opt/apps/trainboard/board.html';
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#0d0d14;';
  body.appendChild(iframe);

  if (props) {
    props.setTitle('TrainBoard');
    props.setWindowView(true);
  }

  iframe.addEventListener('load', () => {
    const bridge = {
      readFile:  (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } },
      writeFile: (p, d) => { try { fs.writeFileSync(p, d); return true; } catch { return false; } },
      listDir:   (p) => { try { return fs.readdirSync(p); } catch { return []; } },
      existsDir: (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } },
      mkDir:     (p) => { try { fs.mkdirSync(p, { recursive: true }); return true; } catch { return false; } },
    };
    if (iframe.contentWindow.__bdInit) iframe.contentWindow.__bdInit(bridge);
  });
};

platform.host.registerCommand('ui.trainboard', run, {
  title: 'TrainBoard',
  icon: 'monitoring',
  fullScreen: false,
  callable: true,
});
