// Shared harness for the security regression suite (testing/scripts/security/test-*.mjs).
//
// Every test script:
//   - launches Chromium with storage partitioning ON (launchRealistic, like real browsers),
//   - boots the OS from BASE_URL (env, default http://localhost:8080) in a fresh context,
//   - drives it through structured calls / the real UI, and
//   - prints one line per check:  RESULT <FINDING-ID> <PASS|FAIL|ERROR> [<phase>] <check> :: <detail>
//
// Phases: `phase1` = must pass once TODO 1A–1F land; `phase2` = only the sandbox runtime fixes it
// (reported separately, never a phase-1 failure); `info` = informational, never gates anything.
// ERROR = the check could not be carried out (harness/UI problem) — neither proof of a bug nor of a fix.
//
// Tests assert security properties (a sentinel stays unset, nothing is written outside a folder,
// no reply arrives), never UI details the fix owners may choose differently.
import http from 'node:http';
import { launchRealistic, launch as launchPlain, addFrame, removeFrame, PROBE_HELPERS } from '../spike-lib.mjs';

export { addFrame, removeFrame, PROBE_HELPERS, launchPlain };

export const BASE_URL = (process.env.BASE_URL || process.env.OS_URL || 'http://localhost:8080').replace(/\/+$/, '');
export const BASE = new URL(BASE_URL);
// 127.0.0.1 and localhost are different sites, so an attacker server on the other name is
// cross-site to the OS even on the same port.
export const ATTACKER_HOST = BASE.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls async `fn` until it returns a truthy value or `ms` passes; returns the last value. */
export async function pollFor(fn, ms = 10000, step = 250) {
  const end = Date.now() + ms;
  let v;
  for (;;) {
    v = await Promise.resolve().then(fn).catch(() => null);
    if (v) return v;
    if (Date.now() > end) return v;
    await sleep(step);
  }
}

const short = (v, n = 300) => {
  const s = typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch (_) { return String(v); } })();
  return (s === undefined ? '' : s).replace(/\s+/g, ' ').slice(0, n);
};

// ── reporting ────────────────────────────────────────────────────────────────
const results = [];
export const allResults = () => results.slice();

/**
 * Prints `RESULT <id> <PASS|FAIL|ERROR> [<phase>] <check> :: <detail>`.
 * pass: true → PASS, false → FAIL, null/undefined → ERROR.
 */
export function report(id, pass, detail = '', { phase = 'phase1', check = '' } = {}) {
  const status = pass === true ? 'PASS' : pass === false ? 'FAIL' : 'ERROR';
  results.push({ id, status, phase, check, detail: short(detail, 600) });
  console.log(`RESULT ${id} ${status} [${phase}] ${check || '-'} :: ${short(detail, 600)}`);
  return pass;
}

/**
 * Runs one check. `fn` returns { pass, detail } (pass true/false/null) or throws (→ ERROR).
 * Never throws, so one broken check doesn't abort the rest of a script.
 */
