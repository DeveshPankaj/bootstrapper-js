// WebRTC Chat — window launcher + deep-link entry point.
//
// The app itself is main.html (opened as a plain same-origin iframe through
// ui.iframe, which gives it window.platform, so it can use the VFS and
// register CLI commands directly). This file only:
//   * registers the `ui.webrtc` command (single instance),
//   * opts in to deep links (see /usr/bin/deeplink.js) so an invite/answer link
//     opened in another tab is delivered to the running window instead of
//     opening a second one.
//
// The page registers `webrtc.deliver` (takes a signal string) while it is open;
// that command's meta.alive() lets us tell a live window from a stale one.

const platform = window.platform
const APP_DIR = platform._appDir || '/opt/apps/webrtc'
const PAGE = `/(sw)${APP_DIR}/main.html`

const liveInstance = () => {
  const cmd = platform.host.getCommand('webrtc.deliver')
  try { return cmd && cmd.meta && cmd.meta.alive() ? cmd : null } catch (_) { return null }
}

const run = (body, props, arg) => {
  if (!body) {
    platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.webrtc'))", platform)
    return
  }
  const signal = typeof arg === 'string' ? arg : ''

  // One session per tab: peers/CLI state live in that page. A second window
  // would just be a second, unrelated peer — hand the link to the live one.
  const existing = liveInstance()
  if (existing) {
    if (signal) existing.exec(signal)
    props.close()
    return
  }

  const iframeCommand = platform.host.getCommand('ui.iframe')
  if (!iframeCommand) { console.warn('[webrtc] ui.iframe is not available'); props.close(); return }
  const origin = platform.window.location.origin
  // ui.iframe only treats "/"-prefixed strings as vfs paths, so pass an absolute URL
  // to be able to carry the ?signal= parameter.
  iframeCommand.exec(body, props, `${origin}${PAGE}${signal ? `?signal=${encodeURIComponent(signal)}` : ''}`)
  // Chat + folder dialogs need more room than the default window.
  try {
    const r = props.getBoundingClientRect()
    const vw = platform.window.innerWidth, vh = platform.window.innerHeight
    props.setBoundingClientRect({ left: Math.max(8, Math.min(r.left, vw - 940)), top: Math.max(8, Math.min(r.top, vh - 640)), width: Math.min(920, vw - 16), height: Math.min(600, vh - 16) })
  } catch (_) {}
}

platform.host.registerCommand('ui.webrtc', run, {
  title: 'WebRTC Chat',
  icon: 'forum',
  description: 'Peer-to-peer group chat, direct messages, file transfer and VFS folder sharing over WebRTC',
  category: 'Network',
  deepLink: true,
  hasDeepLinkTarget: () => !!liveInstance(),
  onDeepLink: (arg) => {
    const instance = liveInstance()
    if (!instance) return false
    instance.exec(String(arg))
    return true
  },
})
