// App Package Manager — install, manage, and discover apps from registries.
// Registered as command('ui.pkg-manager').
// Boot loading of installed apps is handled by /opt/pkg/loader.js.

const platform = window.platform;
const fs = platform.host.getFS();
const React = platform.getService('React');
const { createRoot } = platform.getService('ReactDOM');
const { useState, useEffect, useCallback, useRef } = React;

// ── Constants ────────────────────────────────────────────────────────────────

const INSTALLED_PATH = '/etc/pkg/installed.json';
const REGISTRIES_PATH = '/etc/pkg/registries.json';
const PKG_DIRS = ['/etc/pkg', '/opt/apps'];

// Detect the deployment origin to build the built-in registry URL.
// window.top is the real top-level window (the shim exposes it directly).
const BUILTIN_REGISTRY_URL = (() => {
  try { return window.top.location.origin + '/registry.json'; } catch(_) { return '/registry.json'; }
})();

// Resolve a file src relative to a registry URL (handles paths starting with /).
const resolveFileUrl = (src, registryUrl) => {
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  try { return new URL(src, registryUrl).href; } catch(_) { return src; }
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const pick = (obj, keys) => keys.reduce((acc, k) => { acc[k] = obj[k]; return acc; }, {});

// BrowserFS recursive mkdir doesn't reliably create multi-level paths; do it manually.
const mkdirpSync = (dirPath) => {
  const parts = dirPath.split('/').filter(Boolean);
  let cur = '';
  for (const part of parts) {
    cur += '/' + part;
    try { fs.mkdirSync(cur); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
};

const ensureDirs = () => {
  for (const d of PKG_DIRS) {
    try { mkdirpSync(d); } catch (_) {}
  }
};

const readInstalled = () => {
  try { return JSON.parse(fs.readFileSync(INSTALLED_PATH, 'utf8') || '[]'); }
  catch (_) { return []; }
};

const writeInstalled = (list) => {
  ensureDirs();
  fs.writeFileSync(INSTALLED_PATH, JSON.stringify(list, null, 2));
};

const readRegistries = () => {
  try { return JSON.parse(fs.readFileSync(REGISTRIES_PATH, 'utf8') || '[]'); }
  catch (_) { return []; }
};

const writeRegistries = (list) => {
  ensureDirs();
  fs.writeFileSync(REGISTRIES_PATH, JSON.stringify(list, null, 2));
};

const deleteDirRecursive = (dir) => {
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = `${dir}/${entry}`;
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          deleteDirRecursive(fullPath);
        } else {
          fs.unlinkSync(fullPath);
        }
      } catch (_) {}
    }
    fs.rmdirSync(dir);
  } catch (_) {}
};

const fmtDate = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

// ── Install / Uninstall ──────────────────────────────────────────────────────

const installApp = async (appMeta, registryUrl) => {
  ensureDirs();
  const appDir = `/opt/apps/${appMeta.id}`;
  try { fs.mkdirSync(appDir, { recursive: true }); } catch (_) {}

  for (const file of (appMeta.files || [])) {
    const fileUrl = resolveFileUrl(file.src, registryUrl);
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`Failed to fetch ${fileUrl}: ${response.status}`);
    const data = await response.arrayBuffer();
    const destPath = `${appDir}/${file.dest}`;
    const parentDir = destPath.split('/').slice(0, -1).join('/');
    try { mkdirpSync(parentDir); } catch (_) {}
    fs.writeFileSync(destPath, Buffer.from(data));
  }

  const mainFile = `${appDir}/${appMeta.main}`;

  // Use registry-provided commandName as primary source; fall back to dynamic detection.
  // commands$ may be a Subject (no getValue) in some contexts — fall back gracefully.
  let commandName = appMeta.commandName || null;
  if (mainFile.endsWith('.js') || mainFile.endsWith('.run')) {
    let cmdsBefore = new Set();
    if (!commandName) {
      try { cmdsBefore = new Set((platform.host.commands$.getValue() || []).map(c => c.name)); } catch (_) {}
    }
    try {
      platform._appDir = appDir;
      platform.host.exec(platform, mainFile);
    } catch (e) {
      console.warn('[pkg-manager] failed to load after install:', appMeta.id, e);
    } finally {
      delete platform._appDir;
    }
    if (!commandName) {
      try {
        const newCmd = (platform.host.commands$.getValue() || []).find(c => !cmdsBefore.has(c.name) && c.meta?.title);
        commandName = newCmd?.name || null;
      } catch (_) {}
    }
  }

  const installed = readInstalled();
  const existing = installed.findIndex(p => p.id === appMeta.id);
  const record = {
    ...pick(appMeta, ['id', 'name', 'version', 'description', 'icon', 'category', 'author']),
    appDir,
    mainFile,
    commandName,
    registryUrl,
    installedAt: Date.now(),
  };
  if (existing >= 0) {
    installed[existing] = record;
  } else {
    installed.push(record);
  }
  writeInstalled(installed);
};

