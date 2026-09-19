const platform = window.platform;
const React = platform.getService('React');
const ReactDOM = platform.getService('ReactDOM');
const { useState, useRef, useCallback, useEffect, useReducer } = React;

// ── Constants ─────────────────────────────────────────────────────────────────
const SHAPES = ['rect', 'circle', 'diamond', 'hex', 'parallelogram'];
const SHAPE_LABELS = { rect: 'Rectangle', circle: 'Circle', diamond: 'Diamond', hex: 'Hexagon', parallelogram: 'Parallelogram' };
const PALETTE = [
  { fill: '#dbeafe', stroke: '#3b82f6', label: 'Blue' },
  { fill: '#dcfce7', stroke: '#22c55e', label: 'Green' },
  { fill: '#fef9c3', stroke: '#eab308', label: 'Yellow' },
  { fill: '#fee2e2', stroke: '#ef4444', label: 'Red' },
  { fill: '#f3e8ff', stroke: '#a855f7', label: 'Purple' },
  { fill: '#f1f5f9', stroke: '#64748b', label: 'Gray' },
  { fill: '#fff7ed', stroke: '#f97316', label: 'Orange' },
  { fill: '#fdf2f8', stroke: '#ec4899', label: 'Pink' },
];
const DEFAULT_W = 120, DEFAULT_H = 48;
const newId = () => Math.random().toString(36).slice(2, 9);

// ── Border point: find where a line from (fx,fy) exits the node border ────────
const borderPt = (node, fx, fy) => {
  const { x, y, w = DEFAULT_W, h = DEFAULT_H, shape } = node;
  const dx = fx - x, dy = fy - y;
  if (dx === 0 && dy === 0) return { x, y };
  const hw = w / 2, hh = h / 2;

  if (shape === 'circle') {
    const r = Math.min(hw, hh);
    const len = Math.sqrt(dx * dx + dy * dy);
    return { x: x + (dx / len) * r, y: y + (dy / len) * r };
  }
  if (shape === 'diamond') {
    const len = Math.sqrt(dx * dx + dy * dy);
    const r = (hw * hh) / Math.sqrt((dy * hw) ** 2 + (dx * hh) ** 2) || Math.min(hw, hh);
    return { x: x + (dx / len) * r, y: y + (dy / len) * r };
  }
  if (shape === 'hex') {
    const len = Math.sqrt(dx * dx + dy * dy);
    return { x: x + (dx / len) * hw * 0.9, y: y + (dy / len) * hh };
  }
  // Rect / parallelogram — use rect border
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (adx * hh >= ady * hw) {
    return { x: x + Math.sign(dx) * hw, y: y + dy * hw / adx };
  }
  return { x: x + dx * hh / ady, y: y + Math.sign(dy) * hh };
};

// ── SVG shape renderer ────────────────────────────────────────────────────────
const NodeShape = ({ node, selected, onMouseDown, onDoubleClick, onContextMenu, onPortMouseDown }) => {
  const { x, y, w = DEFAULT_W, h = DEFAULT_H, shape, fill, stroke, label } = node;
  const hw = w / 2, hh = h / 2;
  const sel = selected ? `drop-shadow(0 0 4px ${stroke})` : 'none';
  const common = { fill, stroke, strokeWidth: selected ? 2 : 1.5, filter: sel };
  const textProps = {
    x, y, textAnchor: 'middle', dominantBaseline: 'central',
    fontSize: 13, fontFamily: 'system-ui,sans-serif', fill: '#1c1c1e',
    style: { pointerEvents: 'none', userSelect: 'none' },
  };

  let shapeEl;
  switch (shape) {
    case 'circle':
      shapeEl = <ellipse cx={x} cy={y} rx={hw} ry={hh} {...common} />;
      break;
    case 'diamond': {
      const pts = `${x},${y - hh} ${x + hw},${y} ${x},${y + hh} ${x - hw},${y}`;
      shapeEl = <polygon points={pts} {...common} />;
      break;
    }
    case 'hex': {
      const pts = [0,1,2,3,4,5].map(i => {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        return `${x + hw * Math.cos(a)},${y + hh * Math.sin(a)}`;
      }).join(' ');
      shapeEl = <polygon points={pts} {...common} />;
      break;
    }
    case 'parallelogram': {
      const off = hw * 0.25;
      const pts = `${x - hw + off},${y - hh} ${x + hw + off},${y - hh} ${x + hw - off},${y + hh} ${x - hw - off},${y + hh}`;
      shapeEl = <polygon points={pts} {...common} />;
      break;
    }
    default:
      shapeEl = <rect x={x - hw} y={y - hh} width={w} height={h} rx={6} {...common} />;
  }

  return (
    <g
      data-node-id={node.id}
      style={{ cursor: 'move' }}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {shapeEl}
      <text {...textProps}>{label || 'Node'}</text>
      {selected && (
        <circle cx={x} cy={y + hh + 8} r={6} fill={stroke} stroke="#fff" strokeWidth={1.5}
          style={{ cursor: 'crosshair' }}
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onPortMouseDown && onPortMouseDown(e, node.id); }}
        />
      )}
    </g>
  );
};

