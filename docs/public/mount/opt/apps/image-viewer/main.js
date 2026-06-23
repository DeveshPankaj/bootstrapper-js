const platform = window.platform;
const React = platform.getService('React');
const { createRoot } = platform.getService('ReactDOM');
const { appendStyleSheet } = platform.getService('utils');
const fs = platform.host.getFS();

const IMAGE_EXTENSIONS = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg','.bmp','.ico','.avif']);
const IMAGE_MIME = { '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.bmp':'image/bmp','.ico':'image/x-icon','.avif':'image/avif' };

const getExt = (name) => {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
};

const ImageViewer = ({ filePath }) => {
  const [url, setUrl] = React.useState(null);
  const [info, setInfo] = React.useState({ w: 0, h: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [fitMode, setFitMode] = React.useState(true);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [dragging, setDragging] = React.useState(null);
  const imgRef = React.useRef(null);

  React.useEffect(() => {
    const ext = getExt(filePath);
    const mime = IMAGE_MIME[ext] || 'application/octet-stream';
    try {
      const data = fs.readFileSync(filePath);
      const blob = new Blob([data], { type: mime });
      const objUrl = URL.createObjectURL(blob);
      setUrl(objUrl);
      return () => URL.revokeObjectURL(objUrl);
    } catch (err) {
      console.error('imageviewer: failed to load', filePath, err);
    }
  }, [filePath]);

  const onImgLoad = () => {
    if (imgRef.current) setInfo({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight });
  };

  const onWheel = (e) => {
    e.preventDefault();
    setFitMode(false);
    setZoom(z => Math.max(0.1, Math.min(10, z * (e.deltaY < 0 ? 1.15 : 0.87))));
  };

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    setDragging({ startX: e.clientX - pan.x, startY: e.clientY - pan.y });
  };
  const onMouseMove = (e) => {
    if (!dragging) return;
    setPan({ x: e.clientX - dragging.startX, y: e.clientY - dragging.startY });
  };
  const onMouseUp = () => setDragging(null);

  const name = filePath.split('/').pop();

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#111', color:'#eee', userSelect:'none' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.4rem 0.75rem', background:'#1a1a1a', borderBottom:'1px solid #333', flexShrink:0 }}>
        <span style={{ fontSize:13, opacity:0.8, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
        <button onClick={() => { setFitMode(true); setPan({x:0,y:0}); }} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#eee', borderRadius:5, padding:'2px 8px', cursor:'pointer', fontSize:12 }} title="Fit to window">Fit</button>
        <button onClick={() => { setFitMode(false); setZoom(z => Math.min(10, z * 1.25)); }} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#eee', borderRadius:5, padding:'2px 8px', cursor:'pointer', fontSize:16, lineHeight:1 }}>+</button>
        <button onClick={() => { setFitMode(false); setZoom(z => Math.max(0.1, z * 0.8)); }} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#eee', borderRadius:5, padding:'2px 8px', cursor:'pointer', fontSize:16, lineHeight:1 }}>−</button>
        <span style={{ fontSize:12, opacity:0.6, minWidth:'3rem', textAlign:'right' }}>{Math.round(zoom * 100)}%</span>
      </div>

      <div
        style={{ flex:1, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', cursor: dragging ? 'grabbing' : 'grab', position:'relative' }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {url && (
          <img
            ref={imgRef}
            src={url}
            onLoad={onImgLoad}
            style={{
              maxWidth: fitMode ? '100%' : 'none',
              maxHeight: fitMode ? '100%' : 'none',
              transform: fitMode ? 'none' : `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              pointerEvents: 'none',
              display: 'block',
            }}
            alt={name}
            draggable={false}
          />
        )}
      </div>

      <div style={{ flexShrink:0, padding:'0.2rem 0.75rem', background:'#1a1a1a', borderTop:'1px solid #333', fontSize:11, opacity:0.6 }}>
        {info.w > 0 ? `${info.w} × ${info.h}px` : ''} &nbsp; {filePath}
      </div>
    </div>
  );
};

const run = (...args) => {
  const [body, props, filePath] = args;
  if (!body) {
    const path = filePath || args[2] || '';
    platform.host.execCommand(`service('001-core.layout','open-window')(command('ui.imageviewer'),'${path.replace(/'/g,"\\'")}')`, platform);
    return;
  }
  const container = platform.window.document.createElement('div');
  const root = createRoot(container);
  body.appendChild(container);

  const doc = body.ownerDocument;
  const sheet = new doc.defaultView.CSSStyleSheet();
  sheet.replaceSync(`html,body{margin:0;padding:0;height:100%;width:100%;overflow:hidden;background:#111;}`);
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];

  root.render(React.createElement(ImageViewer, { filePath }));
  props.setWindowView(true);
};

platform.host.registerCommand('ui.imageviewer', run, { icon: 'image', title: 'Image Viewer', fileExtensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif', '.svg'] });
