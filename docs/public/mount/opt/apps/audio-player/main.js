const platform = window.platform;
const fs = platform.host.getFS();

const MEDIA_EXTS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.mp4', '.mkv', '.webm']);
const AUDIO_EXTS = MEDIA_EXTS;

const MIME_MAP = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.opus': 'audio/ogg; codecs=opus',
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
};

const run = (...args) => {
  const [body, props, filePath] = args;

  if (!body) {
    platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.audioplayer'))", platform);
    return;
  }

  const iframe = platform.window.document.createElement('iframe');
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
  iframe.src = '/(sw)/opt/apps/audio-player/player.html';
  body.appendChild(iframe);

  props.setWindowView(true);
  const r = props.getBoundingClientRect();
  props.setBoundingClientRect({ ...r, right: r.left + 620, bottom: r.top + 400 });

  // Wire drop at the app-shell level (body of this iframe, one level deep from the
  // explorer iframe). getData() works here; it fails inside player.html which is
  // two iframes deep — a Chrome security restriction for nested same-origin frames.
  body.addEventListener('dragover', (e) => {
    const hasDrag = e.dataTransfer.types.includes('application/x-vfs-path') || window.top?.__vfsDragPath;
    if (hasDrag) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  });
  body.addEventListener('drop', async (e) => {
    const path = e.dataTransfer.getData('application/x-vfs-path') || window.top?.__vfsDragPath;
    if (window.top?.__vfsDragPath) window.top.__vfsDragPath = null;
    if (!path) return;
    e.preventDefault();
    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
    if (!AUDIO_EXTS.has(ext)) return;
    try { await iframe.contentWindow?.__playerAddTrack?.(path); } catch(_) {}
  });

  iframe.addEventListener('load', () => {
    const bridge = {
      readFile(path) {
        const buf = fs.readFileSync(path);
        return Array.from(buf);
      },
      listDir(path) {
        try { return fs.readdirSync(path); } catch (_) { return []; }
      },
      statPath(path) {
        try { const s = fs.statSync(path); return { isDirectory: s.isDirectory() }; } catch (_) { return { isDirectory: false }; }
      },
      getMime(ext) { return MIME_MAP[ext] || 'audio/mpeg'; },
      initialPath: filePath || null,
    };
    try { iframe.contentWindow.__playerInit(bridge); } catch (_) {}
  });
};

platform.host.registerCommand('ui.audioplayer', run, {
  title: 'Media Player',
  icon: 'movie',
  fullScreen: false,
  callable: true,
  fileExtensions: ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.mp4', '.mkv', '.webm'],
});