// ── Context menu ──────────────────────────────────────────────────────────────
const ContextMenu = ({ menu, nodes, onClose, dispatch, docRef }) => {
  if (!menu) return null;
  const { x, y, type, id } = menu;
  const node = type === 'node' ? nodes.find(n => n.id === id) : null;

  const item = (label, onClick, danger) => (
    <div key={label}
      style={{ padding: '5px 14px', cursor: 'pointer', fontSize: 12, color: danger ? '#dc2626' : '#1c1c1e',
        whiteSpace: 'nowrap', borderRadius: 4 }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? '#fef2f2' : '#f4f4f4'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onClick(); onClose(); }}
    >{label}</div>
  );

  const sep = (k) => <div key={k} style={{ height: 1, background: '#e5e7eb', margin: '3px 0' }} />;

  let items = [];
  if (type === 'canvas') {
    items = [
      item('Add Node here', () => dispatch({ type: 'ADD_NODE', x: menu.svgX, y: menu.svgY })),
    ];
  } else if (type === 'node' && node) {
    items = [
      item('Edit Label', () => dispatch({ type: 'EDIT_NODE_LABEL', id })),
      sep('s0'),
      ...SHAPES.map(s =>
        item((node.shape === s ? '✓ ' : '  ') + SHAPE_LABELS[s], () => dispatch({ type: 'UPDATE_NODE', id, patch: { shape: s } }))
      ),
      sep('s1'),
      ...PALETTE.map(p =>
        item((node.fill === p.fill ? '✓ ' : '  ') + p.label, () => dispatch({ type: 'UPDATE_NODE', id, patch: { fill: p.fill, stroke: p.stroke } }))
      ),
      sep('s2'),
      item('Duplicate', () => dispatch({ type: 'DUPLICATE_NODE', id })),
      item('Delete Node', () => dispatch({ type: 'DELETE_NODE', id }), true),
    ];
  } else if (type === 'edge') {
    items = [
      item('Edit Label', () => dispatch({ type: 'EDIT_EDGE_LABEL', id })),
      sep('s3'),
      item('Delete Edge', () => dispatch({ type: 'DELETE_EDGE', id }), true),
    ];
  }

  return (
    <div
      style={{
        position: 'absolute', left: x, top: y, zIndex: 1000,
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,.15)', padding: '4px 0', minWidth: 160,
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {items}
    </div>
  );
};

// ── Force-directed auto-arrange ───────────────────────────────────────────────
const autoArrange = (nodes, edges) => {
  if (nodes.length === 0) return nodes;
  let pos = nodes.map(n => ({ id: n.id, x: n.x, y: n.y, vx: 0, vy: 0 }));
  const REPULSION = 7000, SPRING = 0.07, REST = 200, DAMP = 0.8;

  for (let iter = 0; iter < 150; iter++) {
    // Repulsion
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = REPULSION / (d * d);
        const fx = f * dx / d, fy = f * dy / d;
        pos[i].vx += fx; pos[i].vy += fy;
        pos[j].vx -= fx; pos[j].vy -= fy;
      }
    }
    // Spring along edges
    for (const e of edges) {
      const pi = pos.find(p => p.id === e.from), pj = pos.find(p => p.id === e.to);
      if (!pi || !pj) continue;
      const dx = pj.x - pi.x, dy = pj.y - pi.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = SPRING * (d - REST);
      const fx = f * dx / d, fy = f * dy / d;
      pi.vx += fx; pi.vy += fy;
      pj.vx -= fx; pj.vy -= fy;
    }
    // Integrate
    const step = Math.max(0.01, 1 - iter / 150) * 6;
    for (const p of pos) {
      p.x += Math.max(-80, Math.min(80, p.vx)) * step;
      p.y += Math.max(-80, Math.min(80, p.vy)) * step;
      p.vx *= DAMP; p.vy *= DAMP;
    }
  }

  // Center result
  const xs = pos.map(p => p.x), ys = pos.map(p => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return nodes.map(n => {
    const p = pos.find(q => q.id === n.id);
    return p ? { ...n, x: p.x - cx + 400, y: p.y - cy + 300 } : n;
  });
};

