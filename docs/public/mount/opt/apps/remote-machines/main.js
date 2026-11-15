// Remote Machines — window launcher.
//
// The app itself is main.html (opened as a same-origin iframe through ui.iframe, which gives it
// window.platform, so it can read and write the VFS). It talks to an SSH bridge (the
// workspace-ssh bridge from ts-playground: `node bridge.mjs`) over a WebSocket and, through it,
// to any machine reachable over SSH: saved connections, terminals on the machine or inside its
// LXD / Incus containers, and a file browser with copies to and from the VFS.
//
// This file only registers the `ui.remote-machines` command and sizes the window.

const platform = window.platform
const APP_DIR = platform._appDir || '/opt/apps/remote-machines'
const PAGE = `${APP_DIR}/main.html`

const run = (body, props) => {
  if (!body) {
    platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.remote-machines'))", platform)
    return
  }
  const iframeCommand = platform.host.getCommand('ui.iframe')
  if (!iframeCommand) { console.warn('[remote-machines] ui.iframe is not available'); props.close(); return }
  iframeCommand.exec(body, props, PAGE)
  // Terminals and the file list need more room than the default window.
  try {
    const r = props.getBoundingClientRect()
    const vw = platform.window.innerWidth, vh = platform.window.innerHeight
    props.setBoundingClientRect({ left: Math.max(8, Math.min(r.left, vw - 1000)), top: Math.max(8, Math.min(r.top, vh - 660)), width: Math.min(980, vw - 16), height: Math.min(640, vh - 16) })
  } catch (_) {}
}

platform.host.registerCommand('ui.remote-machines', run, {
  title: 'Remote Machines',
  icon: 'lan',
  description: 'SSH machines through a bridge: saved connections, terminals (also inside LXD containers) and a file browser',
  category: 'Network',
})
