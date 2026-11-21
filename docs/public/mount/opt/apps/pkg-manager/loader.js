// Package loader — boot hook for installed apps.
// Add this to /.initd.run to auto-load installed packages on startup:
//   service('root', 'exec')('/opt/pkg/loader.js');
//
// pkg-manager.js handles the UI; this file handles boot loading.
// registerCommand calls from each app are idempotent — re-registering
// is safe if this runs after pkg-manager.js for any reason.

const platform = window.platform;
const fs = platform.host.getFS();

const INSTALLED_PATH = '/etc/pkg/installed.json';
const UNINSTALLED_PATH = '/etc/pkg/uninstalled.json';

let uninstalled = new Set();
try { uninstalled = new Set(JSON.parse(fs.readFileSync(UNINSTALLED_PATH, 'utf8') || '[]')); } catch (_) {}

// Core apps that are always loaded unless the user explicitly uninstalled them
const CORE_APPS = [
  { id: 'file-explorer',  appDir: '/opt/apps/file-explorer',  mainFile: '/opt/apps/file-explorer/main.js' },
  { id: 'app-drawer',     appDir: '/opt/apps/app-drawer',     mainFile: '/opt/apps/app-drawer/main.js' },
  { id: 'spotlight',      appDir: '/opt/apps/spotlight',      mainFile: '/opt/apps/spotlight/main.js' },
  { id: 'image-viewer',   appDir: '/opt/apps/image-viewer',   mainFile: '/opt/apps/image-viewer/main.js' },
  { id: 'pkg-manager',    appDir: '/opt/apps/pkg-manager',    mainFile: '/opt/apps/pkg-manager/main.js' },
  { id: 'task-manager',   appDir: '/opt/apps/task-manager',   mainFile: '/opt/apps/task-manager/main.js' },
  { id: 'sqlite-charts',  appDir: '/opt/apps/sqlite-charts',  mainFile: '/opt/apps/sqlite-charts/main.js' },
  { id: 'sqlite-browser', appDir: '/opt/apps/sqlite-browser', mainFile: '/opt/apps/sqlite-browser/main.js' },
  { id: 'audio-player',   appDir: '/opt/apps/audio-player',   mainFile: '/opt/apps/audio-player/main.js' },
  { id: 'colleps',        appDir: '/opt/apps/colleps',        mainFile: '/opt/apps/colleps/main.js' },
  { id: 'trainboard',       appDir: '/opt/apps/trainboard',       mainFile: '/opt/apps/trainboard/main.js' },
  { id: 'nn-ide',           appDir: '/opt/apps/nn-ide',           mainFile: '/opt/apps/nn-ide/main.js' },
  { id: 'model-builder',    appDir: '/opt/apps/model-builder',    mainFile: '/opt/apps/model-builder/main.js' },
  { id: 'snake-game',       appDir: '/opt/apps/snake-game',       mainFile: '/opt/apps/snake-game/main.js' },
  { id: 'snake-lstm',       appDir: '/opt/apps/snake-lstm',       mainFile: '/opt/apps/snake-lstm/main.js' },
  { id: 'snake-qlearning',  appDir: '/opt/apps/snake-qlearning',  mainFile: '/opt/apps/snake-qlearning/main.js' },
  { id: 'snake-cnn3d',      appDir: '/opt/apps/snake-cnn3d',      mainFile: '/opt/apps/snake-cnn3d/main.js' },
  { id: 'app-launcher',   appDir: '/opt/apps/app-launcher',   mainFile: '/opt/apps/app-launcher/main.js' },
  { id: 'vector-store',   appDir: '/opt/apps/vector-store',   mainFile: '/opt/apps/vector-store/main.js' },
  { id: 'ai-dom-lens',    appDir: '/opt/apps/ai-dom-lens',    mainFile: '/opt/apps/ai-dom-lens/main.js' },
  { id: 'webrtc',         appDir: '/opt/apps/webrtc',         mainFile: '/opt/apps/webrtc/main.js' },
  { id: 'remote-machines', appDir: '/opt/apps/remote-machines', mainFile: '/opt/apps/remote-machines/main.js' },
  { id: 'youtube-player', appDir: '/opt/apps/youtube-player', mainFile: '/opt/apps/youtube-player/main.js' },
  { id: 'distributed-compute', appDir: '/opt/apps/distributed-compute', mainFile: '/opt/apps/distributed-compute/main.js' },
  { id: 'distributed-kv',      appDir: '/opt/apps/distributed-kv',      mainFile: '/opt/apps/distributed-kv/main.js' },
  // python-demo is not a core app — install via App Manager
];

const loadApp = (appDir, mainFile) => {
  try {
    platform._appDir = appDir;
    platform.host.exec(platform, mainFile);
  } catch (e) {
    console.warn('[pkg-loader] failed to load', mainFile, e);
  } finally {
    delete platform._appDir;
  }
};

const loaded = new Set();

// Load core apps first (skip uninstalled)
for (const app of CORE_APPS) {
  if (uninstalled.has(app.id)) continue;
  if (fs.existsSync(app.mainFile)) {
    loadApp(app.appDir, app.mainFile);
    loaded.add(app.mainFile);
  }
}

// installed.json is writable by any app, so a record is loaded only when its id is a plain
// app id and its main file lies inside that app's own /opt/apps/<id> folder; its `appDir`
// is derived from the id, never taken from the record (audit BOOT-5/BOOT-10).
const { isValidAppId, isInside, normalizePath } = platform.host.pathPolicy;
const installedApp = (pkg) => {
  if (!pkg || !isValidAppId(pkg.id) || typeof pkg.mainFile !== 'string') return null;
  let mainFile;
  try { mainFile = normalizePath(pkg.mainFile); } catch (_) { return null; }
  const appDir = `/opt/apps/${pkg.id}`;
  return mainFile !== appDir && isInside(appDir, mainFile) ? { appDir, mainFile } : null;
};

// Then load all installed apps (skip already-loaded and uninstalled)
try {
  const raw = fs.readFileSync(INSTALLED_PATH, 'utf8');
  const installed = JSON.parse(raw || '[]');
  for (const pkg of installed) {
    if (!pkg || typeof pkg.mainFile !== 'string' || !pkg.mainFile.endsWith('.js')) continue;
    const app = installedApp(pkg);
    if (!app) { console.warn('[pkg-loader] skipping', pkg.id, '— main file outside /opt/apps/<id>:', pkg.mainFile); continue; }
    if (loaded.has(app.mainFile)) continue;
    if (uninstalled.has(pkg.id)) continue;
    loadApp(app.appDir, app.mainFile);
    loaded.add(app.mainFile);
  }
} catch (_) {}

// All apps loaded — hydrate persisted widgets now that renderers are registered
try { platform.host.callCommand('hydrate-widgets'); } catch (_) {}
