const platform = window.platform;
const React = platform.getService('React');
const ReactDOM = platform.getService('ReactDOM');

const DEFAULT_DIAGRAM = `graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do it]
    B -->|No| D[Skip]
    C --> E[End]
    D --> E`;

const CSS = `
@font-face{font-family:'Material Symbols Outlined';font-style:normal;font-weight:100 700;
  src:url(https://fonts.gstatic.com/s/materialsymbolsoutlined/v138/kJEhBvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oFsLjBuVY.woff2) format('woff2')}
.msi{font-family:'Material Symbols Outlined';font-weight:normal;font-style:normal;font-size:18px;
  line-height:1;display:inline-block;white-space:nowrap;direction:ltr;-webkit-font-smoothing:antialiased;vertical-align:middle;}
*{box-sizing:border-box;}
body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:13.5px;background:#fff;color:#1c1c1e;}
.mv-root{display:flex;flex-direction:column;height:100%;}
.mv-toolbar{
  display:flex;align-items:center;gap:5px;padding:5px 8px;
  border-bottom:1px solid #f0ede9;background:#fff;flex-shrink:0;flex-wrap:wrap;
}
.mv-title{font-size:12px;font-weight:600;color:#aaa;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:60px;}
.mv-btn{
  background:#f4f1ee;border:none;border-radius:5px;padding:4px 9px;
  font-size:12px;cursor:pointer;color:#555;font-family:inherit;
  white-space:nowrap;flex-shrink:0;display:flex;align-items:center;gap:3px;
  transition:background .1s;
}
.mv-btn:hover{background:#ede9e4;color:#1c1c1e;}
.mv-btn.primary{background:#c4a478;color:#fff;}
.mv-btn.primary:hover{background:#b8966a;}
.mv-btn.active{background:#e8e0d4;color:#1c1c1e;}
.mv-btn:disabled{opacity:.45;cursor:default;}
.mv-body{display:flex;flex:1;min-height:0;}
.mv-editor-pane{display:flex;flex-direction:column;width:38%;flex-shrink:0;border-right:1px solid #f0ede9;min-width:0;}
.mv-pane-hdr{
  display:flex;align-items:center;justify-content:space-between;padding:4px 10px;
  border-bottom:1px solid #f0ede9;background:#fafaf8;
  font-size:10px;font-weight:600;color:#bbb;text-transform:uppercase;letter-spacing:.07em;flex-shrink:0;
}
.mv-textarea{
  flex:1;resize:none;border:none;outline:none;padding:10px 12px;
  font-family:monospace;font-size:12.5px;background:#fff;color:#1c1c1e;
  line-height:1.6;min-height:0;
}
.mv-preview-pane{display:flex;flex-direction:column;flex:1;min-width:0;overflow:hidden;}
.mv-preview-content{
  flex:1;overflow:hidden;position:relative;
  background:#fafaf8;min-height:0;cursor:grab;user-select:none;
}
.mv-preview-content.grabbing{cursor:grabbing;}
.mv-svg-wrap{
  position:absolute;top:0;left:0;
  display:flex;align-items:center;justify-content:center;
  width:100%;height:100%;
  transform-origin:center center;will-change:transform;
}
.mv-svg-wrap svg{max-width:none;height:auto;}
.mv-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#ccc;font-size:13px;pointer-events:none;}
.mv-error{
  color:#b91c1c;font-family:monospace;font-size:12px;
  background:#fef2f2;border:1px solid #fecaca;border-radius:6px;
  padding:12px 14px;white-space:pre-wrap;word-break:break-word;
  position:absolute;inset:12px;overflow:auto;max-width:calc(100% - 24px);
}
.mv-loading{color:#aaa;font-size:13px;display:flex;align-items:center;gap:8px;
  position:absolute;inset:0;justify-content:center;}
.mv-status{
  display:flex;align-items:center;padding:3px 10px;border-top:1px solid #f0ede9;
  background:#fafaf8;font-size:11px;color:#bbb;flex-shrink:0;gap:8px;
}
.mv-zoom-ctrl{display:flex;align-items:center;gap:1px;}
.mv-zoom-btn{
  background:#f4f1ee;border:none;border-radius:3px;padding:1px 6px;
  cursor:pointer;font-size:14px;color:#777;line-height:1.4;
}
.mv-zoom-btn:hover{background:#ede9e4;}
.mv-zoom-pct{font-size:11px;color:#aaa;min-width:36px;text-align:center;}
.mv-divider{width:1px;height:18px;background:#e5e0db;flex-shrink:0;margin:0 2px;}
`;

