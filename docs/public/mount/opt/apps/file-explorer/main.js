const platform = window.platform;
const fs = platform.host.getFS();

const React = platform.getService("React");
const { createRoot } = platform.getService("ReactDOM");
const { DESKTOP_PATH, appendStyleSheet, getFileExtension, mountLocalDirectory } = platform.getService("utils");
const { DESKTOP_CONTAINER_CLASS, WINDOWS_CONTAINER_CLASS } = platform.getService("window-manager");

const MOUNT_PATH = '/mnt';

const NAV_SHORTCUTS = [
  { label: 'Home', path: DESKTOP_PATH, icon: 'home' },
  { label: 'Mounted', path: MOUNT_PATH, icon: 'drive_folder_upload' },
  { label: 'Root', path: '/', icon: 'dns' },
];

// Resolves `.`/`..`/`//` segments without delegating to fs.realpathSync, since
// MountableFileSystem's realpathSync returns paths relative to the mounted
// filesystem's own root (e.g. realpathSync('/tmp') => '/') instead of the
// global path.
const normalizePath = (path) => {
  const parts = path.split('/').filter((p) => p && p !== '.');
  const result = [];
  for (const part of parts) {
    if (part === '..') result.pop();
    else result.push(part);
  }
  return '/' + result.join('/');
};

// Splits a normalized path into breadcrumb segments, each carrying the
// absolute path it represents (Finder-style path bar).
const getBreadcrumbs = (path) => {
  const parts = path.split('/').filter(Boolean);
  const crumbs = [{ name: 'Root', path: '/' }];
  let acc = '';
  for (const part of parts) {
    acc += `/${part}`;
    crumbs.push({ name: part, path: acc });
  }
  return crumbs;
};

// Context-menu entries (audit KRN-3/WIN-2/APP-1, decisions.md D9): what an entry
// does is a function over values — the layout's ContextMenuItem `onSelect` —
// so no file name is ever turned into DSL source. Mirrored in
// src/apps/file-explorer/index.tsx; `children` makes an "Open with" group.
const toContextMenuItems = (entries) => entries.map((entry) =>
  entry.divider ? { id: entry.id, type: 'divider', title: '' }
    : entry.children ? { id: entry.id, type: 'group', title: entry.title, children: toContextMenuItems(entry.children) }
      : { id: entry.id, type: 'action', title: entry.title, onSelect: entry.run });

// "Run" for scripts (decisions.md D10): opening a .js/.run file only views it;
// running it is this explicit action. host.runFile asks for confirmation naming
// the file when it lives outside the system folders (/bin, /usr/bin, /opt/apps).
// A .run script gets its folder as `$args[0]`, like a command run from a shell.
const SCRIPT_EXTS = new Set(['js', 'run']);
const runScript = (path) => {
  const report = (e) => platform.host.callCommand('notify', { title: 'Run failed', body: `${path.split('/').pop()}: ${(e && e.message) || e}`, duration: 4000 });
  try {
    const result = platform.host.runFile(platform, path, [path.split('/').slice(0, -1).join('/') || '/']);
    if (result && typeof result.catch === 'function') result.catch(report);
    return result;
  } catch (e) { report(e); }
};

// ── ZIP support via fflate v0.8.2 ─────────────────────────────────────────
// fflate source: https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js
let _fflate = null;
const loadFflate = () => {
  if (_fflate) return _fflate;
  try {
    const code = fs.readFileSync('/usr/lib/fflate.min.js', 'utf8');
    const mod = { exports: {} };
    new Function('module', 'exports', code)(mod, mod.exports);
    _fflate = mod.exports;
  } catch (e) {
    throw new Error('fflate not available: ' + e.message);
  }
  return _fflate;
};

// Where an archive entry may be written (audit BOOT-8/APP-3, decisions.md D6):
// pathPolicy.safeJoin keeps it inside destDir — it refuses absolute names, '..',
// backslashes and control characters — and an entry may not land on a
// kernel-owned path (/etc, /bin, /opt, /.initd.run, ~/initd.run, …) unless the
// user is extracting inside one already. Throws otherwise.
const archiveEntryPath = (destDir, name) => {
  const { safeJoin, isKernelOwned, PathPolicyError } = platform.host.pathPolicy;
  const target = safeJoin(destDir, name);
  if (isKernelOwned(target) && !isKernelOwned(destDir)) throw new PathPolicyError(`protected path: ${target}`);
  return target;
};

// Returns { count, skipped }: entries that would escape destDir are not written.
const extractZip = (zipPath, destDir) => {
  const fflate = loadFflate();
  const data = fs.readFileSync(zipPath);
  const uint8 = new Uint8Array(data.buffer ?? data);
  const entries = fflate.unzipSync(uint8);
  let count = 0;
  const skipped = [];
  for (const [name, content] of Object.entries(entries)) {
    if (name.endsWith('/')) continue;
    let fullPath;
    try { fullPath = archiveEntryPath(destDir, name); }
    catch (_) { skipped.push(name); continue; }
    const parentDir = fullPath.split('/').slice(0, -1).join('/');
    try { fs.mkdirSync(parentDir, { recursive: true }); } catch (_) {}
    fs.writeFileSync(fullPath, Buffer.from(content));
    count++;
  }
  return { count, skipped };
};

// Notification for an extraction, naming (quoted, shortened) any refused entries.
const extractNotice = ({ count, skipped }) => {
  const body = `${count} file${count !== 1 ? 's' : ''} extracted`;
  if (!skipped.length) return { title: 'Extracted', body, duration: 3000 };
  const names = skipped.slice(0, 5).map((n) => JSON.stringify(n.length > 80 ? n.slice(0, 77) + '…' : n)).join(', ');
  return {
    title: 'Extracted — unsafe entries skipped',
    body: `${body}. Skipped ${skipped.length} entr${skipped.length !== 1 ? 'ies' : 'y'} that would land outside the folder or on a system path: ${names}${skipped.length > 5 ? ', …' : ''}`,
    duration: 10000,
  };
};

const addToZip = (zipFiles, vfsPath, zipEntryName) => {
  try {
    const stat = fs.statSync(vfsPath);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(vfsPath);
      if (entries.length === 0) {
        zipFiles[zipEntryName + '/'] = [new Uint8Array(0), { level: 0 }];
      }
      for (const e of entries) addToZip(zipFiles, `${vfsPath}/${e}`, `${zipEntryName}/${e}`);
    } else {
      const data = fs.readFileSync(vfsPath);
      zipFiles[zipEntryName] = [new Uint8Array(data.buffer ?? data), { level: 6 }];
    }
  } catch (_) {}
};

const compressToZip = (vfsPath, outputPath) => {
  const fflate = loadFflate();
  const zipFiles = {};
  const baseName = vfsPath.split('/').pop();
  addToZip(zipFiles, vfsPath, baseName);
  const zipped = fflate.zipSync(zipFiles);
  fs.writeFileSync(outputPath, Buffer.from(zipped));
};
const copyEntry = (src, dest) => {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(name => copyEntry(`${src}/${name}`, `${dest}/${name}`));
  } else {
    fs.writeFileSync(dest, fs.readFileSync(src));
  }
};

// Downloads a vfs file to the user's device: read raw bytes (works for both
// text and binary), wrap in a Blob, and trigger a real browser download via a
// temporary <a download> click. 100% local - no vfs network operations.
const downloadFile = (path) => {
  try {
    const data = fs.readFileSync(path);
    const name = path.split('/').filter(Boolean).pop() || 'download';
    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    platform.host.callCommand('notify', { title: 'Download failed', body: e.message || String(e), duration: 4000 });
  }
};

// Human-readable file size, e.g. "3.4 KB".
const fmtBytes = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
};
// ──────────────────────────────────────────────────────────────────────────

// Settings > Apps > Default File Explorer. The 'explorer' command belongs to
// this file — the command registry refuses a different owner (audit KRN-10) —
// so the alternative explorer can't take the name over; instead this command
// hands the call to it. Only first-party explorers qualify, never whatever
// command a (writable) preferences file names.
const ALT_EXPLORERS = new Set(['explorer-sifi']);
const preferredExplorer = () => {
  try {
    const name = JSON.parse(fs.readFileSync('/user-preferences.json', 'utf8') || '{}').default_explorer;
    return ALT_EXPLORERS.has(name) ? platform.host.getCommand(name) || null : null;
  } catch (_) { return null; }
};

