// App Package Manager — install, manage, and discover apps from registries.
// Registered as command('ui.pkg-manager').
// Boot loading of installed apps is handled by /opt/apps/pkg-manager/loader.js.
// The installed apps are the folders in /opt/apps, each with its own app.json
// manifest; deleting a folder uninstalls that app. installed.json is a snapshot.

const platform = window.platform;
const fs = platform.host.getFS();
const React = platform.getService('React');
const { createRoot } = platform.getService('ReactDOM');
const { useState, useEffect, useCallback, useRef, useMemo } = React;

// ── Constants ────────────────────────────────────────────────────────────────

const INSTALLED_PATH = '/etc/pkg/installed.json';
const REGISTRIES_PATH = '/etc/pkg/registries.json';
const PKG_DIRS = ['/etc/pkg', '/opt/apps'];

// Detect the deployment origin to build the built-in registry URL.
// window.top is the real top-level window (the shim exposes it directly).
const BUILTIN_REGISTRY_URL = (() => {
  try { return window.top.location.origin + '/registry.json'; } catch(_) { return '/registry.json'; }
})();

// Resolve a file src relative to a registry URL (handles paths starting with /).
const resolveFileUrl = (src, registryUrl) => {
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  try { return new URL(src, registryUrl).href; } catch(_) { return src; }
};

// ── Package checks (audit BOOT-4, decisions.md D6) ───────────────────────────
// A registry entry is data from the network: its id names the app's folder and
// its file `dest`s and `main` are joined onto that folder, so all of them are
// validated before anything is fetched or written, and every download is checked
// against the entry's sha256 (docs/registry.json gets them from
// scripts/gen-registry-integrity.mjs).

const SHA256_RE = /^[0-9a-f]{64}$/i;

const appDirFor = (id) => {
  if (!platform.host.pathPolicy.isValidAppId(id)) throw new Error(`invalid app id ${JSON.stringify(id)}`);
  return `/opt/apps/${id}`;
};

// { appDir, files: [{src, dest, destPath, sha256}], mainFile } — or throws.
const planInstall = (appMeta) => {
  const { safeJoin } = platform.host.pathPolicy;
  const appDir = appDirFor(appMeta && appMeta.id);
  const inside = (rel, what) => {
    try { return safeJoin(appDir, rel); }
    catch (_) { throw new Error(`${what} ${JSON.stringify(rel)} is not a path inside ${appDir}`); }
  };
  const files = (Array.isArray(appMeta.files) ? appMeta.files : []).map((file) => {
    if (!file || typeof file.src !== 'string' || !file.src) throw new Error('a file entry has no src');
    if (file.sha256 !== undefined && !(typeof file.sha256 === 'string' && SHA256_RE.test(file.sha256))) {
      throw new Error(`malformed sha256 for ${JSON.stringify(file.dest)}`);
    }
    return { src: file.src, dest: file.dest, destPath: inside(file.dest, 'file destination'), sha256: file.sha256 ? file.sha256.toLowerCase() : null };
  });
  return { appDir, files, mainFile: inside(appMeta.main, 'main file') };
};

const sha256Hex = async (data) => {
  const subtle = typeof crypto !== 'undefined' && crypto.subtle;
  if (!subtle) throw new Error('integrity check unavailable (crypto.subtle needs https or localhost)');
  const digest = await subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
};

// Apps from the built-in registry whose files all carry a sha256 install without
// asking. Anything else — another registry, or a file without a hash — needs the
// user's explicit OK, naming where it comes from.
const confirmInstallSource = (appMeta, registryUrl, files) => {
  const builtIn = registryUrl === BUILTIN_REGISTRY_URL;
  const unhashed = files.filter((f) => !f.sha256).length;
  if (builtIn && !unhashed) return true;
  const reasons = [];
  if (!builtIn) reasons.push(`It comes from a registry that isn't built in:\n${registryUrl}`);
  if (unhashed) reasons.push(`${unhashed} of its ${files.length} file(s) have no integrity hash, so their content can't be verified.`);
  return confirm(`Install "${appMeta.name || appMeta.id}"?\n\n${reasons.join('\n\n')}\n\nInstalled apps run with full access to your files and other apps. Only install apps from sources you trust.`);
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const pick = (obj, keys) => keys.reduce((acc, k) => { acc[k] = obj[k]; return acc; }, {});

// BrowserFS recursive mkdir doesn't reliably create multi-level paths; do it manually.
const mkdirpSync = (dirPath) => {
  const parts = dirPath.split('/').filter(Boolean);
  let cur = '';
  for (const part of parts) {
    cur += '/' + part;
    try { fs.mkdirSync(cur); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
};

const ensureDirs = () => {
  for (const d of PKG_DIRS) {
    try { mkdirpSync(d); } catch (_) {}
  }
};

// The installed apps: loader.js scans /opt/apps and answers `pkg.installed-apps`
// (it also rewrites the installed.json snapshot, read here only as a fallback).
const readInstalled = () => {
  try { const list = platform.host.callCommand('pkg.installed-apps'); if (Array.isArray(list)) return list; } catch (_) {}
  try { return JSON.parse(fs.readFileSync(INSTALLED_PATH, 'utf8') || '[]'); }
  catch (_) { return []; }
};

// Each app folder carries its own manifest, so the folder alone says what is
// installed: /opt/apps/<id>/app.json. The id comes from the validated app id.
const MANIFEST_FILE = 'app.json';
const readManifest = (id) => {
  try { const m = JSON.parse(fs.readFileSync(`${appDirFor(id)}/${MANIFEST_FILE}`, 'utf8')); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; }
  catch (_) { return {}; }
};
const writeManifest = (id, manifest) => {
  fs.writeFileSync(`${appDirFor(id)}/${MANIFEST_FILE}`, JSON.stringify({ ...manifest, id }, null, 2));
};

const UNINSTALLED_PATH = '/etc/pkg/uninstalled.json';

const readUninstalled = () => {
  try { return JSON.parse(fs.readFileSync(UNINSTALLED_PATH, 'utf8') || '[]'); }
  catch (_) { return []; }
};

const writeUninstalled = (list) => {
  ensureDirs();
  fs.writeFileSync(UNINSTALLED_PATH, JSON.stringify(list, null, 2));
};

const readRegistries = () => {
  try { return JSON.parse(fs.readFileSync(REGISTRIES_PATH, 'utf8') || '[]'); }
  catch (_) { return []; }
};

const writeRegistries = (list) => {
  ensureDirs();
  fs.writeFileSync(REGISTRIES_PATH, JSON.stringify(list, null, 2));
};

const deleteDirRecursive = (dir) => {
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = `${dir}/${entry}`;
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          deleteDirRecursive(fullPath);
        } else {
          fs.unlinkSync(fullPath);
        }
      } catch (_) {}
    }
    fs.rmdirSync(dir);
  } catch (_) {}
};

