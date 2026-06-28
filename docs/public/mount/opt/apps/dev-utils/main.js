const platform = window.platform;
const React = platform.getService('React');
const { createRoot } = platform.getService('ReactDOM');
const { useState, useCallback, useRef, useEffect } = React;

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0';

const CSS = `
* { box-sizing: border-box; }
.du-root {
  display: flex; height: 100%; font-family: system-ui, -apple-system, sans-serif;
  font-size: 13.5px; color: #1c1c1e; background: #fff; overflow: hidden;
}
.du-sidebar {
  width: 180px; flex-shrink: 0; padding: 12px 8px; border-right: 1px solid #e0dbd4;
  display: flex; flex-direction: column; gap: 2px; background: #faf9f7; overflow-y: auto;
}
.du-sidebar-label {
  font-size: 10px; font-weight: 600; color: #999; text-transform: uppercase;
  letter-spacing: 0.06em; padding: 6px 10px 4px; margin-top: 4px;
}
.du-nav {
  display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 6px;
  cursor: pointer; color: #3a3a3c; font-size: 13px; font-weight: 500; user-select: none;
}
.du-nav:hover { background: #f0ede9; }
.du-nav.active { background: #c4a478; color: #fff; }
.du-nav .material-symbols-outlined { font-size: 18px; }
.du-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.du-header {
  padding: 14px 20px 10px; border-bottom: 1px solid #e0dbd4; flex-shrink: 0;
  font-size: 15px; font-weight: 600;
}
.du-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
.du-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.du-label { font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.04em; }
.du-input, .du-textarea {
  width: 100%; padding: 8px 10px; border: 1px solid #d4d0ca; border-radius: 6px;
  font-family: 'SF Mono', Menlo, monospace; font-size: 12.5px; color: #1c1c1e;
  background: #faf9f7; outline: none; resize: vertical;
}
.du-input:focus, .du-textarea:focus { border-color: #c4a478; box-shadow: 0 0 0 2px rgba(196,164,120,.15); }
.du-textarea { min-height: 80px; }
.du-btn {
  display: inline-flex; align-items: center; gap: 5px; padding: 6px 14px; border: 1px solid #d4d0ca;
  border-radius: 6px; background: #fff; color: #3a3a3c; font-size: 12px; font-weight: 600;
  cursor: pointer;
}
.du-btn:hover { background: #f5f2ee; }
.du-btn.primary { background: #c4a478; color: #fff; border-color: #c4a478; }
.du-btn.primary:hover { background: #b8956a; }
.du-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.du-output {
  background: #f5f2ee; border: 1px solid #e0dbd4; border-radius: 6px; padding: 10px 12px;
  font-family: 'SF Mono', Menlo, monospace; font-size: 12px; white-space: pre-wrap;
  word-break: break-all; min-height: 36px; color: #333;
}
.du-color-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.du-color-preview {
  width: 48px; height: 48px; border-radius: 8px; border: 1px solid #d4d0ca;
  flex-shrink: 0; cursor: pointer; position: relative;
}
.du-color-preview input[type=color] {
  position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
}
.du-color-values { display: flex; flex-direction: column; gap: 4px; font-family: 'SF Mono', Menlo, monospace; font-size: 12px; }
.du-dropzone {
  border: 2px dashed #d4d0ca; border-radius: 8px; padding: 24px; text-align: center;
  color: #999; font-size: 13px; cursor: pointer; transition: border-color .15s, background .15s;
}
.du-dropzone:hover, .du-dropzone.dragover { border-color: #c4a478; background: rgba(196,164,120,.06); }
.du-dropzone input[type=file] { display: none; }
.du-thumb-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.du-thumb {
  width: 64px; height: 64px; border-radius: 6px; border: 1px solid #d4d0ca;
  object-fit: cover; background: #f5f2ee;
}
.du-file-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #f5f2ee;
  border-radius: 6px; font-size: 12px; margin-bottom: 4px;
}
.du-file-item .du-file-remove {
  margin-left: auto; cursor: pointer; color: #c44; font-size: 16px; border: none; background: none; padding: 0 4px;
}
.du-preview-img {
  max-width: 100%; max-height: 200px; border-radius: 6px; border: 1px solid #d4d0ca; margin-top: 8px; cursor: zoom-in;
}
.du-lightbox {
  position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.85);
  display: flex; align-items: center; justify-content: center; cursor: zoom-out;
}
.du-lightbox img {
  max-width: none; max-height: none; transition: transform .15s ease; transform-origin: center;
  border-radius: 4px; box-shadow: 0 4px 32px rgba(0,0,0,.5);
}
.du-lb-controls {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 10000;
  display: flex; gap: 6px; background: rgba(30,30,30,.8); border-radius: 8px; padding: 6px 10px;
}
.du-lb-controls button {
  border: none; background: transparent; color: #fff; font-size: 20px; cursor: pointer;
  width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
}
.du-lb-controls button:hover { background: rgba(255,255,255,.15); }
.du-lb-zoom { color: rgba(255,255,255,.6); font-size: 12px; display: flex; align-items: center; padding: 0 6px;
}
`;

