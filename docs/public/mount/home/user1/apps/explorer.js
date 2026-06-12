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
            font-family: monospace; 
            height: 100svh;
            // background: black;
            backdrop-filter: blur(50px);
            background: #ffffff55;
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
            -webkit-font-feature-settings: 'liga';
            -webkit-font-smoothing: antialiased;
        }
    
        * {
            box-sizing: border-box;
        }

        .file-explorer {

        }
        .file-explorer > header {
            background: black;
            color: white;
            padding: 7px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .heading {

        }

        .file-explorer-body {
            display: flex;
            flex-grow: 1;
            min-height: 0;
        }

        .file-explorer-nav {
            flex: 0 0 10rem;
            border-right: 1px solid #ccc;
            overflow: auto;
            padding: .5rem 0;
        }

        .file-explorer-nav > div {
            display: flex;
            align-items: center;
            gap: .5rem;
            padding: .4rem .75rem;
            cursor: pointer;
            white-space: nowrap;
        }

        .file-explorer-nav > div:hover {
            background: aqua;
        }

        .file-explorer-nav > div.active {
            background: #ddd;
        }

        .dir-list {
            flex-grow: 1;
            overflow: auto;
        }

        .dir-list > div {
            cursor: pointer;
        }

        .dir-list > div:hover {
            background: aqua;
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
  const [dirList, setDirList] = React.useState(
    fs.readdirSync(dirRef.current || "/")
  );

  const open = (file) => {
    const selectedFilePath = normalizePath(
      dirRef.current.endsWith("/")
        ? `${dirRef.current}${file}`
        : `${dirRef.current}/${file}`
    );
    const stat = fs.statSync(selectedFilePath);

    if (stat.isDirectory()) {
      dirRef.current = selectedFilePath;
      console.log(selectedFilePath);
      setDirList(fs.readdirSync(dirRef.current));

      // props.setTitle(`File Explorer (${dirRef.current})`)
    } else {
      platform.host.exec(platform, selectedFilePath);
    }
  };

  const navigateTo = (path) => {
    if (!fs.existsSync(path)) fs.mkdirSync(path, { recursive: true });
    dirRef.current = normalizePath(path);
    setDirList(fs.readdirSync(dirRef.current));
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
    setDirList(fs.readdirSync(dirRef.current));
  };
  const makeFileClick = () => {
    const fileName = prompt("File name?");
    if (!fileName) return;
    const filePath = dirRef.current.endsWith("/")
      ? `${dirRef.current}${fileName}`
      : `${dirRef.current}/${fileName}`;
    fs.writeFileSync(filePath, "");
    setDirList(fs.readdirSync(dirRef.current));
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

  return (
    <div
      style={{ display: "flex", height: "100%", flexDirection: "column" }}
      className="file-explorer"
    >
      <header>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          {dirRef.current != "/" ? (
            <span
              className="material-symbols-outlined"
              style={{ cursor: "pointer" }}
              onClick={() => open("..")}
              aria-label="back"
              title="back"
            >
              reply
            </span>
          ) : null}
          <span>{dirRef.current}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span
            className="material-symbols-outlined"
            style={{ cursor: "pointer" }}
            onClick={makeDirClick}
            aria-label="create_new_folder"
            title="create folder"
          >
            create_new_folder
          </span>
          <span
            className="material-symbols-outlined"
            style={{ cursor: "pointer" }}
            onClick={makeFileClick}
            aria-label="create_file"
            title="create file"
          >
            post_add
          </span>
          <span
            className="material-symbols-outlined"
            style={{ cursor: "pointer" }}
            onClick={mountLocalFolderClick}
            aria-label="mount_local_folder"
            title="mount local folder"
          >
            drive_folder_upload
          </span>
        </div>
        {/* <div>
                  <span className="material-symbols-outlined" style={{cursor: 'pointer'}} onClick={props.close} aria-label="create_file" title="create file">close</span>
              </div> */}

        {/* <button onClick={makeDirClick}>New Diractory</button>
              <button onClick={makeFileClick}>New File</button> */}
      </header>
      <div className="file-explorer-body">
        <nav className="file-explorer-nav">
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
          {/* {dirRef.current != '/' ? <div onClick={() => open('..')}>..</div> : null} */}
          {/* {
                    dirList.map(file => <div key={`${dirRef.current}/${file}`} onClick={() => open(file)}>{file}</div>)
                } */}

          <ListDirConponent
            dir={dirRef.current}
            openFile={openFile}
            showFileActions={showFileActionsHandler}
          />
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

  const fs = platform.host.getFS();
  const ls = fs.readdirSync(dir, {}).map((x) => ({
    name: x,
    path: `${dir}/${x}`,
    type: fs.statSync(`${dir}/${x}`).isDirectory() ? "dir" : "file",
    meta: { ext: getFileExtension(x) },
  }));

  const files = [
    ...ls,
    // {name: '123.js', path: '/123.js', meta: {ext: '.js'}, type:'file'},
    // {name: 'index.html', path: '/usr/desktop/index.html', meta: {ext: '.html'}, type: 'file'},
    // {name: 'app.proj', path: '/c/app.proj', meta: {ext: '.proj'}, type: 'file'},
    // {name: 'projects', path: '/usr/desktop/projects', meta: {ext: '.'}, type: 'dir'},
  ];

  const containerRef = React.useRef(null);
  React.useLayoutEffect(() => {
    if (!containerRef.current) return;
    const doc = containerRef.current.ownerDocument;
    const styles = new doc.defaultView.CSSStyleSheet();

    styles.replaceSync(`

      .${DESKTOP_CONTAINER_CLASS}-files {
          // height: 100%;
          padding: .5rem;
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;


          // background: #3e3e3e;
      }
  
      .${DESKTOP_CONTAINER_CLASS}-files .file[data-ext] {
      }
  
      .${DESKTOP_CONTAINER_CLASS}-files .file {
          box-sizing: border-box;
          display: inline-block;
          padding: .5rem;
          width: 3rem;
          height: 3rem;
          overflow: hidden;
          cursor: pointer;
      }
      
      `);

    appendStyleSheet(doc, styles);
    doc.adoptedStyleSheets;
  }, []);

  const rightClickHandler = (file, event) => {
    // console.log(event);
    event.preventDefault();
    const customEvent = new CustomEvent("showmenu", { detail: {} });
    event.target.dispatchEvent(customEvent);
    showFileActions(file, event);
  };

  return (
    <main className={`${DESKTOP_CONTAINER_CLASS}-files`} ref={containerRef}>
      {files.map((file) => (
        <div
          key={file.path}
          onClick={() => openFile(file)}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <div
            className={`file`}
            data-ext={file.meta.ext}
            style={{
              backgroundImage: `url(${
                extIconMap[file.meta.ext] ?? extIconMap[""]
              })`,
              backgroundRepeat: "no-repeat",
              backgroundSize: "cover",
              backgroundPosition: "center center",
            }}
            onContextMenu={(ev) => rightClickHandler(file, ev)}
          ></div>
          <span
            style={{
              color: "black",
              mixBlendMode: "difference",
              overflow: "hidden",
              maxWidth: "8rem",
              textOverflow: "ellipsis",
              filter: "contrast(0)",
            }}
          >
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
