// Ring 0 — Service worker bridge
// Registers the SW and routes /(sw)/<path> file requests back to the VFS.

//@ts-nocheck
import type _fs from 'fs'

export function initSwBridge(fs: typeof _fs) {
    if (!navigator.serviceWorker) return

    navigator.serviceWorker
        .register('/sw.bundle.js', { scope: '/' })
        .then(reg => {
            if (reg.active) console.log('[sw-bridge] service worker active')
            const worker = reg.installing || reg.waiting
            if (worker) {
                worker.addEventListener('statechange', () => {
                    if (worker.state === 'activated') location.reload()
                })
            }
            // Requests come only from our own service worker (this container
            // receives nothing else). The SW sends a normalised path and a
            // random request id, and accepts the reply only from this tab
            // (src/sw.ts, audit KRN-8). The reply goes back to the worker
            // that asked, even while a newer one is taking over.
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
        })
        .catch(err => console.error('[sw-bridge] registration failed:', err))
}
