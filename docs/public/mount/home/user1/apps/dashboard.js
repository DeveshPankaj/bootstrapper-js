const platform = window.platform;

platform.host.registerCommand('ui.dashboard', (body, props) => {
  const iframeCmd = platform.host.getCommand('ui.iframe');
  if (!iframeCmd || !body) return;
  iframeCmd.exec(body, props, '/home/user1/apps/dashboard.html');
}, { title: 'Dashboard', icon: 'dashboard', description: 'Personal dashboard with bookmarks and widgets' });
