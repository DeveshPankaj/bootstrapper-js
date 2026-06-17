// Window manager behavior module.
//
// This file lives in the virtual filesystem (/opt/window-manager.js) and is
// re-read and re-executed by the core window manager every time a new window
// is opened. Editing it (and saving through the file explorer's "Edit"
// action) changes the behavior of windows opened afterwards without
// rebuilding the app.
//
// Appearance (colors, border radius, blur, shadow) is controlled separately
// via CSS custom properties, configured from Settings -> Window Manager and
// stored in /etc/wm/window-manager.json.

const platform = window.platform;

export const WM_SETTINGS_PATH = '/etc/wm/current.json';

export const DEFAULT_SETTINGS = {
    appearance: {
        headerBackground: '#000000',
        headerColor: '#ffffff',
        windowBackground: 'rgba(255, 255, 255, 0.15)',
        accentColor: '#0a84ff',
        borderRadius: 6,
        blur: 10,
        shadow: true,
    },
    behavior: {
        dblClickHeaderFullscreen: true,
        bringToFrontOnClick: true,
    },
};

export const readSettings = () => {
    const fs = platform.host.getFS();
    try {
        const raw = JSON.parse(fs.readFileSync(WM_SETTINGS_PATH, 'utf-8'));
        return {
            appearance: { ...DEFAULT_SETTINGS.appearance, ...raw.appearance },
            behavior: { ...DEFAULT_SETTINGS.behavior, ...raw.behavior },
        };
    } catch (err) {
        return DEFAULT_SETTINGS;
    }
};

// Snap overlay element — shared across all windows, shows a translucent
// zone hint while dragging near screen edges.
let snapOverlay = null;
const getSnapOverlay = () => {
    if (snapOverlay) return snapOverlay;
    snapOverlay = top.document.createElement('div');
    snapOverlay.style.cssText = 'position:fixed;z-index:9999;background:rgba(10,132,255,0.25);border:2px solid rgba(10,132,255,0.6);border-radius:8px;pointer-events:none;transition:opacity 0.1s;opacity:0;';
    top.document.body.appendChild(snapOverlay);
    return snapOverlay;
};

const SNAP_ZONES = [
    // Corners checked first (more specific) so they win over edge-only matches
    { test: (x, y, W, H) => x < 40 && y < 40,          rect: (W, H) => ({ left: 0,      top: 0,     width: W / 2, height: H / 2 }) }, // top-left
    { test: (x, y, W, H) => x > W - 40 && y < 40,      rect: (W, H) => ({ left: W / 2,  top: 0,     width: W / 2, height: H / 2 }) }, // top-right
    { test: (x, y, W, H) => x < 40 && y > H - 40,      rect: (W, H) => ({ left: 0,      top: H / 2, width: W / 2, height: H / 2 }) }, // bottom-left
    { test: (x, y, W, H) => x > W - 40 && y > H - 40,  rect: (W, H) => ({ left: W / 2,  top: H / 2, width: W / 2, height: H / 2 }) }, // bottom-right
    // Edges
    { test: (x, y, W, H) => x < 40,                     rect: (W, H) => ({ left: 0,      top: 0,     width: W / 2, height: H }) }, // left half
    { test: (x, y, W, H) => x > W - 40,                 rect: (W, H) => ({ left: W / 2,  top: 0,     width: W / 2, height: H }) }, // right half
    { test: (x, y, W, H) => y < 40,                     rect: (W, H) => ({ left: 0,      top: 0,     width: W,     height: H }) }, // top = fullscreen
];

// Called once per window, right after its header/iframe are created, so
// behavior changes here apply to every new window immediately.
export const setupWindow = ({ container, head, settings, toggleFullScreen, moveOnTop }) => {
    if (settings.behavior.dblClickHeaderFullscreen) {
        head.addEventListener('dblclick', (event) => {
            // Ignore double-clicks on header action buttons (close, fullscreen,
            // and any app-added action icons) — anywhere else on the header
            // (title or empty space) toggles fullscreen.
            if (event.target.closest?.('.window-action')) return;
            toggleFullScreen();
        });
    }

    if (settings.behavior.bringToFrontOnClick) {
        container.addEventListener('mousedown', () => moveOnTop());
    }

    // Window snapping: show snap zone overlay while dragging near screen edges.
    // draggable.ts uses document.onmousemove, so we mirror with document listeners.
    let activeSnap = null;
    const overlay = getSnapOverlay();

    const onSnapMove = (e) => {
        if (!container.classList.contains('dragging')) {
            overlay.style.opacity = '0';
            return;
        }
        if (!container.isConnected) {
            top.document.removeEventListener('mousemove', onSnapMove);
            top.document.removeEventListener('mouseup', onSnapUp);
            overlay.style.opacity = '0';
            return;
        }
        const W = top.innerWidth, H = top.innerHeight;
        const x = e.clientX, y = e.clientY;
        const zone = SNAP_ZONES.find(z => z.test(x, y, W, H)) || null;
        activeSnap = zone;
        if (zone) {
            const r = zone.rect(W, H);
            Object.assign(overlay.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', opacity: '1' });
        } else {
            overlay.style.opacity = '0';
        }
    };

    const onSnapUp = () => {
        overlay.style.opacity = '0';
        if (!activeSnap) { activeSnap = null; return; }
        const W = top.innerWidth, H = top.innerHeight;
        const r = activeSnap.rect(W, H);
        const parentRect = container.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
        Object.assign(container.style, {
            left: (r.left - parentRect.left) + 'px',
            top: (r.top - parentRect.top) + 'px',
            width: r.width + 'px',
            height: r.height + 'px',
        });
        activeSnap = null;
    };

    top.document.addEventListener('mousemove', onSnapMove);
    top.document.addEventListener('mouseup', onSnapUp);
};
