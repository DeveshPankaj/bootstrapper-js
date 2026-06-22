const platform = window.platform;
const _APP_DIR = platform._appDir || null;
const PYTHON_HTML = _APP_DIR ? `/(sw)${_APP_DIR}/python.html` : '/(sw)/home/user1/apps/python.html';

const run = (body, props, filepath) => {
  if (!body) {
    platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.python'))", platform)
    return
  }
  const src = filepath
    ? `${PYTHON_HTML}?file=${encodeURIComponent(filepath)}`
    : PYTHON_HTML;
  Object.assign(body.style, { margin: '0', padding: '0', overflow: 'hidden', height: '100%' });
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
  body.appendChild(iframe);
  props.setWindowView(true);
};

platform.host.registerCommand('ui.python', run, {
  title: 'Python',
  icon: 'terminal',
  description: 'Python REPL powered by Pyodide',
  fileExtensions: ['.py'],
});
