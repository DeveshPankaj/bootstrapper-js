// Tiling window manager — opens windows in a grid and retiles on every change.
// Set windowManager:"tiling" in /etc/managers.json to activate.

// Re-layout all non-minimised, non-hidden windows into a grid that fills the
// windows container. Called after every DOM change on that container.
const tileAll = (parent) => {
    const wins = Array.from(parent.querySelectorAll('.window'))
        .filter(w =>
            !w.classList.contains('minimized') &&
            !w.classList.contains('desktop-hidden') &&
            !w.classList.contains('hidden')
        );
    const n = wins.length;
    if (!n) return;

    const W = parent.clientWidth  || top.innerWidth;
    const H = parent.clientHeight || top.innerHeight;

    if (n === 1) {
        Object.assign(wins[0].style, { left: '0px', top: '0px', width: W + 'px', height: H + 'px' });
        return;
    }

    // Split left/right for 2 windows, grid for more.
    if (n === 2) {
        const half = Math.floor(W / 2);
        Object.assign(wins[0].style, { left: '0px',        top: '0px', width: half + 'px',      height: H + 'px' });
        Object.assign(wins[1].style, { left: half + 'px',  top: '0px', width: (W - half) + 'px', height: H + 'px' });
        return;
    }

    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const colW = Math.floor(W / cols);
    const rowH = Math.floor(H / rows);

    wins.forEach((w, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        Object.assign(w.style, {
            left:   (col * colW) + 'px',
            top:    (row * rowH) + 'px',
            width:  colW + 'px',
            height: rowH + 'px',
        });
    });
};

// One observer per container, persisted across module re-runs.
const OBSERVER_KEY = '_wm_tiling_observer';

export const setupWindow = ({ container, head, settings, moveOnTop }) => {
    container.addEventListener('mousedown', () => moveOnTop());

    // Disable dragging/resizing visual cues for tiling windows.
    container.style.cursor = 'default';
    head.style.cursor = 'default';

    const parent = container.parentElement;
    if (!parent) return;

    // Disconnect and replace the observer so we always have a fresh reference.
    if (parent[OBSERVER_KEY]) {
        parent[OBSERVER_KEY].disconnect();
    }
    const obs = new MutationObserver(() => requestAnimationFrame(() => tileAll(parent)));
    obs.observe(parent, { childList: true, attributes: true, subtree: false, attributeFilter: ['class'] });
    parent[OBSERVER_KEY] = obs;

    requestAnimationFrame(() => tileAll(parent));
};

export const createHeader = ({ command, settings, close }) => {
    const head = document.createElement('div');
    head.className = 'window-header';
    head.style.cssText = [
        'display:flex',
        'align-items:center',
        'padding:0 8px',
        'gap:6px',
        'min-height:28px',
        'user-select:none',
        '-webkit-user-select:none',
    ].join(';');

    const titleEl = document.createElement('span');
    titleEl.style.cssText = 'flex:1;font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    titleEl.textContent = command.meta?.title || command.name;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = [
        'background:rgba(255,59,48,0.75)',
        'border:none',
        'border-radius:3px',
        'color:#fff',
        'width:18px',
        'height:18px',
        'font-size:9px',
        'cursor:pointer',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'flex-shrink:0',
    ].join(';');
    closeBtn.onclick = (e) => { e.stopPropagation(); close(); };

    head.appendChild(titleEl);
    head.appendChild(closeBtn);

    head._setTitle = (t) => { titleEl.textContent = t; };

    return head;
};
