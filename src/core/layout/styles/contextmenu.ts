export const CONTEXTMENU_CSS = `
    .contextmenu {
        position: absolute;
        display: none;
        z-index: 300;
        overflow: hidden;
        /* --ambient-* are set by src/core/layout/ambient-color.ts from the
           active wallpaper's sampled dominant color every time it changes
           (see applyCss/updateAmbientColor) - the fallback values here are
           what's shown before that async sample resolves, or if it fails
           (e.g. a tainted canvas from a cross-origin wallpaper with no CORS
           headers), so the menu never looks broken either way. */
        background: var(--ambient-bg, rgba(255, 255, 255, 0.15));
        backdrop-filter: blur(var(--ambient-blur, 10px));
        color: var(--ambient-fg, inherit);
        border-radius: 15px;
        box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
        border: 1px solid rgba(255, 255, 255, 0.18);
    }

    .overlay {
        background: rgba(255, 255, 255, 0.30);
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 100;
        pointer-events: none;
    }

    .overlay>div {
        width: 10rem;
        height: 10rem;
        outline: 1px solid #00BCD4;
    }
`
