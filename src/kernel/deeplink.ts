// Ring 0 — Deep links (pre-boot half).
//
// A deep link is a URL whose *hash* asks the OS to open a command with one
// string argument once it has booted:
//
//   https://host/path/#open=<command>&app=<appId>&arg=<string>
//
// The hash (not the query) is used on purpose: it is never sent to the web
// server, and args such as WebRTC session descriptions contain IP addresses.
//
// This file only implements the part that has to run BEFORE anything else
// boots: if another tab of this same origin is already running the OS and
// has a handler for the command (see /usr/bin/deeplink.js, which installs
// the receiving side and does the actual command dispatch), the link is
// handed to that tab over a BroadcastChannel and this tab need not boot at
// all. Anything not acknowledged within the timeout falls through to a
// normal boot, where /usr/bin/deeplink.js opens the command locally.
//
// Deep links are only ever honored for commands that opt in by setting
// `deepLink: true` in their registerCommand meta - the URL is untrusted
// input, so it must not be able to launch arbitrary commands.

export const DEEPLINK_CHANNEL = 'wos-deeplink'
const NAME_RE = /^[A-Za-z0-9._-]{1,64}$/
const MAX_ARG = 20000
const SKIP_HANDOFF_KEY = '__wosNoHandoff'

export type DeepLink = { command: string; app: string | null; arg: string }

export function parseDeepLink(hash: string): DeepLink | null {
    if (!hash || hash.length < 2) return null
    const params = new URLSearchParams(hash.slice(1))
    const command = params.get('open')
    if (!command || !NAME_RE.test(command)) return null
    const app = params.get('app')
    return {
        command,
        app: app && NAME_RE.test(app) ? app : null,
        arg: (params.get('arg') || '').slice(0, MAX_ARG),
    }
}

// Resolves true if another tab took ownership of the link.
export function tryHandoffDeepLink(timeoutMs = 800): Promise<boolean> {
    const link = parseDeepLink(window.location.hash)
    if (!link || typeof BroadcastChannel === 'undefined') return Promise.resolve(false)
    try { if (sessionStorage.getItem(SKIP_HANDOFF_KEY)) { sessionStorage.removeItem(SKIP_HANDOFF_KEY); return Promise.resolve(false) } } catch (_) {}

    const id = Math.random().toString(36).slice(2) + Date.now().toString(36)
    const channel = new BroadcastChannel(DEEPLINK_CHANNEL)
    return new Promise<boolean>(resolve => {
        let settled = false
        const finish = (handedOff: boolean) => {
            if (settled) return
            settled = true
            channel.close()
            resolve(handedOff)
        }
        channel.onmessage = (e: MessageEvent) => {
            if (e.data && e.data.t === 'ack' && e.data.id === id) finish(true)
        }
        channel.postMessage({ t: 'open', id, command: link.command, arg: link.arg })
        setTimeout(() => finish(false), timeoutMs)
    })
}

// Replaces the page with a short notice once a link has been handed off.
export function showHandoffNotice() {
    try { window.close() } catch (_) {}
    document.body.innerHTML = ''
    const wrap = document.createElement('div')
    wrap.style.cssText = 'font:14px/1.5 system-ui,sans-serif;max-width:420px;margin:18vh auto;padding:0 20px;text-align:center;color:#333'
    const title = document.createElement('h2')
    title.textContent = 'Opened in your other tab'
    title.style.cssText = 'margin:0 0 8px;font-size:18px'
    const text = document.createElement('p')
    text.textContent = 'This link was handed to the tab where the app is already open. You can close this tab.'
    const button = document.createElement('button')
    button.textContent = 'Open here instead'
    button.style.cssText = 'margin-top:10px;padding:8px 14px;border-radius:8px;border:1px solid #bbb;background:#f5f5f5;cursor:pointer'
    button.onclick = () => {
        try { sessionStorage.setItem(SKIP_HANDOFF_KEY, '1') } catch (_) {}
        window.location.reload()
    }
    wrap.append(title, text, button)
    document.body.append(wrap)
}
