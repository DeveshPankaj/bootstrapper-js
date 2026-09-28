// main.js — registers the app's command and opens its window. The app itself is
// main.html (a plain, non-compiled vfs file using native ES modules, opened via
// `ui.iframe` so it gets window.platform the same way distributed-compute's and the
// webrtc app's own main.html do — see CLAUDE.md's Platform/Host section and
// docs/public/mount/opt/apps/distributed-compute/main.js for the established pattern
// this file mirrors).
const platform = window.platform;
const APP_DIR = platform._appDir || '/opt/apps/distributed-kv';

const run = (body, props) => {
  if (!body) {
    platform.host.execCommand(
      "service('001-core.layout', 'open-window') (command('ui.distributed-kv'))",
      platform
    );
    return;
  }

  const iframeCommand = platform.host.getCommand('ui.iframe');
  if (!iframeCommand) {
    console.warn('[distributed-kv] ui.iframe is not available');
    return;
  }
  iframeCommand.exec(body, props, `${APP_DIR}/main.html`);

  // Roster + table layout wants a bit more room than the default window.
  try {
    const r = props.getBoundingClientRect();
    const vw = platform.window.innerWidth, vh = platform.window.innerHeight;
    props.setBoundingClientRect({
      left: Math.max(8, Math.min(r.left, vw - 760)),
      top: Math.max(8, Math.min(r.top, vh - 520)),
      width: Math.min(720, vw - 16),
      height: Math.min(520, vh - 16),
    });
  } catch (_) {}
};

platform.host.registerCommand('ui.distributed-kv', run, {
  title: 'Distributed KV',
  icon: 'hub',
  description: 'A tiny peer-to-peer replicated key/value store shared over a WebRTC Chat group (last-write-wins, syncs late joiners).',
  category: 'Network',
  callable: true,
});
