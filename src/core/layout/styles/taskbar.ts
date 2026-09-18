export const TASKBAR_CSS = `
    .toolbar {
        position: absolute;
        bottom: 1rem;
        left: 50%;
        transform: translateX(-50%);
    }

    .taskbar {
        display: flex;
        align-items: center;
        gap: 0.15rem;
        box-sizing: border-box;
        height: var(--wm-taskbar-size, 56px);
        padding: 0.3rem 0.6rem;
        background: var(--wm-taskbar-bg, rgba(255, 255, 255, 0.5));
        backdrop-filter: blur(var(--wm-blur, 10px));
        box-shadow: var(--wm-shadow, 0 8px 32px rgba(31, 38, 135, 0.37));
        border-radius: var(--wm-radius, 12px);
        color: var(--wm-header-color, #1d1d1f);
    }

    .header .taskbar, .footer .taskbar {
        width: 100%;
        border-radius: 0;
    }

    .left-nav .taskbar, .right-nav .taskbar {
        flex-direction: column;
        height: 100%;
        width: var(--wm-taskbar-size, 56px);
        border-radius: 0;
    }

    .taskbar-divider {
        width: 1px;
        height: 60%;
        background: currentColor;
        opacity: 0.2;
        margin: 0 0.3rem;
    }

    .left-nav .taskbar-divider, .right-nav .taskbar-divider {
        width: 60%;
        height: 1px;
        margin: 0.3rem 0;
    }

    .taskbar-spacer {
        flex: 1;
    }

    .taskbar-icon-button {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--wm-space-1, 0.25rem);
        border-radius: 8px;
        cursor: pointer;
        color: var(--wm-header-color, #1d1d1f);
        transition: background var(--wm-transition-fast, 0.15s ease);
    }

    .taskbar-icon-button:hover, .taskbar-window-icon.active {
        background: var(--wm-surface-hover, rgba(127, 127, 127, 0.2));
    }

    .taskbar-icon-button:focus-visible {
        outline: 2px solid var(--wm-accent, #0a84ff);
        outline-offset: 2px;
    }

    .taskbar-window-icon.active::after {
        content: '';
        position: absolute;
        bottom: 2px;
        left: 50%;
        transform: translateX(-50%);
        width: 18px;
        height: 3px;
        border-radius: 2px;
        background: var(--wm-accent, #0a84ff);
    }

    .taskbar-window-icon.minimized::after {
        content: '';
        position: absolute;
        bottom: 2px;
        left: 50%;
        transform: translateX(-50%);
        width: 6px;
        height: 3px;
        border-radius: 2px;
        background: rgba(127, 127, 127, 0.6);
    }

    .taskbar-preview {
        position: absolute;
        bottom: calc(100% + 0.5rem);
        left: 50%;
        transform: translateX(-50%);
        display: none;
        flex-direction: column;
        align-items: center;
        background: var(--wm-window-bg, rgba(255, 255, 255, 0.85));
        backdrop-filter: blur(var(--wm-blur, 10px));
        border-radius: var(--wm-radius, 8px);
        box-shadow: var(--wm-shadow, 0 8px 32px rgba(31, 38, 135, 0.37));
        padding: 0.4rem;
        z-index: 50;
        pointer-events: none;
    }

    .taskbar-window-icon:hover .taskbar-preview {
        display: flex;
    }

    .taskbar-preview span {
        margin-top: 0.25rem;
        font-size: 0.75rem;
        white-space: nowrap;
    }

`