const fmtDate = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

// Compare two dotted version strings numerically per-segment (e.g. "1.10.0" > "1.9.0").
// Returns -1 / 0 / 1. Non-numeric segments fall back to 0.
const parseVersionParts = (v) => String(v || '0').split('.').map(n => parseInt(n, 10) || 0);
const compareVersions = (a, b) => {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
};

// Find the registry entry matching an installed pkg — prefer the registry it was
// originally installed from, fall back to any registry that has the same app id.
const findRegistryMatch = (pkg, registryApps) => {
  const sameReg = registryApps.find(a => a.id === pkg.id && a._registryUrl === pkg.registryUrl);
  if (sameReg) return sameReg;
  return registryApps.find(a => a.id === pkg.id) || null;
};

// Launches an already-installed app — shared by InstalledView and (so an
// installed app can also be opened straight from its Discover card, not
// just from the Installed tab) DiscoverView.
// An installed app's main file, only if it lies inside the app's own /opt/apps/<id>
// folder (installed.json is writable by any app, audit BOOT-10); otherwise null.
const installedMainFile = (pkg) => {
  const { isValidAppId, isInside, normalizePath } = platform.host.pathPolicy;
  if (!pkg || !isValidAppId(pkg.id) || typeof pkg.mainFile !== 'string') return null;
  try {
    const mainFile = normalizePath(pkg.mainFile);
    const appDir = `/opt/apps/${pkg.id}`;
    return mainFile !== appDir && isInside(appDir, mainFile) ? mainFile : null;
  } catch (_) { return null; }
};

const openInstalledApp = (pkg) => {
  try {
    if (pkg.commandName) {
      // The command name comes from writable installed.json: pass it as a value,
      // never as DSL source (audit BOOT-2/KRN-3).
      platform.host.openWindow(pkg.commandName);
    } else {
      // HTML apps or apps without a registered command: open the main file directly
      const mainFile = installedMainFile(pkg);
      if (mainFile) platform.host.exec(platform, mainFile);
      else console.warn('[pkg-manager] not opening a main file outside its app folder:', pkg.id, pkg.mainFile);
    }
  } catch (e) {
    console.warn('[pkg-manager] open failed:', pkg.id, e);
  }
};

// ── Backups / rollback ──────────────────────────────────────────────────────

const BACKUPS_DIR = '/etc/pkg/backups';

// Backups live in /etc/pkg/backups/<id>/<version>/ — id and version are validated
// (single, plain path segments) wherever they are joined into a path (audit BOOT-10).
const readBackupManifest = (id) => {
  if (!platform.host.pathPolicy.isValidAppId(id)) return [];
  try { return JSON.parse(fs.readFileSync(`${BACKUPS_DIR}/${id}/manifest.json`, 'utf8') || '[]'); }
  catch (_) { return []; }
};

const writeBackupManifest = (id, list) => {
  appDirFor(id); // throws on an invalid id
  const dir = `${BACKUPS_DIR}/${id}`;
  mkdirpSync(dir);
  fs.writeFileSync(`${dir}/manifest.json`, JSON.stringify(list, null, 2));
};

// Most recently backed-up version for an app, or null if none exists.
const getLatestBackup = (id) => {
  const list = readBackupManifest(id);
  if (!list.length) return null;
  return list[list.length - 1];
};

// Snapshot an installed app's CURRENT on-disk files (as named by the registry entry's
// `files` array, i.e. the files an update is about to overwrite) into
// /etc/pkg/backups/<id>/<old-version>/<relative-filename>, and record it in that app's
// manifest.json. Best-effort — skips files that don't currently exist. Paths come
// from the validated id (never installed.json's `appDir`), a single-segment
// version and safeJoin'ed `dest`s (audit BOOT-4/BOOT-10).
const backupAppFiles = (pkg, registryApp) => {
  const { safeJoin, isValidName } = platform.host.pathPolicy;
  const oldVersion = String(pkg.version);
  if (!isValidName(oldVersion)) return false;
  const appDir = appDirFor(pkg.id);
  const backupDir = `${BACKUPS_DIR}/${pkg.id}/${oldVersion}`;
  let backedUpAny = false;
  for (const file of (registryApp.files || [])) {
    let srcPath, destPath;
    try { srcPath = safeJoin(appDir, file.dest); destPath = safeJoin(backupDir, file.dest); }
    catch (_) { continue; }
    if (!fs.existsSync(srcPath)) continue;
    try {
      const data = fs.readFileSync(srcPath);
      const parentDir = destPath.split('/').slice(0, -1).join('/');
      mkdirpSync(parentDir);
      fs.writeFileSync(destPath, data);
      backedUpAny = true;
    } catch (e) { console.warn('[pkg-manager] backup failed for', srcPath, e); }
  }
  if (backedUpAny) {
    const manifest = readBackupManifest(pkg.id).filter(b => b.version !== oldVersion);
    manifest.push({ version: oldVersion, backedUpAt: Date.now() });
    writeBackupManifest(pkg.id, manifest);
  }
  return backedUpAny;
};

// Recursively copy every file under `dir` back into `appDir`, preserving relative paths
// (each destination safeJoin'ed onto appDir).
const restoreFilesInto = (dir, appDir, relBase = '') => {
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch (_) { return; }
  for (const entry of entries) {
    const full = `${dir}/${entry}`;
    let stat;
    try { stat = fs.statSync(full); } catch (_) { continue; }
    if (stat.isDirectory()) {
      restoreFilesInto(full, appDir, `${relBase}${entry}/`);
    } else {
      let destPath;
      try { destPath = platform.host.pathPolicy.safeJoin(appDir, `${relBase}${entry}`); } catch (_) { continue; }
      const parentDir = destPath.split('/').slice(0, -1).join('/');
      try {
        mkdirpSync(parentDir);
        const data = fs.readFileSync(full);
        fs.writeFileSync(destPath, data);
      } catch (e) { console.warn('[pkg-manager] restore failed for', full, e); }
    }
  }
};

