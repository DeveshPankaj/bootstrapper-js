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

const run = (...args) => {
  const [body, props, dir = DESKTOP_PATH] = args;

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

        .file-explorer-body {
            display: flex;
            flex-grow: 1;
            min-height: 0;
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

  const refresh = () => {
    setDirList(fs.readdirSync(dirRef.current));
    forceUpdate((n) => n + 1);
  };

  const goTo = (path, { pushHistory = true } = {}) => {
    const normalized = normalizePath(path);
    if (!fs.existsSync(normalized)) fs.mkdirSync(normalized, { recursive: true });
    dirRef.current = normalized;

    if (pushHistory) {
      const history = historyRef.current.slice(0, historyIndexRef.current + 1);
      history.push(normalized);
      historyRef.current = history;
      historyIndexRef.current = history.length - 1;
    }

    refresh();
  };

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
  const showFileActionsHandler = (file, event) => {
    const openContextMenu = platform.host.getService(
      "001-core.layout",
      "show-context-menu"
    );
    if (!openContextMenu) return;
    const rect = props.getBoundingClientRect();

    const actions = [];
    file.path = file.path.replace(/\/\//g, '/')
    const stats = fs.statSync(file.path);
    if (stats.isFile()) {
      actions.push({
        id: "edit_file",
        type: "action",
        title: "Edit",
        cmd: `service('001-core.layout', 'open-window') (command('ui.notepad'), '${file.path}')`,
      });
      actions.push({
        id: "open_file",
        type: "action",
        title: "Open",
        cmd: `service('001-core.layout', 'open-window') (command('ui.iframe'), '${file.path}')`,
      });
      actions.push({
        id: "delete_file",
        type: "action",
        title: "Delete",
        cmd: `service('root', 'fs')('rm', '${file.path}')`,
      });
    } else {
      actions.push({
        id: "open_file",
        type: "action",
        title: "Open in explorer",
        cmd: `service('001-core.layout', 'open-window') (command('explorer'), '${file.path}')`,
      });
      actions.push({ id: 'delete_file', type: 'action', title: 'Delete', cmd: `service('root', 'fs')('rmdir', '${file.path}')` })
    }

    openContextMenu(event.clientX + rect.x, event.clientY + rect.y, actions);
  };

  const breadcrumbs = getBreadcrumbs(dirRef.current);

  return (
    <div
      style={{ display: "flex", height: "100%", flexDirection: "column" }}
      className="file-explorer"
    >
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

        <div className="toolbar-actions">
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
        </div>
      </header>
      <div className="file-explorer-body">
        <nav className="file-explorer-nav">
          <div className="nav-section-title">Favorites</div>
          {NAV_SHORTCUTS.map((item) => (
            <div
              key={item.path}
              className={dirRef.current === item.path ? "active" : ""}
              onClick={() => navigateTo(item.path)}
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
          />
          <div className="file-explorer-status">
            {dirList.length} item{dirList.length === 1 ? "" : "s"}
          </div>
        </section>
      </div>
    </div>
  );
};

const ListDirConponent = ({ dir, openFile, showFileActions }) => {
  dir ??= DESKTOP_PATH;

  const extIconMap = {
    ".js": "/public/js-icon.png",
    ".ts": "/public/ts-icon.png",
    ".proj": "/public/game-icon.png",
    ".html": "/public/html-icon.png",
    ".png": "/public/png-icon.png",
    ".jpg": "/public/png-icon.png",
    ".jpeg": "/public/png-icon.png",
    ".gif": "/public/png-icon.png",
    ".webp": "/public/png-icon.png",
    ".svg": "/public/png-icon.png",
    ".bmp": "/public/png-icon.png",
    ".ico": "/public/png-icon.png",
    ".avif": "/public/png-icon.png",
    ".run": "/public/bash.png",
    '.md': '/public/note-icon.webp',
    ".json": "/public/json.png",
    ".": "/public/folder-icon.png",
    "": "/public/invalid-file-icon.png",
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

  const [selected, setSelected] = React.useState(null);

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

      `);

    appendStyleSheet(doc, styles);
    doc.adoptedStyleSheets;
  }, []);

  const rightClickHandler = (file, event) => {
    event.preventDefault();
    setSelected(file.path);
    const customEvent = new CustomEvent("showmenu", { detail: {} });
    event.target.dispatchEvent(customEvent);
    showFileActions(file, event);
  };

  return (
    <main className={`${DESKTOP_CONTAINER_CLASS}-files`} ref={containerRef}>
      {files.map((file) => (
        <div
          key={file.path}
          className={`file-item ${selected === file.path ? "selected" : ""}`}
          onClick={() => setSelected(file.path)}
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
                  : extIconMap[file.meta.ext] ?? extIconMap[""]
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
