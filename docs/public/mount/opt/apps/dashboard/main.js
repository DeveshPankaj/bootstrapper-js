const platform = window.platform;
const _APP_DIR = platform._appDir || null;

platform.host.registerCommand('ui.dashboard', (body, props) => {
  const iframeCmd = platform.host.getCommand('ui.iframe');
  if (!iframeCmd || !body) return;
  const htmlPath = _APP_DIR ? `${_APP_DIR}/dashboard.html` : '/home/user1/apps/dashboard.html';
  iframeCmd.exec(body, props, htmlPath);
}, { title: 'Dashboard', icon: 'dashboard', description: 'Personal dashboard with bookmarks and widgets' });
