// Ring 0 — background work after the landing page.
//
// Boot shows the desktop first and does everything else afterwards: syncing vfs
// files the landing page doesn't need, installing preinstalled apps on a first
// visit, loading the compiled bundles that aren't needed to show the desktop.
// While any of that runs, a small, faint spinner sits in the bottom-right corner.
//
// One tracker per OS window: the bootstrapper bundle owns it and exposes it to the
// other bundles through the frozen `window.__wosKernel` hook (src/kernel/ipc-bus.ts);
// they reach it as `platform.host.trackBackgroundTask(...)`.

const SPINNER_ID = 'wos-background-spinner'
const pending = new Set<string>()
let counter = 0

function spinnerElement(): HTMLElement {
    let el = document.getElementById(SPINNER_ID)
    if (el) return el
    if (!document.getElementById(`${SPINNER_ID}-style`)) {
        const style = document.createElement('style')
        style.id = `${SPINNER_ID}-style`
        style.textContent = `
#${SPINNER_ID} {
  position: fixed; right: 6px; bottom: 6px; z-index: 2147483000;
  width: 10px; height: 10px; border-radius: 50%;
  border: 1.5px solid rgba(127, 127, 127, 0.35); border-top-color: rgba(127, 127, 127, 0.85);
  opacity: 0; transition: opacity .4s ease; pointer-events: none;
  animation: ${SPINNER_ID}-spin .9s linear infinite;
}
#${SPINNER_ID}.active { opacity: .45; }
@keyframes ${SPINNER_ID}-spin { to { transform: rotate(360deg); } }`
        document.head.appendChild(style)
    }
    el = document.createElement('div')
    el.id = SPINNER_ID
    el.setAttribute('role', 'progressbar')
    el.setAttribute('aria-label', 'Loading in the background')
    document.body.appendChild(el)
    return el
}

function render(): void {
    if (!document.body) return
    const el = spinnerElement()
    el.classList.toggle('active', pending.size > 0)
    el.title = [...pending].map(key => key.replace(/#\d+$/, '')).join(', ')
}

/** Runs (or awaits) background work while the spinner shows. Errors are logged, not thrown. */
export function trackBackground<T>(work: Promise<T> | (() => Promise<T>), label = 'background task'): Promise<T | undefined> {
    const key = `${label}#${++counter}`
    pending.add(key)
    render()
    let promise: Promise<T>
    try { promise = typeof work === 'function' ? work() : work }
    catch (err) { promise = Promise.reject(err) }
    return Promise.resolve(promise)
        .catch(err => { console.warn(`[background] ${label} failed:`, err); return undefined })
        .finally(() => { pending.delete(key); render() })
}

/** True while background work is in flight (tests / diagnostics). */
export const backgroundBusy = (): boolean => pending.size > 0

let landing: Promise<void> | null = null

/**
 * Resolves once the landing page is on screen (the layout has rendered), then
 * waits for an idle moment, so background work never competes with first paint.
 * Falls back to a timeout if the layout never appears (e.g. a broken layout).
 */
export function whenLandingReady(timeoutMs = 15000): Promise<void> {
    if (landing) return landing
    landing = new Promise<void>(resolve => {
        const idle = () => {
            const ric = (window as any).requestIdleCallback as ((cb: () => void, o?: { timeout: number }) => void) | undefined
            if (ric) ric(() => resolve(), { timeout: 1500 })
            else setTimeout(resolve, 200)
        }
        const ready = () => !!document.querySelector('.layout-default .content-area, .layout-default')
        if (ready()) { idle(); return }
        const observer = new MutationObserver(() => {
            if (!ready()) return
            observer.disconnect()
            clearTimeout(timer)
            idle()
        })
        const timer = setTimeout(() => { observer.disconnect(); resolve() }, timeoutMs)
        observer.observe(document.documentElement, { childList: true, subtree: true })
    })
    return landing
}

/** Runs `work` in the background once the landing page is ready (spinner from then on). */
export function afterLanding<T>(work: () => Promise<T>, label: string): Promise<T | undefined> {
    return whenLandingReady().then(() => trackBackground(work, label))
}
