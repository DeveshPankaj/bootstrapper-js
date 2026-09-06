// Glass/frosted window header: translucent blur, minimal controls.
// Drop this in /opt/wm/glass.js and set windowManager:"glass" in
// /etc/managers.json to activate.

export const createContainer = ({ command, settings }) => {
    
    const div = document.createElement('div');
    // Remove default solid bg so the glass effect of the header shows through.
    div.style.cssText = 'border-radius:12px;overflow:hidden;';
    return div;
};

export const createHeader = ({ command, settings, close, minimize, fullscreen }) => {
    
    const head = document.createElement('div');
    head.className = 'window-header';
    head.style.cssText = [
        'display:flex',
        'align-items:center',
        'padding:0 14px',
        'gap:8px',
        'min-height:36px',
        'background:rgba(255,255,255,0.12)',
        'backdrop-filter:blur(24px)',
        '-webkit-backdrop-filter:blur(24px)',
        'border-bottom:1px solid rgba(255,255,255,0.15)',
        'user-select:none',
        '-webkit-user-select:none',
    ].join(';');

    // --- Minimal dot buttons ---
    const makeDot = (bg, fn, label) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.title = label;
        b.style.cssText = [
            `background:${bg}`,
            'width:10px',
            'height:10px',
            'border-radius:50%',
            'border:none',
            'padding:0',
            'cursor:pointer',
            'flex-shrink:0',
            'opacity:0.75',
            'transition:opacity 0.15s',
        ].join(';');
        b.addEventListener('mouseover', () => { b.style.opacity = '1'; });
        b.addEventListener('mouseout',  () => { b.style.opacity = '0.75'; });
        b.onclick = (e) => { e.stopPropagation(); fn(); };
        return b;
    };

    const lights = document.createElement('div');
    lights.style.cssText = 'display:flex;gap:5px;align-items:center;flex-shrink:0;';
    lights.appendChild(makeDot('rgba(255,95,87,0.9)',  close,     'Close'));
    lights.appendChild(makeDot('rgba(254,188,46,0.9)', minimize,  'Minimize'));
    lights.appendChild(makeDot('rgba(40,200,64,0.9)',  fullscreen,'Fullscreen'));

    const titleEl = document.createElement('span');
    titleEl.style.cssText = [
        'flex:1',
        'text-align:center',
        'font-size:12px',
        'font-weight:500',
        'letter-spacing:0.02em',
        'white-space:nowrap',
        'overflow:hidden',
        'text-overflow:ellipsis',
        'opacity:0.8',
    ].join(';');
    titleEl.textContent = command.meta?.title || command.name;

    head.appendChild(lights);
    head.appendChild(titleEl);

    head._setTitle = (t) => { titleEl.textContent = t; };

    return head;
};
