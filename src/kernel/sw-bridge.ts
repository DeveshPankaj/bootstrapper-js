// Ring 0 — Service worker bridge
// Registers the SW and routes /(sw)/<path> file requests back to the VFS.

//@ts-nocheck
import type _fs from 'fs'

const RELOAD_FLAG = '__wos_sw_reload__'

/**
 * Registers the service worker and resolves once it controls this page.
 *
 * The SW claims open pages when it activates (src/sw.ts: clients.claim()), so a
 * first visit doesn't need the reload it used to do — boot just waits for the
 * controller here (it is usually already there by the time the VFS is up) and
 * the whole boot doesn't run twice. A page that loaded while the worker was
 * activating, after that claim (e.g. reloaded during the first install), asks
 * the active worker to claim it (`sw/claim`). Only if control still doesn't
 * arrive does it fall back to reloading, once per session. An updated SW taking
 * over mid-session no longer reloads the page either.
 */
export function registerServiceWorker(timeoutMs = 4000): Promise<void> {
    if (!navigator.serviceWorker) return Promise.resolve()
    const container = navigator.serviceWorker
    if (container.controller) {
        try { sessionStorage.removeItem(RELOAD_FLAG) } catch (_) {}
    }

    const controlled = new Promise<void>(resolve => {
        if (container.controller) { resolve(); return }
        container.addEventListener('controllerchange', () => resolve(), { once: true })
    })

    container
        .register('/sw.bundle.js', { scope: '/' })
        .catch(err => console.error('[sw-bridge] registration failed:', err))

    // `ready` resolves once a worker is active, whatever state it was in when this
    // page loaded — no statechange to miss.
    if (!container.controller) {
        container.ready.then(reg => {
            if (container.controller) return
            try { reg.active?.postMessage({ type: 'sw/claim' }) } catch (_) {}
            setTimeout(() => {
                if (container.controller) return
                let reloaded = false
                try { reloaded = sessionStorage.getItem(RELOAD_FLAG) === '1'; sessionStorage.setItem(RELOAD_FLAG, '1') } catch (_) {}
                if (!reloaded) location.reload()
            }, 3000)
        })
    }

    return Promise.race([controlled, new Promise<void>(resolve => setTimeout(resolve, timeoutMs))])
}

/**
 * Answers the SW's file requests from the VFS. Requests come only from our own
 * service worker (this container receives nothing else). The SW sends a
 * normalised path and a random request id, and accepts the reply only from this
 * tab (src/sw.ts, audit KRN-8). The reply goes back to the worker that asked,
 * even while a newer one is taking over.
 */
export function initSwBridge(fs: typeof _fs) {
    if (!navigator.serviceWorker) return
    navigator.serviceWorker.addEventListener('message', event => {
        const { type, payload } = event.data ?? {}
        if (type !== 'fs/file-request') return
        const { path, request_id } = payload ?? {}
        if (typeof path !== 'string' || typeof request_id !== 'string') return

        const sw = (event.source as ServiceWorker | null) ?? navigator.serviceWorker.controller
        const reply = (data: unknown, error: string) => {
            try { sw?.postMessage({ type: 'fs/reply', payload: { data, error, request_id } }) } catch (_) {}
        }

        if (!window.fs) {
            reply('File system not mounted!', 'File system not mounted!')
            return
        }
        try {
            if (fs.existsSync(path) && !fs.statSync(path).isDirectory()) {
                reply(fs.readFileSync(path), '')
            } else {
                reply(`File not found! ${path}`, 'File not found!')
            }
        } catch (err) {
            reply(`File not readable! ${path}`, String(err?.code || err?.message || err))
        }
    })
}
