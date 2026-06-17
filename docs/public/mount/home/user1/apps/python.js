const platform = window.platform;
const PYTHON_HTML = '/(sw)/home/user1/apps/python.html';

const run = (body, props, filepath) => {
  if (!body) {
    const openWindow = platform.host.getService('001-core.layout', 'open-window');
    if (openWindow) openWindow(platform.host.getCommand('ui.python'), filepath || '');
    return;
  }
  const src = filepath
    ? `${PYTHON_HTML}?file=${encodeURIComponent(filepath)}`
    : PYTHON_HTML;
  Object.assign(body.style, { margin: '0', padding: '0', overflow: 'hidden', height: '100%' });
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
  body.appendChild(iframe);
};

platform.host.registerCommand('ui.python', run, {
  name: 'Python',
  icon: 'terminal',
  description: 'Python REPL powered by Pyodide',
});
