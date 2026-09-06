const platform = window.platform;
const fs = platform.host.getFS();
const realWindow = platform.window;

function attachFsBridge(iframe, props) {
  const handler = (event) => {
    try {
      if (event.source !== iframe.contentWindow) return;
      const { id, method, params } = event.data || {};
      if (!id || !method) return;
      let result, error;
      try {
        switch (method) {
          case 'fs.read':
            result = fs.readFileSync(params.path, 'utf8');
            break;
          case 'fs.write': {
            const dir = params.path.split('/').slice(0, -1).join('/');
            if (dir) try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
            fs.writeFileSync(params.path, params.content);
            result = true;
            break;
          }
          case 'fs.mkdir':
            fs.mkdirSync(params.path, { recursive: true });
            result = true;
            break;
          case 'fs.remove':
            try { fs.unlinkSync(params.path); } catch (_) {}
            result = true;
            break;
          case 'fs.list':
            result = fs.readdirSync(params.path);
            break;
          case 'fs.exists':
            result = fs.existsSync(params.path);
            break;
          case 'fs.stat': {
            const s = fs.statSync(params.path);
            result = { isDirectory: s.isDirectory(), isFile: s.isFile(), size: s.size };
            break;
          }
          case 'fs.rename':
            fs.renameSync(params.from, params.to);
            result = true;
            break;
          case 'window.setTitle':
            if (props && props.setTitle) props.setTitle(params.title);
            result = true;
            break;
          case 'app.log':
            console.log('[app]', params.value);
            result = true;
            break;
          default:
            error = 'Unknown method: ' + method;
        }
      } catch (e) {
        error = e.message;
      }
      try { iframe.contentWindow.postMessage({ id, result, error }, '*'); } catch (_) {}
    } catch (_) {}
  };

  realWindow.addEventListener('message', handler);

  const obs = new MutationObserver(() => {
    if (!iframe.isConnected) {
      realWindow.removeEventListener('message', handler);
      obs.disconnect();
    }
  });
  if (iframe.parentElement) obs.observe(iframe.parentElement, { childList: true });
}

platform.host.registerCommand('ui.trainboard', (body, props) => {
  if (!body) {
    platform.host.execCommand(
      "service('001-core.layout', 'open-window') (command('ui.trainboard'))",
      platform
    );
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.src = '/(sw)/opt/apps/trainboard/main.html';
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#fafafa;';
  body.appendChild(iframe);

  if (props && props.setWindowView) props.setWindowView(true);
  attachFsBridge(iframe, props);
}, {
  title: 'TrainBoard',
  icon: 'monitoring',
  description: 'Training metrics dashboard — log loss and accuracy from AI apps, view live charts.',
  callable: true,
});
