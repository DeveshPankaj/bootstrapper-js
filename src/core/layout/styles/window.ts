export const WINDOW_CSS = `
    .window > iframe {
        border: 0;
        flex-grow: 1;
        width: 100%;
        width: -webkit-fill-available;
        height: -webkit-fill-available;
    }

    .window {
        position: absolute;
        z-index: 9;
        background-color: #f1f1f1;
        text-align: center;
        display: flex;
        flex-direction: column;

        width: min(50rem, 90vw);
        height: min(30rem, 80vh);
        top: min(10%, 30rem);
        left: min(10%, 30rem);

        resize: both;
        overflow: hidden;
        border-radius: var(--wm-radius, 6px);

        background: var(--wm-window-bg, rgba(255, 255, 255, 0.15));
        backdrop-filter: blur(var(--wm-blur, 10px));
        box-shadow: var(--wm-shadow, rgba(31, 38, 135, 0.37) 0px 8px 32px);
    }
    .window.hidden, .window.minimized {
        display: none;
    }

    .window.top {
        z-index: 10;
        outline: 1px solid var(--wm-accent, transparent);
    }

    .window::-webkit-resizer {
        background-color: transparent;
    }

    .window-resize-handle {
        position: absolute;
        z-index: 50;
    }
    .window-resize-handle.n  { top: 0; left: 6px; right: 6px; height: 5px; cursor: n-resize; }
    .window-resize-handle.s  { bottom: 0; left: 6px; right: 6px; height: 5px; cursor: s-resize; }
    .window-resize-handle.e  { right: 0; top: 6px; bottom: 6px; width: 5px; cursor: e-resize; }
    .window-resize-handle.w  { left: 0; top: 6px; bottom: 6px; width: 5px; cursor: w-resize; }
    .window-resize-handle.nw { top: 0; left: 0; width: 12px; height: 12px; cursor: nw-resize; }
    .window-resize-handle.ne { top: 0; right: 0; width: 12px; height: 12px; cursor: ne-resize; }
    .window-resize-handle.sw { bottom: 0; left: 0; width: 12px; height: 12px; cursor: sw-resize; }
    .window-resize-handle.se { bottom: 0; right: 0; width: 12px; height: 12px; cursor: se-resize; }

    .window.dragging {
        outline: 1px solid #d3d3d3;
        z-index: 200;
        box-shadow: rgb(255 255 255) 0px 0px 4px;
    }

    .snap-preview {
        position: fixed;
        z-index: 99;
        background: rgba(10, 132, 255, 0.12);
        border: 2px solid rgba(10, 132, 255, 0.45);
        border-radius: var(--wm-radius, 6px);
        pointer-events: none;
        transition: left 0.08s ease, top 0.08s ease, width 0.08s ease, height 0.08s ease;
    }

    .window.on-top {
        z-index: 100;
    }

    .window-header {
        padding: 7px;
        cursor: move;
        z-index: 9;
        background-color: var(--wm-header-bg, rgb(0 0 0));
        color: var(--wm-header-color, #fff);
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .window-header > .title {
        display: inline-flex;
        align-items: center;
        gap: .5rem;
    }

    .window-header .window-controls {
        display: flex;
        align-items: center;
        gap: 0.15rem;
    }

    .window-header .window-gap {
        margin-left: auto;
    }

    .window-header .window-action {
        cursor: pointer;
        padding: var(--wm-space-1, 0.25rem);
        border-radius: 4px;
        transition: background var(--wm-transition-fast, 0.15s ease);
    }

    .window-header .window-action:hover {
        background: var(--wm-surface-active, rgba(127, 127, 127, 0.3));
    }

    .window-header .window-action:focus-visible {
        outline: 2px solid var(--wm-accent, #0a84ff);
        outline-offset: 2px;
    }

    iframe.dragging {
        pointer-events: none;
    }

    .window.desktop-hidden {
        display: none !important;
    }
`
