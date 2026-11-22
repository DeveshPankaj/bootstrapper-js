#!/usr/bin/env node
// Annotates docs/public/mount/meta.json — the list of files the kernel keeps in the
// browser's vfs (src/kernel/vfs.ts, bootstrapMetaFiles) — so boot downloads as little
// as possible:
//
//   sha256  hash of the deployed file. A system file (force_reload: true) is
//           downloaded only when it's missing or its vfs copy differs from this hash,
//           instead of on every boot.
//   when    "boot" — needed to show the landing page (desktop, layout, docks, boot
//           scripts, widgets, icons); fetched before the desktop appears.
//           "background" — everything else; fetched after the landing page is ready,
//           with the small spinner in the bottom-right corner.
//   app     the app id, for files of a preinstalled app (/opt/apps/<id>/… other than the
//           system shell apps below). Fetched once if missing and never refreshed at
//           boot — updates come from App Manager (Update / Reinstall). Apps that aren't
//           preinstalled are not listed in meta.json at all; App Manager installs them
//           from docs/registry.json.
//
// Runs automatically on every webpack build (webpack.config.js). Idempotent.
//
//   node scripts/gen-meta-manifest.mjs          rewrite docs/public/mount/meta.json
//   node scripts/gen-meta-manifest.mjs --check  exit 1 if anything is missing or stale
//
// No dependencies (Node >= 18).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOUNT = join(ROOT, 'docs', 'public', 'mount');
const META = join(MOUNT, 'meta.json');
const CHECK = process.argv.includes('--check');

// Apps that are part of the shell itself: kept in sync with every deploy like other
// system files (by hash, so unchanged files cost nothing).
const SYSTEM_APPS = new Set([
  'file-explorer', 'pkg-manager', 'app-drawer', 'spotlight',
  'terminal', 'settings', 'image-viewer', 'dock',
]);

// Files the landing page doesn't need: synced in the background after it is shown.
const BACKGROUND = [
  /^\/bin\//,                       // shell commands — used once a terminal is open
  /^\/lib\//,                       // legacy helpers, not loaded at boot
  /^\/usr\/lib\/(?!ipc\.js$)/,      // libraries apps load on demand (ipc.js: docks need it at boot)
  /^\/usr\/bin\/(?!deeplink\.js$)/, // deeplink.js runs at boot from initd.run
  /^\/etc\/settings\//,             // Settings pages — loaded when Settings opens
  /^\/opt\/wm\//,                   // window styles, desktop variants, window behaviour:
  /^\/opt\/desktop\//,              //   these run from the shipped static copy,
  /^\/opt\/window-manager\.js$/,    //   the vfs copies are view-only
  /^\/opt\/cron\//,                 // cron jobs — first run is a minute after boot
];

const appOf = (path) => {
  const m = /^\/opt\/apps\/([^/]+)\//.exec(path);
  return m && !SYSTEM_APPS.has(m[1]) ? m[1] : null;
};
const whenOf = (path) => (appOf(path) || BACKGROUND.some((re) => re.test(path)) ? 'background' : 'boot');

const localFileFor = (file) => {
  if (typeof file !== 'string' || !file.startsWith('/')) return null;
  const abs = resolve(MOUNT, '.' + file);
  return abs.startsWith(MOUNT + sep) ? abs : null;
};
const sha256 = (abs) => createHash('sha256').update(readFileSync(abs)).digest('hex');

const raw = readFileSync(META, 'utf8');
const entries = JSON.parse(raw);
const problems = [];
let changed = 0;

const next = entries.map((entry) => {
  const abs = localFileFor(entry.file);
  if (!abs || !existsSync(abs)) { problems.push(`no deployed file for ${entry.path} (file: ${entry.file})`); return entry; }
  const out = { path: entry.path, file: entry.file };
  if ('force_reload' in entry) out.force_reload = entry.force_reload;
  // meta.json lists itself; the kernel writes the copy it just downloaded, so that
  // entry carries no hash (hashing it would change the file it is written into).
  if (entry.file !== '/meta.json') out.sha256 = sha256(abs);
  out.when = whenOf(entry.path);
  const app = appOf(entry.path);
  if (app) out.app = app;
  if (JSON.stringify(out) !== JSON.stringify(entry)) changed++;
  return out;
});

const text = JSON.stringify(next, null, 2) + (raw.endsWith('\n') ? '\n' : '');
if (CHECK) {
  if (problems.length || text !== raw) {
    for (const p of problems) console.error('meta.json:', p);
    if (text !== raw) console.error(`meta.json: ${changed} entr${changed === 1 ? 'y is' : 'ies are'} missing or stale — run node scripts/gen-meta-manifest.mjs`);
    process.exit(1);
  }
  console.log(`meta.json up to date (${next.length} entries)`);
} else {
  for (const p of problems) console.warn('meta.json:', p);
  if (text !== raw) writeFileSync(META, text);
  const counts = next.reduce((acc, e) => { acc[e.when] = (acc[e.when] || 0) + 1; if (e.app) acc.app++; return acc; }, { app: 0 });
  console.log(text !== raw
    ? `docs/public/mount/meta.json updated: ${changed} entries (${counts.boot} boot, ${counts.background} background, ${counts.app} app files)`
    : `docs/public/mount/meta.json unchanged (${next.length} entries)`);
}
