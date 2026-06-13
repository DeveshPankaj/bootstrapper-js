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
};
