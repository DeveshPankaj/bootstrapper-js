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
  { id: 'sqlite-charts',  appDir: '/opt/apps/sqlite-charts',  mainFile: '/opt/apps/sqlite-charts/main.js' },
  { id: 'app-launcher',   appDir: '/opt/apps/app-launcher',   mainFile: '/opt/apps/app-launcher/main.js' },
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

// Then load all installed apps (skip already-loaded and uninstalled)
try {
  const raw = fs.readFileSync(INSTALLED_PATH, 'utf8');
  const installed = JSON.parse(raw || '[]');
  for (const pkg of installed) {
    if (!pkg.mainFile.endsWith('.js')) continue;
    if (loaded.has(pkg.mainFile)) continue;
    if (uninstalled.has(pkg.id)) continue;
    loadApp(pkg.appDir, pkg.mainFile);
    loaded.add(pkg.mainFile);
  }
} catch (_) {}

// All apps loaded — hydrate persisted widgets now that renderers are registered
try { platform.host.callCommand('hydrate-widgets'); } catch (_) {}