// Restore the most recently backed-up version's files over the current ones and revert
// the installed.json version field to match. Only this app's own backup folder
// (/etc/pkg/backups/<id>/<version>) is read, and only into /opt/apps/<id> — the folder
// comes from the validated id, never from installed.json's writable `appDir` (BOOT-10).
const rollbackApp = (pkg) => {
  const appDir = appDirFor(pkg.id);
  const latest = getLatestBackup(pkg.id);
  if (!latest) throw new Error('No backup available to roll back to.');
  const version = String(latest.version);
  if (!platform.host.pathPolicy.isValidName(version)) throw new Error(`invalid backup version ${JSON.stringify(latest.version)}`);
  const backupDir = `${BACKUPS_DIR}/${pkg.id}/${version}`;
  restoreFilesInto(backupDir, appDir);

  writeManifest(pkg.id, { ...readManifest(pkg.id), version: latest.version });
  readInstalled(); // refresh the snapshot
};

// ── Install / Uninstall ──────────────────────────────────────────────────────

// Installs (or updates) an app. Validates the entry, asks for consent when the
// source isn't verifiable, downloads and checks every file before writing any of
// them (a bad file never leaves a half-installed app), then runs `beforeWrite`
// (the update's backup) and writes. Returns false when the user declined.
const installApp = async (appMeta, registryUrl, { beforeWrite } = {}) => {
  const { appDir, files, mainFile } = planInstall(appMeta);
  if (!confirmInstallSource(appMeta, registryUrl, files)) return false;

  const downloads = [];
  for (const file of files) {
    const fileUrl = resolveFileUrl(file.src, registryUrl);
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`Failed to fetch ${fileUrl}: ${response.status}`);
    const data = await response.arrayBuffer();
    if (file.sha256) {
      const actual = await sha256Hex(data);
      if (actual !== file.sha256) {
        throw new Error(`integrity check failed for ${file.dest} (sha256 ${actual.slice(0, 12)}…, expected ${file.sha256.slice(0, 12)}…) — nothing was installed`);
      }
    }
    downloads.push({ ...file, data });
  }

  if (beforeWrite) beforeWrite();
  ensureDirs();
  try { mkdirpSync(appDir); } catch (_) {}
  for (const file of downloads) {
    const parentDir = file.destPath.split('/').slice(0, -1).join('/');
    try { mkdirpSync(parentDir); } catch (_) {}
    fs.writeFileSync(file.destPath, Buffer.from(file.data));
  }

  // Use registry-provided commandName as primary source; fall back to dynamic detection.
  // commands$ may be a Subject (no getValue) in some contexts — fall back gracefully.
  let commandName = appMeta.commandName || null;
  if (mainFile.endsWith('.js') || mainFile.endsWith('.run')) {
    let cmdsBefore = new Set();
    if (!commandName) {
      try { cmdsBefore = new Set((platform.host.commands$.getValue() || []).map(c => c.name)); } catch (_) {}
    }
    try {
      // The user just chose to install it (D10: explicit intent → runFile, no second prompt);
      // mainFile is inside /opt/apps/<id> (planInstall).
      platform._appDir = appDir;
      platform.host.runFile(platform, mainFile, [], { confirm: false });
    } catch (e) {
      console.warn('[pkg-manager] failed to load after install:', appMeta.id, e);
    } finally {
      delete platform._appDir;
    }
    if (!commandName) {
      try {
        const newCmd = (platform.host.commands$.getValue() || []).find(c => !cmdsBefore.has(c.name) && c.meta?.title);
        commandName = newCmd?.name || null;
      } catch (_) {}
    }
  }

  const blocked = readUninstalled();
  if (blocked.includes(appMeta.id)) {
    writeUninstalled(blocked.filter(id => id !== appMeta.id));
  }

  writeManifest(appMeta.id, {
    ...pick(appMeta, ['name', 'version', 'description', 'icon', 'category', 'author']),
    main: mainFile.slice(appDir.length + 1),
    ...(commandName ? { commandName } : {}),
    registryUrl,
    installedAt: Date.now(),
  });
  readInstalled(); // refresh the snapshot
  return true;
};

// Removes /opt/apps/<id> — the folder comes from the validated id, never from
// installed.json's `appDir`, which any app can rewrite (audit BOOT-10). Packages'
// pre-uninstall.js hooks are not run: they'd execute package code with full privileges
// at removal time. A record with an invalid id is dropped without deleting anything.
const uninstallApp = async (pkg) => {
  const validId = platform.host.pathPolicy.isValidAppId(pkg && pkg.id);
  if (validId) deleteDirRecursive(appDirFor(pkg.id));
  else console.warn('[pkg-manager] invalid app id, removing its record only:', pkg && pkg.id);

  const blocked = readUninstalled();
  if (validId && !blocked.includes(pkg.id)) {
    blocked.push(pkg.id);
    writeUninstalled(blocked);
  }
  readInstalled(); // refresh the snapshot
};

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
/* Spatial glass look (same --vs-* tokens as Settings and Files). The window paints
   the frosted material (props.setWindowMaterial('glass')); this page is transparent.
   data-appearance comes from platform.host.appearance$ (light / dark). */
