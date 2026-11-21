// Implicit Function Visualizer — window launcher.
//
// The app itself is main.html: it plots F(x, y) = c (2 variables) or
// F(x, y, z) = c (3 variables). It needs nothing from the OS, so it runs in
// the opaque sandbox (ui.sandboxed-app): its own DOM only, no window.platform,
// no storage. This file only registers the command and sizes the window.

const platform = window.platform
const APP_DIR = platform._appDir || '/opt/apps/implicit-function-visualizer'
const PAGE = `${APP_DIR}/main.html`
const COMMAND = 'ui.implicit-function-visualizer'
const TITLE = 'Implicit Function Visualizer'

const run = (body, props) => {
  if (!body) {
    platform.host.openWindow(COMMAND)
    return
  }
  const sandboxed = platform.host.getCommand('ui.sandboxed-app')
  if (!sandboxed) { console.warn('[implicit-function-visualizer] ui.sandboxed-app is not available'); props.close(); return }
  sandboxed.exec(body, props, PAGE)
  props.setTitle(TITLE)
  // A plot needs more room than the default window.
  try {
    const r = props.getBoundingClientRect()
    const vw = platform.window.innerWidth, vh = platform.window.innerHeight
    const width = Math.min(1120, vw - 16), height = Math.min(720, vh - 16)
    props.setBoundingClientRect({
      left: Math.max(8, Math.min(r.left, vw - width - 8)),
      top: Math.max(8, Math.min(r.top, vh - height - 8)),
      width,
      height,
    })
  } catch (_) {}
}

platform.host.registerCommand(COMMAND, run, {
  title: TITLE,
  icon: 'function',
  description: 'Plot implicit equations in 2 or 3 variables: F(x, y) = c as a surface with its level curve, or F(x, y, z) = c as an isosurface',
  category: 'Tools',
})
