// Package loader — boot hook for installed apps (run from /home/user1/initd.run).
//
// The installed apps ARE the folders in /opt/apps: an app is installed when
// /opt/apps/<id>/ holds a main file, so deleting the folder uninstalls it. Each
// folder carries its own manifest, /opt/apps/<id>/app.json
// ({ id, name, version, description, icon, category, author, main, commandName,
// registryUrl, installedAt }), written by App Manager on install and shipped with
// the preinstalled apps.
//
// At boot this scans the folder, loads every app whose main file is a .js, and
// publishes the list as the `pkg.installed-apps` command (App Manager, Spotlight and
// deep links read it). /etc/pkg/installed.json is only a snapshot of that list, kept
// for compatibility; it decides nothing. /etc/pkg/uninstalled.json still hides an app
// the user removed in App Manager whose files the system restores (system apps).
//
// registerCommand calls from each app are idempotent — re-registering is safe.

const platform = window.platform;
const fs = platform.host.getFS();
const { isValidAppId, isInside, normalizePath } = platform.host.pathPolicy;

const APPS_DIR = '/opt/apps';
const SNAPSHOT_PATH = '/etc/pkg/installed.json';
const UNINSTALLED_PATH = '/etc/pkg/uninstalled.json';
const MANIFEST = 'app.json';
// Loaded first, in this order (the explorer command, the launcher, App Manager).
const LOAD_FIRST = ['file-explorer', 'app-drawer', 'spotlight', 'pkg-manager', 'image-viewer', 'audio-player'];
const META_KEYS = ['name', 'version', 'description', 'icon', 'category', 'author', 'commandName', 'registryUrl'];

const readJson = (path, fallback) => {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch (_) { return fallback; }
};
const readList = (path) => { const v = readJson(path, []); return Array.isArray(v) ? v : []; };
const isFile = (path) => { try { return fs.statSync(path).isFile(); } catch (_) { return false; } };
const isDir = (path) => { try { return fs.statSync(path).isDirectory(); } catch (_) { return false; } };

// The app's main file: the manifest's `main` (relative, or an absolute path from an
// old record), else main.js, else main.html — always inside the app's own folder
// (manifests and old records are writable by any app, audit BOOT-5/BOOT-10).
const resolveMain = (appDir, main) => {
  const candidates = [];
  if (typeof main === 'string' && main) candidates.push(main.startsWith('/') ? main : `${appDir}/${main}`);
  candidates.push(`${appDir}/main.js`, `${appDir}/main.html`);
  for (const c of candidates) {
    let p;
    try { p = normalizePath(c); } catch (_) { continue; }
    if (p !== appDir && isInside(appDir, p) && isFile(p)) return p;
  }
  return null;
};

// The installed apps, from the folders. Old installed.json records (before app
// folders carried app.json) fill in metadata for folders that have no manifest yet.
const scanInstalledApps = () => {
  const uninstalled = new Set(readList(UNINSTALLED_PATH));
  const legacy = new Map(readList(SNAPSHOT_PATH).filter((p) => p && isValidAppId(p.id)).map((p) => [p.id, p]));
  let names = [];
  try { names = fs.readdirSync(APPS_DIR); } catch (_) {}
  const apps = [];
  for (const id of names.sort()) {
    if (!isValidAppId(id) || uninstalled.has(id)) continue;
    const appDir = `${APPS_DIR}/${id}`;
    if (!isDir(appDir)) continue;
    const manifest = readJson(`${appDir}/${MANIFEST}`, null);
    const hasManifest = !!(manifest && typeof manifest === 'object' && !Array.isArray(manifest));
    const meta = hasManifest ? manifest : (legacy.get(id) || {});
    const mainFile = resolveMain(appDir, meta.main ?? meta.mainFile);
    if (!mainFile) continue;
    const app = { id, appDir, mainFile, hasManifest };
    for (const key of META_KEYS) if (typeof meta[key] === 'string' && meta[key]) app[key] = meta[key];
    if (!app.name) app.name = id;
    if (Number.isFinite(meta.installedAt)) app.installedAt = meta.installedAt;
    apps.push(app);
  }
  return apps;
};

const manifestOf = (app) => {
  const m = { id: app.id, main: app.mainFile.slice(app.appDir.length + 1) };
  for (const key of META_KEYS) if (app[key]) m[key] = app[key];
  if (app.installedAt) m.installedAt = app.installedAt;
  return m;
};

// Snapshot for compatibility (same record shape installed.json always had).
const writeSnapshot = (apps) => {
  const list = apps.map(({ hasManifest, ...app }) => app);
  const text = JSON.stringify(list, null, 2);
  try {
    if (fs.existsSync(SNAPSHOT_PATH) && fs.readFileSync(SNAPSHOT_PATH, 'utf8') === text) return list;
    if (!fs.existsSync('/etc/pkg')) fs.mkdirSync('/etc/pkg');
    fs.writeFileSync(SNAPSHOT_PATH, text);
  } catch (err) { console.warn('[pkg-loader] could not write the installed-apps snapshot:', err); }
  return list;
};

const listInstalledApps = () => {
  const apps = scanInstalledApps();
  // One-time migration: give folders without a manifest one, from what we know.
  for (const app of apps) {
    if (app.hasManifest) continue;
    try { fs.writeFileSync(`${app.appDir}/${MANIFEST}`, JSON.stringify(manifestOf(app), null, 2)); app.hasManifest = true; }
    catch (_) { /* read-only mount or similar: keep listing it */ }
  }
  return writeSnapshot(apps);
};

platform.host.registerCommand('pkg.installed-apps', () => listInstalledApps(), { callable: false });

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

const loadAvailableApps = (always = false) => {
  const before = loaded.size;
  const apps = listInstalledApps();
  const rank = (id) => { const i = LOAD_FIRST.indexOf(id); return i < 0 ? LOAD_FIRST.length : i; };
  for (const app of [...apps].sort((a, b) => rank(a.id) - rank(b.id))) {
    if (!app.mainFile.endsWith('.js') || loaded.has(app.mainFile)) continue;
    loadApp(app.appDir, app.mainFile);
    loaded.add(app.mainFile);
  }
  // Apps loaded — hydrate persisted widgets now that their renderers are registered
  if (always || loaded.size !== before) { try { platform.host.callCommand('hydrate-widgets'); } catch (_) {} }
};

loadAvailableApps(true);

// On a first visit the kernel delivers preinstalled apps' files in the background,
// after the landing page (src/kernel/vfs.ts); App Manager installs announce
// themselves the same way. Register each app as its files arrive.
platform.window.addEventListener('wos:apps-installed', () => loadAvailableApps());