:root {
  --vs-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, "Segoe UI", Helvetica, Arial, sans-serif;
  --vs-text: rgba(255, 255, 255, 0.96);
  --vs-text-2: rgba(255, 255, 255, 0.66);
  --vs-text-3: rgba(255, 255, 255, 0.44);
  --vs-fill: rgba(255, 255, 255, 0.075);
  --vs-fill-2: rgba(255, 255, 255, 0.13);
  --vs-fill-3: rgba(255, 255, 255, 0.21);
  --vs-recessed: rgba(0, 0, 0, 0.20);
  --vs-stroke: rgba(255, 255, 255, 0.13);
  --vs-separator: rgba(255, 255, 255, 0.09);
  --vs-sidebar: rgba(255, 255, 255, 0.045);
  --vs-selected-rim: rgba(255, 255, 255, 0.6);
  --vs-strong: rgba(255, 255, 255, 0.94);
  --vs-on-strong: #1c1c1e;
  --vs-scroll: rgba(255, 255, 255, 0.22);
  --vs-dialog-bg: rgba(54, 54, 60, 0.88);
  --vs-danger: #ff7a70;
  --vs-success: #5ee28a;
  --vs-warning: #ffcc66;
  --vs-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
}
:root[data-appearance="light"] {
  --vs-text: rgba(0, 0, 0, 0.86);
  --vs-text-2: rgba(0, 0, 0, 0.56);
  --vs-text-3: rgba(0, 0, 0, 0.38);
  --vs-fill: rgba(255, 255, 255, 0.50);
  --vs-fill-2: rgba(0, 0, 0, 0.06);
  --vs-fill-3: rgba(255, 255, 255, 0.88);
  --vs-recessed: rgba(0, 0, 0, 0.06);
  --vs-stroke: rgba(0, 0, 0, 0.07);
  --vs-separator: rgba(0, 0, 0, 0.08);
  --vs-sidebar: rgba(255, 255, 255, 0.28);
  --vs-selected-rim: rgba(0, 0, 0, 0.22);
  --vs-strong: #1c1c1e;
  --vs-on-strong: #ffffff;
  --vs-scroll: rgba(0, 0, 0, 0.22);
  --vs-dialog-bg: rgba(246, 246, 249, 0.92);
  --vs-danger: #d70015;
  --vs-success: #1f8a3b;
  --vs-warning: #a35200;
}

html, body { background: transparent; }
* { box-sizing: border-box; scrollbar-width: thin; scrollbar-color: var(--vs-scroll) transparent; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: var(--vs-scroll); border-radius: 999px; border: 3px solid transparent; background-clip: padding-box; }
::-webkit-scrollbar-track { background: transparent; }

.pkg-root {
  display: flex;
  height: 100%;
  font-family: var(--vs-font);
  font-size: 13.5px;
  color: var(--vs-text);
  background: transparent;
  overflow: hidden;
  position: relative;
  -webkit-font-smoothing: antialiased;
}

/* Confirm modal */
.pkg-modal-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.pkg-modal {
  background: var(--vs-dialog-bg);
  backdrop-filter: blur(36px) saturate(170%);
  -webkit-backdrop-filter: blur(36px) saturate(170%);
  border-radius: 22px;
  box-shadow: inset 0 0 0 1px var(--vs-stroke), 0 24px 60px rgba(0, 0, 0, 0.35);
  width: 360px;
  max-width: calc(100% - 32px);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pkg-modal-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--vs-text);
}

.pkg-modal-body { font-size: 13px; color: var(--vs-text-2); line-height: 1.5; }
.pkg-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }

/* Update awareness */
.pkg-update-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  background: var(--vs-fill-2);
  color: var(--vs-warning);
  vertical-align: middle;
}
.pkg-update-version { color: var(--vs-warning); font-weight: 600; }
.pkg-btn.update { color: var(--vs-warning); }

/* Sidebar */
.pkg-sidebar {
  width: 190px;
  flex-shrink: 0;
  padding: 14px 10px;
  border-right: 1px solid var(--vs-separator);
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: var(--vs-sidebar);
}

.pkg-sidebar-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--vs-text-3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 6px 12px 4px;
  margin-top: 4px;
}

.pkg-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 12px;
  cursor: pointer;
  color: var(--vs-text);
  font-size: 13px;
  font-weight: 500;
  user-select: none;
  transition: background 0.18s var(--vs-ease);
}
.pkg-nav-item:hover { background: var(--vs-fill); }
.pkg-nav-item.active {
  background: var(--vs-fill-3);
  box-shadow: inset 0 0 0 1px var(--vs-stroke), 0 1px 3px rgba(0, 0, 0, 0.06);
  font-weight: 600;
}
.pkg-nav-item .material-symbols-outlined { font-size: 19px; color: var(--vs-text-2); }
.pkg-nav-item.active .material-symbols-outlined { color: var(--vs-text); }

.pkg-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: var(--vs-fill-2);
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  margin-left: auto;
}

/* Main area */
.pkg-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pkg-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--vs-separator);
  flex-shrink: 0;
}

.pkg-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--vs-text);
  flex: 1;
}

.pkg-search {
  flex: 1;
  max-width: 320px;
  height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  font-size: 13px;
  font-family: inherit;
  color: var(--vs-text);
  background: var(--vs-recessed);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12);
  outline: none;
}
.pkg-search::placeholder { color: var(--vs-text-3); }
.pkg-search:focus { box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12), 0 0 0 2px var(--vs-selected-rim); }

/* Capsule buttons */
.pkg-btn {
  padding: 7px 16px;
  border-radius: 999px;
  border: 0;
  background: var(--vs-fill-2);
  box-shadow: inset 0 0 0 1px var(--vs-stroke);
  color: var(--vs-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.18s var(--vs-ease), transform 0.18s var(--vs-ease);
  white-space: nowrap;
}
.pkg-btn:hover { background: var(--vs-fill-3); }
.pkg-btn:active { transform: scale(0.97); }
.pkg-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
.pkg-btn.primary {
  background: var(--vs-strong);
  box-shadow: none;
  color: var(--vs-on-strong);
  font-weight: 600;
}
.pkg-btn.primary:hover { filter: brightness(1.08); }
.pkg-btn.danger { color: var(--vs-danger); }

/* Scroll content area */
.pkg-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
}

/* App cards grid (Discover) */
.pkg-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

.pkg-card {
  border-radius: 20px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  background: var(--vs-fill);
  box-shadow: inset 0 0 0 1px var(--vs-stroke);
  transition: background 0.18s var(--vs-ease), transform 0.18s var(--vs-ease);
}
.pkg-card:hover { background: var(--vs-fill-2); transform: translateY(-2px); }

.pkg-card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.pkg-card-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--vs-fill-2);
  box-shadow: inset 0 0 0 1px var(--vs-stroke);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--vs-text);
}
.pkg-card-icon .material-symbols-outlined { font-size: 22px; }

