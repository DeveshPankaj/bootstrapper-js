const platform = window.platform;
const fs = platform.host.getFS();

const React = platform.getService("React");
const { createRoot } = platform.getService("ReactDOM");
const { DESKTOP_PATH, appendStyleSheet, getFileExtension, mountLocalDirectory } = platform.getService("utils");
const { DESKTOP_CONTAINER_CLASS } = platform.getService("window-manager");

const SIFI_CLASS = 'sifi-explorer';
const MOUNT_PATH = '/mnt';

const NAV_SHORTCUTS = [
  { label: 'Home',    path: DESKTOP_PATH, icon: 'home' },
  { label: 'Mounted', path: MOUNT_PATH,   icon: 'drive_folder_upload' },
  { label: 'Root',    path: '/',           icon: 'dns' },
];

const normalizePath = (path) => {
  const parts = path.split('/').filter((p) => p && p !== '.');
  const result = [];
  for (const part of parts) {
    if (part === '..') result.pop();
    else result.push(part);
  }
  return '/' + result.join('/');
};

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

// ── ZIP support ──────────────────────────────────────────────────────────
let _fflate = null;
const loadFflate = () => {
  if (_fflate) return _fflate;
  try {
    const code = fs.readFileSync('/usr/lib/fflate.min.js', 'utf8');
    const mod = { exports: {} };
    new Function('module', 'exports', code)(mod, mod.exports);
    _fflate = mod.exports;
  } catch (e) { throw new Error('fflate not available: ' + e.message); }
  return _fflate;
};
const extractZip = (zipPath, destDir) => {
  const fflate = loadFflate();
  const data = fs.readFileSync(zipPath);
  const uint8 = new Uint8Array(data.buffer ?? data);
  const entries = fflate.unzipSync(uint8);
  let count = 0;
  for (const [name, content] of Object.entries(entries)) {
    if (name.endsWith('/')) continue;
    const fullPath = normalizePath(`${destDir}/${name}`);
    const parentDir = fullPath.split('/').slice(0, -1).join('/');
    try { fs.mkdirSync(parentDir, { recursive: true }); } catch (_) {}
    fs.writeFileSync(fullPath, Buffer.from(content));
    count++;
  }
  return count;
};
const addToZip = (zipFiles, vfsPath, zipEntryName) => {
  try {
    const stat = fs.statSync(vfsPath);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(vfsPath);
      if (entries.length === 0) zipFiles[zipEntryName + '/'] = [new Uint8Array(0), { level: 0 }];
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
  addToZip(zipFiles, vfsPath, vfsPath.split('/').pop());
  fs.writeFileSync(outputPath, Buffer.from(fflate.zipSync(zipFiles)));
};
// ─────────────────────────────────────────────────────────────────────────

const SIFI_CSS = `
  @font-face{font-family:'Material Symbols Outlined';font-style:normal;font-weight:100 700;
    src:url(https://fonts.gstatic.com/s/materialsymbolsoutlined/v138/kJEhBvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oFsLjBuVY.woff2) format('woff2')}
  .material-symbols-outlined{font-family:'Material Symbols Outlined';font-weight:normal;font-style:normal;font-size:20px;
    line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;white-space:nowrap;
    direction:ltr;-webkit-font-smoothing:antialiased}

  html,body{margin:0;padding:0;height:100svh;background:#fff;
    font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:13.5px;color:#1c1c1e;}
  *{box-sizing:border-box}

  .${SIFI_CLASS}{display:flex;flex-direction:column;height:100%;background:#fff;}

  .sifi-hud{
    flex-shrink:0;display:flex;align-items:center;gap:.4rem;
    padding:.38rem .65rem;
  }

  .sifi-path{
    flex:1;display:flex;align-items:center;gap:1px;
    overflow:hidden;white-space:nowrap;font-size:13px;
  }
  .sifi-path .crumb{
    color:#888;cursor:pointer;padding:3px 5px;border-radius:4px;
    transition:background .1s,color .1s;
  }
  .sifi-path .crumb:hover{background:#f0ede9;color:#1c1c1e;}
  .sifi-path .crumb.cur{color:#1c1c1e;font-weight:500;}
  .sifi-path .sep{color:#ccc;font-size:10px;flex-shrink:0;padding:0 1px;}

  .sifi-search-input{
    flex:1;border:none;border-bottom:1px solid #ddd;outline:none;
    font-size:13px;padding:3px 4px;background:transparent;color:#1c1c1e;
  }
  .sifi-search-input::placeholder{color:#ccc;}
  .sifi-search-input:focus{border-bottom-color:#aaa;}

  .sifi-actions{display:flex;align-items:center;gap:0;}
  .sifi-actions .material-symbols-outlined{
    font-size:17px;padding:4px 5px;border-radius:4px;cursor:pointer;
    color:#999;transition:background .1s,color .1s;
  }
  .sifi-actions .material-symbols-outlined:hover{background:#f0ede9;color:#1c1c1e;}

  .sifi-body{display:flex;flex:1;min-height:0;}

  .sifi-navmesh{
    padding:.6rem 0 .6rem .75rem;
    overflow:visible;
    background:transparent;
    position:relative;
    flex-shrink:0;
  }

  .sifi-nav-tree{position:relative;padding-left:1.1rem;}
  .sifi-nav-tree::before{
    content:'';position:absolute;left:0;
    top:.4rem;bottom:.4rem;
    width:1px;background:#e8e3dd;
  }

  .sifi-navmesh-item{
    display:flex;align-items:center;gap:.4rem;
    padding:.3rem .45rem .3rem .2rem;
    cursor:pointer;font-size:13px;color:#777;
    position:relative;transition:color .12s;
  }
  .sifi-navmesh-item::before{
    content:'';position:absolute;
    left:-1.1rem;top:50%;
    width:.7rem;height:1px;
    background:#e8e3dd;
  }
  .sifi-navmesh-item .material-symbols-outlined{font-size:14px;color:#ccc;transition:color .12s;}
  .sifi-navmesh-item:hover{color:#1c1c1e;}
  .sifi-navmesh-item:hover .material-symbols-outlined{color:#aaa;}
  .sifi-navmesh-item.active{color:#1c1c1e;font-weight:500;}
  .sifi-navmesh-item.active .material-symbols-outlined{color:#c4a478;}
  .sifi-navmesh-item.active::after{
    content:'';position:absolute;
    left:calc(-1.1rem - 1px);top:18%;bottom:18%;
    width:2px;border-radius:1px;background:#c4a478;
  }

  .sifi-nav-resize{
    position:absolute;right:-5px;top:0;bottom:0;
    width:10px;cursor:col-resize;z-index:5;
  }
  .sifi-nav-resize::after{
    content:'';position:absolute;
    left:4px;top:8%;bottom:8%;
    width:1px;background:transparent;
    transition:background .2s;
    border-radius:1px;
  }
  .sifi-nav-resize:hover::after,.sifi-nav-resize.dragging::after{background:#d4cdc6;}

  .sifi-datasector{flex:1;display:flex;flex-direction:column;overflow:hidden;}

  .sifi-search-overlay{
    position:absolute;inset:0;z-index:20;
    background:rgba(255,255,255,.98);
    display:flex;flex-direction:column;overflow-y:auto;padding:.4rem;
  }
  .sifi-search-result{
    display:flex;align-items:center;gap:.5rem;
    padding:.35rem .6rem;border-radius:4px;cursor:pointer;
    font-size:13px;transition:background .1s;
  }
  .sifi-search-result:hover{background:#f0ede9;}
  .sifi-search-result .material-symbols-outlined{font-size:15px;color:#bbb;}
  .sifi-search-result .result-name{color:#1c1c1e;}
  .sifi-search-result .result-path{font-size:11px;color:#aaa;margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:55%;}

  .sifi-statusbar{flex-shrink:0;padding:.18rem .7rem;font-size:11px;color:#bbb;}
`;

const TILE_CSS = (cls) => `
  .${cls}-files{
    flex:1;padding:.5rem .55rem;
    display:flex;flex-wrap:wrap;gap:.2rem;align-content:flex-start;
    overflow-y:auto;background:#fff;
  }
  .${cls}-files::-webkit-scrollbar{width:5px}
  .${cls}-files::-webkit-scrollbar-thumb{background:#e8e4e0;border-radius:3px}

  .${cls}-files .file-item{
    display:flex;flex-direction:column;align-items:center;
    gap:.22rem;width:5.5rem;padding:.45rem .3rem .4rem;
    border-radius:4px;cursor:pointer;user-select:none;
    background:transparent;
    border:1px solid transparent;
    border-bottom-width:2px;
    transition:background .1s;
  }
  .${cls}-files .file-item:hover{background:#f4f1ee;}
  .${cls}-files .file-item.selected{
    background:#ede9e4;
    border-bottom:2px solid #c4a478;
  }
  .${cls}-files .file-item.drag-over{background:#eef2ff;outline:2px dashed #ccc;outline-offset:-2px;}
  .${cls}-files.drag-over{outline:2px dashed #ccc;outline-offset:-3px;background:#faf9f7;}

  .${cls}-files .file{
    width:3rem;height:3rem;overflow:hidden;display:inline-block;border-radius:2px;
    background-repeat:no-repeat;background-size:cover;background-position:center;
  }
  .${cls}-files .file-name{
    font-size:11px;color:#555;text-align:center;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
    max-width:100%;padding:1px 3px;
  }
  .${cls}-files .file-item:hover .file-name{color:#1c1c1e;}
  .${cls}-files .file-item.selected .file-name{color:#1c1c1e;font-weight:500;}
`;

const run = (...args) => {
  const [body, props, dir = DESKTOP_PATH] = args;
  if (!body) {
    platform.host.execCommand("service('001-core.layout', 'open-window') (command('explorer-sifi'))", platform);
    return;
  }
  const container = platform.window.document.createElement('div');
  const root = createRoot(container);
  body.appendChild(container);
  const win = body.ownerDocument.defaultView;
  const styles = new win.CSSStyleSheet();
  styles.replace(SIFI_CSS);
  body.ownerDocument.adoptedStyleSheets.push(styles);
  root.render(<App {...props} dir={dir} />);
  const rect0 = props.getBoundingClientRect();
  props.setBoundingClientRect({ ...rect0, left: rect0.left+80, right: rect0.right+80, top: rect0.top+60, bottom: rect0.bottom+60 });
  props.setWindowView(true);
  props.setHeaderStyles({ background: '#ffffff', color: '#555555', boxShadow: 'none', borderBottom: '1px solid #f0ede9' });
};

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

const App = (props) => {
  const fs = platform.host.getFS();
  const dirRef = React.useRef(props.dir || '/');
  const historyRef = React.useRef([dirRef.current]);
  const historyIndexRef = React.useRef(0);

  const [dirList, setDirList] = React.useState(fs.readdirSync(dirRef.current || '/'));
  const [, forceUpdate] = React.useState(0);
  const [searchActive, setSearchActive] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState([]);
  const [navWidth, setNavWidth] = React.useState(152);
  const navRef = React.useRef(null);
  const resizeHandleRef = React.useRef(null);

  const startNavResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = navRef.current?.offsetWidth ?? 152;
    const doc = navRef.current?.ownerDocument ?? document;
    const handle = resizeHandleRef.current;
    if (handle) handle.classList.add('dragging');
    const onMove = (ev) => {
      setNavWidth(Math.max(80, Math.min(320, startW + ev.clientX - startX)));
    };
    const onUp = () => {
      if (handle) handle.classList.remove('dragging');
      doc.removeEventListener('mousemove', onMove);
      doc.removeEventListener('mouseup', onUp);
    };
    doc.addEventListener('mousemove', onMove);
    doc.addEventListener('mouseup', onUp);
  };

  const refresh = () => { setDirList(fs.readdirSync(dirRef.current)); forceUpdate(n => n + 1); };
  const refreshRef = React.useRef(refresh);
  refreshRef.current = refresh;

  React.useEffect(() => {
    platform.register('zip-extract-sifi', (zipPath) => {
      try { const n = extractZip(zipPath, zipPath.split('/').slice(0,-1).join('/')); platform.host.callCommand('notify', { title:'Extracted', body:`${n} file${n!==1?'s':''} extracted`, duration:3000 }); refreshRef.current(); }
      catch (e) { platform.host.callCommand('notify', { title:'Extract failed', body:e.message||String(e), duration:4000 }); }
    });
    platform.register('zip-compress-sifi', (vfsPath) => {
      try { const name=vfsPath.split('/').pop(); compressToZip(vfsPath,`${vfsPath.split('/').slice(0,-1).join('/')}/${name}.zip`); platform.host.callCommand('notify', { title:'Compressed', body:`Created ${name}.zip`, duration:3000 }); refreshRef.current(); }
      catch (e) { platform.host.callCommand('notify', { title:'Compress failed', body:e.message||String(e), duration:4000 }); }
    });
  }, []);

  const onSearchChange   = (q) => { setSearchQuery(q); if (q.trim()) setSearchResults(searchVfs(fs, dirRef.current, q.trim().toLowerCase())); else setSearchResults([]); };
  const activateSearch   = () => { setSearchActive(true); setSearchQuery(''); setSearchResults([]); };
  const deactivateSearch = () => { setSearchActive(false); setSearchQuery(''); setSearchResults([]); };
  const openSearchResult = (r) => { deactivateSearch(); r.isDir ? goTo(r.path) : platform.host.exec(platform, r.path); };

  const IMAGE_EXTS = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg','.bmp','.ico','.avif']);

  const open = (file) => {
    const p = normalizePath(`${dirRef.current.endsWith('/')?dirRef.current:dirRef.current+'/'}${file}`);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) { goTo(p); return; }
    const ext = getFileExtension(p);
    if (IMAGE_EXTS.has(ext)) { const cmd=platform.host.getCommand('ui.imageviewer'); if(cmd){cmd.exec(null,null,p);return;} }
    if (ext==='.csv') { const cmd=platform.host.getCommand('ui.csv-viewer'); if(cmd){cmd.exec(null,null,p);return;} }
    if (ext==='.py')  { const cmd=platform.host.getCommand('ui.python');     if(cmd){cmd.exec(null,null,p);return;} }
    if (ext==='.zip') {
      if (confirm(`Extract "${p.split('/').pop()}" here?`)) {
        try { const n=extractZip(p,dirRef.current); platform.host.callCommand('notify',{title:'Extracted',body:`${n} files`,duration:3000}); refresh(); }
        catch (e) { platform.host.callCommand('notify',{title:'Extract failed',body:e.message,duration:4000}); }
      }
      return;
    }
    platform.host.exec(platform, p);
  };

  const goTo = (path, { pushHistory = true } = {}) => {
    const normalized = normalizePath(path);
    if (!fs.existsSync(normalized)) fs.mkdirSync(normalized, { recursive: true });
    dirRef.current = normalized;
    if (pushHistory) {
      const history = historyRef.current.slice(0, historyIndexRef.current + 1);
      history.push(normalized); historyRef.current = history; historyIndexRef.current = history.length - 1;
    }
    refresh();
  };

  const goBack    = () => { if (historyIndexRef.current<=0) return; historyIndexRef.current-=1; dirRef.current=historyRef.current[historyIndexRef.current]; refresh(); };
  const goForward = () => { if (historyIndexRef.current>=historyRef.current.length-1) return; historyIndexRef.current+=1; dirRef.current=historyRef.current[historyIndexRef.current]; refresh(); };
  const goUp      = () => { if (dirRef.current==='/') return; goTo(normalizePath(dirRef.current.split('/').slice(0,-1).join('/'))||'/'); };

  const mountLocalFolderClick = async () => {
    if (!platform.window.showDirectoryPicker) { alert('Not supported in this browser'); return; }
    try { const h=await platform.window.showDirectoryPicker(); const t=`${MOUNT_PATH}/${h.name}`; await mountLocalDirectory(fs,h,t); goTo(t); }
    catch (e) { if (e?.name!=='AbortError') console.error(e); }
  };
  const makeDirClick  = () => { const n=prompt('Folder name?'); if(!n) return; fs.mkdirSync(`${dirRef.current}/${n}`); refresh(); };
  const makeFileClick = () => { const n=prompt('File name?');   if(!n) return; fs.writeFileSync(`${dirRef.current}/${n}`,''); refresh(); };

  const showFileActionsHandler = (file, event) => {
    const openCtx = platform.host.getService('001-core.layout','show-context-menu');
    if (!openCtx) return;
    const rect = props.getBoundingClientRect();
    const actions = [];
    file.path = file.path.replace(/\/\//g,'/');
    const stats = fs.statSync(file.path);
    if (stats.isFile()) {
      actions.push({id:'edit_file', type:'action',title:'Edit',   cmd:`service('001-core.layout','open-window')(command('ui.notepad'),'${file.path}')`});
      const ctxExt=file.name.split('.').pop().toLowerCase();
      if (ctxExt==='py') actions.push({id:'run_py',type:'action',title:'Run in Python',cmd:`service('001-core.layout','open-window')(command('ui.python'),'${file.path}')`});
      actions.push({id:'open_file',  type:'action',title:'Open',   cmd:`service('001-core.layout','open-window')(command('ui.iframe'),'${file.path}')`});
      actions.push({id:'delete_file',type:'action',title:'Delete', cmd:`service('root','fs')('rm','${file.path}')`});
      actions.push({id:'diff_file',  type:'action',title:'Compare with…',cmd:`service('001-core.layout','open-window')(command('ui.diff'),'${file.path}','')`});
      if (ctxExt==='zip') actions.push({id:'zip_extract',type:'action',title:'Extract here',cmd:`service('/home/user1/apps/explorer-sifi.js','zip-extract-sifi')('${file.path}')`});
      actions.push({id:'zip_compress',type:'action',title:'Compress to ZIP',cmd:`service('/home/user1/apps/explorer-sifi.js','zip-compress-sifi')('${file.path}')`});
      actions.push({id:'div_ow',type:'divider',title:''});
      actions.push({id:'open_with',type:'group',title:'Open with',children:[
        {id:'ow_notepad',type:'action',title:'Text Editor', cmd:`service('001-core.layout','open-window')(command('ui.notepad'),'${file.path}')`},
        {id:'ow_vscode', type:'action',title:'VS Code',     cmd:`service('001-core.layout','open-window')(command('ui.vs-code'),'${file.path}')`},
        {id:'ow_csv',    type:'action',title:'Spreadsheet', cmd:`service('001-core.layout','open-window')(command('ui.csv-viewer'),'${file.path}')`},
        {id:'ow_image',  type:'action',title:'Image Viewer',cmd:`service('001-core.layout','open-window')(command('ui.imageviewer'),'${file.path}')`},
        {id:'ow_python', type:'action',title:'Python REPL', cmd:`service('001-core.layout','open-window')(command('ui.python'),'${file.path}')`},
        {id:'ow_browser',type:'action',title:'Browser',     cmd:`service('001-core.layout','open-window')(command('ui.iframe'),'${file.path}')`},
      ]});
    } else {
      actions.push({id:'open_dir',        type:'action',title:'Open',            cmd:`service('001-core.layout','open-window')(command('explorer-sifi'),'${file.path}')`});
      actions.push({id:'delete_dir',      type:'action',title:'Delete',          cmd:`service('root','fs')('rmdir','${file.path}')`});
      actions.push({id:'zip_compress_dir',type:'action',title:'Compress to ZIP', cmd:`service('/home/user1/apps/explorer-sifi.js','zip-compress-sifi')('${file.path}')`});
    }
    openCtx(event.clientX+rect.x, event.clientY+rect.y, actions);
  };

  // ── Drag & drop ──────────────────────────────────────────────────────────
  const isDescendantOrSame = (p,c) => { const np=normalizePath(p),nc=normalizePath(c); if(nc===np)return true; const pfx=np.endsWith('/')?np:`${np}/`; return nc.startsWith(pfx); };
  const moveEntry = (src,tgt) => {
    const ns=normalizePath(src); const name=ns.split('/').filter(Boolean).pop();
    const dest=normalizePath(`${tgt}/${name}`);
    if (dest===ns) return;
    if (isDescendantOrSame(ns,dest)){alert('Cannot move a folder into itself.');return;}
    if (fs.existsSync(dest)){if(!confirm(`"${name}" already exists. Overwrite?`))return; const s=fs.statSync(dest); if(s.isDirectory())fs.rmdirSync(dest); else fs.unlinkSync(dest);}
    try{fs.renameSync(ns,dest);}catch(e){console.error(e);alert(`Failed to move "${name}".`);}
  };
  const importDroppedEntry = async (entry,targetDir) => {
    const dest=normalizePath(`${targetDir}/${entry.name}`);
    if (entry.isDirectory){
      if(!fs.existsSync(dest))fs.mkdirSync(dest,{recursive:true});
      const reader=entry.createReader();
      const readAll=()=>new Promise((res,rej)=>{const all=[];const rb=()=>reader.readEntries(b=>{if(!b.length){res(all);return;}all.push(...b);rb();},rej);rb();});
      for(const c of await readAll())await importDroppedEntry(c,dest);
    }else{const f=await new Promise((res,rej)=>entry.file(res,rej));fs.writeFileSync(dest,Buffer.from(await f.arrayBuffer()));}
  };
  const importDroppedFile   = async (file,targetDir) => {fs.writeFileSync(normalizePath(`${targetDir}/${file.name}`),Buffer.from(await file.arrayBuffer()));};
  const importExternalDrop  = async (dt,targetDir) => {
    const items=dt.items?Array.from(dt.items):[];
    const entries=items.map(item=>typeof item.webkitGetAsEntry==='function'?item.webkitGetAsEntry():null).filter(Boolean);
    if(entries.length)for(const e of entries)await importDroppedEntry(e,targetDir);
    else for(const f of Array.from(dt.files||[]))await importDroppedFile(f,targetDir);
  };
  const handleDragOver = (ev)=>{ev.preventDefault();ev.stopPropagation();ev.dataTransfer.dropEffect=ev.dataTransfer.types.includes('application/x-vfs-path')?'move':'copy';};
  const handleDrop = (ev,targetDir) => {
    ev.preventDefault();ev.stopPropagation();
    const vfsPath=ev.dataTransfer.getData('application/x-vfs-path');
    if(vfsPath){moveEntry(vfsPath,targetDir);refresh();return;}
    const fsExport=ev.dataTransfer.getData('application/x-fs-export');
    if(fsExport){const drop=window.top?.__fsDrop;if(drop){try{fs.writeFileSync(`${targetDir}/${drop.name}`.replace(/\/+/g,'/'),drop.binary?Buffer.from(drop.content):drop.content);refresh();}catch(e){console.error(e);}}return;}
    importExternalDrop(ev.dataTransfer,targetDir).then(refresh).catch(e=>console.error(e));
  };
  // ────────────────────────────────────────────────────────────────────────

  const crumbs = getBreadcrumbs(dirRef.current);

  return (
    <div className={SIFI_CLASS} style={{position:'relative'}}>
      <div className="sifi-hud">
        {searchActive ? (
          <div style={{flex:1,display:'flex',alignItems:'center',gap:'.4rem'}}>
            <input autoFocus type="text" value={searchQuery} onChange={e=>onSearchChange(e.target.value)}
              onKeyDown={e=>e.key==='Escape'&&deactivateSearch()}
              placeholder={`Search in ${dirRef.current}…`} className="sifi-search-input" />
            <span className="material-symbols-outlined" onClick={deactivateSearch}
              style={{cursor:'pointer',color:'#aaa',fontSize:16}}>close</span>
          </div>
        ) : (
          <div className="sifi-path">
            {crumbs.map((c,i) => (
              <React.Fragment key={c.path}>
                {i>0 && <span className="sep">›</span>}
                <span className={`crumb${c.path===dirRef.current?' cur':''}`} onClick={()=>goTo(c.path)} title={c.path}>{c.name}</span>
              </React.Fragment>
            ))}
          </div>
        )}

        <div className="sifi-actions">
          <span className="material-symbols-outlined" onClick={activateSearch}        title="Search">search</span>
          <span className="material-symbols-outlined" onClick={makeDirClick}          title="New folder">create_new_folder</span>
          <span className="material-symbols-outlined" onClick={makeFileClick}         title="New file">post_add</span>
          <span className="material-symbols-outlined" onClick={mountLocalFolderClick} title="Mount local folder">drive_folder_upload</span>
        </div>
      </div>

      {searchActive && searchQuery.trim() && (
        <div className="sifi-search-overlay">
          {searchResults.length===0 ? (
            <div style={{padding:'1rem',color:'#bbb',fontSize:12}}>No results for "{searchQuery}"</div>
          ) : searchResults.map((r,i) => (
            <div key={i} className="sifi-search-result" onDoubleClick={()=>openSearchResult(r)}>
              <span className="material-symbols-outlined">{r.isDir?'folder':'insert_drive_file'}</span>
              <span className="result-name">{r.name}</span>
              <span className="result-path">{r.path}</span>
            </div>
          ))}
        </div>
      )}

      <div className="sifi-body" style={{position:'relative'}}>
        <nav className="sifi-navmesh" ref={navRef} style={{width:navWidth}}>
          <div className="sifi-nav-tree">
            {(() => {
              const cur = dirRef.current;
              const activeShortcut = NAV_SHORTCUTS.find(s =>
                s.path !== '/' && (cur === s.path || cur.startsWith(s.path + '/'))
              ) ?? NAV_SHORTCUTS.find(s => s.path === '/');
              return NAV_SHORTCUTS.map(item => (
                <div key={item.path}
                  className={`sifi-navmesh-item${item === activeShortcut ? ' active' : ''}`}
                  onClick={()=>goTo(item.path)}
                  onDragOver={handleDragOver}
                  onDrop={ev=>handleDrop(ev,item.path)}
                >
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              ));
            })()}
          </div>
          <div className="sifi-nav-resize" ref={resizeHandleRef} onMouseDown={startNavResize} />
        </nav>

        <section className="sifi-datasector">
          <ListDirConponent
            key={dirRef.current} dir={dirRef.current}
            openFile={f=>open(f.name)}
            showFileActions={showFileActionsHandler}
            handleDragOver={handleDragOver}
            handleDrop={handleDrop}
          />
          <div className="sifi-statusbar">
            {dirList.length} {dirList.length===1?'item':'items'}
          </div>
        </section>
      </div>
    </div>
  );
};

