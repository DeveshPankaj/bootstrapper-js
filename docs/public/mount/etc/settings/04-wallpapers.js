// Settings > Wallpaper page. See /home/user1/settings.html for the shared
// `'settings'` service (registerSection / utils) this registers against.
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { utils } = platform.getService('settings')
const { fs, origin, configWallpapers, imageExtensions, getExt, FilePicker } = utils

const isGradient = (v) => /^\s*(linear|radial|conic)-gradient\s*\(/i.test(v)
const CANVAS_PREFIX = 'canvas:'
const isCanvasWallpaper = (v) => v.startsWith(CANVAS_PREFIX)
// Shared system location for wallpaper assets of every kind (image files
// and canvas .js scripts alike) — mirrors the /usr/share/icons/ convention
// already used elsewhere in this vfs for read-mostly shared visual assets.
// (Real Linux distros use /usr/share/backgrounds or /usr/share/wallpapers
// for this; /var is for variable runtime state — logs, spool, caches —
// not static user-selectable content, so it isn't the right fit here.)
const WALLPAPERS_DIR = '/usr/share/wallpapers'

// Same harness used by the real desktop wallpaper (src/core/layout/index.tsx,
// mountCanvasWallpaper) — kept in sync manually since this settings page and
// the compiled layout bundle are separate build contexts. Runs the script in
// a sandboxed iframe as a real ES module, so it can use `export function
// render(canvas) {...}`.
const buildCanvasWallpaperSrcdoc = (code) => {
  const codeJson = JSON.stringify(code).replace(/<\/script/gi, '<\\/script')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:#000}
canvas{display:block;width:100%;height:100%}
</style></head><body>
<canvas id="wallpaper-canvas"></canvas>
<script>window.__WALLPAPER_SRC__ = ${codeJson};<\/script>
<script type="module">
(async function(){
  var canvas = document.getElementById('wallpaper-canvas');
  function fit(){ canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  fit();
  window.addEventListener('resize', fit);
  // Same render(canvas, api) shape as the real desktop wallpaper, so an
  // interactive script doesn't throw when previewed here — but this
  // thumbnail's iframe stays pointer-events:none (see CanvasWallpaperThumb)
  // so clicking the card still selects the wallpaper instead of the
  // iframe swallowing the click, which means it can't forward real mouse
  // coordinates; scripts just see an inactive mouse in this small preview.
  var mouse = { x: -1, y: -1, active: false };
  // Preview always looks like an empty desktop (count: 0) so a
  // window-count-reactive script (e.g. a character that peeks out when
  // nothing is open) shows its "active" state in the thumbnail.
  var windows = { count: 0 };
  try {
    var blob = new Blob([window.__WALLPAPER_SRC__], { type: 'text/javascript' });
    var url = URL.createObjectURL(blob);
    var mod = await import(url);
    URL.revokeObjectURL(url);
    if (typeof mod.render !== 'function') { console.error('Canvas wallpaper must export a render(canvas) function'); return; }
    mod.render(canvas, { mouse: mouse, windows: windows });
  } catch (e) { console.error('Canvas wallpaper preview error:', e); }
})();
<\/script>
</body></html>`
}

// Live preview thumbnail for a canvas wallpaper card — actually runs the
// script (sandboxed) at card size, rather than a static screenshot, so the
// grid shows what the animation looks like before picking it.
const CanvasWallpaperThumb = ({ path }) => {
  const ref = React.useRef(null)
  React.useEffect(() => {
    if (!ref.current) return
    try {
      const code = fs.readFileSync(path, 'utf-8')
      ref.current.srcdoc = buildCanvasWallpaperSrcdoc(code)
    } catch (err) {
      ref.current.srcdoc = ''
    }
  }, [path])
  return (
    <iframe
      ref={ref}
      className="wallpaper-thumb"
      sandbox="allow-scripts"
      style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none', display: 'block' }}
      title={path}
    />
  )
}

const Wallpapers = () => {
  const [inputValue, setInputValue] = React.useState('');
  const [gradientInput, setGradientInput] = React.useState('linear-gradient(135deg, #667eea 0%, #764ba2 100%)');
  const [wallpapers, setWallpapers] = React.useState(configWallpapers);
  const [showPicker, setShowPicker] = React.useState(false);
  const [showScriptPicker, setShowScriptPicker] = React.useState(false);
  const [showFolderPicker, setShowFolderPicker] = React.useState(false);
  const [wallpapersDir, setWallpapersDir] = React.useState(() => platform.userPref.getWallpapersDir() ?? '');
  const [activeWallpaper, setActiveWallpaper] = React.useState(() => platform.userPref.getWallpaper());
  const [contextMenu, setContextMenu] = React.useState(null);

  React.useEffect(() => {
    const metaFileRawContent = fs.readFileSync('/user-preferences.json')
    const prefs = JSON.parse(metaFileRawContent)
    setWallpapers(prefs.wallpapers ?? [])
    setWallpapersDir(prefs.wallpapers_dir ?? '')
  }, [])

  // Images found in the configured wallpapers folder, shown alongside the
  // wallpapers listed in /user-preferences.json.
  const folderWallpapers = React.useMemo(() => {
    if (!wallpapersDir) return [];
    try {
      return fs.readdirSync(wallpapersDir)
        .filter(name => imageExtensions.has(getExt(name)))
        .map(name => `/(sw)${wallpapersDir}/${name}`)
        .filter(url => !wallpapers.includes(url));
    } catch (err) {
      return [];
    }
  }, [wallpapersDir, wallpapers]);

  React.useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    document.addEventListener('contextmenu', close);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('contextmenu', close);
    };
  }, [contextMenu]);

  const toFullUrl = (wallpaper) => wallpaper.startsWith('/') ? `${origin}${wallpaper}` : wallpaper;

  const addAndSet = (wallpaper) => {
    const fullUrl = toFullUrl(wallpaper);
    if (!wallpapers.includes(wallpaper)) {
      setWallpapers(state => [...state, wallpaper]);
      platform.host.callCommand('add-wallpaper', wallpaper);
    }
    platform.host.callCommand('set-wallpaper', fullUrl);
    setActiveWallpaper(fullUrl);
  };

  const onClickHandler = (wallpaper) => {
    addAndSet(wallpaper);
  };

  const onContextMenuHandler = (event, wallpaper) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, wallpaper });
  };

  const onDeleteWallpaper = (wallpaper) => {
    setContextMenu(null);
    setWallpapers(state => state.filter(w => w !== wallpaper));
    platform.host.callCommand('remove-wallpaper', wallpaper);
    setActiveWallpaper(platform.userPref.getWallpaper());
  };

  const onFetchClick = () => {
    if (inputValue && !wallpapers.includes(inputValue)) {
      setWallpapers(state => [...state, inputValue]);
      platform.host.callCommand('add-wallpaper', inputValue);
      setInputValue('')
    }
  };

  const onPickFromFiles = (path) => {
    addAndSet(`/(sw)${path}`);
  };

  const onPickScript = (path) => {
    addAndSet(`${CANVAS_PREFIX}${path}`);
  };

  const onPickWallpapersDir = (path) => {
    setWallpapersDir(path);
    platform.host.callCommand('set-wallpapers-dir', path);
  };

  const onApplyGradient = () => {
    const g = gradientInput.trim();
    if (!g || !isGradient(g)) return;
    // Gradients are stored and applied directly as CSS values (no origin prefix needed).
    if (!wallpapers.includes(g)) {
      setWallpapers(state => [...state, g]);
      platform.host.callCommand('add-wallpaper', g);
    }
    platform.host.callCommand('set-wallpaper', g);
    setActiveWallpaper(g);
  };

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">Wallpaper</h1>
      <div className="wallpaper-toolbar">
        <input
          type="text"
          className="settings-input"
          placeholder="Wallpaper image URL"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <button className="settings-btn" onClick={onFetchClick}>Add</button>
        <button className="settings-btn primary" onClick={() => setShowPicker(true)}>
          <span className="material-symbols-outlined" style={{fontSize: '1.1rem', verticalAlign: '-2px', marginRight: '0.25rem'}}>folder_open</span>
          Choose from Files
        </button>
        <button className="settings-btn" onClick={() => setShowScriptPicker(true)} title="Pick a .js file exporting render(canvas) to use as a live animated wallpaper">
          <span className="material-symbols-outlined" style={{fontSize: '1.1rem', verticalAlign: '-2px', marginRight: '0.25rem'}}>animation</span>
          Canvas Script...
        </button>
      </div>
      <div className="wallpaper-toolbar">
        <span className="settings-hint" style={{flex: 1}}>
          Wallpapers folder:{' '}
          {wallpapersDir ? <code>{wallpapersDir}</code> : <em>not set</em>}
        </span>
        <button className="settings-btn" onClick={() => setShowFolderPicker(true)}>
          <span className="material-symbols-outlined" style={{fontSize: '1.1rem', verticalAlign: '-2px', marginRight: '0.25rem'}}>folder_open</span>
          {wallpapersDir ? 'Change Folder' : 'Set Wallpapers Folder'}
        </button>
      </div>

      <h2 className="settings-section-title" style={{marginTop: '1.5rem', marginBottom: '0.75rem', fontSize: '0.9rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em'}}>CSS Gradient</h2>
      <div className="wallpaper-toolbar" style={{alignItems: 'flex-start', gap: '0.75rem'}}>
        <div style={{flex: 1}}>
          <input
            type="text"
            className="settings-input"
            placeholder="e.g. linear-gradient(135deg, #667eea, #764ba2)"
            value={gradientInput}
            onChange={(e) => setGradientInput(e.target.value)}
            style={{width: '100%', fontFamily: 'monospace', fontSize: '0.82rem'}}
          />
          <div style={{marginTop: '0.5rem', fontSize: '0.78rem', opacity: 0.55}}>
            Supports <code>linear-gradient</code>, <code>radial-gradient</code>, <code>conic-gradient</code>
          </div>
        </div>
        <div
          style={{
            width: '80px', height: '52px', borderRadius: '8px', flexShrink: 0,
            background: isGradient(gradientInput) ? gradientInput : 'rgba(128,128,128,0.2)',
            border: '2px solid rgba(128,128,128,0.2)',
          }}
          title="Live preview"
        />
        <button
          className="settings-btn primary"
          onClick={onApplyGradient}
          disabled={!isGradient(gradientInput)}
        >Apply</button>
      </div>

      <h2 className="settings-section-title" style={{marginTop: '1.5rem', marginBottom: '0.75rem', fontSize: '0.9rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em'}}>Images &amp; Canvas</h2>
      <div className="wallpaper-grid">
        {[...wallpapers, ...folderWallpapers].map((url, index) => {
          const canvasWp = isCanvasWallpaper(url);
          const fullUrl = canvasWp ? url : toFullUrl(url);
          const active = fullUrl === activeWallpaper || url === activeWallpaper;
          const fromList = index < wallpapers.length;
          const gradient = !canvasWp && isGradient(url);
          return (
            <div
              key={url}
              className={`wallpaper-card ${active ? 'active' : ''}`}
              onClick={() => onClickHandler(url)}
              onContextMenu={fromList ? (ev) => onContextMenuHandler(ev, url) : undefined}
              style={gradient ? {background: url, minHeight: '80px'} : undefined}
            >
              {canvasWp ? (
                <CanvasWallpaperThumb path={url.slice(CANVAS_PREFIX.length)} />
              ) : gradient ? null : (
                <img src={fullUrl} alt={`Wallpaper ${index + 1}`} className="wallpaper-thumb" />
              )}
              <div className="wallpaper-overlay">
                {active ? (
                  <span className="material-symbols-outlined wallpaper-check">check_circle</span>
                ) : (
                  <span className="wallpaper-overlay-label">{canvasWp ? 'Canvas' : gradient ? 'Gradient' : 'Set as Wallpaper'}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {showScriptPicker && (
        <FilePicker
          title="Choose a canvas wallpaper script (.js exporting render(canvas))"
          initialDir={WALLPAPERS_DIR}
          accept={new Set(['.js'])}
          onSelect={onPickScript}
          onClose={() => setShowScriptPicker(false)}
        />
      )}
      {showPicker && (
        <FilePicker
          title="Choose a wallpaper image"
          initialDir={WALLPAPERS_DIR}
          accept={imageExtensions}
          onSelect={onPickFromFiles}
          onClose={() => setShowPicker(false)}
        />
      )}
      {showFolderPicker && (
        <FilePicker
          title="Choose a wallpapers folder"
          initialDir={wallpapersDir || WALLPAPERS_DIR}
          mode="folder"
          onSelect={onPickWallpapersDir}
          onClose={() => setShowFolderPicker(false)}
        />
      )}
      {contextMenu && (
        <div className="wallpaper-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button onClick={() => onDeleteWallpaper(contextMenu.wallpaper)}>Delete</button>
        </div>
      )}
    </div>
  );
};

platform.getService('settings').registerSection('04-wallpapers', (container, api) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(Wallpapers))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'Wallpaper',
  icon: 'wallpaper',
  color: '#ff9f0a',
  marginTop: 'auto',
})