const run = (...args) => {
  const alt = preferredExplorer();
  if (alt) return alt.exec(...args);

  const [body, props, dir = DESKTOP_PATH] = args;

  // Called with no args (e.g. from a keybinding or Spotlight) — route through
  // open-window so the window manager provides body/props correctly.
  if (!body) {
    platform.host.openWindow('explorer');
    return
  }

  const container = platform.window.document.createElement("div");
  const root = createRoot(container);
  body.appendChild(container);

  const win = body.ownerDocument.defaultView;

  const styles = new win.CSSStyleSheet();
  styles.replace(`
        html, body {
            margin: 0;
            padding:0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
            height: 100svh;
            background: #fff;
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
            font-size: 20px;
            line-height: 1;
            letter-spacing: normal;
            text-transform: none;
            display: inline-block;
            white-space: nowrap;
            word-wrap: normal;
            direction: ltr;
            -webkit-font-feature-settings: 'liga';
            -webkit-font-smoothing: antialiased;
        }

        * {
            box-sizing: border-box;
        }

        .file-explorer {
            color: #1d1d1f;
            background: #fff;
        }

        .file-explorer > header {
            background: linear-gradient(#f7f7f7, #ececec);
            color: #333;
            padding: .5rem .75rem;
            display: flex;
            align-items: center;
            gap: .75rem;
            border-bottom: 1px solid #d4d4d4;
        }

        .toolbar-nav-buttons {
            display: flex;
            align-items: center;
            gap: .15rem;
            flex-shrink: 0;
        }

        .toolbar-nav-buttons .material-symbols-outlined {
            padding: .25rem;
            border-radius: 6px;
            cursor: pointer;
            color: #555;
        }

        .toolbar-nav-buttons .material-symbols-outlined.disabled {
            color: #ccc;
            cursor: default;
        }

        .toolbar-nav-buttons .material-symbols-outlined:not(.disabled):hover {
            background: rgba(0, 0, 0, 0.08);
        }

        .breadcrumbs {
            flex-grow: 1;
            display: flex;
            align-items: center;
            gap: .15rem;
            overflow: hidden;
            white-space: nowrap;
            font-size: 13px;
            color: #555;
            min-width: 0;
        }

        .breadcrumbs > span.crumb {
            padding: .2rem .5rem;
            border-radius: 5px;
            cursor: pointer;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .breadcrumbs > span.crumb:hover {
            background: rgba(0, 0, 0, 0.06);
        }

        .breadcrumbs > span.crumb.current {
            font-weight: 600;
            color: #1d1d1f;
        }

        .breadcrumbs > span.sep {
            color: #aaa;
            font-size: 11px;
            flex-shrink: 0;
        }

        .toolbar-actions {
            display: flex;
            align-items: center;
            gap: .15rem;
            flex-shrink: 0;
        }

        .toolbar-actions .material-symbols-outlined {
            cursor: pointer;
            padding: .25rem;
            border-radius: 6px;
            color: #555;
        }

        .toolbar-actions .material-symbols-outlined:hover {
            background: rgba(0, 0, 0, 0.08);
        }

        .toolbar-actions .material-symbols-outlined.active {
            background: rgba(10, 132, 255, 0.16);
            color: #0a84ff;
        }

        .toolbar-actions .material-symbols-outlined.disabled {
            color: #ccc;
            cursor: default;
        }

        .toolbar-actions .material-symbols-outlined.disabled:hover {
            background: none;
        }

        .file-explorer-body {
            display: flex;
            flex-grow: 1;
            min-height: 0;
        }

        .file-explorer-details {
            flex: 0 0 14rem;
            background: #f6f6f6;
            border-left: 1px solid #e2e2e2;
            overflow: auto;
            padding: .85rem .9rem;
            font-size: 12px;
            color: #333;
        }

        .file-explorer-details h4 {
            margin: 0 0 .85rem;
            font-size: 11px;
            font-weight: 600;
            color: #9a9a9e;
            text-transform: uppercase;
            letter-spacing: .04em;
        }

        .file-explorer-details .details-empty {
            color: #9a9a9e;
            font-size: 12px;
            padding-top: 1rem;
            text-align: center;
        }

        .file-explorer-details .details-thumb {
            width: 100%;
            height: 8rem;
            border-radius: 8px;
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
            background-color: #fff;
            border: 1px solid #e2e2e2;
            margin-bottom: .85rem;
        }

        .file-explorer-details .details-name {
            font-weight: 600;
            font-size: 13px;
            word-break: break-all;
            margin-bottom: .85rem;
        }

        .file-explorer-details .details-row {
            display: flex;
            flex-direction: column;
            gap: 2px;
            margin-bottom: .65rem;
        }

        .file-explorer-details .details-row .details-label {
            color: #9a9a9e;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: .03em;
        }

        .file-explorer-details .details-row .details-value {
            word-break: break-all;
            font-size: 12px;
        }

        .file-explorer-details .details-multi-list {
            max-height: 12rem;
            overflow-y: auto;
            border-top: 1px solid #e2e2e2;
            padding-top: .5rem;
            display: flex;
            flex-direction: column;
            gap: .3rem;
        }

        .file-explorer-details .details-multi-item {
            font-size: 12px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .file-explorer-nav {
            flex: 0 0 11rem;
            background: #f6f6f6;
            border-right: 1px solid #e2e2e2;
            overflow: auto;
            padding: .6rem .5rem;
        }

        .file-explorer-nav .nav-section-title {
            font-size: 11px;
            font-weight: 600;
            color: #9a9a9e;
            text-transform: uppercase;
            letter-spacing: .04em;
            padding: .4rem .5rem .3rem;
        }

        .file-explorer-nav > div {
            display: flex;
            align-items: center;
            gap: .55rem;
            padding: .35rem .5rem;
            border-radius: 6px;
            cursor: pointer;
            white-space: nowrap;
            font-size: 13px;
            color: #333;
        }

        .file-explorer-nav > div .material-symbols-outlined {
            font-size: 18px;
            color: #6aa9f4;
        }

        .file-explorer-nav > div:hover {
            background: rgba(0, 0, 0, 0.05);
        }

        .file-explorer-nav > div.active {
            background: #cfe6ff;
            color: #0b5fcc;
            font-weight: 500;
        }

        .file-explorer-nav > div.active .material-symbols-outlined {
            color: #1f7bf0;
        }

        .dir-list {
            flex-grow: 1;
            overflow: auto;
            background: #ffffff;
            display: flex;
            flex-direction: column;
        }

        .dir-list-files {
            flex-grow: 1;
        }

        .file-explorer-status {
            flex-shrink: 0;
            margin-top: auto;
            border-top: 1px solid #e2e2e2;
            background: #f6f6f6;
            color: #8a8a8e;
            font-size: 11px;
            padding: .25rem .75rem;
        }

    `);

  body.ownerDocument.adoptedStyleSheets.push(styles);

  root.render(<App {...props} dir={dir} />);

  const move = (diff) => {
    return () => {
      const rect = props.getBoundingClientRect();
      const dir = { left: 0, right: 0, top: 0, bottom: 0, ...diff };
      const newPosition = {
        ...rect,
        left: rect.left + dir.left,
        right: rect.right + dir.right,
        top: rect.top + dir.top,
        bottom: rect.bottom + dir.bottom,
      };
      props.setBoundingClientRect(newPosition);
    };
  };

  move({ right: 100, left: 100, top: 100, bottom: 100 })();
  props.setWindowView(true);
};

// Recursively searches for files/dirs whose name contains `query` (case-insensitive).
const searchVfs = (fs, dir, query, results = [], depth = 0) => {
  if (depth > 6) return results;
  try {
    for (const name of fs.readdirSync(dir)) {
      const path = normalizePath(`${dir}/${name}`);
      if (name.toLowerCase().includes(query)) {
        try { results.push({ name, path, isDir: fs.statSync(path).isDirectory() }); } catch (_) {}
      }
      try { if (fs.statSync(path).isDirectory()) searchVfs(fs, path, query, results, depth + 1); } catch (_) {}
    }
  } catch (_) {}
  return results;
};

