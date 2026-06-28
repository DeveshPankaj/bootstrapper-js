export const DESKTOP_ENV_CSS = `
    /* ===== macOS Desktop Environment ===== */
    .de-macos .window-header {
        justify-content: flex-start;
        gap: 0.5rem;
    }

    .de-macos .window-header .window-controls {
        display: flex;
        align-items: center;
        gap: 6px;
        order: -1;
        padding: 0 4px;
    }

    .de-macos .window-header .window-controls .window-action {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        font-size: 0;
        overflow: hidden;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: filter 0.15s ease;
    }

    .de-macos .window-header .window-controls .window-action.wm-close {
        background: #ff5f57;
    }

    .de-macos .window-header .window-controls .window-action.wm-minimize {
        background: #febc2e;
    }

    .de-macos .window-header .window-controls .window-action.wm-fullscreen {
        background: #28c840;
    }

    .de-macos .window-header .window-controls .window-action:hover {
        filter: brightness(0.85);
        background: inherit;
    }

    .de-macos .window-header .title {
        flex: 1;
        justify-content: center;
        font-size: var(--wm-font-size-sm, 0.8rem);
        font-weight: 500;
    }

    .de-macos .window-header .title .material-symbols-outlined {
        display: none;
    }

    .de-macos .window-header .window-gap {
        display: none;
    }

    .de-macos .taskbar {
        border-radius: var(--wm-radius, 16px);
    }

    /* ===== Windows 11 Desktop Environment ===== */
    .de-windows .window-header {
        padding: 0;
        background: var(--wm-header-bg, #202020);
    }

    .de-windows .window-header .title {
        padding: 8px 12px;
        font-size: var(--wm-font-size-sm, 0.8rem);
        font-weight: 400;
        gap: 0.4rem;
    }

    .de-windows .window-header .title .material-symbols-outlined {
        font-size: 16px;
    }

    .de-windows .window-header .window-controls {
        display: flex;
        align-items: stretch;
        height: 100%;
        margin-left: auto;
    }

    .de-windows .window-header .window-controls .window-action {
        border-radius: 0;
        padding: 0 16px;
        height: 100%;
        display: flex;
        align-items: center;
        font-size: 16px;
        transition: background 0.1s ease;
    }

    .de-windows .window-header .window-controls .window-action:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .de-windows .window-header .window-controls .window-action.wm-close:hover {
        background: #c42b1c;
        color: white;
    }

    .de-windows .window-header .window-gap {
        flex: 1;
    }

    .de-windows .window {
        border-radius: 8px;
    }

    .de-windows .taskbar {
        border-radius: 0;
        background: var(--wm-taskbar-bg, rgba(32, 32, 32, 0.85));
    }

    .de-windows .taskbar-icon-button {
        border-radius: 4px;
    }

    /* ===== Linux/GNOME Desktop Environment ===== */
    .de-linux .window-header {
        padding: 6px 8px;
        border-radius: var(--wm-radius, 12px) var(--wm-radius, 12px) 0 0;
        background: var(--wm-header-bg, #303030);
    }

    .de-linux .window-header .title {
        flex: 1;
        justify-content: center;
        font-size: var(--wm-font-size-sm, 0.8rem);
        font-weight: 600;
    }

    .de-linux .window-header .title .material-symbols-outlined {
        display: none;
    }

    .de-linux .window-header .window-controls {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .de-linux .window-header .window-controls .window-action {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        font-size: 14px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.1);
        transition: background 0.15s ease;
    }

    .de-linux .window-header .window-controls .window-action:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    .de-linux .window-header .window-controls .window-action.wm-close:hover {
        background: #e74c3c;
        color: white;
    }

    .de-linux .window-header .window-gap {
        display: none;
    }

    .de-linux .window-header .window-controls .wm-minimize {
        order: 1;
    }

    .de-linux .window-header .window-controls .wm-fullscreen {
        order: 2;
    }

    .de-linux .window-header .window-controls .wm-close {
        order: 3;
    }

    .de-linux .window {
        border-radius: var(--wm-radius, 12px);
    }

    .de-linux .taskbar {
        border-radius: 0;
        background: var(--wm-taskbar-bg, rgba(36, 36, 36, 0.95));
    }

    .de-linux .taskbar-icon-button {
        border-radius: 8px;
        padding: 0.3rem 0.5rem;
    }
`
