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
            navigator.serviceWorker.addEventListener('message', event => {
                const { type, payload } = event.data ?? {}
                if (type !== 'fs/file-request') return
                const { path, request_id } = payload ?? {}

                if (!window.fs) {
                    navigator.serviceWorker.controller?.postMessage({
                        type: 'fs/reply',
                        payload: { data: 'File system not mounted!', error: 'File system not mounted!', request_id },
                    })
                    return
                }

                if (fs.existsSync(path)) {
                    navigator.serviceWorker.controller?.postMessage({
                        type: 'fs/reply',
                        payload: { data: fs.readFileSync(path), error: '', request_id },
                    })
                } else {
                    navigator.serviceWorker.controller?.postMessage({
                        type: 'fs/reply',
                        payload: { data: `File not found! ${path}`, error: 'File not found!', request_id },
                    })
                }
            })
        })
        .catch(err => console.error('[sw-bridge] registration failed:', err))
}