const uninstallApp = async (pkg) => {
  const preUninstall = `${pkg.appDir}/pre-uninstall.js`;
  try {
    if (fs.existsSync(preUninstall)) {
      platform.host.exec(platform, preUninstall);
    }
  } catch (e) { console.warn('[pkg-manager] pre-uninstall failed:', e); }

  deleteDirRecursive(pkg.appDir);

  const installed = readInstalled().filter(p => p.id !== pkg.id);
  writeInstalled(installed);
};

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
* { box-sizing: border-box; }

.pkg-root {
  display: flex;
  height: 100%;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13.5px;
  color: #1c1c1e;
  background: #fff;
  overflow: hidden;
}

/* Sidebar */
.pkg-sidebar {
  width: 180px;
  flex-shrink: 0;
  padding: 12px 8px;
  border-right: 1px solid #e0dbd4;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: #faf9f7;
}

.pkg-sidebar-label {
  font-size: 10px;
  font-weight: 600;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 6px 10px 4px;
  margin-top: 4px;
}

.pkg-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  color: #3a3a3c;
  font-size: 13px;
  font-weight: 500;
  user-select: none;
  transition: background 0.12s;
}
.pkg-nav-item:hover { background: #f0ede9; }
.pkg-nav-item.active { background: #c4a478; color: #fff; }
.pkg-nav-item .material-symbols-outlined { font-size: 18px; }

.pkg-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: rgba(0,0,0,0.12);
  border-radius: 9px;
  font-size: 10px;
  font-weight: 700;
  margin-left: auto;
}
.pkg-nav-item.active .pkg-badge { background: rgba(255,255,255,0.28); }

/* Main area */
.pkg-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pkg-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid #e0dbd4;
  flex-shrink: 0;
}

.pkg-title {
  font-size: 15px;
  font-weight: 600;
  color: #1c1c1e;
  flex: 1;
}