const TOOLS = [
  { id: 'base64',    name: 'Base64',     icon: 'code' },
  { id: 'url',       name: 'URL Encode', icon: 'link' },
  { id: 'jwt',       name: 'JWT Decode', icon: 'token' },
  { id: 'hash',      name: 'Hash',       icon: 'fingerprint' },
  { id: 'uuid',      name: 'UUID',       icon: 'key' },
  { id: 'timestamp', name: 'Timestamp',  icon: 'schedule' },
  { id: 'color',     name: 'Color',      icon: 'palette' },
  { id: 'json',      name: 'JSON',       icon: 'data_object' },
  { id: 'resize',    name: 'Resize Image', icon: 'photo_size_select_large' },
  { id: 'img2pdf',   name: 'Image → PDF',  icon: 'picture_as_pdf' },
  { id: 'joinpdf',   name: 'Join PDFs',    icon: 'merge' },
];

const Icon = ({ name }) => <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{name}</span>;

// ── Base64 ──
const Base64Tool = () => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const encode = () => { try { setOutput(btoa(unescape(encodeURIComponent(input)))); } catch (e) { setOutput('Error: ' + e.message); } };
  const decode = () => { try { setOutput(decodeURIComponent(escape(atob(input)))); } catch (e) { setOutput('Error: ' + e.message); } };
  return <>
    <div className="du-row"><div className="du-label">Input</div><textarea className="du-textarea" value={input} onChange={e => setInput(e.target.value)} placeholder="Enter text or base64..." /></div>
    <div className="du-actions"><button className="du-btn primary" onClick={encode}>Encode</button><button className="du-btn primary" onClick={decode}>Decode</button></div>
    <div className="du-row" style={{ marginTop: 12 }}><div className="du-label">Output</div><div className="du-output">{output || '—'}</div></div>
  </>;
};

// ── URL Encode ──
const UrlTool = () => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const encode = () => setOutput(encodeURIComponent(input));
  const decode = () => { try { setOutput(decodeURIComponent(input)); } catch (e) { setOutput('Error: ' + e.message); } };
  return <>
    <div className="du-row"><div className="du-label">Input</div><textarea className="du-textarea" value={input} onChange={e => setInput(e.target.value)} placeholder="URL or encoded string..." /></div>
    <div className="du-actions"><button className="du-btn primary" onClick={encode}>Encode</button><button className="du-btn primary" onClick={decode}>Decode</button></div>
    <div className="du-row" style={{ marginTop: 12 }}><div className="du-label">Output</div><div className="du-output">{output || '—'}</div></div>
  </>;
};

// ── JWT Decode ──
const JwtTool = () => {
  const [input, setInput] = useState('');
  const [header, setHeader] = useState('');
  const [payload, setPayload] = useState('');
  const decode = () => {
    try {
      const parts = input.trim().split('.');
      if (parts.length < 2) { setHeader('Invalid JWT'); setPayload(''); return; }
      const decodeB64 = s => decodeURIComponent(escape(atob(s.replace(/-/g,'+').replace(/_/g,'/'))));
      setHeader(JSON.stringify(JSON.parse(decodeB64(parts[0])), null, 2));
      setPayload(JSON.stringify(JSON.parse(decodeB64(parts[1])), null, 2));
    } catch (e) { setHeader('Error: ' + e.message); setPayload(''); }
  };
  return <>
    <div className="du-row"><div className="du-label">JWT Token</div><textarea className="du-textarea" value={input} onChange={e => setInput(e.target.value)} placeholder="Paste JWT token..." /></div>
    <div className="du-actions"><button className="du-btn primary" onClick={decode}>Decode</button></div>
    {header && <div className="du-row" style={{ marginTop: 12 }}><div className="du-label">Header</div><div className="du-output">{header}</div></div>}
    {payload && <div className="du-row"><div className="du-label">Payload</div><div className="du-output">{payload}</div></div>}
  </>;
};

