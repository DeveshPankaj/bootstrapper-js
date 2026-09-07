//@ts-nocheck
import { initVFS } from './kernel/vfs'
import { initSwBridge } from './kernel/sw-bridge'

const __BOOTSTRAP_SCRIPT_PATH_KEY__ = '__BOOTSTRAP_SCRIPT_PATH__';

const loadBootstrapScript = (storage: Storage) => {
    const path = storage.getItem(__BOOTSTRAP_SCRIPT_PATH_KEY__) || '/remote.bundle.js'
    if (!path) return
    const script = window.document.createElement('script')
    script.src = path
    window.document.head.appendChild(script)
}

window.addEventListener('load', async () => {
    // Boot log — phases pushed here; readable from Settings > Boot Log.
    window.__bootLog = []
    const bootLog = (label: string, startMs: number, error?: string) => {
        window.__bootLog.push({ label, durationMs: Date.now() - startMs, error })
    }

    // Ring 0: bring up VFS + IPC bus
    const fs = await initVFS(bootLog)

    // Ring 0: register service worker + VFS file bridge
    initSwBridge(fs)

    // Load the main app bundle (remote.bundle.js → Platform + Layout)
    loadBootstrapScript(localStorage)
})