.pkg-search {
  flex: 1;
  max-width: 320px;
  padding: 6px 10px;
  border: 1px solid #e0dbd4;
  border-radius: 6px;
  font-size: 13px;
  color: #1c1c1e;
  background: #faf9f7;
  outline: none;
}
.pkg-search:focus { border-color: #c4a478; box-shadow: 0 0 0 2px rgba(196,164,120,0.18); }

.pkg-btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid #e0dbd4;
  background: #faf9f7;
  color: #1c1c1e;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s;
  white-space: nowrap;
}
.pkg-btn:hover { background: #f0ede9; }
.pkg-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pkg-btn.primary {
  background: #c4a478;
  border-color: #c4a478;
  color: #fff;
  font-weight: 500;
}
.pkg-btn.primary:hover { background: #b5945f; border-color: #b5945f; }
.pkg-btn.danger { background: #fff; border-color: #e0dbd4; color: #d63b3b; }
.pkg-btn.danger:hover { background: #fdf0f0; }

/* Scroll content area */
.pkg-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* App cards grid (Discover) */
.pkg-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.pkg-card {
  border: 1px solid #e0dbd4;
  border-radius: 8px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #fff;
  transition: box-shadow 0.15s;
}
.pkg-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.07); }

.pkg-card-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.pkg-card-icon {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  background: #f0ede9;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #7a6950;
}
.pkg-card-icon .material-symbols-outlined { font-size: 22px; }

.pkg-card-info { flex: 1; min-width: 0; }
.pkg-card-name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pkg-card-author { font-size: 11px; color: #888; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.pkg-card-desc {
  font-size: 12.5px;
  color: #555;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pkg-card-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.pkg-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  background: #f0ede9;
  color: #7a6950;
}

.pkg-version { font-size: 11px; color: #aaa; margin-left: 2px; }
.pkg-registry-badge {
  font-size: 10px; color: #8a7a6a; background: rgba(0,0,0,.05); padding: 1px 6px;
  border-radius: 4px; margin-left: 2px; cursor: default;
}

.pkg-installed-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  background: #e8f5e9;
  color: #388e3c;
  margin-left: auto;
}
.pkg-installed-badge .material-symbols-outlined { font-size: 14px; }

/* Installed list */
.pkg-list { display: flex; flex-direction: column; gap: 8px; }

.pkg-list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #e0dbd4;
  border-radius: 8px;
  background: #fff;
  transition: background 0.12s;
}
.pkg-list-row:hover { background: #faf9f7; }

.pkg-list-icon {
  width: 32px;
  height: 32px;
  border-radius: 7px;
  background: #f0ede9;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #7a6950;
}
.pkg-list-icon .material-symbols-outlined { font-size: 18px; }

.pkg-list-info { flex: 1; min-width: 0; }
.pkg-list-name { font-weight: 600; font-size: 13.5px; }
.pkg-list-meta { font-size: 11px; color: #888; margin-top: 2px; }

/* Registries */
.pkg-reg-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid #e0dbd4;
  border-radius: 6px;
  background: #fff;
  margin-bottom: 6px;
}
.pkg-reg-url {
  flex: 1;
  font-size: 12px;
  font-family: monospace;
  color: #444;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pkg-input {
  padding: 7px 10px;
  border: 1px solid #e0dbd4;
  border-radius: 6px;
  font-size: 13px;
  color: #1c1c1e;
  background: #faf9f7;
  outline: none;
  font-family: monospace;
  width: 100%;
}
.pkg-input:focus { border-color: #c4a478; box-shadow: 0 0 0 2px rgba(196,164,120,0.18); }

/* States */
.pkg-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 60px 20px;
  color: #aaa;
  text-align: center;
}
.pkg-empty .material-symbols-outlined { font-size: 48px; opacity: 0.4; }
.pkg-empty p { margin: 0; font-size: 13px; }

.pkg-error {
  background: #fff5f5;
  border: 1px solid #fcc;
  border-radius: 6px;
  padding: 10px 14px;
  color: #c0392b;
  font-size: 12.5px;
  margin-bottom: 12px;
}

.pkg-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #888;
  font-size: 13px;
  padding: 20px 0;
}

@keyframes pkg-spin { to { transform: rotate(360deg); } }
.pkg-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #e0dbd4;
  border-top-color: #c4a478;
  border-radius: 50%;
  animation: pkg-spin 0.7s linear infinite;
  flex-shrink: 0;
}

.pkg-note {
  font-size: 12px;
  color: #888;
  background: #faf9f7;
  border: 1px solid #e0dbd4;
  border-radius: 6px;
  padding: 10px 12px;
  line-height: 1.5;
  margin-top: 4px;
}

