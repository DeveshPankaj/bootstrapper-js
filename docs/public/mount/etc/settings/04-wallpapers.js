// Settings > Wallpaper page. See /home/user1/settings.html for the shared
// `'settings'` service (registerSection / utils) this registers against.
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { utils } = platform.getService('settings')
const { fs, origin, configWallpapers, imageExtensions, getExt, FilePicker } = utils

const Wallpapers = () => {
  const [inputValue, setInputValue] = React.useState('');
  const [wallpapers, setWallpapers] = React.useState(configWallpapers);
  const [showPicker, setShowPicker] = React.useState(false);
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

  const onPickWallpapersDir = (path) => {
    setWallpapersDir(path);
    platform.host.callCommand('set-wallpapers-dir', path);
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
      <div className="wallpaper-grid">
        {[...wallpapers, ...folderWallpapers].map((url, index) => {
          const fullUrl = toFullUrl(url);
          const active = fullUrl === activeWallpaper;
          const fromList = index < wallpapers.length;
          return (
            <div
              key={url}
              className={`wallpaper-card ${active ? 'active' : ''}`}
              onClick={() => onClickHandler(url)}
              onContextMenu={fromList ? (ev) => onContextMenuHandler(ev, url) : undefined}
            >
              <img src={fullUrl} alt={`Wallpaper ${index + 1}`} className="wallpaper-thumb" />
              <div className="wallpaper-overlay">
                {active ? (
                  <span className="material-symbols-outlined wallpaper-check">check_circle</span>
                ) : (
                  <span className="wallpaper-overlay-label">Set as Wallpaper</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {showPicker && (
        <FilePicker
          title="Choose a wallpaper image"
          initialDir="/home/user1"
          accept={imageExtensions}
          onSelect={onPickFromFiles}
          onClose={() => setShowPicker(false)}
        />
      )}
      {showFolderPicker && (
        <FilePicker
          title="Choose a wallpapers folder"
          initialDir={wallpapersDir || '/home/user1'}
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
