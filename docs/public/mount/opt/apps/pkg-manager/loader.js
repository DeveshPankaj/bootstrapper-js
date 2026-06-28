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

// Core apps that must always be loaded even if missing from installed.json
// (handles existing VFS that predates the pre-install list)
const CORE_APPS = [
  { appDir: '/opt/apps/file-explorer',  mainFile: '/opt/apps/file-explorer/main.js' },
  { appDir: '/opt/apps/app-drawer',     mainFile: '/opt/apps/app-drawer/main.js' },
  { appDir: '/opt/apps/spotlight',      mainFile: '/opt/apps/spotlight/main.js' },
  { appDir: '/opt/apps/image-viewer',   mainFile: '/opt/apps/image-viewer/main.js' },
  { appDir: '/opt/apps/pkg-manager',    mainFile: '/opt/apps/pkg-manager/main.js' },
  { appDir: '/opt/apps/sqlite-charts',  mainFile: '/opt/apps/sqlite-charts/main.js' },
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

// Load core apps first
for (const app of CORE_APPS) {
  if (fs.existsSync(app.mainFile)) {
    loadApp(app.appDir, app.mainFile);
    loaded.add(app.mainFile);
  }
}

// Then load all installed apps (skipping already-loaded ones)
try {
  const raw = fs.readFileSync(INSTALLED_PATH, 'utf8');
  const installed = JSON.parse(raw || '[]');
  for (const pkg of installed) {
    if (!pkg.mainFile.endsWith('.js')) continue;
    if (loaded.has(pkg.mainFile)) continue;
    loadApp(pkg.appDir, pkg.mainFile);
    loaded.add(pkg.mainFile);
  }
} catch (_) {}
