// macOS-style window header: traffic-light buttons left, centred title.
// Drop this in /opt/wm/classic.js and set windowManager:"classic" in
// /etc/managers.json to activate. Only exports createHeader — everything
// else (setupWindow, readSettings, snap zones) comes from /opt/window-manager.js.

export const createHeader = ({ command, settings, close, minimize, fullscreen }) => {
    const doc = top.document;
    const head = doc.createElement('div');
    head.className = 'window-header';
    head.style.cssText = [
        'display:flex',
        'align-items:center',
        'padding:0 12px',
        'gap:0',
        'position:relative',
        'min-height:36px',
        'user-select:none',
        '-webkit-user-select:none',
    ].join(';');

    // --- Traffic lights ---
    const makeDot = (bg, fn, label) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.title = label;
        b.style.cssText = [
            `background:${bg}`,
            'width:12px',
            'height:12px',
            'border-radius:50%',
            'border:none',
            'padding:0',
            'cursor:pointer',
            'flex-shrink:0',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'font-size:0',
            'transition:filter 0.15s',
        ].join(';');
        b.addEventListener('mouseover', () => { b.style.filter = 'brightness(0.82)'; });
        b.addEventListener('mouseout',  () => { b.style.filter = ''; });
        b.onclick = (e) => { e.stopPropagation(); fn(); };
        return b;
    };

    const lights = doc.createElement('div');
    lights.style.cssText = 'display:flex;gap:6px;align-items:center;flex-shrink:0;z-index:1;';
    lights.appendChild(makeDot('#ff5f57', close,     'Close'));
    lights.appendChild(makeDot('#febc2e', minimize,  'Minimize'));
    lights.appendChild(makeDot('#28c840', fullscreen,'Fullscreen'));

    // --- Centred title (pointer-events:none so it doesn't eat drag) ---
    const titleEl = doc.createElement('span');
    titleEl.style.cssText = [
        'position:absolute',
        'left:0',
        'right:0',
        'text-align:center',
        'font-size:13px',
        'font-weight:500',
        'pointer-events:none',
        'white-space:nowrap',
        'overflow:hidden',
        'text-overflow:ellipsis',
        'padding:0 90px',
    ].join(';');
    titleEl.textContent = command.meta?.title || command.name;

    head.appendChild(lights);
    head.appendChild(titleEl);

    // Convention: expose _setTitle so the host can update it on setTitle() calls.
    head._setTitle = (t) => { titleEl.textContent = t; };

    return head;
};
