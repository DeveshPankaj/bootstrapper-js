// Canvas Window Manager — infinite scrollable workspace.
//
// The .content-area becomes a scrollable viewport; the .windows div is
// expanded to a large virtual canvas. Windows open staggered across the
// canvas. Clicking a partially-visible window smooth-scrolls it into view.
// A minimap in the bottom-right corner lets you navigate and see all open
// windows at a glance — click or drag to pan the canvas.

const CANVAS_W = 6000          // virtual canvas width  (px)
const CANVAS_H = 3600          // virtual canvas height (px)
const MINIMAP_W = 220          // minimap display width (px)
const MINIMAP_H = Math.round(MINIMAP_W * CANVAS_H / CANVAS_W)
const SCALE     = MINIMAP_W / CANVAS_W

const SETUP_KEY   = '_wm_canvas_setup'
const COUNT_KEY   = '_wm_canvas_count'
const MINIMAP_KEY = '_wm_canvas_minimap'

// ─── Canvas initialisation ────────────────────────────────────────────────────
// Runs once per page session (keyed on the DOM node so module-reloads are safe).

const injectStyles = () => {
    if (document.getElementById('wm-canvas-styles')) return
    const s = document.createElement('style')
    s.id = 'wm-canvas-styles'
    s.textContent = `
        .content-area.canvas-wm-active {
            overflow: auto !important;
            scroll-behavior: smooth;
            position: relative !important;
        }
        .content-area.canvas-wm-active .windows {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            overflow: visible !important;
            pointer-events: none !important;
        }
        .content-area.canvas-wm-active .windows .window {
            pointer-events: auto !important;
        }
        .content-area.canvas-wm-active .widgets-panel {
            position: fixed !important;
            top: 1rem !important;
            right: 1rem !important;
            bottom: 1rem !important;
            left: 1rem !important;
        }
    `
    document.head.appendChild(s)
}

const setupCanvas = (windowsEl) => {
    if (windowsEl[SETUP_KEY]) return
    windowsEl[SETUP_KEY] = true

    injectStyles()

    // Expand the windows layer to canvas size
    windowsEl.style.width  = CANVAS_W + 'px'
    windowsEl.style.height = CANVAS_H + 'px'

    // Make the content-area scrollable
    const scrollEl = windowsEl.parentElement
    if (scrollEl) scrollEl.classList.add('canvas-wm-active')

    // Override wm bridge toggleWindow for canvas-aware dock-click behavior.
    // window.__wosWmBridge is on the layout iframe window, not the execString shim —
    // access it via platform.window which IS the real layout window.
    const bridge = platform.window.__wosWmBridge
    if (bridge && !bridge._canvasTogglePatch) {
        bridge._canvasTogglePatch = true
        const orig = bridge.toggleWindow.bind(bridge)
        bridge.toggleWindow = (pid) => {
            const win = windowsEl.querySelector('[data-pid="' + pid + '"]')
            if (win && !win.classList.contains('minimized')) {
                if (scrollEl && !isInViewport(win, scrollEl)) {
                    // Visible but off-screen → scroll to center then bring to front
                    scrollToCenterWindow(win, scrollEl)
                    win._wmMoveOnTop?.()
                    return
                }
                // Fully in view → bring to front, don't minimize
                win._wmMoveOnTop?.()
                return
            }
            // Minimized → un-minimize (MutationObserver handles scroll-to-center)
            orig(pid)
        }
    }
}

// ─── Scroll helpers ───────────────────────────────────────────────────────────

// Returns true if the window is fully visible in the viewport (with padding).
const isInViewport = (container, scrollEl, PAD = 48) => {
    const winL = container.offsetLeft
    const winT = container.offsetTop
    const winR = winL + container.offsetWidth
    const winB = winT + container.offsetHeight
    const vpL  = scrollEl.scrollLeft
    const vpT  = scrollEl.scrollTop
    const vpR  = vpL + scrollEl.clientWidth
    const vpB  = vpT + scrollEl.clientHeight
    return winL >= vpL + PAD && winR <= vpR - PAD &&
           winT >= vpT + PAD && winB <= vpB - PAD
}

