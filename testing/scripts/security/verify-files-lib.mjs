// Shared helpers for the Phase 1D (TODO 1D) browser checks:
// testing/scripts/security/verify-files-*.mjs. Builds on spike-lib.mjs (bootOS etc.).
import { launch, bootOS, writeVfs, OS_URL } from './spike-lib.mjs';
import { installApp } from './verify-viewers-lib.mjs';

// installApp(page, id): only the preinstalled apps ship in the vfs — this installs one
// from docs/registry.json (as App Manager does) and loads its main.js.
export { launch, bootOS, writeVfs, OS_URL, installApp };

// PASS/FAIL collector; done() prints the summary and returns the failure count.
export const makeReporter = () => {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + String(detail).slice(0, 300) : ''}`);
    return !!ok;
  };
  const done = () => {
    const fails = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - fails} pass, ${fails} fail`);
    return fails;
  };
  return { check, done, results };
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// bootOS + wait until the layout's open-window service and the core apps' commands exist
// (bootOS only waits for the vfs/platform/SW; the layout and CORE_APPS load after that).
export async function bootReady(context, opts) {
  const page = await bootOS(context, opts);
  const ok = await pollFor(() => page.evaluate(() => {
    const h = window.platform && window.platform.host;
    return !!(h && typeof h.getService('001-core.layout', 'open-window') === 'function'
      && h.getCommand('ui.pkg-manager') && h.getCommand('spotlight') && h.getCommand('ui.terminal'));
  }), { timeout: 60000, interval: 500 });
  if (!ok) throw new Error('layout / core apps did not come up');
  await sleep(500);
  return page;
}

// Polls an async predicate (page.waitForFunction never resolves on this page).
export const pollFor = async (fn, { timeout = 10000, interval = 200 } = {}) => {
  const end = Date.now() + timeout;
  let v;
  while (Date.now() < end) {
    try { v = await fn(); } catch (_) { v = undefined; }
    if (v) return v;
    await sleep(interval);
  }
  return v;
};

// Records every Host.openWindow / runFile / exec call into window.__spy. Every Host
// instance and every per-script Host view (Object.create(host)) shares Host.prototype,
// so patching it sees calls from vfs apps too. Values are reduced to JSON-able data.
export const installSpies = (page) => page.evaluate(() => {
  if (window.__spy) return;
  const spy = window.__spy = { openWindow: [], runFile: [], exec: [] };
  const simple = (a) => {
    if (a == null || typeof a !== 'object') return typeof a === 'function' ? '[function]' : a;
    if (Array.isArray(a)) return a.map(simple);
    if (a.host && typeof a.name === 'string') return `[platform ${a.name}]`;
    try { return JSON.parse(JSON.stringify(a)); } catch (_) { return '[object]'; }
  };
  let proto = Object.getPrototypeOf(window.platform.host);
  while (proto && !Object.prototype.hasOwnProperty.call(proto, 'openWindow')) proto = Object.getPrototypeOf(proto);
  for (const name of Object.keys(spy)) {
    const orig = proto[name];
    proto[name] = function (...args) { spy[name].push(args.map(simple)); return orig.apply(this, args); };
  }
});
export const resetSpies = (page) => page.evaluate(() => { for (const k of Object.keys(window.__spy)) window.__spy[k].length = 0; });
export const getSpies = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__spy)));

// Dialogs (confirm/prompt/alert) from any frame: answered from a queue, all logged.
export const installDialogs = (page) => {
  const queue = [];
  const log = [];
  page.on('dialog', async (d) => {
    const answer = queue.shift() || { accept: false };
    log.push({ type: d.type(), message: d.message() });
    try { if (answer.accept) await d.accept(answer.text); else await d.dismiss(); } catch (_) {}
  });
  return {
    answer: (...answers) => { queue.push(...answers); },
    log,
    clear: () => { queue.length = 0; log.length = 0; },
  };
};

// First frame (re-searched every call: frames go stale after re-renders) where
// `selector` matches.
export const findFrame = async (page, selector, { timeout = 15000 } = {}) => pollFor(async () => {
  for (const f of page.frames()) {
    try { if (await f.locator(selector).count() > 0) return f; } catch (_) { /* detached */ }
  }
  return null;
}, { timeout, interval: 250 });

// Explorer file item (both explorers render .file-item > .file-name).
export const fileItem = (frame, name) => frame.locator('.file-item').filter({
  has: frame.locator('.file-name', { hasText: name }),
}).filter({ hasText: name }).first();

// Clicks the context-menu entry with this exact title (top document, rendered by the layout).
export const clickMenu = async (page, title, { timeout = 5000 } = {}) => {
  const btn = await pollFor(async () => {
    // The layout shows the menu hidden for one tick while it measures/positions it; a forced
    // click in that window falls through to whatever is underneath.
    const shown = await page.evaluate(() => {
      const m = document.querySelector('.contextmenu');
      if (!m) return false;
      const cs = getComputedStyle(m);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    });
    if (!shown) return null;
    const all = page.locator('.contextmenu button');
    const n = await all.count();
    for (let i = 0; i < n; i++) {
      if ((await all.nth(i).innerText()).trim() === title) return all.nth(i);
    }
    return null;
  }, { timeout });
  if (!btn) return false;
  await btn.click({ force: true });
  return true;
};

export const menuTitles = (page) => page.evaluate(() =>
  [...document.querySelectorAll('.contextmenu button')].map((b) => b.innerText.trim()));

export const closeMenu = (page) => page.evaluate(() => {
  const m = document.querySelector('.contextmenu');
  if (m) m.style.display = 'none';
});

// Closes every window (header close buttons in the top document).
export const closeAllWindows = async (page) => {
  await page.evaluate(() => document.querySelectorAll('.window .wm-close').forEach((b) => b.click()));
  await pollFor(() => page.evaluate(() => document.querySelectorAll('.window .wm-close').length === 0), { timeout: 3000 });
  await sleep(150);
};

export const vfs = {
  exists: (page, p) => page.evaluate((p) => window.fs.existsSync(p), p),
  read: (page, p) => page.evaluate((p) => window.fs.readFileSync(p, 'utf8'), p),
  ls: (page, p) => page.evaluate((p) => { try { return window.fs.readdirSync(p); } catch (_) { return null; } }, p),
  rm: (page, p) => page.evaluate((p) => {
    const fs = window.fs;
    const rm = (x) => { if (!fs.existsSync(x)) return; if (fs.statSync(x).isDirectory()) { for (const n of fs.readdirSync(x)) rm(x + '/' + n); fs.rmdirSync(x); } else fs.unlinkSync(x); };
    rm(p);
  }, p),
  mkdir: (page, p) => page.evaluate((p) => { const fs = window.fs; let cur = ''; for (const s of p.split('/').filter(Boolean)) { cur += '/' + s; if (!fs.existsSync(cur)) fs.mkdirSync(cur); } }, p),
  writeBytes: (page, p, bytes) => page.evaluate(({ p, b }) => window.fs.writeFileSync(p, window.Buffer ? window.Buffer.from(b) : new Uint8Array(b)), { p, b: Array.from(bytes) }),
};