// ── Export to Mermaid ─────────────────────────────────────────────────────────
const toMermaid = (nodes, edges) => {
  const shapeWrap = (n) => {
    const lb = n.label || 'Node';
    switch (n.shape) {
      case 'circle':  return `(("${lb}"))`;
      case 'diamond': return `{"${lb}"}`;
      case 'hex':     return `{{"${lb}"}}`;
      default:        return `["${lb}"]`;
    }
  };
  const lines = ['graph TD'];
  for (const n of nodes) lines.push(`    ${n.id}${shapeWrap(n)}`);
  for (const e of edges) {
    const lbl = e.label ? `|"${e.label}"|` : '';
    lines.push(`    ${e.from} -->${lbl} ${e.to}`);
  }
  return lines.join('\n');
};

// ── Reducer ───────────────────────────────────────────────────────────────────
const reducer = (state, action) => {
  switch (action.type) {
    case 'ADD_NODE': {
      const n = {
        id: newId(), x: action.x, y: action.y,
        w: DEFAULT_W, h: DEFAULT_H,
        label: 'Node', shape: 'rect',
        fill: PALETTE[0].fill, stroke: PALETTE[0].stroke,
      };
      return { ...state, nodes: [...state.nodes, n], selected: { type: 'node', id: n.id }, editing: null };
    }
    case 'DELETE_NODE': {
      return {
        ...state,
        nodes: state.nodes.filter(n => n.id !== action.id),
        edges: state.edges.filter(e => e.from !== action.id && e.to !== action.id),
        selected: state.selected?.id === action.id ? null : state.selected,
        editing: state.editing === action.id ? null : state.editing,
      };
    }
    case 'UPDATE_NODE':
      return { ...state, nodes: state.nodes.map(n => n.id === action.id ? { ...n, ...action.patch } : n) };
    case 'MOVE_NODE':
      return { ...state, nodes: state.nodes.map(n => n.id === action.id ? { ...n, x: action.x, y: action.y } : n) };
    case 'DUPLICATE_NODE': {
      const src = state.nodes.find(n => n.id === action.id);
      if (!src) return state;
      const dup = { ...src, id: newId(), x: src.x + 30, y: src.y + 30, label: src.label + ' copy' };
      return { ...state, nodes: [...state.nodes, dup], selected: { type: 'node', id: dup.id } };
    }
    case 'ADD_EDGE': {
      if (action.from === action.to) return state;
      const exists = state.edges.some(e => e.from === action.from && e.to === action.to);
      if (exists) return state;
      const e = { id: newId(), from: action.from, to: action.to, label: '' };
      return { ...state, edges: [...state.edges, e] };
    }
    case 'DELETE_EDGE':
      return { ...state, edges: state.edges.filter(e => e.id !== action.id), selected: state.selected?.id === action.id ? null : state.selected };
    case 'UPDATE_EDGE':
      return { ...state, edges: state.edges.map(e => e.id === action.id ? { ...e, ...action.patch } : e) };
    case 'SELECT':
      return { ...state, selected: action.selected, editing: null };
    case 'DESELECT':
      return { ...state, selected: null, editing: null };
    case 'ARRANGE':
      return { ...state, nodes: autoArrange(state.nodes, state.edges) };
    case 'LOAD':
      return { nodes: action.nodes || [], edges: action.edges || [], selected: null, editing: null };
    case 'CLEAR':
      return { nodes: [], edges: [], selected: null, editing: null };
    case 'EDIT_NODE_LABEL':
      return { ...state, editing: action.id, selected: { type: 'node', id: action.id } };
    case 'EDIT_EDGE_LABEL':
      return { ...state, editing: 'edge:' + action.id, selected: { type: 'edge', id: action.id } };
    default:
      return state;
  }
};

