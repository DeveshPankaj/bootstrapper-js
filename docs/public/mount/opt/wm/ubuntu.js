// GNOME/Ubuntu-style window header: app icon + title left, circular buttons right.
// Drop this in /opt/wm/ubuntu.js and set windowManager:"ubuntu" in
// /etc/managers.json to activate.

export const createHeader = ({ command, settings, close, minimize, fullscreen }) => {
    
    const head = document.createElement('div');
    head.className = 'window-header';
    head.style.cssText = [
        'display:flex',
        'align-items:center',
        'padding:0 10px',
        'gap:8px',
        'min-height:38px',
        'user-select:none',
        '-webkit-user-select:none',
    ].join(';');

    // --- App icon (material symbol) ---
    const iconEl = document.createElement('span');
    iconEl.className = 'material-symbols-outlined';
    iconEl.style.cssText = 'font-size:16px;opacity:0.75;flex-shrink:0;';
    iconEl.textContent = command.meta?.icon || 'apps';

    // --- Title ---
    const titleEl = document.createElement('span');
    titleEl.style.cssText = [
        'flex:1',
        'font-size:13px',
        'font-weight:500',
        'white-space:nowrap',
        'overflow:hidden',
        'text-overflow:ellipsis',
    ].join(';');
    titleEl.textContent = command.meta?.title || command.name;

    // --- Circular buttons (GNOME-style, right side) ---
    const makeCircle = (symbol, fn, bg, label) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.title = label;
        b.textContent = symbol;
        b.style.cssText = [
            `background:${bg}`,
            'width:16px',
            'height:16px',
            'border-radius:50%',
            'border:none',
            'color:#fff',
            'font-size:9px',
            'cursor:pointer',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'flex-shrink:0',
            'transition:filter 0.15s',
        ].join(';');
        b.addEventListener('mouseover', () => { b.style.filter = 'brightness(0.8)'; });
        b.addEventListener('mouseout',  () => { b.style.filter = ''; });
        b.onclick = (e) => { e.stopPropagation(); fn(); };
        return b;
    };

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:6px;align-items:center;flex-shrink:0;margin-left:auto;';
    controls.appendChild(makeCircle('─', minimize,  '#888',    'Minimize'));
    controls.appendChild(makeCircle('⤢', fullscreen,'#e67e22', 'Fullscreen'));
    controls.appendChild(makeCircle('✕', close,     '#c0392b', 'Close'));

    head.appendChild(iconEl);
    head.appendChild(titleEl);
    head.appendChild(controls);

    head._setTitle = (t) => { titleEl.textContent = t; };

    return head;
};
