//@ts-nocheck
import { initVFS } from './kernel/vfs'
import { initSwBridge, registerServiceWorker } from './kernel/sw-bridge'
import { tryHandoffDeepLink, showHandoffNotice } from './kernel/deeplink'
import { hardenWindow } from './kernel/ipc-bus'

// The main bundle is fixed (audit KRN-9, decisions.md D12). It used to be
// overridable through localStorage, which let any same-origin script swap
// the kernel for its own on every boot; a leftover value is removed.
const BOOTSTRAP_SCRIPT = '/remote.bundle.js'
const LEGACY_BOOTSTRAP_OVERRIDE_KEY = '__BOOTSTRAP_SCRIPT_PATH__'

const loadBootstrapScript = () => {
    try { localStorage.removeItem(LEGACY_BOOTSTRAP_OVERRIDE_KEY) } catch (_) {}
    const script = window.document.createElement('script')
    script.src = BOOTSTRAP_SCRIPT
    window.document.head.appendChild(script)
}

// True when any ancestor frame belongs to another origin (or can't be read,
// e.g. the OS was loaded into an opaque sandbox). A same-origin parent — the
// OS opened inside its own Browser app — is fine.
const isFramedByAnotherOrigin = (): boolean => {
    if (window.top === window.self) return false
    try {
        for (let w: Window = window, depth = 0; w !== w.top && depth < 64; depth++) {
            w = w.parent
            if (w.location.origin !== window.location.origin) return true
        }
        return false
    } catch (_) {
        return true
    }
}

// Replaces the page with a short notice and a link to open it on its own.
const showFramedNotice = () => {
    const show = () => {
        document.body.textContent = ''
        const wrap = document.createElement('div')
        wrap.style.cssText = 'font:14px/1.5 system-ui,sans-serif;max-width:420px;margin:18vh auto;padding:0 20px;text-align:center;color:#333'
        const title = document.createElement('h2')
        title.textContent = 'This page can’t run inside another site'
        title.style.cssText = 'margin:0 0 8px;font-size:18px'
        const link = document.createElement('a')
        link.textContent = 'Open it in its own tab'
        link.href = window.location.href
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        wrap.append(title, link)
        document.body.append(wrap)
    }
    if (document.body) show()
    else window.addEventListener('DOMContentLoaded', show, { once: true })
}

// Ring 0: never boot inside a frame of another site (audit KRN-11, decisions.md
// D12) — it could overlay or click-jack the desktop, and on browsers without
// storage partitioning it would see this origin's real files.
if (isFramedByAnotherOrigin()) {
    showFramedNotice()
} else {
    // A page that opened this one keeps no handle the OS would talk back to,
    // and pages the OS opens on other origins get no opener (KRN-11, APP-9).
    try { window.opener = null } catch (_) {}
    hardenWindow(window)

    window.addEventListener('load', async () => {
        // Deep link opened in a fresh tab while another tab already runs the OS
        // and can handle it: hand it over and skip booting entirely.
        if (await tryHandoffDeepLink()) {
            showHandoffNotice()
            return
        }

        // Boot log — phases pushed here; readable from Settings > Boot Log.
        window.__bootLog = []
        const bootLog = (label: string, startMs: number, error?: string) => {
            window.__bootLog.push({ label, durationMs: Date.now() - startMs, error })
        }

        // Ring 0: the service worker starts registering right away, in parallel
        // with the VFS (on a first visit it activates and claims this page)
        const swControlled = registerServiceWorker()

        // Ring 0: bring up VFS + IPC bus
        const fs = await initVFS(bootLog)

        // Ring 0: answer the SW's /(sw)/ file requests from the VFS
        initSwBridge(fs)

        // The shell's /(sw)/ resources (icons, wallpapers, app pages) need the SW
        // in control; this is usually resolved already (bounded wait otherwise)
        await swControlled

        // Load the main app bundle (remote.bundle.js → Platform + Layout)
        loadBootstrapScript()
    })
}
