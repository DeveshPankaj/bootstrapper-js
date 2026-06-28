export const CONTEXTMENU_CSS = `
    .contextmenu {
        position: absolute;
        display: none;
        z-index: 300;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(10px);
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
