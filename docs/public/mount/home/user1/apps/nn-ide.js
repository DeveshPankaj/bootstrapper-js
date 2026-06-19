const platform = window.platform;

platform.host.registerCommand('ui.nn-ide', (body, props) => {
  const iframeCmd = platform.host.getCommand('ui.iframe');
  if (!iframeCmd || !body) return;
  iframeCmd.exec(body, props, '/home/user1/apps/nn-ide.html');
}, { title: 'Neural Network IDE', icon: 'neurology', description: 'Visual neural network builder and trainer — runs in browser via TensorFlow.js' });
