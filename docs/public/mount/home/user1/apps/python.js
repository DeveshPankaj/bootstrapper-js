const platform = window.platform;
const PYTHON_HTML = '/(sw)/home/user1/apps/python.html';

const run = (body, props, filepath) => {
  if (!body) return;
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
});
