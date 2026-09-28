const platform = window.platform;
const _APP_DIR = platform._appDir || null;

platform.host.registerCommand('ui.youtube-player', (body, props) => {
  const iframeCmd = platform.host.getCommand('ui.iframe');
  if (!iframeCmd || !body) return;
  const htmlPath = `${_APP_DIR || '/opt/apps/youtube-player'}/main.html`;
  iframeCmd.exec(body, props, htmlPath);
}, { title: 'YouTube Player', icon: 'smart_display', description: 'Paste a YouTube video or playlist link and watch it in an embedded player' });