// Scrolls by the minimum amount to bring the window fully into view.
const scrollToWindow = (container, windowsEl) => {
    const scrollEl = windowsEl.parentElement
    if (!scrollEl) return

    const PAD = 48
    const winL = container.offsetLeft
    const winT = container.offsetTop
    const winR = winL + container.offsetWidth
    const winB = winT + container.offsetHeight
    const vpL  = scrollEl.scrollLeft
    const vpT  = scrollEl.scrollTop
    const vpR  = vpL + scrollEl.clientWidth
    const vpB  = vpT + scrollEl.clientHeight

    let dx = 0, dy = 0

    if (winL < vpL + PAD)                                               dx = winL - vpL - PAD
    else if (winR > vpR - PAD && container.offsetWidth < scrollEl.clientWidth - 2 * PAD)
                                                                         dx = winR - vpR + PAD
    if (winT < vpT + PAD)                                               dy = winT - vpT - PAD
    else if (winB > vpB - PAD && container.offsetHeight < scrollEl.clientHeight - 2 * PAD)
                                                                         dy = winB - vpB + PAD

    if (dx || dy) scrollEl.scrollBy({ left: dx, top: dy, behavior: 'smooth' })
}

// Centers the viewport on the window.
const scrollToCenterWindow = (container, scrollEl) => {
    if (!scrollEl) return
    const cx = container.offsetLeft + container.offsetWidth  / 2
    const cy = container.offsetTop  + container.offsetHeight / 2
    scrollEl.scrollTo({
        left: Math.max(0, cx - scrollEl.clientWidth  / 2),
        top:  Math.max(0, cy - scrollEl.clientHeight / 2),
        behavior: 'smooth',
    })
}

// ─── Minimap ──────────────────────────────────────────────────────────────────

