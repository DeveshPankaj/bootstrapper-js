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

try {
  const raw = fs.readFileSync(INSTALLED_PATH, 'utf8');
  const installed = JSON.parse(raw || '[]');
  for (const pkg of installed) {
    if (!pkg.mainFile.endsWith('.js')) continue;
    try {
      platform._appDir = pkg.appDir;
      platform.host.exec(platform, pkg.mainFile);
    } catch (e) {
      console.warn('[pkg-loader] failed to load', pkg.id, e);
    } finally {
      delete platform._appDir;
    }
  }
} catch (_) {}