// Right-side details panel for the currently selected file/folder. Image
// thumbnails use the same blob-URL treatment as the grid thumbnails above
// (the explorer renders inside an `about:blank` iframe, so `/(sw)/...`
// sub-resource URLs don't reach the SW).
const DETAILS_PREVIEW_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif']);
const DETAILS_PREVIEW_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.avif': 'image/avif',
};

const DetailsPanel = ({ paths }) => {
  const fs = platform.host.getFS();
  const [thumbUrl, setThumbUrl] = React.useState(null);

  const path = paths.length === 1 ? paths[0] : null;

  let info = null;
  if (path) {
    try {
      const stat = fs.statSync(path);
      const name = path.split('/').filter(Boolean).pop() || path;
      info = { stat, name, ext: getFileExtension(name), isDir: stat.isDirectory() };
    } catch (_) { info = null; }
  }

  const isPreviewable = !!(info && !info.isDir && DETAILS_PREVIEW_EXTS.has(info.ext));

  React.useEffect(() => {
    if (!isPreviewable) { setThumbUrl(null); return; }
    let url = null;
    try {
      const data = fs.readFileSync(path);
      const blob = new Blob([data], { type: DETAILS_PREVIEW_MIME[info.ext] || 'application/octet-stream' });
      url = URL.createObjectURL(blob);
      setThumbUrl(url);
    } catch (_) { setThumbUrl(null); }
    return () => { if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line
  }, [path, isPreviewable]);

  if (paths.length === 0) {
    return (
      <aside className="file-explorer-details">
        <h4>Details</h4>
        <div className="details-empty">Select a file or folder to see details</div>
      </aside>
    );
  }

  // Multi-selection summary: total count, combined size of files (folders'
  // contents are not recursed into), and a scrollable list of names.
  if (paths.length > 1) {
    let totalSize = 0;
    const items = paths.map((p) => {
      const name = p.split('/').filter(Boolean).pop() || p;
      let isDir = false;
      try {
        const stat = fs.statSync(p);
        isDir = stat.isDirectory();
        if (!isDir) totalSize += stat.size || 0;
      } catch (_) {}
      return { path: p, name, isDir };
    });
    return (
      <aside className="file-explorer-details">
        <h4>Details</h4>
        <div className="details-row">
          <span className="details-label">Selected</span>
          <span className="details-value">{paths.length} items</span>
        </div>
        <div className="details-row">
          <span className="details-label">Combined size</span>
          <span className="details-value">{fmtBytes(totalSize)}</span>
        </div>
        <div className="details-row">
          <span className="details-label">Names</span>
        </div>
        <div className="details-multi-list">
          {items.map((it) => (
            <div key={it.path} className="details-multi-item">
              <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4, color: '#6aa9f4' }}>
                {it.isDir ? 'folder' : 'insert_drive_file'}
              </span>
              {it.name}
            </div>
          ))}
        </div>
      </aside>
    );
  }

  if (!info) {
    return (
      <aside className="file-explorer-details">
        <h4>Details</h4>
        <div className="details-empty">Select a file or folder to see details</div>
      </aside>
    );
  }

  const { stat, name, ext, isDir } = info;
  let childCount = null;
  if (isDir) { try { childCount = fs.readdirSync(path).length; } catch (_) {} }

  return (
    <aside className="file-explorer-details">
      <h4>Details</h4>
      {thumbUrl && <div className="details-thumb" style={{ backgroundImage: `url('${thumbUrl}')` }} />}
      <div className="details-name">{name}</div>
      <div className="details-row">
        <span className="details-label">Path</span>
        <span className="details-value">{path}</span>
      </div>
      <div className="details-row">
        <span className="details-label">Type</span>
        <span className="details-value">{isDir ? 'Folder' : (ext ? `${ext.slice(1).toUpperCase()} file` : 'File')}</span>
      </div>
      {isDir ? (
        <div className="details-row">
          <span className="details-label">Items</span>
          <span className="details-value">{childCount === null ? '—' : `${childCount} item${childCount !== 1 ? 's' : ''}`}</span>
        </div>
      ) : (
        <div className="details-row">
          <span className="details-label">Size</span>
          <span className="details-value">{fmtBytes(stat.size || 0)}</span>
        </div>
      )}
      <div className="details-row">
        <span className="details-label">Modified</span>
        <span className="details-value">{stat.mtime ? new Date(stat.mtime).toLocaleString() : '—'}</span>
      </div>
    </aside>
  );
};

