// Shared helpers for the sandbox feasibility spike (testing/scripts/security/spike-*.mjs).
//
// Every spike script boots the OS in a fresh Playwright context (fresh IndexedDB/SW),
// appends test iframes straight to the booted top document, and evaluates inside them
// with frame.evaluate() — Playwright can evaluate in opaque-origin frames, which a
// page script cannot.
import { chromium } from 'playwright';
import http from 'node:http';

export const OS_URL = process.env.OS_URL || 'http://localhost:8080';

export const launch = (args = []) => chromium.launch({ args });

// Playwright (1.63) launches Chromium with ThirdPartyStoragePartitioning DISABLED
// (microsoft/playwright#32230), unlike real Chrome/Firefox/Safari. Cross-site embedding tests
// must re-enable it or they'd see the first-party IndexedDB from inside a third-party iframe.
// Mirrors Playwright's default --disable-features list minus that one entry; if a newer
// Playwright changes the list, the ignoreDefaultArgs entry simply won't match.
const PW_DISABLED_FEATURES = ['AvoidUnnecessaryBeforeUnloadCheckSync', 'DestroyProfileOnBrowserClose', 'DialMediaRouteProvider',
  'GlobalMediaControls', 'HttpsUpgrades', 'LensOverlay', 'MediaRouter', 'PaintHolding', 'ThirdPartyStoragePartitioning',
  'BlockOriginHeaderModificationOnRedirect', 'Translate', 'AutoDeElevate', 'OptimizationHints', 'msForceBrowserSignIn',
  'msEdgeUpdateLaunchServicesPreferredVersion'];
export const launchRealistic = (args = []) => chromium.launch({
  ignoreDefaultArgs: ['--disable-features=' + PW_DISABLED_FEATURES.join(',')],
  args: ['--disable-features=' + PW_DISABLED_FEATURES.filter((f) => f !== 'ThirdPartyStoragePartitioning').join(','), ...args],
});

// Apps that were preinstalled before the default set was cut to the essentials
// (2026-11-22). Many per-owner checks here exercise them, so bootOS() installs them
// the way a preinstall would: the registry entry's files, checked against their
// sha256, written to /opt/apps/<id>/, recorded in /etc/pkg/installed.json, then
// loaded by pkg-manager/loader.js through its `wos:apps-installed` event. Apps the
// test has uninstalled (/etc/pkg/uninstalled.json) are left alone. The real default
// set is checked by testing/scripts/test-default-apps.mjs, which doesn't use this.
export const LEGACY_TEST_APPS = [
  'sqlite-browser', 'nn-ide', 'wamp-client', 'sqlite-charts', 'colleps', 'trainboard', 'model-builder',
  'snake-game', 'snake-lstm', 'snake-qlearning', 'snake-cnn3d', 'app-launcher', 'task-manager',
  'vector-store', 'ai-dom-lens', 'webrtc', 'remote-machines', 'youtube-player', 'distributed-compute', 'distributed-kv',
];