@font-face {
  font-family: 'Material Symbols Outlined';
  font-style: normal;
  font-weight: 100 700;
  src: url(https://fonts.gstatic.com/s/materialsymbolsoutlined/v138/kJEhBvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oFsLjBuVY.woff2) format('woff2');
}
.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-smoothing: antialiased;
}
`;

// ── Components ────────────────────────────────────────────────────────────────

const Spinner = () => <div className="pkg-spinner" />;

const Icon = ({ name, style }) => (
  <span className="material-symbols-outlined" style={style}>{name}</span>
);

// Discover view ───────────────────────────────────────────────────────────────

const DiscoverView = ({ registryApps, installed, loading, fetchError, onInstall, installingId }) => {
  const [search, setSearch] = useState('');

  const installedIds = new Set(installed.map(p => p.id));

  const visible = registryApps.filter(app => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (app.name || '').toLowerCase().includes(q) ||
      (app.description || '').toLowerCase().includes(q) ||
      (app.category || '').toLowerCase().includes(q) ||
      (app.author || '').toLowerCase().includes(q) ||
      (app.id || '').toLowerCase().includes(q)
    );
  });

  return (
    <>
      <div className="pkg-toolbar">
        <span className="pkg-title">Discover</span>
        <input
          className="pkg-search"
          placeholder="Search apps…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="pkg-scroll">
        {fetchError && <div className="pkg-error">{fetchError}</div>}
        {loading && (
          <div className="pkg-loading">
            <Spinner />
            <span>Fetching registries…</span>
          </div>
        )}
        {!loading && !fetchError && registryApps.length === 0 && (
          <div className="pkg-empty">
            <Icon name="package_2" />
            <p>No apps found. Add a registry in the Registries tab.</p>
          </div>
        )}
        {!loading && visible.length === 0 && registryApps.length > 0 && (
          <div className="pkg-empty">
            <Icon name="search_off" />
            <p>No apps match "{search}"</p>
          </div>
        )}
        {visible.length > 0 && (
          <div className="pkg-cards">
            {visible.map(app => {
              const isInstalled = installedIds.has(app.id);
              const isInstalling = installingId === app.id;
              return (
                <div className="pkg-card" key={`${app._registryUrl}::${app.id}`}>
                  <div className="pkg-card-header">
                    <div className="pkg-card-icon">
                      <Icon name={app.icon || 'apps'} />
                    </div>
                    <div className="pkg-card-info">
                      <div className="pkg-card-name">{app.name}</div>
                      <div className="pkg-card-author">{app.author || 'Unknown'}</div>
                    </div>
                  </div>
                  {app.description && (
                    <div className="pkg-card-desc">{app.description}</div>
                  )}
                  <div className="pkg-card-footer">
                    {app.category && <span className="pkg-tag">{app.category}</span>}
                    <span className="pkg-version">v{app.version}</span>
                    <div style={{ flex: 1 }} />
                    {isInstalled ? (
                      <span className="pkg-installed-badge">
                        <Icon name="check_circle" />
                        Installed
                      </span>
                    ) : (
                      <button
                        className="pkg-btn primary"
                        disabled={isInstalling}
                        onClick={() => onInstall(app, app._registryUrl)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                      >
                        {isInstalling ? <><Spinner /> Installing…</> : 'Install'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

// Installed view ──────────────────────────────────────────────────────────────

const InstalledView = ({ installed, onUninstall, uninstallingId }) => {
  const [confirmId, setConfirmId] = useState(null);

  const handleOpen = (pkg) => {
    try {
      if (pkg.commandName) {
        platform.host.execCommand(
          `service('001-core.layout','open-window')(command('${pkg.commandName}'))`,
          platform
        );
      } else {
        // HTML apps or apps without a registered command: exec the main file directly
        platform.host.exec(platform, pkg.mainFile);
      }
    } catch (e) {
      console.warn('[pkg-manager] open failed:', pkg.id, e);
    }
  };

  const handleUninstall = (pkg) => {
    if (confirmId === pkg.id) {
      setConfirmId(null);
      onUninstall(pkg);
    } else {
      setConfirmId(pkg.id);
    }
  };

  return (
    <>
      <div className="pkg-toolbar">
        <span className="pkg-title">Installed</span>
        <span style={{ fontSize: 12, color: '#888' }}>{installed.length} app{installed.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="pkg-scroll">
        {installed.length === 0 ? (
          <div className="pkg-empty">
            <Icon name="inbox" />
            <p>No apps installed.</p>
            <p style={{ opacity: 0.7 }}>Browse the Discover tab to find apps.</p>
          </div>
        ) : (
          <div className="pkg-list">
            {installed.map(pkg => {
              const isUninstalling = uninstallingId === pkg.id;
              const isConfirming = confirmId === pkg.id;
              return (
                <div className="pkg-list-row" key={pkg.id}>
                  <div className="pkg-list-icon">
                    <Icon name={pkg.icon || 'apps'} />
                  </div>
                  <div className="pkg-list-info">
                    <div className="pkg-list-name">{pkg.name}</div>
                    <div className="pkg-list-meta">
                      v{pkg.version}
                      {pkg.category && <> · {pkg.category}</>}
                      {pkg.author && <> · {pkg.author}</>}
                      {pkg.installedAt && <> · Installed {fmtDate(pkg.installedAt)}</>}
                    </div>
                  </div>
                  {isConfirming ? (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 12, color: '#d63b3b', alignSelf: 'center' }}>Remove?</span>
                      <button
                        className="pkg-btn danger"
                        disabled={isUninstalling}
                        onClick={() => handleUninstall(pkg)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                      >
                        {isUninstalling ? <><Spinner /> Removing…</> : 'Confirm'}
                      </button>
                      <button className="pkg-btn" onClick={() => setConfirmId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        className="pkg-btn"
                        onClick={() => handleOpen(pkg)}
                      >
                        Open
                      </button>
                      <button
                        className="pkg-btn danger"
                        disabled={isUninstalling}
                        onClick={() => handleUninstall(pkg)}
                      >
                        Uninstall
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

// Registries view ─────────────────────────────────────────────────────────────

const RegistriesView = ({ registries, onAdd, onRemove, onRefresh, loading }) => {
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef(null);

  const handleAdd = () => {
    const url = inputVal.trim();
    if (!url) return;
    onAdd(url);
    setInputVal('');
  };

  return (
    <>
      <div className="pkg-toolbar">
        <span className="pkg-title">Registries</span>
        <button
          className="pkg-btn"
          onClick={onRefresh}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 5 }}
        >
          {loading ? <><Spinner /> Fetching…</> : <><Icon name="refresh" style={{ fontSize: 15 }} />Refresh</>}
        </button>
      </div>
      <div className="pkg-scroll">
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Add Registry</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              className="pkg-input"
              placeholder="https://example.com/registry.json"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
            <button className="pkg-btn primary" onClick={handleAdd} disabled={!inputVal.trim()}>
              Add
            </button>
          </div>
        </div>

        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
          Built-in Registry
        </div>
        <div className="pkg-reg-row" style={{ background: '#fafaf8', borderRadius: 6 }}>
          <Icon name="verified" style={{ fontSize: 16, color: '#c4a478', flexShrink: 0 }} />
          <span className="pkg-reg-url" title={BUILTIN_REGISTRY_URL}>{BUILTIN_REGISTRY_URL}</span>
          <span style={{ fontSize: 11, color: '#bbb', flexShrink: 0 }}>built-in</span>
        </div>

        <div style={{ fontWeight: 600, fontSize: 13, margin: '16px 0 8px' }}>
          Additional Registries
          <span style={{ fontWeight: 400, color: '#888', marginLeft: 6 }}>({registries.length})</span>
        </div>

        {registries.length === 0 ? (
          <div style={{ fontSize: 12, color: '#bbb', padding: '8px 0' }}>No additional registries. Add one above.</div>
        ) : (
          registries.map((url, i) => (
            <div className="pkg-reg-row" key={i}>
              <Icon name="public" style={{ fontSize: 16, color: '#aaa', flexShrink: 0 }} />
              <span className="pkg-reg-url" title={url}>{url}</span>
              <button
                className="pkg-btn danger"
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => onRemove(url)}
              >
                Remove
              </button>
            </div>
          ))
        )}

        <div className="pkg-note" style={{ marginTop: 16 }}>
          Registries must return JSON with <code>name</code>, <code>version</code>, and <code>apps</code> array.
          Each app needs: <code>id</code>, <code>name</code>, <code>version</code>, <code>files</code> (<code>[{'{dest, src}'}]</code>), and <code>main</code>.
          File <code>src</code> can be absolute URLs or paths starting with <code>/</code> (resolved against registry origin).
        </div>
      </div>
    </>
  );
};

// ── Main App ──────────────────────────────────────────────────────────────────

const App = () => {
  const [activeTab, setActiveTab] = useState('discover');
  const [registryApps, setRegistryApps] = useState([]);
  const [installed, setInstalled] = useState(() => readInstalled());
  const [registries, setRegistries] = useState(() => readRegistries());
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [installingId, setInstallingId] = useState(null);
  const [uninstallingId, setUninstallingId] = useState(null);
  const [installError, setInstallError] = useState('');

  const fetchRegistries = useCallback(async (regs) => {
    const userRegs = regs !== undefined ? regs : registries;
    // Always include the built-in registry; dedupe by URL
    const seen = new Set();
    const list = [BUILTIN_REGISTRY_URL, ...userRegs].filter(u => { if (seen.has(u)) return false; seen.add(u); return true; });
    setLoading(true);
    setFetchError('');
    const apps = [];
    const errors = [];
    await Promise.all(list.map(async (url) => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        for (const app of (data.apps || [])) {
          apps.push({ ...app, _registryUrl: url });
        }
      } catch (e) {
        errors.push(`${url}: ${e.message}`);
      }
    }));
    if (errors.length && apps.length === 0) {
      setFetchError(`Failed to fetch ${errors.length} registry(s): ${errors.join('; ')}`);
    }
    setRegistryApps(apps);
    setLoading(false);
  }, [registries]);

  useEffect(() => {
    if (activeTab === 'discover' && registryApps.length === 0) {
      fetchRegistries(registries);
    }
  }, [activeTab]);

  const handleInstall = async (appMeta, registryUrl) => {
    setInstallingId(appMeta.id);
    setInstallError('');
    try {
      await installApp(appMeta, registryUrl);
      setInstalled(readInstalled());
    } catch (e) {
      setInstallError(`Install failed for "${appMeta.name}": ${e.message}`);
    } finally {
      setInstallingId(null);
    }
  };

  const handleUninstall = async (pkg) => {
    setUninstallingId(pkg.id);
    try {
      await uninstallApp(pkg);
      setInstalled(readInstalled());
    } catch (e) {
      console.warn('[pkg-manager] uninstall error:', e);
    } finally {
      setUninstallingId(null);
    }
  };

  const handleAddRegistry = (url) => {
    if (registries.includes(url)) return;
    const updated = [...registries, url];
    setRegistries(updated);
    writeRegistries(updated);
  };

  const handleRemoveRegistry = (url) => {
    const updated = registries.filter(r => r !== url);
    setRegistries(updated);
    writeRegistries(updated);
    // Remove apps from that registry from the in-memory list
    setRegistryApps(prev => prev.filter(a => a._registryUrl !== url));
  };

  const handleRefresh = () => fetchRegistries(registries);

  const navItems = [
    { id: 'discover', label: 'Discover', icon: 'explore' },
    { id: 'installed', label: 'Installed', icon: 'deployed_code', badge: installed.length || null },
    { id: 'registries', label: 'Registries', icon: 'dns', badge: registries.length || null },
  ];

  return (
    <div className="pkg-root">
      <nav className="pkg-sidebar">
        <div className="pkg-sidebar-label">App Manager</div>
        {navItems.map(item => (
          <div
            key={item.id}
            className={`pkg-nav-item${activeTab === item.id ? ' active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            <Icon name={item.icon} />
            {item.label}
            {item.badge != null && (
              <span className="pkg-badge">{item.badge}</span>
            )}
          </div>
        ))}
      </nav>
      <div className="pkg-main">
        {installError && (
          <div className="pkg-error" style={{ margin: '10px 16px 0', flexShrink: 0 }}>{installError}</div>
        )}
        {activeTab === 'discover' && (
          <DiscoverView
            registryApps={registryApps}
            installed={installed}
            loading={loading}
            fetchError={fetchError}
            onInstall={handleInstall}
            installingId={installingId}
          />
        )}
        {activeTab === 'installed' && (
          <InstalledView
            installed={installed}
            onUninstall={handleUninstall}
            uninstallingId={uninstallingId}
          />
        )}
        {activeTab === 'registries' && (
          <RegistriesView
            registries={registries}
            onAdd={handleAddRegistry}
            onRemove={handleRemoveRegistry}
            onRefresh={handleRefresh}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
};

// ── Window command ────────────────────────────────────────────────────────────

const run = (...args) => {
  const [body, props] = args;
  if (!body) {
    platform.host.execCommand("service('001-core.layout','open-window')(command('ui.pkg-manager'))", platform);
    return;
  }
  const container = platform.window.document.createElement('div');
  container.style.cssText = 'height:100%;display:flex;flex-direction:column;overflow:hidden;';
  const root = createRoot(container);
  body.appendChild(container);
  const win = body.ownerDocument.defaultView;
  const styles = new win.CSSStyleSheet();
  styles.replace(CSS);
  body.ownerDocument.adoptedStyleSheets = [...(body.ownerDocument.adoptedStyleSheets || []), styles];
  root.render(<App />);
  props.setHeaderStyles({ background: '#ffffff', color: '#555555', boxShadow: 'none', borderBottom: '1px solid #f0ede9' });
  props.setWindowView(true);
  props.onDestroy(() => setTimeout(() => root.unmount(), 0));
};

platform.host.registerCommand('ui.pkg-manager', run, {
  icon: 'package_2',
  title: 'App Manager',
  fullScreen: false,
  category: 'System',
});