const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
let mermaidLoadPromise = null;

const loadMermaid = (doc) => {
  if (mermaidLoadPromise) return mermaidLoadPromise;
  const win = doc.defaultView;
  if (win.mermaid) { mermaidLoadPromise = Promise.resolve(win.mermaid); return mermaidLoadPromise; }
  mermaidLoadPromise = new Promise((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = MERMAID_CDN;
    s.onload = () => {
      const m = win.mermaid;
      if (!m) { reject(new Error('mermaid not found on window')); return; }
      m.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
      resolve(m);
    };
    s.onerror = () => reject(new Error('Failed to load Mermaid from CDN'));
    doc.head.appendChild(s);
  });
  return mermaidLoadPromise;
};

// Fixed PNG converter: strips @font-face external URLs to avoid tainted canvas,
// uses base64 data URL for better iframe/sandbox compat.
const svgToPngBlob = (svgEl, iframeDoc) => new Promise((resolve, reject) => {
  const win = iframeDoc.defaultView;
  const clone = svgEl.cloneNode(true);

  // Strip @font-face rules that reference external URLs — they taint the canvas.
  clone.querySelectorAll('style').forEach(s => {
    s.textContent = s.textContent.replace(/@font-face\s*\{[^}]*url\s*\([^)]*https?:[^)]*\)[^}]*\}/g, '');
  });

  // Ensure explicit width/height so the canvas knows the dimensions.
  const vb = svgEl.viewBox?.baseVal;
  const W = vb?.width || svgEl.width?.baseVal?.value || 800;
  const H = vb?.height || svgEl.height?.baseVal?.value || 600;
  clone.setAttribute('width', String(W));
  clone.setAttribute('height', String(H));

  const svgStr = new win.XMLSerializer().serializeToString(clone);
  // Base64 data URL avoids blob-URL loading issues inside sandboxed iframes.
  const b64 = win.btoa(win.unescape(win.encodeURIComponent(svgStr)));
  const dataUrl = 'data:image/svg+xml;base64,' + b64;

  const img = new win.Image();
  img.onload = () => {
    const scale = 2;
    const canvas = iframeDoc.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), 'image/png');
  };
  img.onerror = () => reject(new Error('SVG failed to load as image (check font/resource errors)'));
  img.src = dataUrl;
});

