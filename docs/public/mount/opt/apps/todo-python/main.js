const platform = window.platform;
const _APP_DIR = platform._appDir || '/opt/apps/todo-python';
const TODO_HTML = `/(sw)${_APP_DIR}/todo.html`;

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
  props.setWindowView(true);
};

platform.host.registerCommand('ui.py-todo', run, {
  title: 'Python Todo',
  icon: 'checklist',
  description: 'A simple todo list app with its UI and logic written in Python, run in-browser via Pyodide.',
  category: 'Tools',
});
