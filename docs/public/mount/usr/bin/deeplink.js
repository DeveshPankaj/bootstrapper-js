// /usr/bin/deeplink.js — deep links (post-boot half; the pre-boot cross-tab
// handoff lives in src/kernel/deeplink.ts). Run at boot from initd.run,
// after pkg-manager/loader.js so installed apps have registered their commands.
//
//   https://host/path/#open=<command>&app=<appId>&arg=<string>
//
// SECURITY: the URL is untrusted input. Only commands that opt in with
// `deepLink: true` in their registerCommand meta can be opened this way, the
// command/app names are validated against a strict pattern, and `arg` is only
// ever passed as data ($args) — never interpolated into the command string.
//
// A command may also provide, in its meta:
//   hasDeepLinkTarget(): boolean  — true if an already-open instance can take the arg
//   onDeepLink(arg): boolean      — deliver arg to that instance (true = handled)
// so a link can be routed to a running window (in this tab, or via the
// BroadcastChannel below, in another tab) instead of opening a second one.

const CHANNEL = 'wos-deeplink'
const NAME_RE = /^[A-Za-z0-9._-]{1,64}$/
const MAX_ARG = 20000
const top = window.top

const parse = (hash) => {
  if (!hash || hash.length < 2) return null
  const params = new URLSearchParams(hash.slice(1))
  const command = params.get('open')
  if (!command || !NAME_RE.test(command)) return null
  const app = params.get('app')
  return { command, app: app && NAME_RE.test(app) ? app : null, arg: (params.get('arg') || '').slice(0, MAX_ARG) }
}

const isOptedIn = (cmd) => !!(cmd && cmd.meta && cmd.meta.deepLink === true)
const hasTarget = (cmd) => {
  try { return isOptedIn(cmd) && typeof cmd.meta.hasDeepLinkTarget === 'function' && typeof cmd.meta.onDeepLink === 'function' && cmd.meta.hasDeepLinkTarget() === true }
  catch (_) { return false }
}
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// ── Receiving side: other tabs asking us to take a link ────────────────────
if (typeof BroadcastChannel !== 'undefined') {
  const channel = new BroadcastChannel(CHANNEL)
  const claimed = new Set()
  channel.onmessage = (event) => {
    const msg = event.data
    if (!msg || typeof msg !== 'object') return
    if (msg.t === 'ack') { claimed.add(msg.id); return }
    if (msg.t !== 'open' || typeof msg.id !== 'string' || typeof msg.command !== 'string' || typeof msg.arg !== 'string') return
    if (!NAME_RE.test(msg.command)) return
    const cmd = platform.host.getCommand(msg.command)
    if (!hasTarget(cmd)) return
    // If several tabs could take it, the first to ack wins (small random
    // delay lets one ack reach the rest before they act).
    setTimeout(() => {
      if (claimed.has(msg.id)) return
      claimed.add(msg.id)
      channel.postMessage({ t: 'ack', id: msg.id })
      try { cmd.meta.onDeepLink(msg.arg.slice(0, MAX_ARG)) } catch (e) { console.warn('[deeplink] handler failed:', e) }
    }, Math.random() * 40)
  }
}

// ── This tab's own link (present when it was opened from one) ──────────────
const openLocally = async (link) => {
  const fs = platform.host.getFS()
  let cmd = platform.host.getCommand(link.command)
  if (!cmd && link.app) {
    // App not installed/loaded in this browser yet: load it from its own dir.
    const mainFile = `/opt/apps/${link.app}/main.js`
    if (fs.existsSync(mainFile)) {
      platform._appDir = `/opt/apps/${link.app}`
      try { platform.host.exec(platform, mainFile) } catch (e) { console.warn('[deeplink] loading app failed:', e) }
      finally { delete platform._appDir }
      cmd = platform.host.getCommand(link.command)
    }
  }
  if (!isOptedIn(cmd)) {
    console.warn(`[deeplink] "${link.command}" is not available or does not accept deep links`)
    return
  }
  if (hasTarget(cmd) && cmd.meta.onDeepLink(link.arg) === true) return
  // The layout module boots in parallel. open-window silently does nothing
  // until the desktop's .content-area is mounted, so wait for that first.
  const doc = top.document
  const windowOpen = () => doc.querySelector(`.window[data-name="${link.command}"]`) !== null
  for (let attempt = 0; attempt < 40; attempt++) {
    if (!doc.querySelector('.content-area')) { await sleep(400); continue }
    try {
      await platform.host.execCommand("service('001-core.layout','open-window')(command($args[0]), $args[1])", platform, link.command, link.arg)
      if (windowOpen()) return
    } catch (e) { /* layout service not registered yet */ }
    await sleep(400)
  }
  console.warn('[deeplink] could not open window for', link.command)
}

const link = parse(top.location.hash)
if (link) {
  // Consume the link so a reload doesn't replay a stale offer/answer.
  try { top.history.replaceState(null, '', top.location.pathname + top.location.search) } catch (_) {}
  openLocally(link)
}