const App = ({ initialArg, docRef, topDoc, fs, onTitleChange }) => {
  const [filePath, setFilePath] = React.useState(initialArg || null);
  const baseName = filePath ? filePath.split('/').pop().replace(/\.[^.]*$/, '') : 'diagram';

  const [source, setSource] = React.useState(() => {
    if (initialArg) { try { return fs.readFileSync(initialArg, 'utf8'); } catch(_){} }
    return DEFAULT_DIAGRAM;
  });
  const [svgHtml, setSvgHtml]         = React.useState('');
  const [renderError, setRenderError] = React.useState('');
  const [mermaidReady, setMermaidReady] = React.useState(false);
  const [loading, setLoading]         = React.useState(true);
  const [saveStatus, setSaveStatus]   = React.useState('');
  const [pinned, setPinned]           = React.useState(false);
  const [zoomPct, setZoomPct]         = React.useState(100);

  const mermaidRef    = React.useRef(null);
  const renderIdRef   = React.useRef(0);
  const previewRef    = React.useRef(null);
  const svgWrapRef    = React.useRef(null);
  const zoomRef       = React.useRef(1);
  const panRef        = React.useRef({ x: 0, y: 0 });
  const dragRef       = React.useRef(null);
  const pipCleanupRef = React.useRef(null);

  React.useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    loadMermaid(doc)
      .then(m => { mermaidRef.current = m; setMermaidReady(true); setLoading(false); })
      .catch(e => { setRenderError('Failed to load Mermaid: ' + e.message); setLoading(false); });
  }, []);

  React.useEffect(() => {
    if (!mermaidReady || !mermaidRef.current) return;
    const trimmed = source.trim();
    if (!trimmed) { setSvgHtml(''); setRenderError(''); return; }
    renderIdRef.current += 1;
    const myId = renderIdRef.current;
    setRenderError('');
    mermaidRef.current.render('mv-' + myId, trimmed)
      .then(({ svg }) => { if (renderIdRef.current === myId) setSvgHtml(svg); })
      .catch(e => {
        if (renderIdRef.current !== myId) return;
        setSvgHtml('');
        setRenderError('Render error: ' + ((e?.message || String(e)).replace(/^Error:\s*/i, '')));
      });
  }, [source, mermaidReady]);

  React.useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      zoomRef.current = Math.max(0.1, Math.min(10, zoomRef.current * (e.deltaY > 0 ? 0.9 : 1.1)));
      applyTransform();
      setZoomPct(Math.round(zoomRef.current * 100));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const applyTransform = () => {
    if (!svgWrapRef.current) return;
    const { x, y } = panRef.current;
    svgWrapRef.current.style.transform = `translate(${x}px,${y}px) scale(${zoomRef.current})`;
  };

  const resetView = () => {
    zoomRef.current = 1; panRef.current = { x: 0, y: 0 };
    setZoomPct(100); applyTransform();
  };
  const zoomIn  = () => { zoomRef.current = Math.min(10, zoomRef.current * 1.25); applyTransform(); setZoomPct(Math.round(zoomRef.current * 100)); };
  const zoomOut = () => { zoomRef.current = Math.max(0.1, zoomRef.current / 1.25); applyTransform(); setZoomPct(Math.round(zoomRef.current * 100)); };

  const onMouseDown = (e) => {
    if (e.button !== 0 || e.target.tagName === 'A') return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: panRef.current.x, py: panRef.current.y };
    previewRef.current?.classList.add('grabbing');
    const doc = docRef.current;
    const onMove = (ev) => {
      if (!dragRef.current) return;
      panRef.current = { x: dragRef.current.px + ev.clientX - dragRef.current.sx, y: dragRef.current.py + ev.clientY - dragRef.current.sy };
      applyTransform();
    };
    const onUp = () => {
      dragRef.current = null;
      previewRef.current?.classList.remove('grabbing');
      doc.removeEventListener('mousemove', onMove);
      doc.removeEventListener('mouseup', onUp);
    };
    doc.addEventListener('mousemove', onMove);
    doc.addEventListener('mouseup', onUp);
  };

  const getSvgEl = () => svgWrapRef.current?.querySelector('svg');

  // Open a file from VFS
  const openFile = () => {
    const path = docRef.current.defaultView.prompt('Open file (VFS path):', filePath || '/home/user1/diagram.mmd');
    if (!path) return;
    try {
      const content = fs.readFileSync(path, 'utf8');
      setSource(content);
      setFilePath(path);
      onTitleChange?.(path.split('/').pop());
    } catch(e) {
      docRef.current.defaultView.alert('Cannot open: ' + e.message);
    }
  };

  // New/blank diagram
  const newDiagram = () => {
    setSource(DEFAULT_DIAGRAM);
    setFilePath(null);
    resetView();
    onTitleChange?.('Diagram');
  };

  // Save source to VFS
  const save = () => {
    if (!filePath) {
      const path = docRef.current.defaultView.prompt('Save to VFS path:', '/home/user1/diagram.mmd');
      if (!path) return;
      try { fs.writeFileSync(path, source); setFilePath(path); onTitleChange?.(path.split('/').pop()); setSaveStatus('saved'); }
      catch(e) { setSaveStatus('error'); }
    } else {
      try { fs.writeFileSync(filePath, source); setSaveStatus('saved'); }
      catch(_) { setSaveStatus('error'); }
    }
    setTimeout(() => setSaveStatus(''), 2000);
  };

  const copySvg = () => {
    if (!svgHtml) return;
    try { docRef.current.defaultView.navigator.clipboard?.writeText(svgHtml); } catch(_) {}
  };

  // Download PNG to browser — uses FileReader data URL to work in sandboxed iframes
  const downloadPng = async () => {
    const svgEl = getSvgEl();
    if (!svgEl) return;
    try {
      const blob = await svgToPngBlob(svgEl, docRef.current);
      await new Promise((res, rej) => {
        const r = new docRef.current.defaultView.FileReader();
        r.onload = () => {
          const a = docRef.current.createElement('a');
          a.href = r.result; a.download = baseName + '.png';
          docRef.current.body.appendChild(a); a.click(); a.remove();
          res();
        };
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
    } catch(e) { docRef.current.defaultView.alert('PNG export failed: ' + e.message); }
  };

  // Save PNG to VFS path
  const savePng = async () => {
    const svgEl = getSvgEl();
    if (!svgEl) return;
    const defaultPath = filePath ? filePath.replace(/\.[^.]*$/, '.png') : `/home/user1/${baseName}.png`;
    const savePath = docRef.current.defaultView.prompt('Save PNG to VFS path:', defaultPath);
    if (!savePath) return;
    try {
      const blob = await svgToPngBlob(svgEl, docRef.current);
      const ab = await blob.arrayBuffer();
      fs.writeFileSync(savePath, Buffer.from(ab));
      setSaveStatus('png-saved');
      setTimeout(() => setSaveStatus(''), 2500);
    } catch(e) { docRef.current.defaultView.alert('Save failed: ' + e.message); }
  };

  // Pin as floating PiP overlay
  const togglePin = () => {
    if (pipCleanupRef.current) { pipCleanupRef.current(); return; }
    const svgEl = getSvgEl();
    if (!svgEl) return;
    const doc = topDoc;
    const pip = doc.createElement('div');
    pip.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:99996;width:280px;min-width:140px;min-height:80px;background:#fff;border:1px solid #e0dbd4;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.18);overflow:hidden;resize:both;font-family:system-ui,sans-serif;';
    const hdr = doc.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:5px 10px;background:#fafaf8;border-bottom:1px solid #e0dbd4;font-size:11px;color:#888;cursor:move;user-select:none;';
    hdr.innerHTML = `<span>📌 ${baseName}</span>`;
    const closeBtn = doc.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:14px;color:#aaa;padding:0 3px;line-height:1;';
    closeBtn.onclick = () => cleanup();
    hdr.appendChild(closeBtn);
    const body = doc.createElement('div');
    body.style.cssText = 'padding:8px;overflow:auto;max-height:220px;background:#fafaf8;display:flex;justify-content:center;';
    const clone = svgEl.cloneNode(true);
    clone.style.cssText = 'max-width:100%;height:auto;';
    body.appendChild(clone);
    pip.appendChild(hdr); pip.appendChild(body); doc.body.appendChild(pip);
    let dragging = false, dx = 0, dy = 0;
    hdr.addEventListener('mousedown', e => { dragging = true; const r = pip.getBoundingClientRect(); dx = e.clientX - r.left; dy = e.clientY - r.top; e.preventDefault(); });
    const onMove = e => { if (!dragging) return; pip.style.left = (e.clientX - dx)+'px'; pip.style.top = (e.clientY - dy)+'px'; pip.style.right='auto'; pip.style.bottom='auto'; };
    const onUp = () => { dragging = false; };
    doc.addEventListener('mousemove', onMove); doc.addEventListener('mouseup', onUp);
    const cleanup = () => { doc.removeEventListener('mousemove', onMove); doc.removeEventListener('mouseup', onUp); pip.remove(); pipCleanupRef.current = null; setPinned(false); };
    pipCleanupRef.current = cleanup;
    setPinned(true);
  };

  const hasSvg = !!svgHtml;
  const isDirty = !filePath || saveStatus !== 'saved';

  return (
    <div className="mv-root">
      <div className="mv-toolbar">
        <span className="mv-title">{filePath ? filePath.split('/').pop() : 'Untitled'}</span>
        <button className="mv-btn" onClick={newDiagram} title="New diagram"><span className="msi">add</span>New</button>
        <button className="mv-btn" onClick={openFile} title="Open file from VFS"><span className="msi">folder_open</span>Open</button>
        <button className={`mv-btn${filePath && saveStatus !== 'saved' ? ' primary' : ''}`} onClick={save} title="Save to VFS">
          {saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? '✗ Error' : <><span className="msi">save</span>Save</>}
        </button>
        {hasSvg && <>
          <div className="mv-divider"/>
          <button className="mv-btn" onClick={copySvg} title="Copy SVG markup">Copy SVG</button>
          <button className="mv-btn" onClick={downloadPng} title="Download PNG to computer"><span className="msi">download</span>PNG</button>
          <button className="mv-btn" onClick={savePng} title="Save PNG to VFS"><span className="msi">image</span>Save PNG</button>
          <button className={`mv-btn${pinned?' active':''}`} onClick={togglePin} title={pinned?'Unpin':'Float as overlay'}>
            <span className="msi">push_pin</span>{pinned?'Pinned':'Pin'}
          </button>
        </>}
        {saveStatus === 'png-saved' && <span style={{fontSize:11,color:'#888'}}>PNG saved ✓</span>}
      </div>

      <div className="mv-body">
        <div className="mv-editor-pane">
          <div className="mv-pane-hdr"><span>Source</span></div>
          <textarea className="mv-textarea" value={source} onChange={e=>setSource(e.target.value)}
            spellCheck={false} placeholder="Enter mermaid diagram syntax…" />
        </div>

        <div className="mv-preview-pane">
          <div className="mv-pane-hdr">
            <span>Preview</span>
            <div className="mv-zoom-ctrl">
              <button className="mv-zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
              <span className="mv-zoom-pct">{zoomPct}%</span>
              <button className="mv-zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
              <button className="mv-zoom-btn" onClick={resetView} title="Reset view" style={{marginLeft:3,fontSize:11,padding:'1px 5px'}}>⌂</button>
            </div>
          </div>
          <div className="mv-preview-content" ref={previewRef} onMouseDown={onMouseDown}>
            {loading && <div className="mv-loading">Loading Mermaid…</div>}
            {!loading && renderError && <div className="mv-error">{renderError}</div>}
            {!loading && !renderError && (
              <>
                <div ref={svgWrapRef} className="mv-svg-wrap" dangerouslySetInnerHTML={{ __html: svgHtml || '' }} />
                {!hasSvg && <div className="mv-empty">{source.trim() ? 'Rendering…' : 'Enter a diagram in the editor'}</div>}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mv-status">
        <span>{filePath || 'No file — use Save to pick a path'}</span>
        <span style={{marginLeft:'auto',fontSize:10}}>Scroll to zoom · Drag to pan</span>
      </div>
    </div>
  );
};

const run = (...args) => {
  const [body, props, initialArg] = args;
  if (!body) {
    platform.host.execCommand("service('001-core.layout','open-window')(command('ui.mermaid'))", platform);
    return;
  }
  const doc = body.ownerDocument;
  const fs = platform.host.getFS();
  let topDoc;
  try { topDoc = doc.defaultView.top.document; } catch(_) { topDoc = doc; }

  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.appendChild(style);

  const container = doc.createElement('div');
  container.style.cssText = 'height:100%;display:flex;flex-direction:column;';
  body.appendChild(container);
  body.style.cssText = 'margin:0;height:100%;overflow:hidden;';

  if (props.setTitle) props.setTitle(initialArg ? initialArg.split('/').pop() : 'Diagram');
  const root = ReactDOM.createRoot(container);
  root.render(
    <App
      initialArg={initialArg || null}
      docRef={{ current: doc }}
      topDoc={topDoc}
      fs={fs}
      onTitleChange={t => props.setTitle?.(t)}
    />
  );
  props.setHeaderStyles({ background: '#ffffff', color: '#555', boxShadow: 'none', borderBottom: '1px solid #f0ede9' });
  props.setWindowView(true);
  props.onDestroy(() => { mermaidLoadPromise = null; setTimeout(() => root.unmount(), 0); });
};

platform.host.registerCommand('ui.mermaid', run, {
  icon: 'account_tree', title: 'Diagram Editor', fullScreen: false, category: 'Dev',
  fileExtensions: ['.mmd', '.mermaid'],
});

const _mermaidIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect x="5" y="3" width="22" height="9" rx="2.5" fill="#7c3aed"/>
  <rect x="5" y="20" width="22" height="9" rx="2.5" fill="#7c3aed"/>
  <line x1="16" y1="12" x2="16" y2="17" stroke="#a78bfa" stroke-width="2.2"/>
  <polygon points="11,17 21,17 16,22" fill="#a78bfa"/>
</svg>`;
const _mermaidIconUrl = 'data:image/svg+xml,' + encodeURIComponent(_mermaidIconSvg);
platform.host.registerFileTypeIcon('.mmd', _mermaidIconUrl);
platform.host.registerFileTypeIcon('.mermaid', _mermaidIconUrl);