// ── Hash ──
const HashTool = () => {
  const [input, setInput] = useState('');
  const [results, setResults] = useState({});
  const compute = async () => {
    const enc = new TextEncoder().encode(input);
    const res = {};
    for (const algo of ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']) {
      try {
        const buf = await crypto.subtle.digest(algo, enc);
        res[algo] = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (_) { res[algo] = 'Not available'; }
    }
    setResults(res);
  };
  return <>
    <div className="du-row"><div className="du-label">Input</div><textarea className="du-textarea" value={input} onChange={e => setInput(e.target.value)} placeholder="Text to hash..." /></div>
    <div className="du-actions"><button className="du-btn primary" onClick={compute}>Compute</button></div>
    {Object.keys(results).length > 0 && Object.entries(results).map(([algo, hash]) => (
      <div className="du-row" key={algo} style={{ marginTop: 8 }}><div className="du-label">{algo}</div><div className="du-output">{hash}</div></div>
    ))}
  </>;
};

// ── UUID ──
const UuidTool = () => {
  const [uuids, setUuids] = useState([]);
  const [count, setCount] = useState(1);
  const generate = () => {
    const list = [];
    for (let i = 0; i < count; i++) list.push(crypto.randomUUID());
    setUuids(list);
  };
  useEffect(() => { generate(); }, []);
  return <>
    <div className="du-row">
      <div className="du-label">Count</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input className="du-input" type="number" min="1" max="100" value={count} onChange={e => setCount(Math.max(1, +e.target.value))} style={{ width: 80 }} />
        <button className="du-btn primary" onClick={generate}>Generate</button>
      </div>
    </div>
    <div className="du-row"><div className="du-label">Result</div><div className="du-output">{uuids.join('\n') || '—'}</div></div>
  </>;
};

// ── Timestamp ──
const TimestampTool = () => {
  const [ts, setTs] = useState(String(Math.floor(Date.now() / 1000)));
  const [date, setDate] = useState('');
  const [iso, setIso] = useState('');
  const convert = useCallback(() => {
    const v = ts.trim();
    const ms = v.length > 12 ? +v : +v * 1000;
    if (isNaN(ms)) { setDate('Invalid'); setIso(''); return; }
    const d = new Date(ms);
    setDate(d.toString());
    setIso(d.toISOString());
  }, [ts]);
  useEffect(() => { convert(); }, []);
  const setNow = () => { const n = Math.floor(Date.now() / 1000); setTs(String(n)); };
  useEffect(() => { convert(); }, [ts]);
  return <>
    <div className="du-row">
      <div className="du-label">Unix Timestamp (s or ms)</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="du-input" value={ts} onChange={e => setTs(e.target.value)} style={{ flex: 1 }} />
        <button className="du-btn" onClick={setNow}>Now</button>
      </div>
    </div>
    <div className="du-row"><div className="du-label">Local</div><div className="du-output">{date || '—'}</div></div>
    <div className="du-row"><div className="du-label">ISO 8601</div><div className="du-output">{iso || '—'}</div></div>
  </>;
};

// ── Color Picker ──
const ColorTool = () => {
  const [hex, setHex] = useState('#c4a478');
  const hexToRgb = h => {
    const r = parseInt(h.slice(1,3),16), g = parseInt(h.slice(3,5),16), b = parseInt(h.slice(5,7),16);
    return { r, g, b };
  };
  const rgbToHsl = ({ r, g, b }) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b), l = (max+min)/2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d/(2-max-min) : d/(max+min);
      if (max===r) h = ((g-b)/d + (g<b?6:0))/6;
      else if (max===g) h = ((b-r)/d+2)/6;
      else h = ((r-g)/d+4)/6;
    }
    return { h: Math.round(h*360), s: Math.round(s*100), l: Math.round(l*100) };
  };
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  return <>
    <div className="du-color-row">
      <div className="du-color-preview" style={{ background: hex }}>
        <input type="color" value={hex} onChange={e => setHex(e.target.value)} />
      </div>
      <div className="du-color-values">
        <div><strong>HEX:</strong> {hex}</div>
        <div><strong>RGB:</strong> rgb({rgb.r}, {rgb.g}, {rgb.b})</div>
        <div><strong>HSL:</strong> hsl({hsl.h}, {hsl.s}%, {hsl.l}%)</div>
      </div>
    </div>
    <div className="du-row" style={{ marginTop: 16 }}>
      <div className="du-label">Hex Input</div>
      <input className="du-input" value={hex} onChange={e => { const v = e.target.value; if (/^#[0-9a-f]{0,6}$/i.test(v)) setHex(v); }} style={{ width: 140 }} />
    </div>
  </>;
};

// ── JSON Formatter ──
const JsonTool = () => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const format = () => { try { setOutput(JSON.stringify(JSON.parse(input), null, 2)); } catch (e) { setOutput('Error: ' + e.message); } };
  const minify = () => { try { setOutput(JSON.stringify(JSON.parse(input))); } catch (e) { setOutput('Error: ' + e.message); } };
  return <>
    <div className="du-row"><div className="du-label">Input JSON</div><textarea className="du-textarea" style={{ minHeight: 120 }} value={input} onChange={e => setInput(e.target.value)} placeholder='{"key": "value"}' /></div>
    <div className="du-actions"><button className="du-btn primary" onClick={format}>Format</button><button className="du-btn primary" onClick={minify}>Minify</button></div>
    <div className="du-row" style={{ marginTop: 12 }}><div className="du-label">Output</div><div className="du-output" style={{ minHeight: 80 }}>{output || '—'}</div></div>
  </>;
};

// ── Image Lightbox ──
const Lightbox = ({ src, onClose }) => {
  const [zoom, setZoom] = useState(1);
  const zoomIn = e => { e.stopPropagation(); setZoom(z => Math.min(z + 0.25, 5)); };
  const zoomOut = e => { e.stopPropagation(); setZoom(z => Math.max(z - 0.25, 0.25)); };
  const reset = e => { e.stopPropagation(); setZoom(1); };
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); else if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(z => Math.min(z + 0.25, 5)); } else if (e.key === '-') { e.preventDefault(); setZoom(z => Math.max(z - 0.25, 0.25)); } else if (e.key === '0') setZoom(1); };
    const onWheel = e => { e.preventDefault(); setZoom(z => Math.max(0.25, Math.min(5, z + (e.deltaY > 0 ? -0.15 : 0.15)))); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('wheel', onWheel, { passive: false });
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('wheel', onWheel); };
  }, [onClose]);
  return <>
    <div className="du-lightbox" onClick={onClose}>
      <img src={src} style={{ transform: `scale(${zoom})` }} onClick={e => e.stopPropagation()} />
    </div>
    <div className="du-lb-controls">
      <button onClick={zoomOut} title="Zoom out (-)">−</button>
      <div className="du-lb-zoom">{Math.round(zoom * 100)}%</div>
      <button onClick={zoomIn} title="Zoom in (+)">+</button>
      <button onClick={reset} title="Reset (0)">⊙</button>
      <button onClick={onClose} title="Close (Esc)">✕</button>
    </div>
  </>;
};