const App = (props) => {
  const fs = platform.host.getFS();
  const dirRef = React.useRef(props.dir || "/");

  // Finder-style back/forward navigation history.
  const historyRef = React.useRef([dirRef.current]);
  const historyIndexRef = React.useRef(0);

  const [dirList, setDirList] = React.useState(
    fs.readdirSync(dirRef.current || "/")
  );
  const [, forceUpdate] = React.useState(0);
  const [searchActive, setSearchActive] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState([]);
  const [propsFile, setPropsFile] = React.useState(null);
  const setPropsFileRef = React.useRef(setPropsFile);
  setPropsFileRef.current = setPropsFile;

  // Currently selected files/folders (lifted up from ListDirConponent so the
  // details panel can show it live) - a plain array, order not significant
  // for correctness (only for range-select anchoring, tracked separately in
  // ListDirConponent) - and whether the details panel is open.
  const [selectedPaths, setSelectedPaths] = React.useState([]);
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  // Root element ref so Escape-to-clear-selection can be scoped to this
  // window/iframe's own document (each explorer window is its own iframe,
  // so a keydown listener on its ownerDocument only fires while that
  // specific window/iframe has focus).
  const rootRef = React.useRef(null);

  const cmdPrefix = React.useRef(`__e${Date.now().toString(36)}`);

  const refresh = () => {
    setDirList(fs.readdirSync(dirRef.current));
    forceUpdate((n) => n + 1);
  };
  const refreshRef = React.useRef(refresh);
  refreshRef.current = refresh;

  // Backends that fill in asynchronously (e.g. Remote Machines' /mnt/ssh/<machine> mirror) announce
  // changes with a 'vfs:changed' event on the top window ({ detail: { path } }); re-read the shown
  // folder when the change is in it, is it, or is its parent. Mirrored in src/apps/file-explorer/index.tsx.
  React.useEffect(() => {
    const top = window.top;
    if (!top) return;
    const onChanged = (e) => {
      const p = e && e.detail && e.detail.path;
      const dir = dirRef.current;
      if (typeof p !== 'string' || !dir) return;
      if (p === dir || p.startsWith(dir === '/' ? '/' : dir + '/') || dir.startsWith(p === '/' ? '/' : p + '/')) {
        try { refreshRef.current(); } catch (_) { /* the folder went away; the next navigation shows it */ }
      }
    };
    top.addEventListener('vfs:changed', onChanged);
    return () => top.removeEventListener('vfs:changed', onChanged);
  }, []);

  React.useEffect(() => {
    const k = cmdPrefix.current;
    const regs = [
      platform.host.registerCommand(`${k}.zip-extract`, (zipPath) => {
        try {
          const destDir = zipPath.split('/').slice(0, -1).join('/') || '/';
          platform.host.callCommand('notify', extractNotice(extractZip(zipPath, destDir)));
          refreshRef.current();
        } catch (e) {
          platform.host.callCommand('notify', { title: 'Extract failed', body: e.message || String(e), duration: 4000 });
        }
      }),
      platform.host.registerCommand(`${k}.zip-compress`, (vfsPath) => {
        try {
          const dir = vfsPath.split('/').slice(0, -1).join('/');
          const name = vfsPath.split('/').pop();
          const outPath = `${dir}/${name}.zip`;
          compressToZip(vfsPath, outPath);
          platform.host.callCommand('notify', { title: 'Compressed', body: `Created ${name}.zip`, duration: 3000 });
          refreshRef.current();
        } catch (e) {
          platform.host.callCommand('notify', { title: 'Compress failed', body: e.message || String(e), duration: 4000 });
        }
      }),
      platform.host.registerCommand(`${k}.rename`, (path) => {
        const oldName = path.split('/').pop();
        const dir     = path.split('/').slice(0, -1).join('/') || '/';
        const newName = prompt('New name:', oldName);
        if (!newName || newName.trim() === oldName) return;
        const trimmed = newName.trim();
        if (/[/\\]/.test(trimmed)) { alert('Name cannot contain "/" or "\\".'); return; }
        const newPath = normalizePath(`${dir}/${trimmed}`);
        if (fs.existsSync(newPath)) {
          if (!confirm(`"${trimmed}" already exists. Overwrite?`)) return;
        }
        try { fs.renameSync(path, newPath); refreshRef.current(); }
        catch (e) { alert(`Rename failed: ${e.message}`); }
      }),
      platform.host.registerCommand(`${k}.show-properties`, (path) => { setPropsFileRef.current(path); }),
      platform.host.registerCommand(`${k}.download-file`, (path) => downloadFile(path)),
      platform.host.registerCommand(`${k}.download-files`, (paths) => {
        const list = Array.isArray(paths) ? paths : [paths];
        let skipped = 0;
        list.forEach((p) => {
          try {
            if (fs.statSync(p).isDirectory()) { skipped++; return; }
            downloadFile(p);
          } catch (_) { skipped++; }
        });
        if (skipped) {
          platform.host.callCommand('notify', {
            title: 'Some items skipped',
            body: `${skipped} folder${skipped !== 1 ? 's' : ''} skipped (folders can't be downloaded individually)`,
            duration: 4000,
          });
        }
      }),
      platform.host.registerCommand(`${k}.delete-files`, (paths) => {
        const list = Array.isArray(paths) ? paths : [paths];
        if (!list.length) return;
        if (!confirm(`Delete ${list.length} item${list.length !== 1 ? 's' : ''}?`)) return;
        const files_ = list.filter(p => { try { return !fs.statSync(p).isDirectory(); } catch (_) { return false; } });
        const dirs_ = list.filter(p => { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } });
        const fsService = platform.host.getService('root', 'fs');
        try {
          if (files_.length) fsService('rm', ...files_);
          if (dirs_.length) fsService('rmdir', ...dirs_);
        } catch (e) {
          platform.host.callCommand('notify', { title: 'Delete error', body: e.message || String(e), duration: 4000 });
        }
        setSelectedPaths([]);
        refreshRef.current();
      }),
      platform.host.registerCommand(`${k}.copy-file`, (path) => {
        window.top.__vfsClipboard = { op: 'copy', paths: [path] };
        platform.host.callCommand('notify', { title: 'Copied', body: path.split('/').pop(), duration: 2000 });
        refreshRef.current();
      }),
      platform.host.registerCommand(`${k}.cut-file`, (path) => {
        window.top.__vfsClipboard = { op: 'cut', paths: [path] };
        platform.host.callCommand('notify', { title: 'Ready to move', body: path.split('/').pop(), duration: 2000 });
        refreshRef.current();
      }),
      platform.host.registerCommand(`${k}.paste-files`, (destDir) => {
        const cb = window.top?.__vfsClipboard;
        if (!cb || !cb.paths.length) { platform.host.callCommand('notify', { title: 'Nothing to paste', body: '', duration: 2000 }); return; }
        let errors = 0;
        cb.paths.forEach(srcPath => {
          const destPath = normalizePath(`${destDir}/${srcPath.split('/').pop()}`);
          try { if (cb.op === 'cut') fs.renameSync(srcPath, destPath); else copyEntry(srcPath, destPath); }
          catch (e) { errors++; console.error('Paste failed:', srcPath, e); }
        });
        if (cb.op === 'cut') window.top.__vfsClipboard = null;
        platform.host.callCommand('notify', errors
          ? { title: 'Paste error', body: `${errors} item(s) failed`, duration: 4000 }
          : { title: 'Pasted', body: `${cb.paths.length} item${cb.paths.length !== 1 ? 's' : ''}`, duration: 2000 });
        refreshRef.current();
      }),
      platform.host.registerCommand(`${k}.make-dir`, (dir) => {
        const name = prompt('Folder name?'); if (!name || !name.trim()) return;
        try { fs.mkdirSync(normalizePath(`${dir}/${name.trim()}`)); refreshRef.current(); } catch (e) { alert(`Failed: ${e.message}`); }
      }),
      platform.host.registerCommand(`${k}.make-file`, (dir) => {
        const name = prompt('File name?'); if (!name || !name.trim()) return;
        try { fs.writeFileSync(normalizePath(`${dir}/${name.trim()}`), ''); refreshRef.current(); } catch (e) { alert(`Failed: ${e.message}`); }
      }),
    ];
    return () => regs.forEach(r => r.remove());
  }, []);

  // Escape clears the current selection while this explorer window/iframe
  // has focus - scoped to this window's own document via ownerDocument
  // (each explorer window is its own iframe with its own document, so a
  // keydown listener here only fires while that iframe is the focused frame).
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const doc = node.ownerDocument;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setSelectedPaths([]);
    };
    doc.addEventListener('keydown', onKeyDown);
    return () => doc.removeEventListener('keydown', onKeyDown);
  }, []);

  const onSearchChange = (q) => {
    setSearchQuery(q);
    if (q.trim()) setSearchResults(searchVfs(fs, dirRef.current, q.trim().toLowerCase()));
    else setSearchResults([]);
  };

  const activateSearch = () => { setSearchActive(true); setSearchQuery(''); setSearchResults([]); };
  const deactivateSearch = () => { setSearchActive(false); setSearchQuery(''); setSearchResults([]); };

  const openSearchResult = (result) => {
    deactivateSearch();
    if (result.isDir) goTo(result.path);
    else platform.host.exec(platform, result.path);
  };

  const goTo = (path, { pushHistory = true } = {}) => {
    const normalized = normalizePath(path);
    if (!fs.existsSync(normalized)) fs.mkdirSync(normalized, { recursive: true });
    dirRef.current = normalized;
    setSelectedPaths([]);

    if (pushHistory) {
      const history = historyRef.current.slice(0, historyIndexRef.current + 1);
      history.push(normalized);
      historyRef.current = history;
      historyIndexRef.current = history.length - 1;
    }

    refresh();
  };

  const IMAGE_EXTS = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg','.bmp','.ico','.avif']);
  const AUDIO_EXTS = new Set(['.mp3','.wav','.ogg','.flac','.m4a','.aac','.opus']);

  const open = (file) => {
    const selectedFilePath = normalizePath(
      dirRef.current.endsWith("/")
        ? `${dirRef.current}${file}`
        : `${dirRef.current}/${file}`
    );
    const stat = fs.statSync(selectedFilePath);

    if (stat.isDirectory()) {
      goTo(selectedFilePath);
    } else {
      const ext = getFileExtension(selectedFilePath);
      if (IMAGE_EXTS.has(ext)) {
        const cmd = platform.host.getCommand('ui.imageviewer');
        if (cmd) { cmd.exec(null, null, selectedFilePath); return; }
      }
      if (ext === 'csv') {
        const cmd = platform.host.getCommand('ui.csv-viewer');
        if (cmd) { cmd.exec(null, null, selectedFilePath); return; }
      }
      if (ext === 'py') {
        const cmd = platform.host.getCommand('ui.python');
        if (cmd) { cmd.exec(null, null, selectedFilePath); return; }
      }
      if (AUDIO_EXTS.has(ext)) {
        platform.host.openWindow('ui.audioplayer', selectedFilePath);
        return;
      }
      if (ext === 'zip') {
        if (confirm(`Extract "${selectedFilePath.split('/').pop()}" into current folder?`)) {
          try {
            platform.host.callCommand('notify', extractNotice(extractZip(selectedFilePath, dirRef.current)));
            refresh();
          } catch (e) {
            platform.host.callCommand('notify', { title: 'Extract failed', body: e.message || String(e), duration: 4000 });
          }
        }
        return;
      }
      platform.host.exec(platform, selectedFilePath);
    }
  };

  const navigateTo = (path) => goTo(path);

  const goBack = () => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    dirRef.current = historyRef.current[historyIndexRef.current];
    refresh();
  };

  const goForward = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    dirRef.current = historyRef.current[historyIndexRef.current];
    refresh();
  };

  const goUp = () => {
    if (dirRef.current === "/") return;
    const parent = normalizePath(dirRef.current.split("/").slice(0, -1).join("/")) || "/";
    goTo(parent);
  };

  const mountLocalFolderClick = async () => {
    if (!platform.window.showDirectoryPicker) {
      alert("Mounting a local folder is not supported in this browser.");
      return;
    }

    try {
      const dirHandle = await platform.window.showDirectoryPicker();
      const targetPath = `${MOUNT_PATH}/${dirHandle.name}`;
      await mountLocalDirectory(fs, dirHandle, targetPath);
      navigateTo(targetPath);
    } catch (error) {
      if (error?.name !== "AbortError") console.error(error);
    }
  };

  const makeDirClick = () => {
    const dirName = prompt("Dir name?");
    if (!dirName) return;
    const dirPath = dirRef.current.endsWith("/")
      ? `${dirRef.current}${dirName}`
      : `${dirRef.current}/${dirName}`;
    fs.mkdirSync(dirPath);
    refresh();
  };
  const makeFileClick = () => {
    const fileName = prompt("File name?");
    if (!fileName) return;
    const filePath = dirRef.current.endsWith("/")
      ? `${dirRef.current}${fileName}`
      : `${dirRef.current}/${fileName}`;
    fs.writeFileSync(filePath, "");
    refresh();
  };

  const openFile = (file) => {
    open(file.name);
  };
  const showFileActionsHandler = (file, event, selection) => {
    const openContextMenu = platform.host.getService(
      "001-core.layout",
      "show-context-menu"
    );
    if (!openContextMenu) return;
    const rect = props.getBoundingClientRect();
    const k = cmdPrefix.current;
    const call = (name, ...values) => () => platform.host.callCommand(`${k}.${name}`, ...values);
    const openIn = (commandName, ...values) => () => platform.host.openWindow(commandName, ...values);
    const fsService = (op, path) => () => platform.host.getService('root', 'fs')(op, path);

    // Batch actions for a multi-selection - shown instead of the single-item
    // action list below when the right-clicked item is part of a selection
    // of more than one item.
    if (Array.isArray(selection) && selection.length > 1) {
      const paths = [...selection];
      const hasFolder = paths.some(p => { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } });
      const actions = [
        { id: 'download_selected', title: hasFolder ? 'Download files (skips folders)' : 'Download', run: call('download-files', paths) },
        { id: 'div_batch', divider: true },
        { id: 'delete_selected', title: `Delete ${paths.length} items`, run: call('delete-files', paths) },
      ];
      openContextMenu(event.clientX + rect.x, event.clientY + rect.y, toContextMenuItems(actions));
      return;
    }

    const actions = [];
    const path = file.path = normalizePath(file.path);
    const stats = fs.statSync(path);
    if (stats.isFile()) {
      const ctxExt = file.name.split('.').pop().toLowerCase();
      actions.push({ id: 'edit_file', title: 'Edit', run: openIn('ui.notepad', path) });
      if (SCRIPT_EXTS.has(ctxExt)) actions.push({ id: 'run_file', title: 'Run', run: () => runScript(path) });
      if (ctxExt === 'py') actions.push({ id: 'run_python', title: 'Run in Python', run: openIn('ui.python', path) });
      actions.push({ id: 'open_file', title: 'Open', run: openIn('ui.iframe', path) });
      actions.push({ id: 'download_file', title: 'Download', run: call('download-file', path) });
      actions.push({ id: 'delete_file', title: 'Delete', run: fsService('rm', path) });
      actions.push({ id: 'rename_file', title: 'Rename', run: call('rename', path) });
      actions.push({ id: 'diff_file', title: 'Compare with…', run: openIn('ui.diff', path, '') });
      if (ctxExt === 'zip') actions.push({ id: 'zip_extract', title: 'Extract here', run: call('zip-extract', path) });
      actions.push({ id: 'zip_compress_file', title: 'Compress to ZIP', run: call('zip-compress', path) });
      actions.push({ id: 'div_clip', divider: true });
      actions.push({ id: 'copy_file', title: 'Copy', run: call('copy-file', path) });
      actions.push({ id: 'cut_file', title: 'Cut', run: call('cut-file', path) });
      actions.push({ id: 'props_file', title: 'Properties', run: call('show-properties', path) });
      actions.push({ id: 'divider_open_with', divider: true });
      const openWithApps = platform.host.getCommandsForExtension ? platform.host.getCommandsForExtension(ctxExt) : [];
      const openWithChildren = openWithApps.map(app => ({ id: `ow_${app.name}`, title: app.title, run: openIn(app.name, path) }));
      openWithChildren.push({ id: 'ow_browser', title: 'Browser', run: openIn('ui.iframe', path) });
      actions.push({ id: 'open_with', title: 'Open with', children: openWithChildren });
    } else {
      actions.push({ id: 'open_file', title: 'Open in explorer', run: openIn('explorer', path) });
      actions.push({ id: 'delete_file', title: 'Delete', run: fsService('rmdir', path) });
      actions.push({ id: 'rename_dir', title: 'Rename', run: call('rename', path) });
      actions.push({ id: 'zip_compress_dir', title: 'Compress to ZIP', run: call('zip-compress', path) });
      actions.push({ id: 'div_clip_dir', divider: true });
      actions.push({ id: 'copy_dir', title: 'Copy', run: call('copy-file', path) });
      actions.push({ id: 'cut_dir', title: 'Cut', run: call('cut-file', path) });
      actions.push({ id: 'props_dir', title: 'Properties', run: call('show-properties', path) });
    }

    openContextMenu(event.clientX + rect.x, event.clientY + rect.y, toContextMenuItems(actions));
  };

  const showDirActionsHandler = (event) => {
    const openContextMenu = platform.host.getService('001-core.layout', 'show-context-menu');
    if (!openContextMenu) return;
    const rect = props.getBoundingClientRect();
    const dir = dirRef.current;
    const k = cmdPrefix.current;
    const call = (name, ...values) => () => platform.host.callCommand(`${k}.${name}`, ...values);
    const cb = window.top?.__vfsClipboard;
    const actions = [];
    if (cb && cb.paths.length) {
      actions.push({ id: 'paste', title: `Paste "${cb.paths[0].split('/').pop()}"`, run: call('paste-files', dir) });
      actions.push({ id: 'div_paste', divider: true });
    }
    actions.push({ id: 'mk_folder', title: 'New Folder', run: call('make-dir', dir) });
    actions.push({ id: 'mk_file_bg', title: 'New File', run: call('make-file', dir) });
    openContextMenu(event.clientX + rect.x, event.clientY + rect.y, toContextMenuItems(actions));
  };

  // --- Drag & drop: move files between explorer windows, and import files from the OS ---

  const isDescendantOrSame = (parentPath, childPath) => {
    const normalizedParent = normalizePath(parentPath);
    const normalizedChild = normalizePath(childPath);
    if (normalizedChild === normalizedParent) return true;
    const prefix = normalizedParent.endsWith("/") ? normalizedParent : `${normalizedParent}/`;
    return normalizedChild.startsWith(prefix);
  };

  const moveEntry = (sourcePath, targetDir) => {
    const normalizedSource = normalizePath(sourcePath);
    const name = normalizedSource.split("/").filter(Boolean).pop();
    const destPath = normalizePath(`${targetDir}/${name}`);
    if (destPath === normalizedSource) return;
    if (isDescendantOrSame(normalizedSource, destPath)) {
      alert("Cannot move a folder into itself.");
      return;
    }
    if (fs.existsSync(destPath)) {
      if (!confirm(`"${name}" already exists in the destination. Overwrite?`)) return;
      const stat = fs.statSync(destPath);
      if (stat.isDirectory()) fs.rmdirSync(destPath);
      else fs.unlinkSync(destPath);
    }
    try {
      fs.renameSync(normalizedSource, destPath);
    } catch (err) {
      console.error("Failed to move", normalizedSource, "->", destPath, err);
      alert(`Failed to move "${name}".`);
    }
  };

  // Recursively imports a dropped OS file/directory entry (File System Entry API).
  const importDroppedEntry = async (entry, targetDir) => {
    const destPath = normalizePath(`${targetDir}/${entry.name}`);
    if (entry.isDirectory) {
      if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
      const reader = entry.createReader();
      const readAllEntries = () =>
        new Promise((resolve, reject) => {
          const all = [];
          const readBatch = () => {
            reader.readEntries((batch) => {
              if (batch.length === 0) {
                resolve(all);
                return;
              }
              all.push(...batch);
              readBatch();
            }, reject);
          };
          readBatch();
        });
      const children = await readAllEntries();
      for (const child of children) await importDroppedEntry(child, destPath);
    } else {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      const buffer = await file.arrayBuffer();
      fs.writeFileSync(destPath, Buffer.from(buffer));
    }
  };

  const importDroppedFile = async (file, targetDir) => {
    const buffer = await file.arrayBuffer();
    fs.writeFileSync(normalizePath(`${targetDir}/${file.name}`), Buffer.from(buffer));
  };

  // Imports files/folders dragged in from the user's computer.
  const importExternalDrop = async (dataTransfer, targetDir) => {
    const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
    const entries = items
      .map((item) => (typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null))
      .filter(Boolean);

    if (entries.length > 0) {
      for (const entry of entries) await importDroppedEntry(entry, targetDir);
    } else {
      const droppedFiles = Array.from(dataTransfer.files || []);
      for (const file of droppedFiles) await importDroppedFile(file, targetDir);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const isVfsMove = event.dataTransfer.types.includes("application/x-vfs-path")
      || event.dataTransfer.types.includes("application/x-vfs-paths");
    event.dataTransfer.dropEffect = isVfsMove ? "move" : "copy";
  };

  // Handles a drop onto `targetDir` - either moving item(s) dragged from an explorer
  // window (`application/x-vfs-paths` for a multi-selection drag, `application/x-vfs-path`
  // for a single item), importing a file from FS.html (`application/x-fs-export`),
  // or importing files/folders dragged from the OS.
  const handleDrop = (event, targetDir) => {
    event.preventDefault();
    event.stopPropagation();

    const vfsPathsJson = event.dataTransfer.getData("application/x-vfs-paths");
    if (vfsPathsJson) {
      let paths = [];
      try { paths = JSON.parse(vfsPathsJson); } catch (_) {}
      if (Array.isArray(paths) && paths.length) {
        paths.forEach((p) => moveEntry(p, targetDir));
        setSelectedPaths([]);
        refresh();
        return;
      }
    }

    const vfsPath = event.dataTransfer.getData("application/x-vfs-path");
    if (vfsPath) {
      moveEntry(vfsPath, targetDir);
      refresh();
      return;
    }

    // File dragged from FS.html — data is in window.top.__fsDrop
    const fsExport = event.dataTransfer.getData("application/x-fs-export");
    if (fsExport) {
      const drop = window.top?.__fsDrop;
      if (drop) {
        try {
          const destPath = `${targetDir}/${drop.name}`.replace(/\/+/g, "/");
          fs.writeFileSync(destPath, drop.binary ? Buffer.from(drop.content) : drop.content);
          refresh();
        } catch (e) { console.error("FS export import failed", e); }
      }
      return;
    }

    importExternalDrop(event.dataTransfer, targetDir)
      .then(refresh)
      .catch((err) => console.error("Failed to import dropped files", err));
  };

  const breadcrumbs = getBreadcrumbs(dirRef.current);

  const selectedFilePaths = selectedPaths.filter((p) => {
    try { return fs.statSync(p).isFile(); } catch (_) { return false; }
  });
  const canDownloadSelected = selectedFilePaths.length > 0;
  const downloadSelected = () => {
    if (!canDownloadSelected) return;
    selectedFilePaths.forEach(downloadFile);
    if (selectedFilePaths.length !== selectedPaths.length) {
      platform.host.callCommand('notify', {
        title: 'Some items skipped',
        body: `${selectedPaths.length - selectedFilePaths.length} folder(s) skipped (folders can't be downloaded individually)`,
        duration: 4000,
      });
    }
  };

  return (
    <div
      ref={rootRef}
      style={{ display: "flex", height: "100%", flexDirection: "column", position: "relative" }}
      className="file-explorer"
    >
      {propsFile && (
        <div style={{ position:'absolute',inset:0,background:'rgba(0,0,0,.35)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center' }}
          onClick={() => setPropsFile(null)}>
          <div style={{ background:'#fff',borderRadius:12,padding:'1.5rem',minWidth:280,maxWidth:400,boxShadow:'0 20px 60px rgba(0,0,0,.3)',fontFamily:'inherit' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ margin:'0 0 1rem',fontSize:15,borderBottom:'1px solid #e2e2e2',paddingBottom:'.75rem' }}>Properties</h3>
            {(() => {
              try {
                const stat=fs.statSync(propsFile); const name=propsFile.split('/').pop(); const dir=propsFile.split('/').slice(0,-1).join('/')||'/';
                const ext=getFileExtension(name); const isDir=stat.isDirectory();
                const fmtSize=n=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:n<1073741824?`${(n/1048576).toFixed(1)} MB`:`${(n/1073741824).toFixed(2)} GB`;
                let childCount=null; if(isDir){try{childCount=fs.readdirSync(propsFile).length;}catch(_){}}
                const rows=[['Name',name],['Location',dir],['Type',isDir?'Folder':(ext?`${ext.slice(1).toUpperCase()} file`:'File')]];
                if(isDir&&childCount!==null)rows.push(['Contents',`${childCount} item${childCount!==1?'s':''}`]);
                else if(!isDir)rows.push(['Size',fmtSize(stat.size||0)]);
                if(stat.mtime)rows.push(['Modified',new Date(stat.mtime).toLocaleString()]);
                return(<table style={{fontSize:13,borderCollapse:'collapse',width:'100%'}}><tbody>{rows.map(([k,v])=>(
                  <tr key={k} style={{borderBottom:'1px solid #f0f0f0'}}>
                    <td style={{padding:'.4rem .5rem',color:'#888',fontWeight:500,whiteSpace:'nowrap',verticalAlign:'top'}}>{k}</td>
                    <td style={{padding:'.4rem .5rem',wordBreak:'break-all'}}>{v}</td>
                  </tr>
                ))}</tbody></table>);
              } catch(e){return <div style={{color:'#e74c3c',fontSize:13}}>Error: {e.message}</div>;}
            })()}
            <div style={{textAlign:'right',marginTop:'1rem'}}>
              <button onClick={() => setPropsFile(null)} style={{padding:'.35rem .9rem',border:'none',borderRadius:6,background:'#0a84ff',color:'#fff',cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>OK</button>
            </div>
          </div>
        </div>
      )}
      <header>
        <div className="toolbar-nav-buttons">
          <span
            className={`material-symbols-outlined ${historyIndexRef.current <= 0 ? "disabled" : ""}`}
            onClick={goBack}
            aria-label="back"
            title="back"
          >
            arrow_back_ios
          </span>
          <span
            className={`material-symbols-outlined ${historyIndexRef.current >= historyRef.current.length - 1 ? "disabled" : ""}`}
            onClick={goForward}
            aria-label="forward"
            title="forward"
          >
            arrow_forward_ios
          </span>
          <span
            className={`material-symbols-outlined ${dirRef.current === "/" ? "disabled" : ""}`}
            onClick={goUp}
            aria-label="up"
            title="enclosing folder"
          >
            arrow_upward
          </span>
        </div>

        {searchActive ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && deactivateSearch()}
              placeholder={`Search in ${dirRef.current}…`}
              style={{ flex: 1, border: '1px solid #ccc', borderRadius: 6, padding: '3px 8px', fontSize: 13, outline: 'none' }}
            />
            <span className="material-symbols-outlined" onClick={deactivateSearch} style={{ cursor: 'pointer', color: '#888', fontSize: 18 }}>close</span>
          </div>
        ) : (
          <div className="breadcrumbs">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.path}>
                {idx > 0 ? <span className="sep material-symbols-outlined">chevron_right</span> : null}
                <span
                  className={`crumb ${crumb.path === dirRef.current ? "current" : ""}`}
                  onClick={() => navigateTo(crumb.path)}
                  title={crumb.path}
                >
                  {idx === 0 ? <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle' }}>dns</span> : crumb.name}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}

        <div className="toolbar-actions">
          <span
            className="material-symbols-outlined"
            onClick={activateSearch}
            aria-label="search"
            title="search"
          >
            search
          </span>
          <span
            className="material-symbols-outlined"
            onClick={makeDirClick}
            aria-label="create_new_folder"
            title="create folder"
          >
            create_new_folder
          </span>
          <span
            className="material-symbols-outlined"
            onClick={makeFileClick}
            aria-label="create_file"
            title="create file"
          >
            post_add
          </span>
          <span
            className="material-symbols-outlined"
            onClick={mountLocalFolderClick}
            aria-label="mount_local_folder"
            title="mount local folder"
          >
            drive_folder_upload
          </span>
          <span
            className={`material-symbols-outlined ${canDownloadSelected ? "" : "disabled"}`}
            onClick={downloadSelected}
            aria-label="download"
            title="download selected file(s)"
          >
            download
          </span>
          <span
            className={`material-symbols-outlined ${detailsOpen ? "active" : ""}`}
            onClick={() => setDetailsOpen((o) => !o)}
            aria-label="details"
            title="toggle details panel"
          >
            info
          </span>
        </div>
      </header>
      {searchActive && searchQuery.trim() && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: '#fff', zIndex: 10, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '0.5rem' }}>
          {searchResults.length === 0 ? (
            <div style={{ padding: '1rem', color: '#999', fontSize: 13 }}>No results for "{searchQuery}"</div>
          ) : searchResults.map((r, i) => (
            <div key={i} onDoubleClick={() => openSearchResult(r)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,122,255,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#6aa9f4' }}>{r.isDir ? 'folder' : 'insert_drive_file'}</span>
              <span style={{ fontWeight: 500 }}>{r.name}</span>
              <span style={{ fontSize: 11, color: '#999', marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{r.path}</span>
            </div>
          ))}
        </div>
      )}
      <div className="file-explorer-body" style={{ position: 'relative' }}>
        <nav className="file-explorer-nav">
          <div className="nav-section-title">Favorites</div>
          {NAV_SHORTCUTS.map((item) => (
            <div
              key={item.path}
              className={dirRef.current === item.path ? "active" : ""}
              onClick={() => navigateTo(item.path)}
              onDragOver={handleDragOver}
              onDrop={(ev) => handleDrop(ev, item.path)}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </nav>
        <section className="dir-list">
          <ListDirConponent
            key={dirRef.current}
            dir={dirRef.current}
            openFile={openFile}
            showFileActions={showFileActionsHandler}
            showDirActions={showDirActionsHandler}
            handleDragOver={handleDragOver}
            handleDrop={handleDrop}
            selectedPaths={selectedPaths}
            onSelect={setSelectedPaths}
          />
          <div className="file-explorer-status">
            {dirList.length} item{dirList.length === 1 ? "" : "s"}
          </div>
        </section>
        {detailsOpen && <DetailsPanel paths={selectedPaths} />}
      </div>
    </div>
  );
};

const ListDirConponent = ({ dir, openFile, showFileActions, showDirActions, handleDragOver, handleDrop, selectedPaths, onSelect }) => {
  dir ??= DESKTOP_PATH;

  const extIconMap = {
    ".js": "/usr/share/icons/js-icon.png",
    ".ts": "/usr/share/icons/ts-icon.png",
    ".proj": "/usr/share/icons/game-icon.png",
    ".html": "/usr/share/icons/html-icon.png",
    ".png": "/usr/share/icons/png-icon.png",
    ".jpg": "/usr/share/icons/png-icon.png",
    ".jpeg": "/usr/share/icons/png-icon.png",
    ".gif": "/usr/share/icons/png-icon.png",
    ".webp": "/usr/share/icons/png-icon.png",
    ".svg": "/usr/share/icons/png-icon.png",
    ".bmp": "/usr/share/icons/png-icon.png",
    ".ico": "/usr/share/icons/png-icon.png",
    ".avif": "/usr/share/icons/png-icon.png",
    ".run": "/usr/share/icons/bash.png",
    '.md': '/usr/share/icons/note-icon.webp',
    ".json": "/usr/share/icons/json.png",
    ".db": "/usr/share/icons/db-icon.svg",
    ".sqlite": "/usr/share/icons/db-icon.svg",
    ".sqlite3": "/usr/share/icons/db-icon.svg",
    ".ipynb": "/usr/share/icons/ipynb-icon.png",
    ".mp3":  "/usr/share/icons/audio-icon.png",
    ".wav":  "/usr/share/icons/audio-icon.png",
    ".ogg":  "/usr/share/icons/audio-icon.png",
    ".flac": "/usr/share/icons/audio-icon.png",
    ".m4a":  "/usr/share/icons/audio-icon.png",
    ".aac":  "/usr/share/icons/audio-icon.png",
    ".opus": "/usr/share/icons/audio-icon.png",
    ".mp4":  "/usr/share/icons/video-icon.svg",
    ".mkv":  "/usr/share/icons/video-icon.svg",
    ".webm": "/usr/share/icons/video-icon.svg",
    ".": "/usr/share/icons/folder-icon.png",
    "": "/usr/share/icons/invalid-file-icon.png",
  };

  const imageExtensions = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif",
  ]);

  const imageMimeTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".avif": "image/avif",
  };

  const fs = platform.host.getFS();
  const ls = fs.readdirSync(dir, {}).map((x) => ({
    name: x,
    path: `${dir}/${x}`,
    type: fs.statSync(`${dir}/${x}`).isDirectory() ? "dir" : "file",
    meta: { ext: getFileExtension(x) },
  }));

  const files = [...ls];

  // Selection is lifted up to the parent App (so the details panel can react
  // to it live) instead of local state. `selectedPaths` is a plain array;
  // `selectedSet` is just a membership-check convenience for rendering.
  const selectedSet = new Set(selectedPaths);

  // Anchor for shift-click range selection - the index (in current visual/
  // sort order) of the last item clicked without Shift. Local to this
  // component (which remounts, via its `key={dir}` in App, on every
  // directory change) so the anchor naturally resets when navigating.
  const lastClickedIndexRef = React.useRef(null);

  // Standard file-manager click semantics:
  // - plain click: select just this item.
  // - Ctrl/Cmd-click: toggle this item's membership in the selection.
  // - Shift-click: select the contiguous range from the last plain/ctrl
  //   click to this item, in the current visual order.
  const handleItemClick = (file, index, event) => {
    event.stopPropagation();
    const isToggle = event.metaKey || event.ctrlKey;
    const isRange = event.shiftKey;

    if (isRange && lastClickedIndexRef.current !== null) {
      const start = Math.min(lastClickedIndexRef.current, index);
      const end = Math.max(lastClickedIndexRef.current, index);
      onSelect(files.slice(start, end + 1).map((f) => f.path));
      return;
    }

    if (isToggle) {
      const next = new Set(selectedPaths);
      if (next.has(file.path)) next.delete(file.path);
      else next.add(file.path);
      onSelect(Array.from(next));
      lastClickedIndexRef.current = index;
      return;
    }

    onSelect([file.path]);
    lastClickedIndexRef.current = index;
  };

  // Image thumbnails are generated as blob URLs read straight from the
  // virtual fs instead of `/(sw)<path>` - the explorer renders inside an
  // `about:blank` window iframe, which has no service-worker controller, so
  // sub-resource fetches (CSS background-image) to `/(sw)/...` never reach
  // the SW's fetch handler (unlike `<iframe src="/(sw)/...">` navigations,
  // which the SW intercepts regardless of the embedding document's controller).
  const [thumbnails, setThumbnails] = React.useState({});
  const filesKey = files.map((f) => f.path).join(" ");
  React.useEffect(() => {
    const urls = [];
    const next = {};
    files.forEach((file) => {
      if (file.type !== "file" || !imageExtensions.has(file.meta.ext)) return;
      try {
        const data = fs.readFileSync(file.path);
        const blob = new Blob([data], { type: imageMimeTypes[file.meta.ext] || "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        next[file.path] = url;
        urls.push(url);
      } catch (err) {
        console.error("Failed to load thumbnail for", file.path, err);
      }
    });
    setThumbnails(next);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [filesKey]);

  // File-type icons live in the virtual fs under /usr/share/icons (see
  // extIconMap above) and, for the same reason as the thumbnails above, are
  // loaded as blob URLs rather than referenced via `/(sw)/...` paths.
  const [iconUrls, setIconUrls] = React.useState({});
  React.useEffect(() => {
    const urls = [];
    const next = {};
    Object.entries(extIconMap).forEach(([ext, path]) => {
      try {
        const data = fs.readFileSync(path);
        const blob = new Blob([data], { type: path.endsWith(".webp") ? "image/webp" : path.endsWith(".svg") ? "image/svg+xml" : "image/png" });
        const url = URL.createObjectURL(blob);
        next[ext] = url;
        urls.push(url);
      } catch (err) {
        console.error("Failed to load icon for", ext, err);
      }
    });
    setIconUrls(next);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const containerRef = React.useRef(null);
  React.useLayoutEffect(() => {
    if (!containerRef.current) return;
    const doc = containerRef.current.ownerDocument;
    const styles = new doc.defaultView.CSSStyleSheet();

    styles.replaceSync(`

      .${DESKTOP_CONTAINER_CLASS}-files {
          padding: .75rem;
          display: flex;
          gap: .25rem;
          flex-wrap: wrap;
          align-content: flex-start;
      }

      .${DESKTOP_CONTAINER_CLASS}-files .file-item {
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: .35rem;
          width: 5.5rem;
          padding: .4rem .25rem;
          border-radius: 8px;
          cursor: pointer;
          user-select: none;
      }

      .${DESKTOP_CONTAINER_CLASS}-files .file-item:hover {
          background: rgba(0, 90, 255, 0.06);
      }

      .${DESKTOP_CONTAINER_CLASS}-files .file-item.selected {
          background: rgba(0, 122, 255, 0.16);
      }

      .${DESKTOP_CONTAINER_CLASS}-files .file-item.selected .file-name {
          background: #0a84ff;
          color: #fff;
      }

      .${DESKTOP_CONTAINER_CLASS}-files .file-item.drag-over {
          background: rgba(10, 132, 255, 0.18);
          outline: 2px dashed #0a84ff;
          outline-offset: -2px;
      }

      .${DESKTOP_CONTAINER_CLASS}-files.drag-over {
          outline: 2px dashed #0a84ff;
          outline-offset: -4px;
          background: rgba(10, 132, 255, 0.04);
      }

      .${DESKTOP_CONTAINER_CLASS}-files .file[data-ext] {
      }

      .${DESKTOP_CONTAINER_CLASS}-files .file {
          box-sizing: border-box;
          display: inline-block;
          width: 3rem;
          height: 3rem;
          overflow: hidden;
          cursor: pointer;
      }

      .${DESKTOP_CONTAINER_CLASS}-files .file-name {
          font-size: 12px;
          color: #1d1d1f;
          text-align: center;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 100%;
          padding: 1px 5px;
          border-radius: 4px;
      }

      .${DESKTOP_CONTAINER_CLASS}-files .file-item.cut {
          opacity: 0.45;
      }

      `);

    appendStyleSheet(doc, styles);
    doc.adoptedStyleSheets;
  }, []);

  const rightClickHandler = (file, event) => {
    event.preventDefault();
    event.stopPropagation();
    // Right-clicking an item that's already part of a multi-selection keeps
    // the whole selection (so batch actions apply); right-clicking anything
    // else replaces the selection with just that item, as before.
    const keepSelection = selectedPaths.length > 1 && selectedSet.has(file.path);
    if (!keepSelection) {
      onSelect([file.path]);
      lastClickedIndexRef.current = files.findIndex((f) => f.path === file.path);
    }
    const effectiveSelection = keepSelection ? selectedPaths : [file.path];
    const customEvent = new CustomEvent("showmenu", { detail: {} });
    event.target.dispatchEvent(customEvent);
    showFileActions(file, event, effectiveSelection);
  };

  const [dragOverPath, setDragOverPath] = React.useState(null);
  const [mainDragOver, setMainDragOver] = React.useState(false);

  const dragStartHandler = (file, event) => {
    // Dragging an item that's part of the current multi-selection carries
    // the whole selection along; dragging a non-selected item (even while
    // other items are selected) only drags that one item.
    const isMultiDrag = selectedPaths.length > 1 && selectedSet.has(file.path);
    if (isMultiDrag) {
      event.dataTransfer.setData("application/x-vfs-paths", JSON.stringify(selectedPaths));
    }
    // Always set the singular path too - the item actually under the
    // pointer - so other single-file drop targets (audio player, desktop,
    // fs-inspector) keep working exactly as before for both single- and
    // multi-drag.
    event.dataTransfer.setData("application/x-vfs-path", file.path);
    event.dataTransfer.effectAllowed = "move";
    if (window.top) window.top.__vfsDragPath = file.path;
  };

  const clipboard = window.top?.__vfsClipboard;
  const cutPaths = clipboard?.op === 'cut' ? new Set(clipboard.paths) : new Set();

  return (
    <main
      className={`${DESKTOP_CONTAINER_CLASS}-files ${mainDragOver ? "drag-over" : ""}`}
      ref={containerRef}
      onClick={() => { onSelect([]); lastClickedIndexRef.current = null; }}
      onContextMenu={(ev) => { ev.preventDefault(); showDirActions && showDirActions(ev); }}
      onDragOver={(ev) => {
        handleDragOver(ev);
        setMainDragOver(true);
      }}
      onDragLeave={() => setMainDragOver(false)}
      onDrop={(ev) => {
        setMainDragOver(false);
        handleDrop(ev, dir);
      }}
    >
      {files.map((file, index) => (
        <div
          key={file.path}
          className={`file-item ${selectedSet.has(file.path) ? "selected" : ""} ${cutPaths.has(file.path) ? "cut" : ""} ${dragOverPath === file.path ? "drag-over" : ""}`}
          draggable
          onDragStart={(ev) => dragStartHandler(file, ev)}
          onDragOver={
            file.type === "dir"
              ? (ev) => {
                  handleDragOver(ev);
                  setDragOverPath(file.path);
                }
              : undefined
          }
          onDragLeave={file.type === "dir" ? () => setDragOverPath(null) : undefined}
          onDrop={
            file.type === "dir"
              ? (ev) => {
                  setDragOverPath(null);
                  handleDrop(ev, file.path);
                }
              : undefined
          }
          onClick={(ev) => handleItemClick(file, index, ev)}
          onDoubleClick={() => openFile(file)}
          onContextMenu={(ev) => rightClickHandler(file, ev)}
        >
          <div
            className={`file`}
            data-ext={file.meta.ext}
            style={{
              backgroundImage: `url('${
                file.type === "file" && imageExtensions.has(file.meta.ext) && thumbnails[file.path]
                  ? thumbnails[file.path]
                  : iconUrls[file.meta.ext] ?? iconUrls[""] ?? ""
              }')`,
              backgroundRepeat: "no-repeat",
              backgroundSize: "cover",
              backgroundPosition: "center center",
            }}
          ></div>
          <span className="file-name">
            {file.name}
          </span>
        </div>
      ))}
    </main>
  );
};

const { remove } = platform.host.registerCommand("explorer", run, {
  callable: false,
  icon: "folder",
  title: "Files",
  fullScreen: false,
  header: {style: {backgroundColor: ''}}
});

// setTimeout(remove, 6000)