.pkg-card-info { flex: 1; min-width: 0; }
.pkg-card-name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pkg-card-author { font-size: 11px; color: var(--vs-text-3); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.pkg-card-desc {
  font-size: 12.5px;
  color: var(--vs-text-2);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pkg-card-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  row-gap: 8px;
  margin-top: 2px;
  flex-wrap: wrap;
}

.pkg-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  background: var(--vs-fill-2);
  color: var(--vs-text-2);
}

.pkg-version { font-size: 11px; color: var(--vs-text-3); margin-left: 2px; }
.pkg-registry-badge {
  font-size: 10px; color: var(--vs-text-2); background: var(--vs-fill-2); padding: 2px 7px;
  border-radius: 999px; margin-left: 2px; cursor: default;
}

.pkg-installed-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--vs-fill-2);
  color: var(--vs-success);
  margin-left: auto;
}
.pkg-installed-badge .material-symbols-outlined { font-size: 14px; }

/* Installed list */
.pkg-list { display: flex; flex-direction: column; gap: 8px; }

.pkg-list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 18px;
  background: var(--vs-fill);
  box-shadow: inset 0 0 0 1px var(--vs-stroke);
  transition: background 0.18s var(--vs-ease);
}
.pkg-list-row:hover { background: var(--vs-fill-2); }

.pkg-list-icon {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--vs-fill-2);
  box-shadow: inset 0 0 0 1px var(--vs-stroke);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--vs-text);
}
.pkg-list-icon .material-symbols-outlined { font-size: 18px; }

.pkg-list-info { flex: 1; min-width: 0; }
.pkg-list-name { font-weight: 600; font-size: 13.5px; }
.pkg-list-meta { font-size: 11px; color: var(--vs-text-3); margin-top: 2px; }

/* Registries */
.pkg-reg-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--vs-fill);
  box-shadow: inset 0 0 0 1px var(--vs-stroke);
  margin-bottom: 6px;
}
.pkg-reg-url {
  flex: 1;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--vs-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pkg-input {
  padding: 8px 12px;
  border: 0;
  border-radius: 12px;
  font-size: 13px;
  color: var(--vs-text);
  background: var(--vs-recessed);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12);
  outline: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  width: 100%;
}
.pkg-input::placeholder { color: var(--vs-text-3); }
.pkg-input:focus { box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12), 0 0 0 2px var(--vs-selected-rim); }

/* States */
.pkg-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 60px 20px;
  color: var(--vs-text-3);
  text-align: center;
}
.pkg-empty .material-symbols-outlined { font-size: 48px; opacity: 0.6; }
.pkg-empty p { margin: 0; font-size: 13px; }

.pkg-error {
  background: var(--vs-fill);
  box-shadow: inset 0 0 0 1px var(--vs-stroke);
  border-radius: 14px;
  padding: 10px 14px;
  color: var(--vs-danger);
  font-size: 12.5px;
  margin-bottom: 12px;
}

.pkg-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--vs-text-2);
  font-size: 13px;
  padding: 20px 0;
}

@keyframes pkg-spin { to { transform: rotate(360deg); } }
.pkg-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--vs-fill-3);
  border-top-color: var(--vs-text);
  border-radius: 50%;
  animation: pkg-spin 0.7s linear infinite;
  flex-shrink: 0;
}

.pkg-note {
  font-size: 12px;
  color: var(--vs-text-2);
  background: var(--vs-fill);
  box-shadow: inset 0 0 0 1px var(--vs-stroke);
  border-radius: 14px;
  padding: 10px 14px;
  line-height: 1.5;
  margin-top: 4px;
}