const PreviewImg = ({ src, style, className }) => {
  const [open, setOpen] = useState(false);
  return <>
    <img className={className || 'du-preview-img'} src={src} style={style} onClick={() => setOpen(true)} />
    {open && <Lightbox src={src} onClose={() => setOpen(false)} />}
  </>;
};

// ── CDN loader helper ──
const loadScript = (url) => {
  const win = document.defaultView || window;
  if (win.__loadedScripts?.[url]) return Promise.resolve();
  return new Promise((ok, err) => {
    const s = document.createElement('script');
    s.src = url; s.onload = () => { (win.__loadedScripts = win.__loadedScripts || {})[url] = true; ok(); }; s.onerror = err;
    document.head.appendChild(s);
  });
};

// ── Drop zone component ──
const DropZone = ({ accept, multiple, onFiles, label }) => {
  const ref = useRef(null);
  const [over, setOver] = useState(false);
  const pick = () => ref.current?.click();
  const onDrop = e => { e.preventDefault(); setOver(false); onFiles(Array.from(e.dataTransfer.files)); };
  return React.createElement('div', {
    className: 'du-dropzone' + (over ? ' dragover' : ''),
    onClick: pick, onDragOver: e => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false), onDrop
  },
    React.createElement('input', { ref, type: 'file', accept: accept || '', multiple: !!multiple, onChange: e => { onFiles(Array.from(e.target.files)); e.target.value = ''; } }),
    React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 28, display: 'block', marginBottom: 6 } }, 'upload_file'),
    label || 'Drop files here or click to browse'
  );
};