export async function installLegacyApps(page, ids = LEGACY_TEST_APPS) {
  const result = await page.evaluate(async (ids) => {
    const fs = window.fs;
    const readList = (p) => { try { const v = JSON.parse(fs.readFileSync(p, 'utf8') || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
    const uninstalled = new Set(readList('/etc/pkg/uninstalled.json'));
    const installed = readList('/etc/pkg/installed.json');
    const registry = await (await fetch('/registry.json', { cache: 'no-cache' })).json();
    const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const mkdirp = (dir) => { let cur = ''; for (const part of dir.split('/').slice(1)) { cur += '/' + part; if (!fs.existsSync(cur)) fs.mkdirSync(cur); } };
    const added = [];
    const errors = [];
    await Promise.all(ids.map(async (id) => {
      if (uninstalled.has(id) || installed.some((p) => p && p.id === id)) return;
      const app = (registry.apps || []).find((a) => a.id === id);
      if (!app) { errors.push(`${id}: not in the registry`); return; }
      try {
        const files = await Promise.all(app.files.map(async (f) => {
          const data = await (await fetch(f.src)).arrayBuffer();
          if (f.sha256 && hex(await crypto.subtle.digest('SHA-256', data)) !== f.sha256) throw new Error(`integrity check failed for ${f.dest}`);
          return { dest: `/opt/apps/${id}/${f.dest}`, data };
        }));
        for (const f of files) { mkdirp(f.dest.slice(0, f.dest.lastIndexOf('/'))); fs.writeFileSync(f.dest, Buffer.from(f.data)); }
        added.push({
          id, name: app.name, version: app.version, description: app.description, icon: app.icon, category: app.category, author: app.author,
          appDir: `/opt/apps/${id}`, mainFile: `/opt/apps/${id}/${app.main}`, commandName: app.commandName || null,
          registryUrl: '/registry.json', installedAt: Date.now(),
        });
      } catch (e) { errors.push(`${id}: ${e.message}`); }
    }));
    if (added.length) {
      fs.writeFileSync('/etc/pkg/installed.json', JSON.stringify([...installed, ...added], null, 2));
      window.dispatchEvent(new CustomEvent('wos:apps-installed', { detail: { ids: added.map((a) => a.id) } }));
    }
    return { added: added.map((a) => a.id), errors };
  }, ids).catch((e) => ({ added: [], errors: [String(e.message || e)] }));
  if (result.errors.length) console.warn('[installLegacyApps]', result.errors.join('; '));
  return result;
}

// goto + 2 reloads (first-load SW quirk, see CLAUDE.md), then wait until the VFS,
// the platform and an active SW controller are all up. Retries across the SW's own
// activation reload (which destroys the execution context mid-wait).
export async function bootOS(context, { url = OS_URL, timeout = 90000, legacyApps = true } = {}) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  // (page.waitForFunction never resolves on this page — its rAF-based polling stalls —
  // so poll with plain evaluate calls instead.)
  const deadline = Date.now() + timeout;
  for (;;) {
    const ready = await page.evaluate(
      () => !!(window.fs && window.platform && window.platform.host && navigator.serviceWorker.controller),
    ).catch(() => false);
    if (ready) break;
    if (Date.now() > deadline) throw new Error('OS did not boot within ' + timeout + 'ms');
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500); // let initd / CORE_APPS finish registering
  if (legacyApps) {
    const { added } = await installLegacyApps(page);
    if (added.length) await page.waitForTimeout(1500); // let the loader register them
  }
  return page;
}

// Append an iframe to the top document. `sandbox: null` → no sandbox attribute at all.
export async function addFrame(page, { name, sandbox = null, allow, allowfullscreen, src, srcdoc }) {
  await page.evaluate(({ name, sandbox, allow, allowfullscreen, src, srcdoc }) => {
    const f = document.createElement('iframe');
    f.name = name;
    if (sandbox !== null) f.setAttribute('sandbox', sandbox);
    if (allow) f.setAttribute('allow', allow);
    if (allowfullscreen) f.setAttribute('allowfullscreen', '');
    f.style.cssText = 'position:fixed;right:4px;bottom:4px;width:320px;height:200px;z-index:2147483647;border:2px solid red;background:#fff';
    if (srcdoc !== undefined) f.srcdoc = srcdoc; else f.src = src;
    document.body.appendChild(f);
  }, { name, sandbox, allow, allowfullscreen, src, srcdoc });
  const deadline = Date.now() + 20000;
  let frame = null;
  while (!frame && Date.now() < deadline) {
    frame = page.frame({ name });
    if (!frame) await page.waitForTimeout(100);
  }
  if (!frame) throw new Error('frame not found: ' + name);
  await frame.waitForLoadState('load').catch(() => {});
  return frame;
}

export async function removeFrame(page, name) {
  await page.evaluate((n) => document.querySelector(`iframe[name="${n}"]`)?.remove(), name);
}

// Write files into the booted OS's vfs (top page has window.fs).
export async function writeVfs(page, files) {
  await page.evaluate((files) => {
    const fs = window.fs;
    for (const [p, content] of Object.entries(files)) {
      const parts = p.split('/').slice(1, -1);
      let cur = '';
      for (const part of parts) {
        cur += '/' + part;
        if (!fs.existsSync(cur)) fs.mkdirSync(cur);
      }
      fs.writeFileSync(p, content);
    }
  }, files);
}

// Throwaway static server. routes: { '/path': {status?, headers?, body} | (req, res) => void }.
// Listens dual-stack so both http://localhost:PORT and http://127.0.0.1:PORT work.
export function startServer(port, routes) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const r = routes[u.pathname];
    if (!r) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
    if (typeof r === 'function') { r(req, res); return; }
    res.writeHead(r.status || 200, r.headers || { 'Content-Type': 'text/html' });
    res.end(r.body);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
}

// try/catch wrapper for code evaluated inside frames; returns 'ALLOWED: …' / 'BLOCKED: …'.
export const PROBE_HELPERS = `
  window.__probe = (fn) => { try { const v = fn(); return 'ALLOWED: ' + String(v).slice(0, 100) } catch (e) { return 'BLOCKED: ' + e.name + ': ' + String(e.message).slice(0, 140) } };
  window.__aprobe = async (fn) => { try { const v = await fn(); return 'ALLOWED: ' + String(v).slice(0, 100) } catch (e) { return 'BLOCKED: ' + e.name + ': ' + String(e.message).slice(0, 140) } };
`;

export const print = (title, obj) => {
  console.log(`\n=== ${title}`);
  for (const [k, v] of Object.entries(obj)) console.log(`  ${k.padEnd(28)} ${typeof v === 'string' ? v : JSON.stringify(v)}`);
};
