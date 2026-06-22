const platform = window.platform;
const _APP_DIR = platform._appDir || null;

const run = (...args) => {
  console.log('Opening...')
  console.log(args)
  const htmlPath = _APP_DIR ? `${_APP_DIR}/md-renderer.html` : '/home/user1/apps/md-renderer.html';
  platform.host.exec(platform, htmlPath, args.slice(2))
  // This window is just a redirector to md-renderer.html (which opens its own
  // window/taskbar entry) - close it immediately so it doesn't linger as a
  // second, never-closed taskbar entry.
  args[1]?.close()
}

const { remove } = platform.host.registerCommand("ui.markdown", run, {
  callable: false,
  icon: "folder",
  title: "Markdown",
  fullScreen: false,
  header: {style: {backgroundColor: ''}}
});
