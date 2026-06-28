export const WIDGETS_CSS = `
    .widgets-panel {
        position: absolute;
        top: 1rem;
        right: 1rem;
        bottom: 1rem;
        left: 1rem;
        z-index: 5;
        pointer-events: none;
    }

    .widgets-panel .widget {
        position: absolute;
        min-width: 9rem;
        pointer-events: auto;
        padding: 0.75rem 1rem;
        background: var(--wm-window-bg, rgba(255, 255, 255, 0.15));
        backdrop-filter: blur(var(--wm-blur, 10px));
        border-radius: var(--wm-radius, 8px);
        box-shadow: var(--wm-shadow, 0 8px 32px rgba(31, 38, 135, 0.37));
        color: var(--wm-header-color, #1d1d1f);
        cursor: grab;
        user-select: none;
    }

    .widgets-panel .widget.dragging {
        cursor: grabbing;
        opacity: 0.85;
        z-index: 10;
    }

    .widget-close {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: rgba(255, 59, 48, 0.8);
        color: #fff;
        font-size: 12px;
        line-height: 18px;
        text-align: center;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s;
        pointer-events: auto;
        z-index: 1;
    }

    .widgets-panel .widget:hover .widget-close {
        opacity: 1;
    }

    .widget-close:hover {
        background: #ff3b30;
    }

    .widget-clock-time {
        font-size: 1.75rem;
        font-weight: 600;
        text-align: right;
    }

    .widget-clock-date {
        font-size: 0.8rem;
        opacity: 0.8;
        text-align: right;
    }

    .widget-public-ip-label {
        font-size: 0.7rem;
        opacity: 0.8;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .widget-public-ip-value {
        font-size: 1rem;
        font-weight: 600;
        text-align: right;
    }

    .widget-memory-label {
        font-size: 0.7rem;
        opacity: 0.8;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .widget-memory-value {
        font-size: 1rem;
        font-weight: 600;
        text-align: right;
    }

    .widget-memory-bar {
        margin-top: 0.4rem;
        width: 100%;
        height: 0.35rem;
        border-radius: 0.2rem;
        background: rgba(127, 127, 127, 0.3);
        overflow: hidden;
    }

    .widget-memory-bar-fill {
        height: 100%;
        width: 0%;
        background: var(--wm-accent, #0a84ff);
        border-radius: 0.2rem;
        transition: width 0.3s ease;
    }

    .widget-memory-sub {
        margin-top: 0.2rem;
        font-size: 0.7rem;
        opacity: 0.7;
        text-align: right;
    }
`