export async function step(id, check, fn, { phase = 'phase1' } = {}) {
  try {
    const r = await fn();
    if (!r || typeof r !== 'object') return report(id, null, 'check returned nothing', { phase, check });
    return report(id, r.pass, r.detail ?? '', { phase, check });
  } catch (e) {
    return report(id, null, 'exception: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)), { phase, check });
  }
}

/** Prints a per-script summary and exits 0 (run-all parses the RESULT lines, not the exit code). */
export function done(label) {
  const by = (s) => results.filter((r) => r.status === s).length;
  console.log(`\nSUMMARY ${label}: ${by('PASS')} pass, ${by('FAIL')} fail, ${by('ERROR')} error (${results.length} checks)`);
  process.exit(0);
}

// ── browser / boot ───────────────────────────────────────────────────────────
export const launch = (args = []) => launchRealistic(args);

/** Records dialogs on `page` and answers them by page.__dialogPolicy ('dismiss' default | 'accept' | fn). */
export function instrument(page) {
  if (page.__instrumented) return page;
  page.__instrumented = true;
  page.__dialogs = [];
  page.__errors = [];
  page.__console = [];
  page.__dialogPolicy = page.__dialogPolicy || 'dismiss';
  page.on('dialog', async (d) => {
    page.__dialogs.push({ type: d.type(), message: d.message() });
    try {
      const pol = page.__dialogPolicy;
      if (typeof pol === 'function') await pol(d);
      else if (pol === 'accept') await d.accept();
      else await d.dismiss();
    } catch (_) {}
  });
  page.on('pageerror', (e) => page.__errors.push(String(e && e.message || e).slice(0, 300)));
  page.on('console', (m) => { if (page.__console.length < 400) page.__console.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  return page;
}

/** In-page: is the OS booted (vfs + platform + SW controller + desktop + explorer command)? */
export const isBooted = (page) => page.evaluate(() => {
  try {
    const fs = window.fs || (window.platform && window.platform.host && window.platform.host.getFS());
    return !!(fs && window.platform && window.platform.host && navigator.serviceWorker.controller
      && document.querySelector('.content-area') && window.platform.host.getCommand('explorer'));
  } catch (_) { return false; }
}).catch(() => false);

/** Waits until the already-navigated page has booted. Returns true/false. */
export async function waitBooted(page, timeout = 120000) {
  const ok = await pollFor(() => isBooted(page), timeout, 500);
  if (ok) await sleep(2000); // let initd / CORE_APPS finish registering
  return !!ok;
}

/**
 * Opens a new page in `context`, loads `url` + 2 reloads (first-load SW quirk, CLAUDE.md) and
 * waits for the OS to boot. `reloads: 0` for URLs whose effect must happen exactly once.
 */
export async function boot(context, { url = BASE_URL + '/', reloads = 2, timeout = 120000, dialogPolicy = 'dismiss', page } = {}) {
  page = page || await context.newPage();
  page.__dialogPolicy = dialogPolicy;
  instrument(page);
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  for (let i = 0; i < reloads; i++) await page.reload({ waitUntil: 'load', timeout: 60000 });
  if (!(await waitBooted(page, timeout))) throw new Error('OS did not boot within ' + timeout + 'ms at ' + url);
  return page;
}

/** Launches a browser + fresh context; returns { browser, context, close }. */
export async function newSession({ args = [], contextOptions = {} } = {}) {
  const browser = await launch(args);
  const context = await browser.newContext(contextOptions);
  context.on('page', (p) => instrument(p));
  return { browser, context, close: async () => { await context.close().catch(() => {}); await browser.close().catch(() => {}); } };
}

// ── vfs helpers (through the top page's fs) ─────────────────────────────────

/** files: { path: string | { base64 } } — parent folders are created segment by segment. */
export async function vfsWrite(page, files) {
  return page.evaluate(({ files }) => {
    const fs = window.fs || window.platform.host.getFS();
    for (const [p, c] of Object.entries(files)) {
      let cur = '';
      for (const part of p.split('/').slice(1, -1)) { cur += '/' + part; if (!fs.existsSync(cur)) fs.mkdirSync(cur); }
      const data = c && typeof c === 'object' && c.base64 !== undefined ? Buffer.from(c.base64, 'base64') : c;
      fs.writeFileSync(p, data);
    }
    return true;
  }, { files });
}
export async function vfsMkdirp(page, dir) {
  return page.evaluate(({ dir }) => {
    const fs = window.fs || window.platform.host.getFS();
    let cur = '';
    for (const part of dir.split('/').filter(Boolean)) { cur += '/' + part; if (!fs.existsSync(cur)) fs.mkdirSync(cur); }
    return true;
  }, { dir });
}
export const vfsRead = (page, p) => page.evaluate(({ p }) => {
  const fs = window.fs || window.platform.host.getFS();
  try { return fs.existsSync(p) && fs.statSync(p).isFile() ? fs.readFileSync(p, 'utf8') : null; } catch (_) { return null; }
}, { p });
export const vfsExists = (page, p) => page.evaluate(({ p }) => { try { return (window.fs || window.platform.host.getFS()).existsSync(p); } catch (_) { return false; } }, { p });
export const vfsList = (page, p) => page.evaluate(({ p }) => { try { return (window.fs || window.platform.host.getFS()).readdirSync(p); } catch (_) { return null; } }, { p });
export const vfsRm = (page, p) => page.evaluate(({ p }) => {
  const fs = window.fs || window.platform.host.getFS();
  const rm = (x) => { let st; try { st = fs.statSync(x); } catch (_) { return; } if (st.isDirectory()) { for (const n of fs.readdirSync(x)) rm(x + '/' + n); fs.rmdirSync(x); } else fs.unlinkSync(x); };
  rm(p); return true;
}, { p });

/** Every vfs file (outside /proc, ≤ 64 KB) whose content contains `marker`. */
export const vfsFindMarker = (page, marker, root = '/') => page.evaluate(({ marker, root }) => {
  const fs = window.fs || window.platform.host.getFS();
  const hits = [], seen = new Set();
  const walk = (dir, depth) => {
    if (depth > 12 || seen.has(dir)) return; seen.add(dir);
    let names = []; try { names = fs.readdirSync(dir); } catch (_) { return; }
    for (const n of names) {
      const p = (dir === '/' ? '' : dir) + '/' + n;
      if (p === '/proc') continue;
      let st; try { st = fs.statSync(p); } catch (_) { continue; }
      if (st.isDirectory()) walk(p, depth + 1);
      else if (st.size <= 65536) { try { if (String(fs.readFileSync(p, 'utf8')).includes(marker)) hits.push(p); } catch (_) {} }
    }
  };
  walk(root, 0);
  return hits;
}, { marker, root });

export const isInside = (base, p) => p === base || p.startsWith(base.replace(/\/+$/, '') + '/');

// ── windows, commands, frames ────────────────────────────────────────────────
/** Opens a window for `command` with plain values (never DSL source). Retries until the layout is up. */
export async function openWindow(page, command, ...args) {
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(({ c, a }) => {
      try {
        const host = window.platform.host;
        if (!host.getCommand(c)) return false;
        if (typeof host.openWindow === 'function') { host.openWindow(c, ...a); return true; }
        const open = host.getService('001-core.layout', 'open-window');
        if (typeof open !== 'function') return false;
        open(host.getCommand(c), ...a);
        return true;
      } catch (_) { return false; }
    }, { c: command, a: args }).catch(() => false);
    if (ok) return true;
    await sleep(500);
  }
  return false;
}

export const waitForCommand = (page, name, ms = 30000) =>
  pollFor(() => page.evaluate((n) => !!(window.platform && window.platform.host.getCommand(n)), name), ms, 400);

/**
 * Makes sure app `id` is installed and `command` registered. Only the preinstalled apps
 * ship in the vfs, so an app the user hasn't installed is installed first, the way App
 * Manager does it: the registry entry's files are downloaded, checked against their
 * sha256 and written to /opt/apps/<id>/. Then its main.js is loaded the way
 * pkg-manager/loader.js does.
 */
export async function ensureApp(page, id, command) {
  if (await page.evaluate((c) => !!window.platform.host.getCommand(c), command)) return true;
  const installError = await page.evaluate(async ({ id }) => {
    const fs = window.fs || window.platform.host.getFS();
    if (fs.existsSync(`/opt/apps/${id}/main.js`)) return '';
    try {
      const registry = await (await fetch('/registry.json', { cache: 'no-cache' })).json();
      const app = (registry.apps || []).find((a) => a.id === id);
      if (!app) return `${id} is not in the registry`;
      const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      const files = [];
      for (const f of app.files) {
        const data = await (await fetch(f.src)).arrayBuffer();
        if (f.sha256 && hex(await crypto.subtle.digest('SHA-256', data)) !== f.sha256) return `integrity check failed for ${f.dest}`;
        files.push({ dest: `/opt/apps/${id}/${f.dest}`, data });
      }
      for (const f of files) {
        // segment by segment: BrowserFS's recursive mkdir fails with 2+ missing levels
        let cur = '';
        for (const part of f.dest.split('/').slice(1, -1)) { cur += '/' + part; if (!fs.existsSync(cur)) fs.mkdirSync(cur); }
        fs.writeFileSync(f.dest, Buffer.from(f.data));
      }
      return '';
    } catch (e) { return String(e && e.message || e); }
  }, { id });
  if (installError) { console.warn('ensureApp: install failed:', id, installError); return false; }
  await page.evaluate(({ id }) => {
    const p = window.platform;
    p._appDir = `/opt/apps/${id}`;
    try { p.host.exec(p, `/opt/apps/${id}/main.js`); } catch (e) { console.warn('ensureApp', id, e); } finally { delete p._appDir; }
  }, { id });
  return !!(await waitForCommand(page, command, 10000));
}

export const windowNames = (page) => page.evaluate(() => [...document.querySelectorAll('.window[data-name]')].map((w) => w.getAttribute('data-name')));
export const closeAllWindows = (page) => page.evaluate(() => {
  for (const w of document.querySelectorAll('.window')) {
    const btn = w.querySelector('.wm-close, [title="close window"]');
    try { if (btn) btn.click(); } catch (_) {}
  }
  for (const w of document.querySelectorAll('.window')) w.remove();
}).catch(() => {});

/** First frame (any depth) matching all given conditions. */
export async function findFrame(page, { urlPart, urlPrefix, selector, text, predicate, timeout = 20000 } = {}) {
  return pollFor(async () => {
    for (const f of page.frames()) {
      let url = '';
      try { url = f.url(); } catch (_) { continue; }
      if (urlPart && !url.includes(urlPart)) continue;
      if (urlPrefix && !url.startsWith(urlPrefix)) continue;
      if (selector || text) {
        const loc = selector ? (text ? f.locator(selector, { hasText: text }) : f.locator(selector)) : f.locator(`text=${text}`);
        if (!(await loc.count().catch(() => 0))) continue;
      }
      if (predicate && !(await f.evaluate(predicate).catch(() => false))) continue;
      return f;
    }
    return null;
  }, timeout, 300);
}

/** The content frame of the first `.window[data-name="<name>"]` window. */
export async function windowFrame(page, name, timeout = 15000) {
  return pollFor(async () => {
    const h = await page.$(`.window[data-name="${name}"] iframe`);
    return h ? await h.contentFrame() : null;
  }, timeout, 300);
}

/** Names of globals on the top window starting with `prefix` (sentinels). */
export const sentinels = (page, prefix = '__sec_') => page.evaluate((p) => Object.keys(window).filter((k) => k.startsWith(p)), prefix).catch(() => ['<page gone>']);
/** Same, in every frame we can evaluate in (same-origin or opaque). */
export async function sentinelsAnywhere(page, prefix = '__sec_') {
  const out = [];
  for (const f of page.frames()) {
    const ks = await f.evaluate((p) => { try { return Object.keys(window).filter((k) => k.startsWith(p)); } catch (_) { return []; } }, prefix).catch(() => []);
    for (const k of ks) out.push(`${k}@${(f.url() || '').slice(0, 60)}`);
  }
  return out;
}

// ── attacker web server (cross-site to the OS) ──────────────────────────────
/**
 * Throwaway server on a free port, reachable at http://<ATTACKER_HOST>:<port> (cross-site to
 * BASE_URL). routes: { '/path': { status?, headers?, body } | (req, res) => void }.
 * Every response carries Access-Control-Allow-Origin: * so the OS *can* fetch it (a real
 * attacker would do the same) — tests then assert the OS chose not to.
 */
export async function startAttacker(routes = {}) {
  const hits = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    hits.push({ path: u.pathname, search: u.search, method: req.method, at: Date.now() });
    const r = routes[u.pathname];
    const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
    if (!r) { res.writeHead(404, { ...cors, 'Content-Type': 'text/plain' }); res.end('not found'); return; }
    if (typeof r === 'function') { r(req, res, cors); return; }
    const type = u.pathname.endsWith('.js') ? 'application/javascript' : u.pathname.endsWith('.json') ? 'application/json' : 'text/html';
    res.writeHead(r.status || 200, { ...cors, 'Content-Type': type, ...(r.headers || {}) });
    res.end(r.body);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, resolve); });
  const port = server.address().port;
  const origin = `http://${ATTACKER_HOST}:${port}`;
  return {
    origin, port, hits, routes,
    url: (p) => origin + p,
    hitCount: (p) => hits.filter((h) => h.path === p).length,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

/**
 * Script for attacker pages: collects wos-ipc responses / events and sends probes.
 * window.__resp[] gets { id, origin, result, error }; window.__events[] gets kernel broadcasts.
 * __probe(target, tag) asks for the secret, writes /tmp/sec-pwned-<tag>.txt, lists ~ and the windows.
 */
export const IPC_ATTACK_JS = (secretPath) => `
  window.__resp = []; window.__events = []; window.__other = [];
  addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'wos-ipc-response') {
      const r = d.result;
      window.__resp.push({ id: d.id, origin: e.origin, result: typeof r === 'string' ? r.slice(0, 200) : r, error: d.error === undefined ? undefined : String(d.error).slice(0, 200) });
    } else if (d.type === 'wos-ipc-event') window.__events.push({ event: d.event, data: JSON.stringify(d.data).slice(0, 200) });
    else if (window.__other.length < 50) window.__other.push(JSON.stringify(d).slice(0, 200));
  });
  window.__probe = (target, tag) => {
    const send = (id, event, data) => { try { target.postMessage({ type: 'wos-ipc', id, event, data }, '*'); } catch (_) {} };
    send(tag + '-read', 'fs.readText', { path: ${JSON.stringify(secretPath)} });
    send(tag + '-write', 'fs.write', { path: '/tmp/sec-pwned-' + tag + '.txt', content: 'pwned via ' + tag });
    send(tag + '-list', 'fs.list', { path: '/home/user1' });
    send(tag + '-wins', 'wm.getWindows', {});
  };`;

/** True if any collected response is a success (has no error) — i.e. the OS served the sender. */
export const ipcSuccesses = (resp) => (resp || []).filter((r) => r && r.error === undefined);

// ── archives (built in Node so the bytes don't depend on the vfs fflate copy) ──
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
export const crc32 = (buf) => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

/** A stored (method 0) ZIP with the given raw entry names → Buffer. entries: [[name, string|Buffer]] */
export function makeZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6); eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, eocd]);
}

/** /bin/tar.run's own "BOOTAR1" format (see that file) with raw entry paths → Buffer. */
export function makeBootar(entries) {
  const header = [], chunks = [];
  for (const [p, content] of entries) {
    if (content === null) { header.push({ path: p, type: 'dir', size: 0 }); continue; }
    const data = Buffer.from(String(content), 'utf8');
    header.push({ path: p, type: 'file', size: data.length });
    chunks.push(data);
  }
  const h = Buffer.from(JSON.stringify({ version: 1, entries: header }), 'utf8');
  return Buffer.concat([Buffer.from('BOOTAR1\n'), Buffer.from(String(h.length) + '\n'), h, ...chunks]);
}
