const platform = window.platform;
const fs = platform.host.getFS();
const React = platform.getService('React');
const { createRoot } = platform.getService('ReactDOM');
const { useState, useEffect, useRef, useCallback } = React;

const SQL_JS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js';
const SQL_WASM_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.wasm';

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
.sc-root {
  display: flex; flex-direction: column; height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 13px; color: #e4e4e7; background: #18181b; overflow: hidden;
}
.sc-toolbar {
  display: flex; align-items: center; gap: 8px; padding: 8px 14px;
  border-bottom: 1px solid #27272a; flex-shrink: 0; background: #1f1f23;
}
.sc-toolbar-title { font-size: 13px; font-weight: 600; margin-right: auto; display: flex; align-items: center; gap: 6px; }
.sc-btn {
  display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border: 1px solid #3f3f46;
  border-radius: 6px; background: #27272a; color: #e4e4e7; font-size: 11.5px; font-weight: 500;
  cursor: pointer; transition: background 0.15s;
}
.sc-btn:hover { background: #3f3f46; }
.sc-btn.primary { background: #6366f1; color: #fff; border-color: #6366f1; }
.sc-btn.primary:hover { background: #4f46e5; }
.sc-btn.success { background: #22c55e; color: #fff; border-color: #22c55e; }
.sc-btn.success:hover { background: #16a34a; }
.sc-btn:disabled { opacity: .4; cursor: not-allowed; }
.sc-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.sc-tabs {
  display: flex; gap: 0; border-bottom: 1px solid #27272a; background: #1f1f23; flex-shrink: 0;
}
.sc-tab {
  padding: 8px 16px; font-size: 12px; font-weight: 500; cursor: pointer;
  border-bottom: 2px solid transparent; color: #71717a; transition: color 0.15s;
}
.sc-tab:hover { color: #e4e4e7; }
.sc-tab.active { color: #6366f1; border-bottom-color: #6366f1; }
.sc-content { flex: 1; overflow: auto; padding: 14px; }
.sc-editor {
  width: 100%; min-height: 80px; padding: 10px 12px; border: 1px solid #3f3f46; border-radius: 8px;
  font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12.5px; color: #e4e4e7;
  background: #09090b; outline: none; resize: vertical;
}
.sc-editor:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,.2); }
.sc-results { margin-top: 12px; }
.sc-results table {
  width: 100%; border-collapse: collapse; font-size: 12px;
}
.sc-results th {
  text-align: left; padding: 6px 10px; background: #27272a; color: #a1a1aa;
  font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em;
  border-bottom: 1px solid #3f3f46; position: sticky; top: 0;
}
.sc-results td {
  padding: 5px 10px; border-bottom: 1px solid #27272a; color: #d4d4d8;
  max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sc-results tr:hover td { background: rgba(99,102,241,0.06); }
.sc-chart-container {
  background: #09090b; border: 1px solid #3f3f46; border-radius: 8px;
  padding: 16px; margin-top: 12px;
}
.sc-chart-bar-row {
  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
}
.sc-chart-label { width: 120px; text-align: right; font-size: 11px; color: #a1a1aa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }
.sc-chart-bar { height: 22px; border-radius: 4px; transition: width 0.3s ease; min-width: 2px; }
.sc-chart-value { font-size: 11px; color: #71717a; flex-shrink: 0; }
.sc-chart-type-selector { display: flex; gap: 4px; }
.sc-chart-type-btn {
  padding: 3px 8px; border: 1px solid #3f3f46; border-radius: 4px; background: transparent;
  color: #71717a; font-size: 11px; cursor: pointer;
}
.sc-chart-type-btn.active { background: #6366f1; color: #fff; border-color: #6366f1; }
.sc-empty { color: #71717a; text-align: center; padding: 3rem; }
.sc-empty .material-symbols-outlined { font-size: 48px; display: block; margin-bottom: 8px; opacity: 0.3; }
.sc-status { padding: 6px 14px; font-size: 11px; color: #71717a; border-top: 1px solid #27272a; flex-shrink: 0; display: flex; gap: 12px; }
.sc-install-banner {
  margin: 2rem; padding: 1.5rem; border: 1px solid #3f3f46; border-radius: 12px;
  background: #1f1f23; text-align: center;
}
.sc-install-banner h3 { font-size: 16px; margin-bottom: 8px; }
.sc-install-banner p { font-size: 12.5px; color: #a1a1aa; margin-bottom: 16px; }
.sc-select {
  padding: 4px 8px; border: 1px solid #3f3f46; border-radius: 6px;
  background: #27272a; color: #e4e4e7; font-size: 11.5px; outline: none;
}
.sc-preview-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px; margin-top: 12px;
}
.sc-preview-card {
  background: #1f1f23; border: 1px solid #3f3f46; border-radius: 8px; padding: 12px;
  cursor: pointer; transition: border-color 0.15s;
}
.sc-preview-card:hover { border-color: #6366f1; }
.sc-preview-card h4 { font-size: 12px; font-weight: 600; margin-bottom: 4px; }
.sc-preview-card p { font-size: 11px; color: #71717a; }
`;

const CHART_COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#06b6d4','#ec4899','#8b5cf6','#14b8a6','#f97316','#64748b'];

const Icon = ({ name, size }) => <span className="material-symbols-outlined" style={{ fontSize: size || 16 }}>{name}</span>;

let _sqlPromise = null;
const loadSqlJs = () => {
  if (_sqlPromise) return _sqlPromise;
  _sqlPromise = new Promise((resolve, reject) => {
    const iframe = top.document.createElement('iframe');
    iframe.style.display = 'none';
    top.document.body.appendChild(iframe);
    const iframeWin = iframe.contentWindow;
    const script = iframeWin.document.createElement('script');
    script.src = SQL_JS_CDN;
    script.onload = () => {
      const initFn = iframeWin.initSqlJs;
      if (!initFn) { reject(new Error('initSqlJs not found')); return; }
      initFn({ locateFile: () => SQL_WASM_CDN }).then(resolve).catch(reject);
    };
    script.onerror = () => reject(new Error('Failed to load sql.js'));
    iframeWin.document.head.appendChild(script);
  });
  return _sqlPromise;
};

const checkSqliteBrowserInstalled = () => {
  return !!platform.host.getCommand('ui.sqlite');
};

const BarChart = ({ columns, values, labelCol, valueCol }) => {
  const maxVal = Math.max(...values.map(r => Math.abs(Number(r[valueCol]) || 0)), 1);
  return <div className="sc-chart-container">
    {values.slice(0, 50).map((row, i) => {
      const val = Number(row[valueCol]) || 0;
      const pct = (Math.abs(val) / maxVal) * 100;
      return <div key={i} className="sc-chart-bar-row">
        <div className="sc-chart-label" title={String(row[labelCol])}>{String(row[labelCol])}</div>
        <div className="sc-chart-bar" style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
        <div className="sc-chart-value">{val.toLocaleString()}</div>
      </div>;
    })}
  </div>;
};

const PieChart = ({ columns, values, labelCol, valueCol }) => {
  const data = values.slice(0, 10).map((r, i) => ({
    label: String(r[labelCol]),
    value: Math.abs(Number(r[valueCol]) || 0),
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let cumAngle = 0;
  const slices = data.map(d => {
    const angle = (d.value / total) * 360;
    const start = cumAngle;
    cumAngle += angle;
    return { ...d, start, angle };
  });
  const toRad = deg => (deg - 90) * Math.PI / 180;
  const arcPath = (cx, cy, r, startAngle, endAngle) => {
    const s = { x: cx + r * Math.cos(toRad(startAngle)), y: cy + r * Math.sin(toRad(startAngle)) };
    const e = { x: cx + r * Math.cos(toRad(endAngle)), y: cy + r * Math.sin(toRad(endAngle)) };
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`;
  };

  return <div className="sc-chart-container" style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
    <svg width="160" height="160" viewBox="0 0 160 160">
      {slices.map((s, i) => s.angle > 0.1 ?
        <path key={i} d={arcPath(80, 80, 70, s.start, s.start + s.angle)} fill={s.color} stroke="#09090b" strokeWidth="1" />
      : null)}
    </svg>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {data.map((d, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
        <div style={{ width: 10, height: 10, borderRadius: 2, background: d.color, flexShrink: 0 }} />
        <span style={{ color: '#a1a1aa' }}>{d.label}</span>
        <span style={{ marginLeft: 'auto', color: '#71717a' }}>{((d.value / total) * 100).toFixed(1)}%</span>
      </div>)}
    </div>
  </div>;
};

const LineChart = ({ columns, values, labelCol, valueCol }) => {
  const data = values.slice(0, 100).map(r => Number(r[valueCol]) || 0);
  if (!data.length) return null;
  const minV = Math.min(...data);
  const maxV = Math.max(...data);
  const range = maxV - minV || 1;
  const w = 500, h = 160, px = 40, py = 20;
  const points = data.map((v, i) => ({
    x: px + (i / (data.length - 1 || 1)) * (w - 2 * px),
    y: py + (1 - (v - minV) / range) * (h - 2 * py),
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return <div className="sc-chart-container">
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <line x1={px} y1={py} x2={px} y2={h - py} stroke="#3f3f46" strokeWidth="1" />
      <line x1={px} y1={h - py} x2={w - px} y2={h - py} stroke="#3f3f46" strokeWidth="1" />
      <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="2" />
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="#6366f1" />)}
      <text x={px - 4} y={py + 4} fill="#71717a" fontSize="9" textAnchor="end">{maxV.toLocaleString()}</text>
      <text x={px - 4} y={h - py + 4} fill="#71717a" fontSize="9" textAnchor="end">{minV.toLocaleString()}</text>
    </svg>
  </div>;
};

const ChartView = ({ result, chartType, setChartType, labelCol, setLabelCol, valueCol, setValueCol }) => {
  if (!result || !result.columns || result.columns.length < 2) {
    return <div className="sc-empty"><Icon name="bar_chart" size={48} /><br />Run a query with at least 2 columns to chart</div>;
  }
  const { columns, values } = result;
  const ChartComponent = chartType === 'pie' ? PieChart : chartType === 'line' ? LineChart : BarChart;

  return <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
      <div className="sc-chart-type-selector">
        {['bar', 'pie', 'line'].map(t =>
          <button key={t} className={`sc-chart-type-btn${chartType === t ? ' active' : ''}`} onClick={() => setChartType(t)}>
            <Icon name={t === 'bar' ? 'bar_chart' : t === 'pie' ? 'pie_chart' : 'show_chart'} size={14} /> {t}
          </button>
        )}
      </div>
      <span style={{ fontSize: '11px', color: '#71717a' }}>Label:</span>
      <select className="sc-select" value={labelCol} onChange={e => setLabelCol(Number(e.target.value))}>
        {columns.map((c, i) => <option key={i} value={i}>{c}</option>)}
      </select>
      <span style={{ fontSize: '11px', color: '#71717a' }}>Value:</span>
      <select className="sc-select" value={valueCol} onChange={e => setValueCol(Number(e.target.value))}>
        {columns.map((c, i) => <option key={i} value={i}>{c}</option>)}
      </select>
    </div>
    <ChartComponent columns={columns} values={values} labelCol={labelCol} valueCol={valueCol} />
  </div>;
};

const App = ({ initialPath, props }) => {
  const [loading, setLoading] = useState(true);
  const [sqliteInstalled, setSqliteInstalled] = useState(false);
  const [SQL, setSQL] = useState(null);
  const [db, setDb] = useState(null);
  const [dbPath, setDbPath] = useState(initialPath || null);
  const [tables, setTables] = useState([]);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('table');
  const [chartType, setChartType] = useState('bar');
  const [labelCol, setLabelCol] = useState(0);
  const [valueCol, setValueCol] = useState(1);
  const [status, setStatus] = useState('');
  const [dbFiles, setDbFiles] = useState([]);

  useEffect(() => {
    setSqliteInstalled(checkSqliteBrowserInstalled());
    loadSqlJs().then(sql => { setSQL(sql); setLoading(false); }).catch(err => { setError(err.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!SQL) return;
    const files = [];
    const walk = (dir, depth) => {
      if (depth > 3) return;
      try {
        for (const name of fs.readdirSync(dir)) {
          const p = `${dir}/${name}`;
          try {
            if (fs.statSync(p).isDirectory()) walk(p, depth + 1);
            else if (/\.(db|sqlite|sqlite3)$/i.test(name)) files.push(p);
          } catch (_) {}
        }
      } catch (_) {}
    };
    ['/home/user1', '/tmp', '/opt/apps'].forEach(d => walk(d, 0));
    setDbFiles(files);
    if (initialPath) openDb(initialPath);
  }, [SQL]);

  const openDb = (path) => {
    try {
      const data = fs.readFileSync(path);
      const uArr = new Uint8Array(data instanceof Buffer ? data : data);
      const newDb = new SQL.Database(uArr);
      setDb(newDb);
      setDbPath(path);
      setError(null);
      const tablesResult = newDb.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
      setTables(tablesResult.length ? tablesResult[0].values.map(r => r[0]) : []);
      setStatus(`Opened ${path}`);
      if (props) props.setTitle(`SQLite Charts — ${path.split('/').pop()}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const createSampleDb = () => {
    if (!SQL) return;
    const sampleDb = new SQL.Database();
    sampleDb.run(`CREATE TABLE sales (month TEXT, revenue INTEGER, expenses INTEGER, region TEXT)`);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const regions = ['North','South','East','West'];
    for (const m of months) {
      for (const r of regions) {
        sampleDb.run('INSERT INTO sales VALUES (?,?,?,?)', [m, Math.floor(Math.random()*50000)+10000, Math.floor(Math.random()*30000)+5000, r]);
      }
    }
    sampleDb.run(`CREATE TABLE products (name TEXT, category TEXT, price REAL, stock INTEGER)`);
    const products = [
      ['Widget A','Hardware',29.99,150],['Widget B','Hardware',49.99,80],
      ['App Pro','Software',99.99,999],['App Lite','Software',19.99,999],
      ['Cable X','Accessories',9.99,500],['Case Y','Accessories',24.99,200],
      ['Monitor Z','Hardware',399.99,30],['Keyboard K','Hardware',79.99,120],
    ];
    for (const p of products) sampleDb.run('INSERT INTO products VALUES (?,?,?,?)', p);

    sampleDb.run(`CREATE TABLE tasks (id INTEGER PRIMARY KEY, title TEXT, status TEXT, priority TEXT, created TEXT)`);
    const statuses = ['todo','in_progress','done','blocked'];
    const priorities = ['low','medium','high','critical'];
    for (let i = 1; i <= 25; i++) {
      sampleDb.run('INSERT INTO tasks VALUES (?,?,?,?,?)', [
        i, `Task ${i}`, statuses[Math.floor(Math.random()*4)],
        priorities[Math.floor(Math.random()*4)],
        new Date(Date.now() - Math.random()*30*86400000).toISOString().slice(0,10),
      ]);
    }

    const path = '/home/user1/sample-charts.db';
    const exported = sampleDb.export();
    fs.writeFileSync(path, Buffer.from(exported));
    sampleDb.close();
    openDb(path);
    setDbFiles(prev => prev.includes(path) ? prev : [...prev, path]);
    setStatus(`Created sample database at ${path}`);
  };

  const runQuery = () => {
    if (!db || !query.trim()) return;
    try {
      const res = db.exec(query);
      if (res.length) {
        setResult(res[0]);
        setLabelCol(0);
        setValueCol(Math.min(1, res[0].columns.length - 1));
        setError(null);
        setStatus(`${res[0].values.length} rows returned`);
      } else {
        setResult(null);
        setError(null);
        setStatus('Query executed (no results)');
      }
    } catch (err) {
      setError(err.message);
      setResult(null);
    }
  };

  const selectTable = (table) => {
    const q = `SELECT * FROM "${table}" LIMIT 500`;
    setQuery(q);
    if (db) {
      try {
        const res = db.exec(q);
        if (res.length) {
          setResult(res[0]);
          setLabelCol(0);
          setValueCol(Math.min(1, res[0].columns.length - 1));
          setStatus(`${res[0].values.length} rows from ${table}`);
        }
        setError(null);
      } catch (err) { setError(err.message); }
    }
  };

  const addChartAsWidget = () => {
    if (!result || !result.columns || result.columns.length < 2) return;
    const widgetData = {
      columns: result.columns,
      values: result.values.slice(0, 20),
      labelCol,
      valueCol,
      chartType,
      title: dbPath ? dbPath.split('/').pop() : 'SQLite Chart',
    };
    const widgetId = `sqlchart-${Date.now()}`;

    platform.host.registerWidget(widgetId, (container, api) => {
      const d = widgetData;
      const titleEl = document.createElement('div');
      titleEl.style.cssText = 'font-size:0.7rem;opacity:0.8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;';
      titleEl.textContent = d.title;
      container.appendChild(titleEl);

      const maxVal = Math.max(...d.values.map(r => Math.abs(Number(r[d.valueCol]) || 0)), 1);
      for (const row of d.values.slice(0, 8)) {
        const val = Number(row[d.valueCol]) || 0;
        const pct = (Math.abs(val) / maxVal) * 100;
        const rowEl = document.createElement('div');
        rowEl.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:3px;';
        const label = document.createElement('div');
        label.style.cssText = 'width:60px;font-size:10px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:0.8;';
        label.textContent = String(row[d.labelCol]);
        const bar = document.createElement('div');
        bar.style.cssText = `height:12px;border-radius:3px;background:#6366f1;width:${pct}%;min-width:2px;`;
        const valEl = document.createElement('div');
        valEl.style.cssText = 'font-size:10px;opacity:0.6;';
        valEl.textContent = val.toLocaleString();
        rowEl.appendChild(label);
        rowEl.appendChild(bar);
        rowEl.appendChild(valEl);
        container.appendChild(rowEl);
      }
    }, { title: widgetData.title });

    setStatus(`Widget "${widgetData.title}" added to desktop`);
  };

  const openInSqliteBrowser = () => {
    if (dbPath && sqliteInstalled) {
      platform.host.callCommand('ui.sqlite', dbPath);
    }
  };

  const installSqliteBrowser = () => {
    const cmd = platform.host.getCommand('ui.pkg-manager');
    if (cmd) cmd.exec();
  };

  if (loading) return <div className="sc-root"><div className="sc-empty"><Icon name="hourglass_empty" size={48} /><br />Loading SQL engine...</div></div>;

  if (!db) return <div className="sc-root">
    <div className="sc-toolbar">
      <div className="sc-toolbar-title"><Icon name="database" size={18} /> SQLite Charts</div>
    </div>
    <div className="sc-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
      {!sqliteInstalled && <div className="sc-install-banner">
        <h3><Icon name="info" size={20} /> SQLite Browser not installed</h3>
        <p>Install the SQLite Browser app for advanced database editing and management.</p>
        <button className="sc-btn primary" onClick={installSqliteBrowser}><Icon name="download" size={14} /> Open Package Manager</button>
      </div>}

      <div style={{ textAlign: 'center', maxWidth: '500px' }}>
        <h3 style={{ fontSize: '18px', marginBottom: '8px' }}><Icon name="bar_chart" size={24} /> SQLite Charts</h3>
        <p style={{ fontSize: '12.5px', color: '#a1a1aa', marginBottom: '20px' }}>
          Open a .db file to query data, visualize it with charts, and add chart widgets to your desktop.
        </p>
        <button className="sc-btn primary" onClick={createSampleDb} style={{ marginBottom: '16px' }}>
          <Icon name="add_circle" size={14} /> Create Sample Database
        </button>
      </div>

      {dbFiles.length > 0 && <div style={{ width: '100%', maxWidth: '600px' }}>
        <h4 style={{ fontSize: '12px', color: '#71717a', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Databases found on this system
        </h4>
        <div className="sc-preview-grid">
          {dbFiles.map(f => <div key={f} className="sc-preview-card" onClick={() => openDb(f)}>
            <h4><Icon name="database" size={14} /> {f.split('/').pop()}</h4>
            <p>{f}</p>
          </div>)}
        </div>
      </div>}
    </div>
  </div>;

  return <div className="sc-root">
    <div className="sc-toolbar">
      <div className="sc-toolbar-title"><Icon name="database" size={18} /> {dbPath ? dbPath.split('/').pop() : 'SQLite Charts'}</div>
      {sqliteInstalled && <button className="sc-btn" onClick={openInSqliteBrowser} title="Open in SQLite Browser"><Icon name="open_in_new" size={14} /> SQLite Browser</button>}
      <button className="sc-btn success" onClick={addChartAsWidget} disabled={!result || (result.columns||[]).length < 2} title="Add current chart as desktop widget">
        <Icon name="widgets" size={14} /> Add Widget
      </button>
    </div>
    <div className="sc-body">
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #27272a', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <textarea className="sc-editor" value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); } }}
            placeholder="SELECT * FROM table_name ..."
          />
        </div>
        <button className="sc-btn primary" onClick={runQuery} disabled={!query.trim()} style={{ height: '34px' }}>
          <Icon name="play_arrow" size={14} /> Run
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: '160px', borderRight: '1px solid #27272a', padding: '8px', overflowY: 'auto', flexShrink: 0, background: '#1f1f23' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 6px' }}>Tables</div>
          {tables.map(t => <div key={t} style={{ padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
            onClick={() => selectTable(t)}
            onMouseEnter={e => e.currentTarget.style.background = '#27272a'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <Icon name="table_chart" size={14} /> {t}
          </div>)}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="sc-tabs">
            <div className={`sc-tab${tab === 'table' ? ' active' : ''}`} onClick={() => setTab('table')}><Icon name="table_rows" size={14} /> Table</div>
            <div className={`sc-tab${tab === 'chart' ? ' active' : ''}`} onClick={() => setTab('chart')}><Icon name="bar_chart" size={14} /> Chart</div>
            <div className={`sc-tab${tab === 'preview' ? ' active' : ''}`} onClick={() => setTab('preview')}><Icon name="visibility" size={14} /> Preview</div>
          </div>

          <div className="sc-content">
            {error && <div style={{ color: '#ef4444', fontSize: '12px', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: '6px', marginBottom: '10px' }}>{error}</div>}

            {tab === 'table' && result && <div className="sc-results">
              <table>
                <thead><tr>{result.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
                <tbody>{result.values.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell == null ? <em style={{opacity:.3}}>NULL</em> : String(cell)}</td>)}</tr>)}</tbody>
              </table>
            </div>}

            {tab === 'chart' && <ChartView result={result} chartType={chartType} setChartType={setChartType}
              labelCol={labelCol} setLabelCol={setLabelCol} valueCol={valueCol} setValueCol={setValueCol} />}

            {tab === 'preview' && result && <div>
              <h4 style={{ fontSize: '12px', color: '#71717a', marginBottom: '8px' }}>Widget Preview — this is how it will look on your desktop:</h4>
              <div style={{ maxWidth: '280px', padding: '12px 16px', background: 'rgba(255,255,255,0.08)', borderRadius: '12px', border: '1px solid #3f3f46' }}>
                <div style={{ fontSize: '10px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                  {dbPath ? dbPath.split('/').pop() : 'SQLite Chart'}
                </div>
                <BarChart columns={result.columns} values={result.values.slice(0, 8)} labelCol={labelCol} valueCol={valueCol} />
              </div>
              <button className="sc-btn success" onClick={addChartAsWidget} style={{ marginTop: '12px' }}>
                <Icon name="add" size={14} /> Add to Desktop Widgets
              </button>
            </div>}

            {!result && !error && tab === 'table' && <div className="sc-empty"><Icon name="database" size={48} /><br />Select a table or run a query</div>}
          </div>
        </div>
      </div>
    </div>
    <div className="sc-status">
      <span>{status}</span>
      {result && <span>{result.values.length} rows × {result.columns.length} cols</span>}
    </div>
  </div>;
};

const run = (...args) => {
  const [body, props, ...rest] = args;
  if (!body) {
    platform.host.execCommand("service('001-core.layout','open-window')(command('ui.sqlite-charts'))", platform);
    return;
  }
  const container = platform.window.document.createElement('div');
  container.style.cssText = 'height:100%;width:100%;';
  body.appendChild(container);
  const doc = body.ownerDocument;
  const styles = new doc.defaultView.CSSStyleSheet();
  styles.replaceSync(CSS);
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, styles];
  const fontLink = doc.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0';
  doc.head.appendChild(fontLink);

  const root = createRoot(container);
  const initialPath = rest[0] || null;
  root.render(<App initialPath={initialPath} props={props} />);
  props.setWindowView(true);
  props.setTitle('SQLite Charts');
  props.onDestroy(() => root.unmount());
};

platform.host.registerCommand('ui.sqlite-charts', run, {
  icon: 'bar_chart',
  title: 'SQLite Charts',
  category: 'Data',
  fileExtensions: ['.db', '.sqlite', '.sqlite3'],
});
