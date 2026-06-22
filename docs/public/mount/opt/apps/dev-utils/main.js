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

const TOOL_COMPONENTS = { base64: Base64Tool, url: UrlTool, jwt: JwtTool, hash: HashTool, uuid: UuidTool, timestamp: TimestampTool, color: ColorTool, json: JsonTool };

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
