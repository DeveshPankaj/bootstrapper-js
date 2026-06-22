const platform = window.platform;
const fs = platform.host.getFS();
const React = platform.getService('React');
const { createRoot } = platform.getService('ReactDOM');
const { useState, useEffect, useRef, useCallback } = React;

const SQL_JS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js';
const SQL_WASM_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.wasm';
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0';

const CSS = `
* { box-sizing: border-box; }
.sq-root {
  display: flex; flex-direction: column; height: 100%; font-family: system-ui, -apple-system, sans-serif;
  font-size: 13.5px; color: #1c1c1e; background: #fff; overflow: hidden;
}
.sq-toolbar {
  display: flex; align-items: center; gap: 8px; padding: 10px 16px;
  border-bottom: 1px solid #e0dbd4; flex-shrink: 0; background: #faf9f7;
}
.sq-toolbar-title { font-size: 14px; font-weight: 600; margin-right: auto; }
.sq-btn {
  display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; border: 1px solid #d4d0ca;
  border-radius: 6px; background: #fff; color: #3a3a3c; font-size: 12px; font-weight: 600;
  cursor: pointer;
}
.sq-btn:hover { background: #f5f2ee; }
.sq-btn.primary { background: #c4a478; color: #fff; border-color: #c4a478; }
.sq-btn.primary:hover { background: #b8956a; }
.sq-btn:disabled { opacity: .5; cursor: not-allowed; }
.sq-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.sq-split { display: flex; flex: 1; overflow: hidden; }
.sq-sidebar {
  width: 200px; flex-shrink: 0; border-right: 1px solid #e0dbd4; background: #faf9f7;
  overflow-y: auto; padding: 8px;
}
.sq-sidebar-label {
  font-size: 10px; font-weight: 600; color: #999; text-transform: uppercase;
  letter-spacing: 0.06em; padding: 6px 8px 4px;
}
.sq-table-item {
  display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 5px;
  cursor: pointer; font-size: 12.5px; color: #3a3a3c; user-select: none;
}
.sq-table-item:hover { background: #f0ede9; }
.sq-table-item.active { background: #c4a478; color: #fff; }
.sq-table-item .material-symbols-outlined { font-size: 16px; }
.sq-main-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.sq-editor {
  border-bottom: 1px solid #e0dbd4; padding: 10px 14px; flex-shrink: 0;
  display: flex; flex-direction: column; gap: 6px;
}
.sq-editor textarea {
  width: 100%; min-height: 64px; padding: 8px 10px; border: 1px solid #d4d0ca; border-radius: 6px;
  font-family: 'SF Mono', Menlo, monospace; font-size: 12.5px; color: #1c1c1e;
  background: #faf9f7; outline: none; resize: vertical;
}
.sq-editor textarea:focus { border-color: #c4a478; box-shadow: 0 0 0 2px rgba(196,164,120,.15); }
.sq-results { flex: 1; overflow: auto; padding: 0; }
.sq-results table {
  width: 100%; border-collapse: collapse; font-size: 12.5px;
  font-family: 'SF Mono', Menlo, monospace;
}
.sq-results th {
  position: sticky; top: 0; background: #f5f2ee; border-bottom: 2px solid #d4d0ca;
  padding: 6px 10px; text-align: left; font-weight: 600; font-size: 11px;
  text-transform: uppercase; letter-spacing: .03em; color: #777;
}
.sq-results td {
  padding: 5px 10px; border-bottom: 1px solid #f0ede9; max-width: 300px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sq-results tr:hover td { background: #faf9f7; }
.sq-status {
  padding: 6px 14px; border-top: 1px solid #e0dbd4; font-size: 11px; color: #888;
  flex-shrink: 0; background: #faf9f7;
}
.sq-error { color: #c44; background: #fff5f5; border: 1px solid #f0d0d0; border-radius: 6px; padding: 8px 12px; margin: 8px 14px; font-size: 12px; }
.sq-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; color: #bbb; gap: 8px; }
.sq-empty .material-symbols-outlined { font-size: 48px; }
.sq-loading { display: flex; align-items: center; justify-content: center; flex: 1; color: #999; font-size: 13px; }
.sq-modal-overlay {
  position: absolute; inset: 0; background: rgba(0,0,0,.3); display: flex;
  align-items: center; justify-content: center; z-index: 10;
}
.sq-modal {
  background: #fff; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.2);
  width: 400px; max-height: 70%; display: flex; flex-direction: column; overflow: hidden;
}
.sq-modal-header {
  padding: 12px 16px; border-bottom: 1px solid #e0dbd4; font-weight: 600; font-size: 14px;
  display: flex; align-items: center; justify-content: space-between;
}
.sq-modal-body { flex: 1; overflow-y: auto; padding: 8px; }
.sq-modal-file {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 6px;
  cursor: pointer; font-size: 12.5px; color: #3a3a3c;
}
.sq-modal-file:hover { background: #f0ede9; }
.sq-modal-footer { padding: 10px 16px; border-top: 1px solid #e0dbd4; display: flex; gap: 8px; }
.sq-modal-footer input {
  flex: 1; padding: 6px 10px; border: 1px solid #d4d0ca; border-radius: 6px;
  font-size: 12.5px; outline: none; font-family: 'SF Mono', Menlo, monospace;
}
.sq-modal-footer input:focus { border-color: #c4a478; }
`;