const buildMinimap = (windowsEl) => {
    const scrollEl = windowsEl.parentElement
    if (!scrollEl) return

    // Wrapper (fixed bottom-right, draggable to reposition)
    const wrap = document.createElement('div')
    wrap.id = 'wm-canvas-minimap'
    wrap.style.cssText = [
        'position:fixed', 'bottom:76px', 'right:14px',
        'width:' + MINIMAP_W + 'px',
        'height:' + MINIMAP_H + 'px',
        'border-radius:10px',
        'background:rgba(15,15,18,0.80)',
        'border:1px solid rgba(255,255,255,0.12)',
        'backdrop-filter:blur(10px)',
        '-webkit-backdrop-filter:blur(10px)',
        'box-shadow:0 6px 24px rgba(0,0,0,0.5)',
        'z-index:9500',
        'overflow:hidden',
        'cursor:crosshair',
        'user-select:none',
    ].join(';')

    // Label
    const label = document.createElement('div')
    label.textContent = 'CANVAS'
    label.style.cssText = 'position:absolute;top:5px;left:8px;font-size:8px;letter-spacing:.08em;opacity:0.35;color:#fff;pointer-events:none;font-family:system-ui,sans-serif;'
    wrap.appendChild(label)

    // Close button
    const closeBtn = document.createElement('div')
    closeBtn.textContent = '×'
    closeBtn.style.cssText = 'position:absolute;top:3px;right:6px;font-size:13px;opacity:0.35;color:#fff;cursor:pointer;padding:1px 3px;'
    closeBtn.onmouseenter = () => { closeBtn.style.opacity = '1' }
    closeBtn.onmouseleave = () => { closeBtn.style.opacity = '0.35' }
    closeBtn.onclick = (e) => { e.stopPropagation(); wrap.remove(); document.body[MINIMAP_KEY] = null }
    wrap.appendChild(closeBtn)

    // Canvas element for drawing
    const cvs = document.createElement('canvas')
    cvs.width  = MINIMAP_W
    cvs.height = MINIMAP_H
    cvs.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;'
    wrap.appendChild(cvs)

    document.body.appendChild(wrap)

    const ctx = cvs.getContext('2d')

    const rr = (x, y, w, h, r) => {
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return }
        ctx.beginPath(); ctx.rect(x, y, w, h)
    }

    const draw = () => {
        ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H)

        // Subtle grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'
        ctx.lineWidth = 0.5
        for (let x = 0; x < MINIMAP_W; x += Math.round(500 * SCALE)) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MINIMAP_H); ctx.stroke() }
        for (let y = 0; y < MINIMAP_H; y += Math.round(500 * SCALE * (CANVAS_H/CANVAS_W) * (MINIMAP_W/MINIMAP_H))); { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(MINIMAP_W, 0); ctx.stroke() }

        // Viewport rectangle
        const vpX = Math.round(scrollEl.scrollLeft * SCALE)
        const vpY = Math.round(scrollEl.scrollTop  * (MINIMAP_H / CANVAS_H))
        const vpW = Math.min(Math.round(scrollEl.clientWidth  * SCALE),         MINIMAP_W - vpX)
        const vpH = Math.min(Math.round(scrollEl.clientHeight * (MINIMAP_H / CANVAS_H)), MINIMAP_H - vpY)
        ctx.fillStyle   = 'rgba(255,255,255,0.07)'
        ctx.strokeStyle = 'rgba(10,132,255,0.85)'
        ctx.lineWidth   = 1.5
        rr(vpX, vpY, vpW, vpH, 3); ctx.fill(); ctx.stroke()

        // Windows
        const wins = windowsEl.querySelectorAll('.window')
        wins.forEach(win => {
            if (win.classList.contains('minimized') || win.style.display === 'none') return
            const l = Math.round(parseFloat(win.style.left || '0') * SCALE)
            const t = Math.round(parseFloat(win.style.top  || '0') * (MINIMAP_H / CANVAS_H))
            const w = Math.max(Math.round(parseFloat(win.style.width  || '300') * SCALE), 5)
            const h = Math.max(Math.round(parseFloat(win.style.height || '200') * (MINIMAP_H / CANVAS_H)), 3)
            const active = win.classList.contains('top')

            // Window body
            ctx.fillStyle   = active ? 'rgba(10,132,255,0.45)' : 'rgba(100,100,110,0.35)'
            ctx.strokeStyle = active ? 'rgba(10,132,255,0.9)'  : 'rgba(255,255,255,0.18)'
            ctx.lineWidth   = active ? 1.2 : 0.8
            rr(l, t, w, h, 2); ctx.fill(); ctx.stroke()

            // Header stripe
            const hh = Math.max(2, Math.round(28 * (MINIMAP_H / CANVAS_H)))
            ctx.fillStyle = active ? 'rgba(10,132,255,0.55)' : 'rgba(255,255,255,0.12)'
            rr(l, t, w, hh, [2, 2, 0, 0]); ctx.fill()
        })
    }

    // Navigate: click + drag on minimap scrolls the canvas
    let panning = false, panStartX = 0, panStartY = 0

    const panTo = (ex, ey) => {
        const cx = ex / SCALE - scrollEl.clientWidth  / 2
        const cy = ey / (MINIMAP_H / CANVAS_H) - scrollEl.clientHeight / 2
        scrollEl.scrollTo({ left: Math.max(0, cx), top: Math.max(0, cy), behavior: 'auto' })
    }

    cvs.addEventListener('pointerdown', (e) => {
        panning = true
        cvs.setPointerCapture(e.pointerId)
        panStartX = e.offsetX; panStartY = e.offsetY
        panTo(e.offsetX, e.offsetY)
        e.preventDefault()
    })
    cvs.addEventListener('pointermove', (e) => { if (panning) panTo(e.offsetX, e.offsetY) })
    cvs.addEventListener('pointerup',   (e) => { panning = false; cvs.releasePointerCapture(e.pointerId) })

    // Re-draw on scroll + any DOM/style mutation inside .windows
    scrollEl.addEventListener('scroll', draw)
    const obs = new MutationObserver(draw)
    obs.observe(windowsEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })

    draw()
    return { draw, obs, wrap }
}