.pkg-chip {
  font-size: 11px;
  padding: 3px 10px;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-family: inherit;
  color: var(--vs-text-2);
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--vs-stroke);
}
.pkg-chip.active { color: var(--vs-text); font-weight: 600; background: var(--vs-fill-3); box-shadow: inset 0 0 0 1px var(--vs-selected-rim); }

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
  -webkit-font-smoothing: antialiased;
  font-variation-settings: 'FILL' 0, 'wght' 300;
}
`;

// ── Components ────────────────────────────────────────────────────────────────

const Spinner = () => <div className="pkg-spinner" />;

const Icon = ({ name, style }) => (
  <span className="material-symbols-outlined" style={style}>{name}</span>
);

// Small custom confirm modal, matching the app's card/button styling (used instead of
// a native confirm() so it stays visually consistent with the rest of the UI).
const ConfirmModal = ({ icon, title, message, confirmLabel = 'Confirm', danger, busy, onConfirm, onCancel }) => (
  <div className="pkg-modal-overlay" onClick={onCancel}>
    <div className="pkg-modal" onClick={e => e.stopPropagation()}>
      <div className="pkg-modal-title">
        {icon && <Icon name={icon} style={{ fontSize: 18, color: danger ? 'var(--vs-danger)' : 'var(--vs-text-2)' }} />}
        {title}
      </div>
      <div className="pkg-modal-body">{message}</div>
      <div className="pkg-modal-actions">
        <button className="pkg-btn" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className={`pkg-btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} disabled={busy}>
          {busy ? <><Spinner /> Working…</> : confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

// Discover view ───────────────────────────────────────────────────────────────

const DiscoverView = ({ registryApps, installed, loading, fetchError, onInstall, onRequestUninstall, onUpdate, installingId, uninstallingId, updatingId, search, setSearch }) => {

  const installedIds = new Set(installed.map(p => p.id));
  const [regFilter, setRegFilter] = useState('');

  // Unique registry URLs present in the app list
  const registryUrls = useMemo(() => {
    const seen = new Set();
    registryApps.forEach(a => { if (a._registryUrl) seen.add(a._registryUrl); });
    return [...seen];
  }, [registryApps]);

  const registryLabel = url => {
    try { const u = new URL(url); return u.hostname + (u.pathname !== '/' ? u.pathname : ''); } catch(_) { return url; }
  };

  const visible = registryApps.filter(app => {
    if (regFilter && app._registryUrl !== regFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (app.name || '').toLowerCase().includes(q) ||
      (app.description || '').toLowerCase().includes(q) ||
      (app.category || '').toLowerCase().includes(q) ||
      (app.author || '').toLowerCase().includes(q) ||
      (app.id || '').toLowerCase().includes(q)
    );
  });

  return (
    <>
      <div className="pkg-toolbar">
        <span className="pkg-title">Discover</span>
        <input
          className="pkg-search"
          placeholder="Search apps…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      {registryUrls.length > 1 && (
        <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderBottom:'1px solid var(--vs-separator)', flexWrap:'wrap' }}>
          <span style={{ fontSize:11, color:'var(--vs-text-3)', flexShrink:0 }}>Registry:</span>
          <button
            className={`pkg-chip ${regFilter==='' ? 'active' : ''}`}
            onClick={() => setRegFilter('')}
          >All</button>
          {registryUrls.map(url => (
            <button key={url}
              className={`pkg-chip ${regFilter===url ? 'active' : ''}`}
              onClick={() => setRegFilter(regFilter===url ? '' : url)}
              title={url}
            >{registryLabel(url)}</button>
          ))}
        </div>
      )}
      <div className="pkg-scroll">
        {fetchError && <div className="pkg-error">{fetchError}</div>}
        {loading && (
          <div className="pkg-loading">
            <Spinner />
            <span>Fetching registries…</span>
          </div>
        )}
        {!loading && !fetchError && registryApps.length === 0 && (
          <div className="pkg-empty">
            <Icon name="package_2" />
            <p>No apps found. Add a registry in the Registries tab.</p>
          </div>
        )}
        {!loading && visible.length === 0 && registryApps.length > 0 && (
          <div className="pkg-empty">
            <Icon name="search_off" />
            <p>No apps match "{search}"</p>
          </div>
        )}
        {visible.length > 0 && (
          <div className="pkg-cards">
            {visible.map(app => {
              const isInstalled = installedIds.has(app.id);
              const isInstalling = installingId === app.id;
              const installedPkg = isInstalled ? installed.find(p => p.id === app.id) : null;
              const isUpdating = updatingId === app.id;
              const hasUpdate = !!installedPkg && compareVersions(app.version, installedPkg.version) > 0;
              return (
                <div className="pkg-card" key={`${app._registryUrl}::${app.id}`}>
                  <div className="pkg-card-header">
                    <div className="pkg-card-icon">
                      <Icon name={app.icon || 'apps'} />
                    </div>
                    <div className="pkg-card-info">
                      <div className="pkg-card-name">{app.name}</div>
                      <div className="pkg-card-author">{app.author || 'Unknown'}</div>
                    </div>
                  </div>
                  {app.description && (
                    <div className="pkg-card-desc">{app.description}</div>
                  )}
                  <div className="pkg-card-footer">
                    {app.category && <span className="pkg-tag">{app.category}</span>}
                    <span className="pkg-version">v{app.version}</span>
                    <div style={{ flex: 1 }} />
                    {isInstalled ? (
                      <>
                        <button
                          className="pkg-btn"
                          onClick={() => openInstalledApp(installedPkg)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                        >
                          <Icon name="open_in_new" style={{ fontSize: 15 }} /> Open
                        </button>
                        <button
                          className="pkg-btn update"
                          disabled={isUpdating}
                          onClick={() => onUpdate(installedPkg, app)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                          title={hasUpdate ? `Update to v${app.version}` : 'Reinstall this app\'s files from the registry'}
                        >
                          {isUpdating
                            ? <><Spinner /> {hasUpdate ? 'Updating…' : 'Reinstalling…'}</>
                            : <><Icon name="upgrade" style={{ fontSize: 15 }} /> {hasUpdate ? 'Update' : 'Reinstall'}</>}
                        </button>
                        <button
                          className="pkg-btn danger"
                          disabled={uninstallingId === app.id}
                          onClick={() => onRequestUninstall(installedPkg)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                        >
                          {uninstallingId === app.id ? <><Spinner /> Removing…</> : <><Icon name="delete" /> Uninstall</>}
                        </button>
                      </>
                    ) : (
                      <button
                        className="pkg-btn primary"
                        disabled={isInstalling}
                        onClick={() => onInstall(app, app._registryUrl)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                      >
                        {isInstalling ? <><Spinner /> Installing…</> : 'Install'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

// Installed view ──────────────────────────────────────────────────────────────

const InstalledView = ({ installed, registryApps, onRequestUninstall, onUpdate, onRollback, uninstallingId, updatingId, rollingBackId, search, setSearch }) => {

  const filtered = search
    ? installed.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()) || p.id?.toLowerCase().includes(search.toLowerCase()) || p.category?.toLowerCase().includes(search.toLowerCase()))
    : installed;

  return (
    <>
      <div className="pkg-toolbar">
        <span className="pkg-title">Installed</span>
        <span style={{ fontSize: 12, color: 'var(--vs-text-2)' }}>{filtered.length} of {installed.length} app{installed.length !== 1 ? 's' : ''}</span>
        <input className="pkg-search" placeholder="Search installed…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="pkg-scroll">
        {filtered.length === 0 ? (
          <div className="pkg-empty">
            <Icon name={search ? 'search_off' : 'inbox'} />
            <p>{search ? `No results for "${search}"` : 'No apps installed.'}</p>
            {!search && <p style={{ opacity: 0.7 }}>Browse the Discover tab to find apps.</p>}
          </div>
        ) : (
          <div className="pkg-list">
            {filtered.map(pkg => {
              const isUninstalling = uninstallingId === pkg.id;
              const isUpdating = updatingId === pkg.id;
              const isRollingBack = rollingBackId === pkg.id;
              const match = findRegistryMatch(pkg, registryApps);
              const hasUpdate = !!match && compareVersions(match.version, pkg.version) > 0;
              const backup = getLatestBackup(pkg.id);
              const canRollback = !!backup && backup.version !== pkg.version;
              return (
                <div className="pkg-list-row" key={pkg.id}>
                  <div className="pkg-list-icon">
                    <Icon name={pkg.icon || 'apps'} />
                  </div>
                  <div className="pkg-list-info">
                    <div className="pkg-list-name">
                      {pkg.name}
                      {hasUpdate && <span className="pkg-update-badge">Update available</span>}
                    </div>
                    <div className="pkg-list-meta">
                      v{pkg.version}
                      {hasUpdate && <span className="pkg-update-version"> → v{match.version}</span>}
                      {pkg.category && <> · {pkg.category}</>}
                      {pkg.author && <> · {pkg.author}</>}
                      {pkg.installedAt && <> · Installed {fmtDate(pkg.installedAt)}</>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {hasUpdate && (
                      <button
                        className="pkg-btn update"
                        disabled={isUpdating}
                        onClick={() => onUpdate(pkg, match)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                      >
                        {isUpdating ? <><Spinner /> Updating…</> : <><Icon name="upgrade" style={{ fontSize: 15 }} />Update</>}
                      </button>
                    )}
                    {canRollback && (
                      <button
                        className="pkg-btn"
                        disabled={isRollingBack}
                        onClick={() => onRollback(pkg)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                      >
                        {isRollingBack ? <><Spinner /> Rolling back…</> : `Rollback to v${backup.version}`}
                      </button>
                    )}
                    <button
                      className="pkg-btn"
                      onClick={() => openInstalledApp(pkg)}
                    >
                      Open
                    </button>
                    <button
                      className="pkg-btn danger"
                      disabled={isUninstalling}
                      onClick={() => onRequestUninstall(pkg)}
                    >
                      {isUninstalling ? <><Spinner /> Removing…</> : 'Uninstall'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

// Registries view ─────────────────────────────────────────────────────────────

const RegistriesView = ({ registries, onAdd, onRemove, onRefresh, loading }) => {
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef(null);

  const handleAdd = () => {
    const url = inputVal.trim();
    if (!url) return;
    onAdd(url);
    setInputVal('');
  };

  return (
    <>
      <div className="pkg-toolbar">
        <span className="pkg-title">Registries</span>
        <button
          className="pkg-btn"
          onClick={onRefresh}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 5 }}
        >
          {loading ? <><Spinner /> Fetching…</> : <><Icon name="refresh" style={{ fontSize: 15 }} />Refresh</>}
        </button>
      </div>
      <div className="pkg-scroll">
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Add Registry</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              className="pkg-input"
              placeholder="https://example.com/registry.json"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
            <button className="pkg-btn primary" onClick={handleAdd} disabled={!inputVal.trim()}>
              Add
            </button>
          </div>
        </div>

        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
          Built-in Registry
        </div>
        <div className="pkg-reg-row">
          <Icon name="verified" style={{ fontSize: 16, color: 'var(--vs-text-2)', flexShrink: 0 }} />
          <span className="pkg-reg-url" title={BUILTIN_REGISTRY_URL}>{BUILTIN_REGISTRY_URL}</span>
          <span style={{ fontSize: 11, color: 'var(--vs-text-3)', flexShrink: 0 }}>built-in</span>
        </div>

        <div style={{ fontWeight: 600, fontSize: 13, margin: '16px 0 8px' }}>
          Additional Registries
          <span style={{ fontWeight: 400, color: 'var(--vs-text-2)', marginLeft: 6 }}>({registries.length})</span>
        </div>

        {registries.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--vs-text-3)', padding: '8px 0' }}>No additional registries. Add one above.</div>
        ) : (
          registries.map((url, i) => (
            <div className="pkg-reg-row" key={i}>
              <Icon name="public" style={{ fontSize: 16, color: 'var(--vs-text-3)', flexShrink: 0 }} />
              <span className="pkg-reg-url" title={url}>{url}</span>
              <button
                className="pkg-btn danger"
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => onRemove(url)}
              >
                Remove
              </button>
            </div>
          ))
        )}

        <div className="pkg-note" style={{ marginTop: 16 }}>
          Registries must return JSON with <code>name</code>, <code>version</code>, and <code>apps</code> array.
          Each app needs: <code>id</code>, <code>name</code>, <code>version</code>, <code>files</code> (<code>[{'{dest, src}'}]</code>), and <code>main</code>.
          File <code>src</code> can be absolute URLs or paths starting with <code>/</code> (resolved against registry origin).
          The <code>id</code> must be a plain app id, and every <code>dest</code> and <code>main</code> a relative path inside the app's folder.
          A file may carry a <code>sha256</code> (hex) that is verified before install; apps from added registries, or with files
          without one, ask for your confirmation first.
        </div>
      </div>
    </>
  );
};

// ── Main App ──────────────────────────────────────────────────────────────────

const App = ({ initialSearch = '' }) => {
  const [activeTab, setActiveTab] = useState('discover');
  const [registryApps, setRegistryApps] = useState([]);
  const [installed, setInstalled] = useState(() => readInstalled());
  const [registries, setRegistries] = useState(() => readRegistries());
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [installingId, setInstallingId] = useState(null);
  const [uninstallingId, setUninstallingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [rollingBackId, setRollingBackId] = useState(null);
  const [installError, setInstallError] = useState('');
  const [search, setSearch] = useState(initialSearch);
  const [confirmTarget, setConfirmTarget] = useState(null); // pkg pending uninstall confirmation

  const fetchRegistries = useCallback(async (regs) => {
    const userRegs = regs !== undefined ? regs : registries;
    // Always include the built-in registry; dedupe by URL
    const seen = new Set();
    const list = [BUILTIN_REGISTRY_URL, ...userRegs].filter(u => { if (seen.has(u)) return false; seen.add(u); return true; });
    setLoading(true);
    setFetchError('');
    const apps = [];
    const errors = [];
    await Promise.all(list.map(async (url) => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        for (const app of (data.apps || [])) {
          apps.push({ ...app, _registryUrl: url });
        }
      } catch (e) {
        errors.push(`${url}: ${e.message}`);
      }
    }));
    if (errors.length && apps.length === 0) {
      setFetchError(`Failed to fetch ${errors.length} registry(s): ${errors.join('; ')}`);
    }
    setRegistryApps(apps);
    setLoading(false);
  }, [registries]);

  useEffect(() => {
    // Installed view also needs registry data (to detect available updates), so fetch
    // eagerly the first time either tab is visited, reusing the same fetch logic.
    if ((activeTab === 'discover' || activeTab === 'installed') && registryApps.length === 0) {
      fetchRegistries(registries);
    }
  }, [activeTab]);

  const handleInstall = async (appMeta, registryUrl) => {
    setInstallingId(appMeta.id);
    setInstallError('');
    try {
      await installApp(appMeta, registryUrl); // false = the user declined: nothing to report
      setInstalled(readInstalled());
    } catch (e) {
      setInstallError(`Install failed for "${appMeta.name}": ${e.message}`);
    } finally {
      setInstallingId(null);
    }
  };

  const handleUninstall = async (pkg) => {
    setUninstallingId(pkg.id);
    try {
      await uninstallApp(pkg);
      setInstalled(readInstalled());
    } catch (e) {
      console.warn('[pkg-manager] uninstall error:', e);
    } finally {
      setUninstallingId(null);
    }
  };

  // Uninstall always goes through a confirmation step first (native-style modal,
  // matching the app's own UI) rather than removing files immediately.
  const requestUninstall = (pkg) => { if (pkg) setConfirmTarget(pkg); };
  const cancelUninstall = () => setConfirmTarget(null);
  const confirmUninstall = async () => {
    const pkg = confirmTarget;
    setConfirmTarget(null);
    if (pkg) await handleUninstall(pkg);
  };

  // Update re-runs the same install logic against the matching registry entry, after
  // snapshotting the app's current files so it can be rolled back.
  const handleUpdate = async (pkg, registryApp) => {
    const match = registryApp || findRegistryMatch(pkg, registryApps);
    if (!match) return;
    setUpdatingId(pkg.id);
    setInstallError('');
    try {
      // The backup is taken only once the new files are downloaded and verified.
      await installApp(match, match._registryUrl || pkg.registryUrl, { beforeWrite: () => backupAppFiles(pkg, match) });
      setInstalled(readInstalled());
    } catch (e) {
      setInstallError(`Update failed for "${pkg.name}": ${e.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRollback = async (pkg) => {
    setRollingBackId(pkg.id);
    setInstallError('');
    try {
      rollbackApp(pkg);
      setInstalled(readInstalled());
    } catch (e) {
      setInstallError(`Rollback failed for "${pkg.name}": ${e.message}`);
    } finally {
      setRollingBackId(null);
    }
  };

  const handleAddRegistry = (url) => {
    if (registries.includes(url)) return;
    const updated = [...registries, url];
    setRegistries(updated);
    writeRegistries(updated);
  };

  const handleRemoveRegistry = (url) => {
    const updated = registries.filter(r => r !== url);
    setRegistries(updated);
    writeRegistries(updated);
    // Remove apps from that registry from the in-memory list
    setRegistryApps(prev => prev.filter(a => a._registryUrl !== url));
  };

  const handleRefresh = () => fetchRegistries(registries);

  const navItems = [
    { id: 'discover', label: 'Discover', icon: 'explore' },
    { id: 'installed', label: 'Installed', icon: 'deployed_code', badge: installed.length || null },
    { id: 'registries', label: 'Registries', icon: 'dns', badge: registries.length || null },
  ];

  return (
    <div className="pkg-root">
      <nav className="pkg-sidebar">
        <div className="pkg-sidebar-label">App Manager</div>
        {navItems.map(item => (
          <div
            key={item.id}
            className={`pkg-nav-item${activeTab === item.id ? ' active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            <Icon name={item.icon} />
            {item.label}
            {item.badge != null && (
              <span className="pkg-badge">{item.badge}</span>
            )}
          </div>
        ))}
      </nav>
      <div className="pkg-main">
        {installError && (
          <div className="pkg-error" style={{ margin: '10px 16px 0', flexShrink: 0 }}>{installError}</div>
        )}
        {activeTab === 'discover' && (
          <DiscoverView
            registryApps={registryApps}
            installed={installed}
            loading={loading}
            fetchError={fetchError}
            onInstall={handleInstall}
            onRequestUninstall={requestUninstall}
            onUpdate={handleUpdate}
            installingId={installingId}
            uninstallingId={uninstallingId}
            updatingId={updatingId}
            search={search}
            setSearch={setSearch}
          />
        )}
        {activeTab === 'installed' && (
          <InstalledView
            installed={installed}
            registryApps={registryApps}
            onRequestUninstall={requestUninstall}
            onUpdate={handleUpdate}
            onRollback={handleRollback}
            uninstallingId={uninstallingId}
            updatingId={updatingId}
            rollingBackId={rollingBackId}
            search={search}
            setSearch={setSearch}
          />
        )}
        {activeTab === 'registries' && (
          <RegistriesView
            registries={registries}
            onAdd={handleAddRegistry}
            onRemove={handleRemoveRegistry}
            onRefresh={handleRefresh}
            loading={loading}
          />
        )}
      </div>
      {confirmTarget && (
        <ConfirmModal
          icon="warning"
          title="Uninstall app?"
          message={<>This will remove <strong>{confirmTarget.name}</strong> (v{confirmTarget.version}) and delete its files from the filesystem. This can't be undone.</>}
          confirmLabel="Uninstall"
          danger
          busy={uninstallingId === confirmTarget.id}
          onConfirm={confirmUninstall}
          onCancel={cancelUninstall}
        />
      )}
    </div>
  );
};

// ── Window command ────────────────────────────────────────────────────────────

const run = (...args) => {
  const [body, props, initialSearch] = args;
  if (!body) {
    platform.host.openWindow('ui.pkg-manager');
    return;
  }
  const container = platform.window.document.createElement('div');
  container.style.cssText = 'height:100%;display:flex;flex-direction:column;overflow:hidden;';
  const root = createRoot(container);
  body.appendChild(container);
  const win = body.ownerDocument.defaultView;
  const styles = new win.CSSStyleSheet();
  styles.replace(CSS);
  body.ownerDocument.adoptedStyleSheets = [...(body.ownerDocument.adoptedStyleSheets || []), styles];
  root.render(<App initialSearch={typeof initialSearch === 'string' ? initialSearch : ''} />);
  // Spatial glass look, light or dark (Settings › Window Manager › Themes › Mode).
  if (typeof props.setWindowMaterial === 'function') props.setWindowMaterial('glass');
  const docEl = body.ownerDocument.documentElement;
  const appearanceSub = platform.host.appearance$?.subscribe(a => docEl.setAttribute('data-appearance', a));
  win.addEventListener('pagehide', () => appearanceSub?.unsubscribe());
  props.setWindowView(true);
  props.onDestroy(() => setTimeout(() => root.unmount(), 0));
};

platform.host.registerCommand('ui.pkg-manager', run, {
  icon: 'package_2',
  title: 'App Manager',
  fullScreen: false,
  category: 'System',
});
