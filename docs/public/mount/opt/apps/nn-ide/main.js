const platform = window.platform;
const _APP_DIR = platform._appDir || null;

platform.host.registerCommand('ui.nn-ide', (body, props) => {
  if (!body) {
    platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.nn-ide'))", platform)
    return
  }
  const iframeCmd = platform.host.getCommand('ui.iframe');
  if (!iframeCmd) return;
  const htmlPath = _APP_DIR ? `${_APP_DIR}/nn-ide.html` : '/home/user1/apps/nn-ide.html';
  iframeCmd.exec(body, props, htmlPath);
}, { title: 'Neural Network IDE', icon: 'neurology', description: 'Visual neural network builder and trainer — runs in browser via TensorFlow.js' });
