const platform = window.platform;

const run = (...args) => {
  console.log('Opening...')
  console.log(args)
  platform.host.exec(platform, '/home/user1/apps/md-render.html', args.slice(2))
}

const { remove } = platform.host.registerCommand("ui.markdown", run, {
  callable: false,
  icon: "folder",
  title: "Markdown",
  fullScreen: false,
  header: {style: {backgroundColor: ''}}
});