const ListDirConponent = ({ dir, openFile, showFileActions, handleDragOver, handleDrop }) => {
  dir ??= DESKTOP_PATH;
  const fs = platform.host.getFS();

  const extIconMap = {
    '.js':   '/usr/share/icons/js-icon.png',  '.ts':   '/usr/share/icons/ts-icon.png',
    '.proj': '/usr/share/icons/game-icon.png', '.html': '/usr/share/icons/html-icon.png',
    '.png':  '/usr/share/icons/png-icon.png',  '.jpg':  '/usr/share/icons/png-icon.png',
    '.jpeg': '/usr/share/icons/png-icon.png',  '.gif':  '/usr/share/icons/png-icon.png',
    '.webp': '/usr/share/icons/png-icon.png',  '.svg':  '/usr/share/icons/png-icon.png',
    '.bmp':  '/usr/share/icons/png-icon.png',  '.ico':  '/usr/share/icons/png-icon.png',
    '.avif': '/usr/share/icons/png-icon.png',  '.run':  '/usr/share/icons/bash.png',
    '.md':   '/usr/share/icons/note-icon.webp','.json': '/usr/share/icons/json.png',
    '.':     '/usr/share/icons/folder-icon.png','':     '/usr/share/icons/invalid-file-icon.png',
  };
  const imageExts = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg','.bmp','.ico','.avif']);
  const imageMime = {'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.bmp':'image/bmp','.ico':'image/x-icon','.avif':'image/avif'};

  const ls = fs.readdirSync(dir,{}).map(x=>({
    name:x, path:`${dir}/${x}`,
    type:fs.statSync(`${dir}/${x}`).isDirectory()?'dir':'file',
    meta:{ext:getFileExtension(x)},
  }));

  const [selected,    setSelected]    = React.useState(null);
  const [thumbnails,  setThumbnails]  = React.useState({});
  const [iconUrls,    setIconUrls]    = React.useState({});
  const [dragOverPath,setDragOverPath]= React.useState(null);
  const [mainDragOver,setMainDragOver]= React.useState(false);

  const filesKey = ls.map(f=>f.path).join(' ');
  React.useEffect(()=>{
    const urls=[]; const next={};
    ls.forEach(f=>{
      if(f.type!=='file'||!imageExts.has(f.meta.ext))return;
      try{const d=fs.readFileSync(f.path);const b=new Blob([d],{type:imageMime[f.meta.ext]||'application/octet-stream'});const u=URL.createObjectURL(b);next[f.path]=u;urls.push(u);}catch(_){}
    });
    setThumbnails(next);
    return()=>urls.forEach(u=>URL.revokeObjectURL(u));
  },[filesKey]);

  React.useEffect(()=>{
    const urls=[]; const next={};
    Object.entries(extIconMap).forEach(([ext,path])=>{
      try{const d=fs.readFileSync(path);const b=new Blob([d],{type:path.endsWith('.webp')?'image/webp':'image/png'});const u=URL.createObjectURL(b);next[ext]=u;urls.push(u);}catch(_){}
    });
    setIconUrls(next);
    return()=>urls.forEach(u=>URL.revokeObjectURL(u));
  },[]);

  const containerRef = React.useRef(null);
  React.useLayoutEffect(()=>{
    if(!containerRef.current)return;
    const doc=containerRef.current.ownerDocument;
    const s=new doc.defaultView.CSSStyleSheet();
    s.replaceSync(TILE_CSS(DESKTOP_CONTAINER_CLASS));
    appendStyleSheet(doc,s);
  },[]);

  return (
    <main
      ref={containerRef}
      className={`${DESKTOP_CONTAINER_CLASS}-files${mainDragOver?' drag-over':''}`}
      onDragOver={ev=>{handleDragOver(ev);setMainDragOver(true);}}
      onDragLeave={()=>setMainDragOver(false)}
      onDrop={ev=>{setMainDragOver(false);handleDrop(ev,dir);}}
    >
      {ls.map(file=>(
        <div
          key={file.path}
          className={`file-item${selected===file.path?' selected':''}${dragOverPath===file.path?' drag-over':''}`}
          draggable
          onDragStart={ev=>{ev.dataTransfer.setData('application/x-vfs-path',file.path);ev.dataTransfer.effectAllowed='move';}}
          onDragOver={file.type==='dir'?ev=>{handleDragOver(ev);setDragOverPath(file.path);}:undefined}
          onDragLeave={file.type==='dir'?()=>setDragOverPath(null):undefined}
          onDrop={file.type==='dir'?ev=>{setDragOverPath(null);handleDrop(ev,file.path);}:undefined}
          onClick={()=>setSelected(file.path)}
          onDoubleClick={()=>openFile(file)}
          onContextMenu={ev=>{ev.preventDefault();setSelected(file.path);showFileActions(file,ev);}}
        >
          <div className="file" data-ext={file.meta.ext} style={{
            backgroundImage:`url('${file.type==='file'&&imageExts.has(file.meta.ext)&&thumbnails[file.path]?thumbnails[file.path]:iconUrls[file.meta.ext]??iconUrls['']??''}')`,
            backgroundRepeat:'no-repeat',backgroundSize:'cover',backgroundPosition:'center',
          }}/>
          <span className="file-name">{file.name}</span>
        </div>
      ))}
    </main>
  );
};

platform.host.registerCommand('explorer-sifi', run, {
  callable: false,
  icon: 'folder_open',
  title: 'Files',
  fullScreen: false,
});

// Register as default 'explorer' if the user has set this as their preference
try {
  const prefs = JSON.parse(fs.readFileSync('/user-preferences.json','utf8')||'{}');
  if (prefs.default_explorer==='explorer-sifi') {
    platform.host.registerCommand('explorer', run, {
      callable:false, icon:'folder_open', title:'Files', fullScreen:false,
    });
  }
} catch(_){}