// ─── Window setup (called per new window) ─────────────────────────────────────

export const setupWindow = ({ container, head, settings, moveOnTop }) => {
    const windowsEl = container.parentElement
    if (!windowsEl) return

    // One-time canvas initialisation
    setupCanvas(windowsEl)

    // Stagger windows in a 3-column grid across the canvas
    if (!windowsEl[COUNT_KEY]) windowsEl[COUNT_KEY] = 0
    const n   = windowsEl[COUNT_KEY]++
    const col = n % 3
    const row = Math.floor(n / 3)
    container.style.left = (64 + col * 420) + 'px'
    container.style.top  = (64 + row * 300) + 'px'

    // Scroll viewport to the newly opened window
    const scrollEl = windowsEl.parentElement
    if (scrollEl) {
        const targetL = parseFloat(container.style.left) - 64
        const targetT = parseFloat(container.style.top)  - 64
        requestAnimationFrame(() =>
            scrollEl.scrollTo({ left: Math.max(0, targetL), top: Math.max(0, targetT), behavior: 'smooth' })
        )
    }

    // Store moveOnTop so the bridge override can call it on dock-icon click.
    container._wmMoveOnTop = moveOnTop

    // Bring window to front on click. No scrollToWindow here — calling it on
    // mousedown fires between draggable's onmousedown (saves clientX/Y) and
    // the first mousemove, changing scrollTop mid-drag and making the drag
    // position jump. Scroll-to-center is handled by dock clicks and un-minimize.
    container.addEventListener('mousedown', () => moveOnTop())

    // When a window is un-minimized (minimized class removed), scroll to center it.
    // Track previous state so we only scroll on the minimized→visible transition,
    // not on other class changes like the 'top' class toggled by moveOnTop().
    let _wasMinimized = container.classList.contains('minimized')
    const classObs = new MutationObserver(() => {
        const isMinimized = container.classList.contains('minimized')
        if (_wasMinimized && !isMinimized && scrollEl) {
            requestAnimationFrame(() => scrollToCenterWindow(container, scrollEl))
        }
        _wasMinimized = isMinimized
    })
    classObs.observe(container, { attributes: true, attributeFilter: ['class'] })

    // Build minimap once (persisted on document.body across module-reloads)
    if (!document.body[MINIMAP_KEY]) {
        const mm = buildMinimap(windowsEl)
        document.body[MINIMAP_KEY] = mm || true
    } else if (document.body[MINIMAP_KEY]?.draw) {
        document.body[MINIMAP_KEY].draw()
    }
}

// ─── Header ───────────────────────────────────────────────────────────────────
// macOS traffic-light style, centred title.

export const createHeader = ({ close, minimize, fullscreen }) => {
    const head = document.createElement('div')
    head.className = 'window-header'
    head.style.cssText = 'display:flex;align-items:center;padding:4px 10px;gap:6px;'

    const dot = (bg, cls, action) => {
        const d = document.createElement('div')
        d.className = 'window-action ' + cls
        d.style.cssText = `width:12px;height:12px;border-radius:50%;background:${bg};cursor:pointer;flex-shrink:0;transition:filter .15s;`
        d.onmouseenter = () => { d.style.filter = 'brightness(0.75)' }
        d.onmouseleave = () => { d.style.filter = '' }
        d.onclick = (e) => { e.stopPropagation(); action?.() }
        return d
    }

    const title = document.createElement('span')
    title.style.cssText = 'flex:1;text-align:center;font-size:12px;opacity:0.72;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;user-select:none;'
    head._setTitle = (t) => { title.textContent = t }

    head.appendChild(dot('#ff5f57', 'wm-close',      close))
    head.appendChild(dot('#febc2e', 'wm-minimize',   minimize))
    head.appendChild(dot('#28c840', 'wm-fullscreen', fullscreen))
    head.appendChild(title)

    return head
}
