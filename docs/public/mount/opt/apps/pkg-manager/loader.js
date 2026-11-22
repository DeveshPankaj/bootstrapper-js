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

// Core apps: the default set, always loaded unless the user explicitly uninstalled
// them. Terminal and Settings are pages (main.html) registered by the shell. Every
// other app is installed from App Manager and loaded through installed.json below.
const CORE_APPS = [
  { id: 'file-explorer', appDir: '/opt/apps/file-explorer', mainFile: '/opt/apps/file-explorer/main.js' },
  { id: 'app-drawer',    appDir: '/opt/apps/app-drawer',    mainFile: '/opt/apps/app-drawer/main.js' },
  { id: 'spotlight',     appDir: '/opt/apps/spotlight',     mainFile: '/opt/apps/spotlight/main.js' },
  { id: 'audio-player',  appDir: '/opt/apps/audio-player',  mainFile: '/opt/apps/audio-player/main.js' },
  { id: 'pkg-manager',   appDir: '/opt/apps/pkg-manager',   mainFile: '/opt/apps/pkg-manager/main.js' },  // App Manager: installs everything else
  { id: 'image-viewer',  appDir: '/opt/apps/image-viewer',  mainFile: '/opt/apps/image-viewer/main.js' }, // File Explorer opens images with it
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

// Load core apps first (skip uninstalled, already loaded, and ones whose files
// haven't arrived yet — see the end of this file)
const loadCoreApps = () => {
  for (const app of CORE_APPS) {
    if (uninstalled.has(app.id) || loaded.has(app.mainFile)) continue;
    if (fs.existsSync(app.mainFile)) {
      loadApp(app.appDir, app.mainFile);
      loaded.add(app.mainFile);
    }
  }
};

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

// Then load all installed apps (skip already-loaded, uninstalled, and not yet arrived)
const loadInstalledApps = () => {
  try {
    const raw = fs.readFileSync(INSTALLED_PATH, 'utf8');
    const installed = JSON.parse(raw || '[]');
    for (const pkg of installed) {
      if (!pkg || typeof pkg.mainFile !== 'string' || !pkg.mainFile.endsWith('.js')) continue;
      const app = installedApp(pkg);
      if (!app) { console.warn('[pkg-loader] skipping', pkg.id, '— main file outside /opt/apps/<id>:', pkg.mainFile); continue; }
      if (loaded.has(app.mainFile) || uninstalled.has(pkg.id) || !fs.existsSync(app.mainFile)) continue;
      loadApp(app.appDir, app.mainFile);
      loaded.add(app.mainFile);
    }
  } catch (_) {}
};

const loadAvailableApps = (always = false) => {
  const before = loaded.size;
  loadCoreApps();
  loadInstalledApps();
  // Apps loaded — hydrate persisted widgets now that their renderers are registered
  if (always || loaded.size !== before) { try { platform.host.callCommand('hydrate-widgets'); } catch (_) {} }
};

loadAvailableApps(true);

// On a first visit the kernel installs preinstalled apps' files in the background,
// after the landing page (src/kernel/vfs.ts); register each app as its files arrive.
platform.window.addEventListener('wos:apps-installed', () => loadAvailableApps());