// ── Main App ──────────────────────────────────────────────────────────────────
const App = ({ fs, docRef, onTitleChange, initialFilePath }) => {
  const [state, dispatch] = useReducer(reducer, { nodes: [], edges: [], selected: null, editing: null });
  const [filePath, setFilePath] = useState(initialFilePath || null);
  const [saveStatus, setSaveStatus] = useState('');
  const [menu, setMenu] = useState(null);
  const [edgeDraw, setEdgeDraw] = useState(null); // { fromId, curX, curY }
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const svgRef = useRef(null);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const dragNodeRef = useRef(null);
  const panDragRef = useRef(null);
  const editRef = useRef(null);

  // Sync pan/zoom to refs for use in event handlers
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // Auto-load file when opened with a file argument
  useEffect(() => {
    if (!initialFilePath) return;
    try {
      const raw = fs.readFileSync(initialFilePath, 'utf8');
      const data = JSON.parse(raw);
      dispatch({ type: 'LOAD', nodes: data.nodes || [], edges: data.edges || [] });
      onTitleChange?.(initialFilePath.split('/').pop());
    } catch(e) { /* ignore — new file */ }
  }, []);

  // Focus label input when editing starts
  useEffect(() => {
    if (state.editing && editRef.current) editRef.current.focus();
  }, [state.editing]);

  // SVG coordinate from screen point
  const svgCoords = (clientX, clientY) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const sx = (clientX - rect.left - panRef.current.x) / zoomRef.current;
    const sy = (clientY - rect.top  - panRef.current.y) / zoomRef.current;
    return { x: sx, y: sy };
  };

  // Wheel zoom
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZ = Math.max(0.15, Math.min(8, zoomRef.current * factor));
      const rect = el.getBoundingClientRect();
      const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
      setPan(p => ({
        x: ox - (ox - p.x) * (newZ / zoomRef.current),
        y: oy - (oy - p.y) * (newZ / zoomRef.current),
      }));
      setZoom(newZ);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  // Start edge draw from port handle — uses native events to avoid stopPropagation issues
  const startEdgeDraw = useCallback((e, fromId) => {
    const { x, y } = svgCoords(e.clientX, e.clientY);
    setEdgeDraw({ fromId, curX: x, curY: y });
    const doc = docRef.current;
    const onMove = (ev) => {
      const cur = svgCoords(ev.clientX, ev.clientY);
      setEdgeDraw(d => d ? { ...d, curX: cur.x, curY: cur.y } : null);
    };
    const onUp = (ev) => {
      doc.removeEventListener('mousemove', onMove);
      doc.removeEventListener('mouseup', onUp);
      const el = doc.elementFromPoint(ev.clientX, ev.clientY);
      const targetEl = el?.closest('[data-node-id]');
      const targetId = targetEl?.getAttribute('data-node-id');
      setEdgeDraw(null);
      if (targetId && targetId !== fromId) {
        dispatch({ type: 'ADD_EDGE', from: fromId, to: targetId });
      }
    };
    doc.addEventListener('mousemove', onMove);
    doc.addEventListener('mouseup', onUp);
  }, [svgCoords, docRef]);

  // Click anywhere on canvas
  const onSvgMouseDown = (e) => {
    if (e.button === 2) return;
    setMenu(null);

    // Pan drag
    panDragRef.current = { sx: e.clientX, sy: e.clientY, px: panRef.current.x, py: panRef.current.y };
    dispatch({ type: 'DESELECT' });
    const doc = docRef.current;
    const onMove = (ev) => {
      if (!panDragRef.current) return;
      const nx = panDragRef.current.px + ev.clientX - panDragRef.current.sx;
      const ny = panDragRef.current.py + ev.clientY - panDragRef.current.sy;
      setPan({ x: nx, y: ny });
      panRef.current = { x: nx, y: ny };
    };
    const onUp = () => { panDragRef.current = null; doc.removeEventListener('mousemove', onMove); doc.removeEventListener('mouseup', onUp); };
    doc.addEventListener('mousemove', onMove);
    doc.addEventListener('mouseup', onUp);
  };

  const onSvgContextMenu = (e) => {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    const svgX = (e.clientX - rect.left - pan.x) / zoom;
    const svgY = (e.clientY - rect.top  - pan.y) / zoom;
    setMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, type: 'canvas', svgX, svgY });
  };

  const onSvgMouseMove = () => {};
  const onSvgMouseUp = () => {};

  // Node mouse down — select + drag
  const onNodeMouseDown = (node, e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null);

    dispatch({ type: 'SELECT', selected: { type: 'node', id: node.id } });
    const startPos = svgCoords(e.clientX, e.clientY);
    const origX = node.x, origY = node.y;
    const doc = docRef.current;
    const onMove = (ev) => {
      const cur = svgCoords(ev.clientX, ev.clientY);
      dispatch({ type: 'MOVE_NODE', id: node.id, x: origX + cur.x - startPos.x, y: origY + cur.y - startPos.y });
    };
    const onUp = () => { doc.removeEventListener('mousemove', onMove); doc.removeEventListener('mouseup', onUp); };
    doc.addEventListener('mousemove', onMove);
    doc.addEventListener('mouseup', onUp);
  };

  const onNodeDblClick = (node, e) => {
    e.stopPropagation();
    dispatch({ type: 'EDIT_NODE_LABEL', id: node.id });
  };

  const onNodeContextMenu = (node, e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = svgRef.current?.getBoundingClientRect();
    setMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, type: 'node', id: node.id });
    dispatch({ type: 'SELECT', selected: { type: 'node', id: node.id } });
  };

  const onEdgeContextMenu = (edge, e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = svgRef.current?.getBoundingClientRect();
    setMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, type: 'edge', id: edge.id });
    dispatch({ type: 'SELECT', selected: { type: 'edge', id: edge.id } });
  };

  // Keyboard: Delete removes selected
  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    const onKey = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = e.target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        if (!state.selected) return;
        e.preventDefault();
        if (state.selected.type === 'node') dispatch({ type: 'DELETE_NODE', id: state.selected.id });
        else dispatch({ type: 'DELETE_EDGE', id: state.selected.id });
      }
      if (e.key === 'Escape') { dispatch({ type: 'DESELECT' }); setEdgeDraw(null); setMenu(null); }
    };
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  }, [state.selected]);

  // ── File ops ──────────────────────────────────────────────────────────────
  const win = docRef.current?.defaultView;
  const load = () => {
    const p = win?.prompt('Open .graph file (VFS path):', filePath || '/home/user1/diagram.graph');
    if (!p) return;
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      dispatch({ type: 'LOAD', nodes: data.nodes, edges: data.edges });
      setFilePath(p); onTitleChange?.(p.split('/').pop());
    } catch(e) { win?.alert('Cannot open: ' + e.message); }
  };

  const save = (as = false) => {
    let p = (!as && filePath) ? filePath : win?.prompt('Save to VFS path:', filePath || '/home/user1/diagram.graph');
    if (!p) return;
    try {
      fs.writeFileSync(p, JSON.stringify({ nodes: state.nodes, edges: state.edges }, null, 2));
      setFilePath(p); onTitleChange?.(p.split('/').pop());
      setSaveStatus('saved'); setTimeout(() => setSaveStatus(''), 2000);
    } catch(e) { win?.alert('Save failed: ' + e.message); }
  };

  const exportPng = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const doc = docRef.current;
    // Snapshot the graph area
    const ns = state.nodes;
    if (ns.length === 0) return;
    const xs = ns.map(n => [n.x - (n.w||DEFAULT_W)/2, n.x + (n.w||DEFAULT_W)/2]).flat();
    const ys = ns.map(n => [n.y - (n.h||DEFAULT_H)/2, n.y + (n.h||DEFAULT_H)/2]).flat();
    const pad = 40;
    const bx = Math.min(...xs) - pad, by = Math.min(...ys) - pad;
    const bw = Math.max(...xs) - bx + pad, bh = Math.max(...ys) - by + pad;

    // Create a clean SVG string with the graph content
    const inner = svg.innerHTML;
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bx} ${by} ${bw} ${bh}" width="${bw}" height="${bh}" style="background:#f8f9fa">${inner}</svg>`;
    const win2 = doc.defaultView;
    const b64 = win2.btoa(win2.unescape(win2.encodeURIComponent(svgStr)));
    const dataUrl = 'data:image/svg+xml;base64,' + b64;
    const img = new win2.Image();
    img.onload = () => {
      const scale = 2;
      const canvas = doc.createElement('canvas');
      canvas.width = bw * scale; canvas.height = bh * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = '#f8f9fa'; ctx.fillRect(0, 0, bw, bh);
      ctx.drawImage(img, 0, 0, bw, bh);
      canvas.toBlob(blob => {
        if (!blob) { win2.alert('PNG export failed'); return; }
        const r = new win2.FileReader();
        r.onload = () => {
          const a = doc.createElement('a');
          a.href = r.result; a.download = (filePath ? filePath.split('/').pop().replace(/\.[^.]*$/, '') : 'graph') + '.png';
          doc.body.appendChild(a); a.click(); a.remove();
        };
        r.readAsDataURL(blob);
      }, 'image/png');
    };
    img.onerror = () => win2.alert('PNG render failed');
    img.src = dataUrl;
  };

  const exportMermaid = () => {
    const txt = toMermaid(state.nodes, state.edges);
    try { docRef.current.defaultView.navigator.clipboard?.writeText(txt); } catch(_) {}
    setSaveStatus('mmd-copied'); setTimeout(() => setSaveStatus(''), 2000);
  };

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // ── Rendering helpers ─────────────────────────────────────────────────────
  const editingNode = state.editing && !state.editing.startsWith('edge:')
    ? state.nodes.find(n => n.id === state.editing)
    : null;
  const editingEdgeId = state.editing?.startsWith('edge:') ? state.editing.slice(5) : null;
  const editingEdge = editingEdgeId ? state.edges.find(e => e.id === editingEdgeId) : null;

  const fromNode = edgeDraw ? state.nodes.find(n => n.id === edgeDraw.fromId) : null;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', fontFamily:'system-ui,sans-serif', fontSize:13 }}>
      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 8px', borderBottom:'1px solid #e5e7eb', background:'#fff', flexShrink:0, flexWrap:'wrap' }}>
        <span style={{ fontSize:12, fontWeight:600, color:'#aaa', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {filePath ? filePath.split('/').pop() : 'Untitled Graph'}
        </span>
        {[
          ['New',    () => { if (!state.nodes.length || win?.confirm('Discard?')) { dispatch({ type:'CLEAR' }); setFilePath(null); onTitleChange?.('Graph Editor'); } }],
          ['Open',   load],
          ['Save',   () => save(false)],
          ['Save As',() => save(true)],
        ].map(([l, fn]) => <Btn key={l} onClick={fn}>{l}</Btn>)}
        <div style={{ width:1, height:18, background:'#e5e7eb', margin:'0 3px' }}/>
        <Btn onClick={() => dispatch({ type:'ARRANGE' })}>⟳ Auto-arrange</Btn>
        <Btn onClick={exportPng}>↓ PNG</Btn>
        <Btn onClick={exportMermaid}>⊞ Copy Mermaid</Btn>
        <Btn onClick={resetView} title="Reset view">⌂</Btn>
        {saveStatus === 'saved' && <span style={{ fontSize:11, color:'#22c55e' }}>Saved ✓</span>}
        {saveStatus === 'mmd-copied' && <span style={{ fontSize:11, color:'#888' }}>Mermaid copied ✓</span>}
        <span style={{ fontSize:11, color:'#bbb', marginLeft:'auto' }}>Right-click canvas to add · Drag port to connect · Del to remove</span>
      </div>

      {/* Canvas */}
      <div style={{ flex:1, overflow:'hidden', position:'relative', background:'#f8f9fa' }}>
        <svg
          ref={svgRef}
          style={{ width:'100%', height:'100%', display:'block' }}
          onMouseDown={onSvgMouseDown}
          onMouseMove={onSvgMouseMove}
          onMouseUp={onSvgMouseUp}
          onContextMenu={onSvgContextMenu}
          onClick={e => { if (menu) { setMenu(null); } }}
        >
          <defs>
            <marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
            </marker>
            <marker id="arrow-sel" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
            </marker>
          </defs>

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* Background dot grid */}
            <pattern id="grid" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
              <circle cx="0" cy="0" r="1" fill="#d1d5db" />
            </pattern>
            <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#grid)" opacity="0.5" />

            {/* Edges */}
            {state.edges.map(e => {
              const fn = state.nodes.find(n => n.id === e.from);
              const tn = state.nodes.find(n => n.id === e.to);
              if (!fn || !tn) return null;
              const start = borderPt(fn, tn.x, tn.y);
              const end   = borderPt(tn, fn.x, fn.y);
              const mx = (start.x + end.x) / 2, my = (start.y + end.y) / 2;
              const sel = state.selected?.type === 'edge' && state.selected.id === e.id;
              return (
                <g key={e.id} onContextMenu={ev => onEdgeContextMenu(e, ev)}
                  onClick={ev => { ev.stopPropagation(); dispatch({ type:'SELECT', selected:{ type:'edge', id:e.id } }); }}>
                  <line x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                    stroke="transparent" strokeWidth={12} style={{ cursor:'pointer' }} />
                  <line x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                    stroke={sel ? '#3b82f6' : '#64748b'} strokeWidth={sel ? 2 : 1.5}
                    markerEnd={sel ? 'url(#arrow-sel)' : 'url(#arrow)'}
                  />
                  {e.label && (
                    <text x={mx} y={my - 5} textAnchor="middle" fontSize={11} fill="#64748b"
                      fontFamily="system-ui,sans-serif" style={{ userSelect:'none', pointerEvents:'none' }}>
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Temp edge being drawn */}
            {edgeDraw && fromNode && (
              <line
                x1={borderPt(fromNode, edgeDraw.curX, edgeDraw.curY).x}
                y1={borderPt(fromNode, edgeDraw.curX, edgeDraw.curY).y}
                x2={edgeDraw.curX} y2={edgeDraw.curY}
                stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="6 3"
                markerEnd="url(#arrow-sel)" pointerEvents="none"
              />
            )}

            {/* Nodes */}
            {state.nodes.map(n => (
              <NodeShape
                key={n.id}
                node={n}
                selected={state.selected?.type === 'node' && state.selected.id === n.id}
                onMouseDown={e => onNodeMouseDown(n, e)}
                onDoubleClick={e => onNodeDblClick(n, e)}
                onContextMenu={e => onNodeContextMenu(n, e)}
                onPortMouseDown={startEdgeDraw}
              />
            ))}
          </g>
        </svg>

        {/* Context menu */}
        <ContextMenu menu={menu} nodes={state.nodes} onClose={closeMenu} dispatch={dispatch} docRef={docRef} />

        {/* Inline node label editor */}
        {editingNode && (
          <div style={{ position:'absolute', left:0, top:0, width:'100%', height:'100%', pointerEvents:'none' }}>
            <div style={{
              position:'absolute',
              left: pan.x + editingNode.x * zoom - 60,
              top: pan.y + editingNode.y * zoom - 14,
              pointerEvents:'all',
            }}>
              <input
                ref={editRef}
                defaultValue={editingNode.label}
                style={{ width:120, textAlign:'center', border:'2px solid #3b82f6', borderRadius:4, fontSize:12, padding:'2px 6px', outline:'none' }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { dispatch({ type:'UPDATE_NODE', id:editingNode.id, patch:{ label:e.target.value } }); dispatch({ type:'SELECT', selected:{ type:'node', id:editingNode.id } }); }
                  if (e.key === 'Escape') dispatch({ type:'SELECT', selected:{ type:'node', id:editingNode.id } });
                }}
                onBlur={e => { dispatch({ type:'UPDATE_NODE', id:editingNode.id, patch:{ label:e.target.value } }); dispatch({ type:'SELECT', selected:{ type:'node', id:editingNode.id } }); }}
              />
            </div>
          </div>
        )}

        {/* Inline edge label editor */}
        {editingEdge && (() => {
          const fn = state.nodes.find(n => n.id === editingEdge.from);
          const tn = state.nodes.find(n => n.id === editingEdge.to);
          if (!fn || !tn) return null;
          const mx = pan.x + ((fn.x + tn.x) / 2) * zoom - 60;
          const my = pan.y + ((fn.y + tn.y) / 2) * zoom - 20;
          return (
            <div style={{ position:'absolute', left:mx, top:my, pointerEvents:'all' }}>
              <input
                ref={editRef}
                defaultValue={editingEdge.label}
                placeholder="Edge label…"
                style={{ width:120, textAlign:'center', border:'2px solid #64748b', borderRadius:4, fontSize:12, padding:'2px 6px', outline:'none' }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { dispatch({ type:'UPDATE_EDGE', id:editingEdge.id, patch:{ label:e.target.value } }); dispatch({ type:'SELECT', selected:{ type:'edge', id:editingEdge.id } }); }
                  if (e.key === 'Escape') dispatch({ type:'SELECT', selected:{ type:'edge', id:editingEdge.id } });
                }}
                onBlur={e => { dispatch({ type:'UPDATE_EDGE', id:editingEdge.id, patch:{ label:e.target.value } }); dispatch({ type:'SELECT', selected:{ type:'edge', id:editingEdge.id } }); }}
              />
            </div>
          );
        })()}

        {/* Empty state hint */}
        {state.nodes.length === 0 && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none', color:'#bbb', fontSize:14 }}>
            Right-click to add the first node
          </div>
        )}
      </div>

      {/* Status bar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'3px 10px', borderTop:'1px solid #e5e7eb', background:'#fff', fontSize:11, color:'#bbb', flexShrink:0 }}>
        <span>{state.nodes.length} nodes · {state.edges.length} edges</span>
        {state.selected && <span>Selected: {state.selected.type} {state.selected.id}</span>}
        <span style={{ marginLeft:'auto' }}>{Math.round(zoom * 100)}% · Scroll to zoom · Drag canvas to pan</span>
      </div>
    </div>
  );
};

// Small button component
const Btn = ({ children, onClick, title }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      background:'#f4f1ee', border:'none', borderRadius:5, padding:'4px 9px',
      fontSize:12, cursor:'pointer', color:'#555', fontFamily:'inherit',
      whiteSpace:'nowrap', flexShrink:0, display:'flex', alignItems:'center', gap:3,
    }}
    onMouseEnter={e => e.currentTarget.style.background = '#ede9e4'}
    onMouseLeave={e => e.currentTarget.style.background = '#f4f1ee'}
  >{children}</button>
);

// ── Entry point ───────────────────────────────────────────────────────────────
const run = (...args) => {
  const [body, props, initialArg] = args;
  if (!body) {
    platform.host.execCommand("service('001-core.layout','open-window')(command('ui.graph-editor'))", platform);
    return;
  }
  const doc = body.ownerDocument;
  const fs = platform.host.getFS();

  body.style.cssText = 'margin:0;height:100%;overflow:hidden;background:#f8f9fa;';
  const container = doc.createElement('div');
  container.style.cssText = 'height:100%;display:flex;flex-direction:column;';
  body.appendChild(container);

  if (props.setTitle) props.setTitle(initialArg ? initialArg.split('/').pop() : 'Graph Editor');
  const root = ReactDOM.createRoot(container);
  root.render(<App fs={fs} docRef={{ current: doc }} onTitleChange={t => props.setTitle?.(t)} initialArg={initialArg || null} initialFilePath={initialArg || null} />);
  props.setHeaderStyles({ background: '#ffffff', color: '#555', boxShadow: 'none', borderBottom: '1px solid #e5e7eb' });
  props.setWindowView(true);
  props.onDestroy(() => setTimeout(() => root.unmount(), 0));
};

platform.host.registerCommand('ui.graph-editor', run, {
  icon: 'hub', title: 'Graph Editor', fullScreen: false, category: 'Dev',
  fileExtensions: ['.graph', '.grf'],
});

const _graphIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <line x1="16" y1="7" x2="6" y2="24" stroke="#0891b2" stroke-width="2.2"/>
  <line x1="16" y1="7" x2="26" y2="24" stroke="#0891b2" stroke-width="2.2"/>
  <line x1="8" y1="25" x2="24" y2="25" stroke="#0891b2" stroke-width="2.2"/>
  <circle cx="16" cy="6" r="4.5" fill="#0e7490" stroke="white" stroke-width="1.5"/>
  <circle cx="6" cy="25" r="4.5" fill="#0e7490" stroke="white" stroke-width="1.5"/>
  <circle cx="26" cy="25" r="4.5" fill="#0e7490" stroke="white" stroke-width="1.5"/>
</svg>`;
const _graphIconUrl = 'data:image/svg+xml,' + encodeURIComponent(_graphIconSvg);
platform.host.registerFileTypeIcon('.graph', _graphIconUrl);
platform.host.registerFileTypeIcon('.grf', _graphIconUrl);
