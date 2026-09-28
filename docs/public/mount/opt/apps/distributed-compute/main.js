// main.js — registers the app's command and opens its window. The app itself
// is main.html (a plain, non-compiled vfs file using native ES modules --
// verified to resolve correctly through the service worker's /(sw)/... path
// before the rest of this app was built on top of that assumption), opened
// via `ui.iframe` so it gets window.platform the same way the webrtc app's
// own main.html does (see CLAUDE.md's Platform/Host section and
// docs/public/mount/opt/apps/webrtc/main.js for the established pattern).
const platform = window.platform;
const APP_DIR = platform._appDir || '/opt/apps/distributed-compute';

const run = (body, props) => {
  if (!body) {
    platform.host.execCommand(
      "service('001-core.layout', 'open-window') (command('ui.distributed-compute'))",
      platform
    );
    return;
  }

  const iframeCommand = platform.host.getCommand('ui.iframe');
  if (!iframeCommand) {
    console.warn('[distributed-compute] ui.iframe is not available');
    return;
  }
  iframeCommand.exec(body, props, `${APP_DIR}/main.html`);

  // Chunk/roster/editor layout wants a bit more room than the default window.
  try {
    const r = props.getBoundingClientRect();
    const vw = platform.window.innerWidth, vh = platform.window.innerHeight;
    props.setBoundingClientRect({
      left: Math.max(8, Math.min(r.left, vw - 900)),
      top: Math.max(8, Math.min(r.top, vh - 560)),
      width: Math.min(880, vw - 16),
      height: Math.min(560, vh - 16),
    });
  } catch (_) {}
};

platform.host.registerCommand('ui.distributed-compute', run, {
  title: 'Distributed Compute',
  icon: 'hub',
  description: "Distribute a map/reduce computation (including training a tiny neural net) across everyone connected in a WebRTC Chat group's mesh.",
  category: 'Network',
  callable: true,
});