const Icon = ({ name, size }) => <span className="material-symbols-outlined" style={{ fontSize: size || 16 }}>{name}</span>;

// Load sql.js in a fresh hidden iframe (the top document has webpack __dirname polyfills
// that confuse sql.js's Node detection; a clean iframe avoids that).
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
      initFn({ locateFile: () => SQL_WASM_CDN })
        .then(SQL => { resolve(SQL); })
        .catch(reject);
    };
    script.onerror = () => reject(new Error('Failed to load sql.js script'));
    iframeWin.document.head.appendChild(script);
  });
  return _sqlPromise;
};

const scanDbFiles = (dirs) => {
  const files = [];
  const walk = (dir, depth) => {
    if (depth > 4) return;
    try {
      for (const name of fs.readdirSync(dir)) {
        const path = `${dir}/${name}`;
        try {
          if (fs.statSync(path).isDirectory()) walk(path, depth + 1);
          else if (/\.(db|sqlite|sqlite3)$/i.test(name)) files.push(path);
        } catch (_) {}
      }
    } catch (_) {}
  };
  for (const d of dirs) walk(d, 0);
  return files;
};

const ResultTable = ({ columns, values }) => (
  <table>
    <thead><tr>{columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
    <tbody>
      {values.map((row, ri) => (
        <tr key={ri}>{row.map((cell, ci) => <td key={ci} title={cell == null ? 'NULL' : String(cell)}>{cell == null ? <em style={{ color: '#bbb' }}>NULL</em> : String(cell)}</td>)}</tr>
      ))}
    </tbody>
  </table>
);

// ── File picker modal ──
const FilePickerModal = ({ onSelect, onClose }) => {
  const dbFiles = scanDbFiles(['/home/user1', '/mnt', '/opt/apps', '/tmp']);
  return (
    <div className="sq-modal-overlay" onClick={onClose}>
      <div className="sq-modal" onClick={e => e.stopPropagation()}>
        <div className="sq-modal-header">
          Open Database
          <button className="sq-btn" onClick={onClose} style={{ padding: '2px 8px' }}>✕</button>
        </div>
        <div className="sq-modal-body">
          {dbFiles.length === 0 ? (
            <div style={{ padding: 24, color: '#bbb', textAlign: 'center' }}>
              <div>No .db / .sqlite files found</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Create a new database or drop a file into VFS first</div>
            </div>
          ) : dbFiles.map(path => (
            <div key={path} className="sq-modal-file" onClick={() => { onSelect(path); onClose(); }}>
              <Icon name="database" />{path}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Save dialog modal ──
const SaveModal = ({ defaultName, onSave, onClose }) => {
  const [path, setPath] = useState(`/home/user1/${defaultName || 'database.db'}`);
  const inputRef = useRef(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);
  return (
    <div className="sq-modal-overlay" onClick={onClose}>
      <div className="sq-modal" onClick={e => e.stopPropagation()} style={{ width: 360 }}>
        <div className="sq-modal-header">
          Save Database
          <button className="sq-btn" onClick={onClose} style={{ padding: '2px 8px' }}>✕</button>
        </div>
        <div className="sq-modal-footer">
          <input ref={inputRef} value={path} onChange={e => setPath(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { onSave(path); onClose(); }}} />
          <button className="sq-btn primary" onClick={() => { onSave(path); onClose(); }}>Save</button>
        </div>
      </div>
    </div>
  );
};

// ── Main app ──
const App = ({ initialFile }) => {
  const [SQL, setSQL] = useState(null);
  const [db, setDb] = useState(null);
  const [tables, setTables] = useState([]);
  const [activeTable, setActiveTable] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [dbName, setDbName] = useState('');
  const [showOpen, setShowOpen] = useState(false);
  const [showSave, setShowSave] = useState(false);

  useEffect(() => {
    loadSqlJs()
      .then(sql => { setSQL(sql); setLoading(false); })
      .catch(e => { setError('Failed to load sql.js: ' + e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    if (SQL && initialFile) openFile(initialFile);
  }, [SQL]);

  const openFile = useCallback((path) => {
    if (!SQL) return;
    try {
      const data = fs.readFileSync(path);
      const uArr = new Uint8Array(data instanceof Buffer ? data : data);
      const newDb = new SQL.Database(uArr);
      if (db) db.close();
      setDb(newDb);
      setDbName(path.split('/').pop());
      setError(null);
      const tbls = newDb.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
      const tableNames = tbls.length ? tbls[0].values.map(r => r[0]) : [];
      setTables(tableNames);
      setActiveTable(null);
      setResults(null);
      setQuery('');
      setStatus(`Opened ${path} — ${tableNames.length} table(s)`);
    } catch (e) {
      setError('Failed to open file: ' + e.message);
    }
  }, [SQL, db]);

  const createNew = useCallback(() => {
    if (!SQL) return;
    if (db) db.close();
    const newDb = new SQL.Database();
    setDb(newDb);
    setDbName('untitled.db');
    setTables([]);
    setActiveTable(null);
    setResults(null);
    setQuery('');
    setError(null);
    setStatus('New empty database created');
  }, [SQL, db]);

  const doSave = useCallback((path) => {
    if (!db) return;
    try {
      const data = db.export();
      fs.writeFileSync(path, Buffer.from(data));
      setDbName(path.split('/').pop());
      setStatus(`Saved to ${path} (${data.byteLength} bytes)`);
    } catch (e) { setError('Save failed: ' + e.message); }
  }, [db]);

  const selectTable = useCallback((name) => {
    setActiveTable(name);
    const q = `SELECT * FROM "${name}" LIMIT 500`;
    setQuery(q);
    runQuery(q);
  }, [db]);

  const runQuery = useCallback((q) => {
    const sql = (q || query).trim();
    if (!db || !sql) return;
    setError(null);
    try {
      const t0 = performance.now();
      const res = db.exec(sql);
      const elapsed = (performance.now() - t0).toFixed(1);
      if (res.length > 0) {
        setResults(res[0]);
        setStatus(`${res[0].values.length} row(s) in ${elapsed}ms`);
      } else {
        setResults(null);
        const tbls = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
        setTables(tbls.length ? tbls[0].values.map(r => r[0]) : []);
        setStatus(`Query executed in ${elapsed}ms (no result rows)`);
      }
    } catch (e) { setError(e.message); }
  }, [db, query]);

  if (loading) return <div className="sq-root"><div className="sq-loading">Loading sql.js…</div></div>;

  return (
    <div className="sq-root" style={{ position: 'relative' }}>
      <div className="sq-toolbar">
        <div className="sq-toolbar-title">{dbName ? `SQLite — ${dbName}` : 'SQLite Browser'}</div>
        <button className="sq-btn" onClick={createNew} disabled={!SQL}><Icon name="add" /> New</button>
        <button className="sq-btn" onClick={() => setShowOpen(true)} disabled={!SQL}><Icon name="folder_open" /> Open</button>
        <button className="sq-btn" onClick={() => setShowSave(true)} disabled={!db}><Icon name="save" /> Save</button>
      </div>
      {error && <div className="sq-error">{error}</div>}
      <div className="sq-body">
        {!db ? (
          <div className="sq-empty">
            <Icon name="database" size={48} />
            <div>{SQL ? 'No database open' : 'Loading sql.js engine…'}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="sq-btn primary" onClick={createNew}>Create New</button>
              <button className="sq-btn" onClick={() => setShowOpen(true)}>Open from VFS</button>
            </div>
          </div>
        ) : (
          <div className="sq-split">
            <div className="sq-sidebar">
              <div className="sq-sidebar-label">Tables ({tables.length})</div>
              {tables.map(t => (
                <div key={t} className={`sq-table-item${activeTable === t ? ' active' : ''}`} onClick={() => selectTable(t)}>
                  <Icon name="table_chart" />{t}
                </div>
              ))}
              {tables.length === 0 && <div style={{ padding: '12px 8px', color: '#bbb', fontSize: 12 }}>No tables yet — run CREATE TABLE</div>}
            </div>
            <div className="sq-main-area">
              <div className="sq-editor">
                <textarea value={query} onChange={e => setQuery(e.target.value)} placeholder="SELECT * FROM ..." onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); }}} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="sq-btn primary" onClick={() => runQuery()} disabled={!query.trim()}>
                    <Icon name="play_arrow" /> Run
                  </button>
                  <span style={{ fontSize: 11, color: '#aaa', alignSelf: 'center' }}>⌘/Ctrl+Enter</span>
                </div>
              </div>
              {error && <div className="sq-error">{error}</div>}
              <div className="sq-results">
                {results ? <ResultTable columns={results.columns} values={results.values} /> : (
                  <div style={{ padding: 24, color: '#bbb', textAlign: 'center', fontSize: 12 }}>Run a query to see results</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="sq-status">{status || 'Ready'}</div>
      {showOpen && <FilePickerModal onSelect={openFile} onClose={() => setShowOpen(false)} />}
      {showSave && <SaveModal defaultName={dbName} onSave={doSave} onClose={() => setShowSave(false)} />}
    </div>
  );
};

const run = (...args) => {
  const [body, props] = args;
  if (!body) {
    platform.host.execCommand("service('001-core.layout','open-window')(command('ui.sqlite'))", platform);
    return;
  }
  const filePath = args[2] || null;
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
  root.render(<App initialFile={filePath} />);
  props.setHeaderStyles({ background: '#ffffff', color: '#555555', boxShadow: 'none', borderBottom: '1px solid #f0ede9' });
  props.setWindowView(true);
  props.onDestroy(() => { root.unmount(); });
};

platform.host.registerCommand('ui.sqlite', run, {
  icon: 'database',
  title: 'SQLite Browser',
  category: 'Dev',
});
