// Windows-style window header: title left, square control buttons right.
// Drop this in /opt/wm/minimal.js and set windowManager:"minimal" in
// /etc/managers.json to activate.

export const createHeader = ({ command, settings, close, minimize, fullscreen }) => {
    
    const head = doc.createElement('div');
    head.className = 'window-header';
    head.style.cssText = [
        'display:flex',
        'align-items:center',
        'padding:0 0 0 10px',
        'gap:0',
        'min-height:30px',
        'user-select:none',
        '-webkit-user-select:none',
    ].join(';');

    // --- Title left ---
    const titleEl = doc.createElement('span');
    titleEl.style.cssText = [
        'flex:1',
        'font-size:12px',
        'font-weight:400',
        'white-space:nowrap',
        'overflow:hidden',
        'text-overflow:ellipsis',
        'opacity:0.9',
    ].join(';');
    titleEl.textContent = command.meta?.title || command.name;

    // --- Square control buttons right ---
    const makeBtn = (symbol, fn, hoverBg, label) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.title = label;
        b.textContent = symbol;
        b.style.cssText = [
            'background:transparent',
            'border:none',
            'color:inherit',
            'width:46px',
            'height:30px',
            'font-size:10px',
            'cursor:pointer',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'flex-shrink:0',
            'transition:background 0.1s',
        ].join(';');
        b.addEventListener('mouseover', () => { b.style.background = hoverBg; });
        b.addEventListener('mouseout',  () => { b.style.background = 'transparent'; });
        b.onclick = (e) => { e.stopPropagation(); fn(); };
        return b;
    };

    const controls = doc.createElement('div');
    controls.style.cssText = 'display:flex;align-items:center;flex-shrink:0;margin-left:auto;height:100%;';
    controls.appendChild(makeBtn('─', minimize,  'rgba(128,128,128,0.25)', 'Minimize'));
    controls.appendChild(makeBtn('☐', fullscreen,'rgba(128,128,128,0.25)', 'Fullscreen'));
    controls.appendChild(makeBtn('✕', close,     'rgba(196,43,28,0.85)',   'Close'));

    head.appendChild(titleEl);
    head.appendChild(controls);

    head._setTitle = (t) => { titleEl.textContent = t; };

    return head;
};