// ── Resize Image ──
const ResizeTool = () => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [origSize, setOrigSize] = useState({ w: 0, h: 0 });
  const [mode, setMode] = useState('percent');
  const [pct, setPct] = useState(50);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  const [lock, setLock] = useState(true);
  const [result, setResult] = useState('');
  const [resultSize, setResultSize] = useState(null);
  const previewTimerRef = useRef(null);
  const imgRef = useRef(null);

  const loadFile = (files) => {
    const f = files[0]; if (!f || !f.type.startsWith('image/')) return;
    setFile(f); setResult(''); setResultSize(null);
    const url = URL.createObjectURL(f);
    setPreview(url);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setOrigSize({ w: img.width, h: img.height }); setW(img.width); setH(img.height);
    };
    img.src = url;
  };

  const targetW = () => mode === 'percent' ? Math.round((origSize.w * pct) / 100) : w;
  const targetH = () => mode === 'percent' ? Math.round((origSize.h * pct) / 100) : h;

  const doResize = useCallback(() => {
    if (!imgRef.current) return;
    const nw = targetW(), nh = targetH();
    if (nw < 1 || nh < 1) return;
    const cv = document.createElement('canvas'); cv.width = nw; cv.height = nh;
    cv.getContext('2d').drawImage(imgRef.current, 0, 0, nw, nh);
    cv.toBlob(blob => {
      if (!blob) return;
      setResult(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
      setResultSize({ w: nw, h: nh, bytes: blob.size });
    }, file?.type || 'image/png');
  }, [file, mode, pct, w, h, origSize]);

  useEffect(() => {
    if (!file) return;
    clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(doResize, 200);
    return () => clearTimeout(previewTimerRef.current);
  }, [doResize, file]);

  const download = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result; a.download = 'resized_' + (file?.name || 'image.png'); a.click();
  };

  const setWidth = v => { setW(v); if (lock && origSize.w) setH(Math.round(v * origSize.h / origSize.w)); };
  const setHeight = v => { setH(v); if (lock && origSize.h) setW(Math.round(v * origSize.w / origSize.h)); };

  return <>
    <DropZone accept="image/*" onFiles={loadFile} label="Drop an image or click to browse" />
    {preview && <>
      <div className="du-row" style={{ marginTop: 12 }}>
        <div className="du-label">Mode</div>
        <div className="du-actions">
          <button className={'du-btn' + (mode === 'percent' ? ' primary' : '')} onClick={() => setMode('percent')}>By %</button>
          <button className={'du-btn' + (mode === 'pixels' ? ' primary' : '')} onClick={() => setMode('pixels')}>By Pixels</button>
        </div>
      </div>
      {mode === 'percent' ? (
        <div className="du-row">
          <div className="du-label">Scale (%)</div>
          <input className="du-input" type="number" min="1" max="500" value={pct} onChange={e => setPct(+e.target.value)} style={{ width: 100 }} />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div className="du-row" style={{ flex: 1 }}><div className="du-label">Width</div><input className="du-input" type="number" min="1" value={w} onChange={e => setWidth(+e.target.value)} /></div>
          <button className={'du-btn' + (lock ? ' primary' : '')} onClick={() => setLock(!lock)} style={{ marginBottom: 16, fontSize: 16 }}>{lock ? '🔗' : '🔓'}</button>
          <div className="du-row" style={{ flex: 1 }}><div className="du-label">Height</div><input className="du-input" type="number" min="1" value={h} onChange={e => setHeight(+e.target.value)} /></div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div className="du-label" style={{ marginBottom: 4 }}>Original ({origSize.w} x {origSize.h}) — {file ? (file.size < 1048576 ? (file.size / 1024).toFixed(1) + ' KB' : (file.size / 1048576).toFixed(1) + ' MB') : ''}</div>
          <PreviewImg src={preview} style={{ maxHeight: 180 }} />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div className="du-label" style={{ marginBottom: 4 }}>Preview ({targetW()} x {targetH()}){resultSize ? ` — ${(resultSize.bytes / 1024).toFixed(1)} KB` : ''}</div>
          {result ? <PreviewImg src={result} style={{ maxHeight: 180 }} /> : <div className="du-output" style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Generating…</div>}
        </div>
      </div>
      <div className="du-actions" style={{ marginTop: 10 }}>
        {result && <button className="du-btn primary" onClick={download}><Icon name="download" /> Download</button>}
      </div>
    </>}
  </>;
};

// ── Image to PDF ──
const Img2PdfTool = () => {
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [status, setStatus] = useState('');

  const addFiles = (newFiles) => {
    const imgs = newFiles.filter(f => f.type.startsWith('image/'));
    setFiles(prev => [...prev, ...imgs]);
    setPreviews(prev => [...prev, ...imgs.map(f => URL.createObjectURL(f))]);
  };
  const removeFile = (i) => {
    URL.revokeObjectURL(previews[i]);
    setFiles(prev => prev.filter((_, j) => j !== i));
    setPreviews(prev => prev.filter((_, j) => j !== i));
  };

  const convert = async () => {
    if (!files.length) return;
    setStatus('Loading jsPDF…');
    const doc = document.ownerDocument || document;
    await loadScript.call(null, 'https://cdn.jsdelivr.net/npm/jspdf@2/dist/jspdf.umd.min.js');
    const jsPDF = (window.jspdf || window.top.jspdf || {}).jsPDF;
    if (!jsPDF) { setStatus('Failed to load jsPDF'); return; }

    setStatus('Generating PDF…');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const pad = 20;

    for (let i = 0; i < files.length; i++) {
      if (i > 0) pdf.addPage();
      setStatus(`Processing image ${i + 1}/${files.length}…`);
      const dataUrl = await new Promise(ok => {
        const reader = new FileReader();
        reader.onload = () => ok(reader.result);
        reader.readAsDataURL(files[i]);
      });
      const img = await new Promise(ok => { const im = new Image(); im.onload = () => ok(im); im.src = dataUrl; });
      const scale = Math.min((pageW - pad * 2) / img.width, (pageH - pad * 2) / img.height, 1);
      const iw = img.width * scale, ih = img.height * scale;
      const x = (pageW - iw) / 2, y = (pageH - ih) / 2;
      pdf.addImage(dataUrl, 'JPEG', x, y, iw, ih);
    }

    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'images.pdf'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setStatus(`Done — ${files.length} image(s), ${(blob.size / 1024).toFixed(0)} KB`);
  };

  return <>
    <DropZone accept="image/*" multiple onFiles={addFiles} label="Drop images or click to browse (multiple)" />
    {files.length > 0 && <>
      <div style={{ marginTop: 8 }}>
        {files.map((f, i) => (
          <div className="du-file-item" key={i}>
            <img className="du-thumb" src={previews[i]} style={{ width: 32, height: 32 }} />
            <span>{f.name}</span>
            <span style={{ color: '#999', fontSize: 11 }}>({(f.size / 1024).toFixed(0)} KB)</span>
            <button className="du-file-remove" onClick={() => removeFile(i)}>×</button>
          </div>
        ))}
      </div>
      <div className="du-actions" style={{ marginTop: 8 }}>
        <button className="du-btn primary" onClick={convert}>Convert to PDF</button>
        <button className="du-btn" onClick={() => { previews.forEach(URL.revokeObjectURL); setFiles([]); setPreviews([]); setStatus(''); }}>Clear All</button>
      </div>
      {status && <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>{status}</div>}
    </>}
  </>;
};

// ── Join PDFs ──
const JoinPdfTool = () => {
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('');

  const addFiles = (newFiles) => {
    const pdfs = newFiles.filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    setFiles(prev => [...prev, ...pdfs]);
  };
  const removeFile = (i) => setFiles(prev => prev.filter((_, j) => j !== i));
  const moveFile = (i, dir) => {
    setFiles(prev => {
      const a = [...prev]; const j = i + dir;
      if (j < 0 || j >= a.length) return a;
      [a[i], a[j]] = [a[j], a[i]]; return a;
    });
  };

  const merge = async () => {
    if (files.length < 2) { setStatus('Need at least 2 PDFs'); return; }
    setStatus('Loading pdf-lib…');
    await loadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1/dist/pdf-lib.min.js');
    const PDFDocument = (window.PDFLib || window.top.PDFLib || {}).PDFDocument;
    if (!PDFDocument) { setStatus('Failed to load pdf-lib'); return; }

    setStatus('Merging…');
    const merged = await PDFDocument.create();
    for (let i = 0; i < files.length; i++) {
      setStatus(`Processing ${i + 1}/${files.length}: ${files[i].name}`);
      const buf = await files[i].arrayBuffer();
      try {
        const src = await PDFDocument.load(buf);
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      } catch (e) {
        setStatus(`Error in ${files[i].name}: ${e.message}`);
        return;
      }
    }

    const out = await merged.save();
    const blob = new Blob([out], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'merged.pdf'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setStatus(`Done — ${merged.getPageCount()} pages, ${(blob.size / 1024).toFixed(0)} KB`);
  };

  return <>
    <DropZone accept=".pdf,application/pdf" multiple onFiles={addFiles} label="Drop PDFs or click to browse" />
    {files.length > 0 && <>
      <div style={{ marginTop: 8 }}>
        {files.map((f, i) => (
          <div className="du-file-item" key={i}>
            <Icon name="description" />
            <span>{f.name}</span>
            <span style={{ color: '#999', fontSize: 11 }}>({(f.size / 1024).toFixed(0)} KB)</span>
            <button className="du-file-remove" onClick={() => moveFile(i, -1)} style={{ color: '#555', marginLeft: 'auto' }} title="Move up">↑</button>
            <button className="du-file-remove" onClick={() => moveFile(i, 1)} style={{ color: '#555' }} title="Move down">↓</button>
            <button className="du-file-remove" onClick={() => removeFile(i)}>×</button>
          </div>
        ))}
      </div>
      <div className="du-actions" style={{ marginTop: 8 }}>
        <button className="du-btn primary" onClick={merge}>Merge PDFs</button>
        <button className="du-btn" onClick={() => { setFiles([]); setStatus(''); }}>Clear All</button>
      </div>
      {status && <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>{status}</div>}
    </>}
  </>;
};

const TOOL_COMPONENTS = { base64: Base64Tool, url: UrlTool, jwt: JwtTool, hash: HashTool, uuid: UuidTool, timestamp: TimestampTool, color: ColorTool, json: JsonTool, resize: ResizeTool, img2pdf: Img2PdfTool, joinpdf: JoinPdfTool };

const App = () => {
  const [active, setActive] = useState('base64');
  const ToolComponent = TOOL_COMPONENTS[active];
  return (
    <div className="du-root">
      <nav className="du-sidebar">
        <div className="du-sidebar-label">Dev Utils</div>
        {TOOLS.map(t => (
          <div key={t.id} className={`du-nav${active === t.id ? ' active' : ''}`} onClick={() => setActive(t.id)}>
            <Icon name={t.icon} />{t.name}
          </div>
        ))}
      </nav>
      <div className="du-main">
        <div className="du-header">{TOOLS.find(t => t.id === active)?.name}</div>
        <div className="du-body"><ToolComponent key={active} /></div>
      </div>
    </div>
  );
};

const run = (...args) => {
  const [body, props] = args;
  if (!body) {
    platform.host.execCommand("service('001-core.layout','open-window')(command('ui.dev-utils'))", platform);
    return;
  }
  const container = platform.window.document.createElement('div');
  container.style.cssText = 'height:100%;display:flex;flex-direction:column;overflow:hidden;';
  const root = createRoot(container);
  body.appendChild(container);
  const doc = body.ownerDocument;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONT_URL;
  doc.head.appendChild(link);
  const win = doc.defaultView;
  const styles = new win.CSSStyleSheet();
  styles.replace(CSS);
  doc.adoptedStyleSheets = [...(doc.adoptedStyleSheets || []), styles];
  root.render(<App />);
  props.setHeaderStyles({ background: '#ffffff', color: '#555555', boxShadow: 'none', borderBottom: '1px solid #f0ede9' });
  props.setWindowView(true);
  props.onDestroy(() => setTimeout(() => root.unmount(), 0));
};

platform.host.registerCommand('ui.dev-utils', run, {
  icon: 'handyman',
  title: 'Dev Utils',
  category: 'Dev',
});
