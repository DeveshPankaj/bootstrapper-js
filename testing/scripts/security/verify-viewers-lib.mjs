// Shared helpers for the phase-1F viewer/tool verification scripts (verify-viewers-*.mjs).
// Builds on spike-lib.mjs (bootOS, writeVfs, …). Every script boots the OS in a fresh
// Playwright context, plants hostile content in the vfs, opens the app the way a user
// would (platform.host.openWindow) and checks that a `top.__pwned*` sentinel stays unset.
export * from './spike-lib.mjs';

const results = [];

/** Records one check; prints PASS/FAIL immediately. */
export function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  const d = detail === undefined ? '' : '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d.length > 400 ? d.slice(0, 400) + '…' : d}`);
}

/** Prints the totals and exits 0 when every check passed, 1 otherwise. */
export function finish(label) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${label}: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) console.log('failed: ' + failed.map((r) => r.name).join(' | '));
  process.exit(failed.length ? 1 : 0);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls `fn` (async) until it returns a truthy value or `ms` passes; returns the last value. */
export async function pollFor(fn, ms, step = 250) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn().catch(() => null);
    if (v) return v;
    await sleep(step);
  }
  return v;
}

/**
 * bootOS() + wait until the layout's open-window service exists and the core apps loaded by
 * pkg-manager/loader.js have registered their commands (the shared dev server can be slow).
 */
export async function bootReady(context, opts) {
  const { bootOS } = await import('./spike-lib.mjs');
  const page = await bootOS(context, opts);
  const ok = await pollFor(() => page.evaluate(() => {
    const h = window.platform && window.platform.host;
    return !!(h && typeof h.getService('001-core.layout', 'open-window') === 'function'
      && h.getCommand('ui.audioplayer') && h.getCommand('ui.imageviewer') && h.getCommand('ui.colleps'));
  }), 90000, 500);
  if (!ok) throw new Error('OS booted but the layout / core apps did not register in time');
  await sleep(500);
  return page;
}

/** Opens a window for `command` with values (never DSL source). */
export async function openApp(page, command, ...args) {
  await page.evaluate(({ command, args }) => { window.platform.host.openWindow(command, ...args); }, { command, args });
}

/**
 * Installs a registry app the way App Manager does (each `files[]` entry fetched from its
 * static /public/mount source into /opt/apps/<id>/<dest>), then loads its main.js like
 * pkg-manager/loader.js (platform._appDir set, host.exec of the system executable).
 */
export async function installApp(page, id) {
  return page.evaluate(async (id) => {
    const reg = await (await fetch('/registry.json')).json();
    const app = reg.apps.find((a) => a.id === id);
    if (!app) throw new Error('not in registry: ' + id);
    const fs = window.fs;
    const dir = '/opt/apps/' + id;
    for (const f of app.files) {
      const res = await fetch(f.src);
      if (!res.ok) throw new Error('fetch failed: ' + f.src);
      const p = dir + '/' + f.dest;
      // segment by segment: BrowserFS's recursive mkdir fails with 2+ missing levels
      let cur = '';
      for (const part of p.split('/').slice(1, -1)) { cur += '/' + part; if (!fs.existsSync(cur)) fs.mkdirSync(cur); }
      if (window.Buffer) fs.writeFileSync(p, window.Buffer.from(await res.arrayBuffer()));
      else fs.writeFileSync(p, await res.text());
    }
    if (app.main.endsWith('.js')) {
      const platform = window.platform;
      platform._appDir = dir;
      try { platform.host.exec(platform, dir + '/' + app.main); } finally { delete platform._appDir; }
    }
    return app.files.length;
  }, id);
}

/** Removes every window from the desktop (tests only — no app cleanup). */
export async function closeAllWindows(page) {
  await page.evaluate(() => document.querySelectorAll('.window').forEach((w) => w.remove()));
}

/** First frame whose URL contains `urlPart` and (optionally) that has a match for `selector`. */
export async function findFrame(page, { urlPart, selector, text, timeout = 20000 } = {}) {
  return pollFor(async () => {
    for (const f of page.frames()) {
      if (urlPart && !f.url().includes(urlPart)) continue;
      if (selector) {
        const loc = text ? f.locator(selector, { hasText: text }) : f.locator(selector);
        if (!(await loc.count().catch(() => 0))) continue;
      }
      return f;
    }
    return null;
  }, timeout);
}

/** Names of every `__pwned*` global set on the top window. */
export async function pwnedKeys(page) {
  return page.evaluate(() => Object.keys(window).filter((k) => k.startsWith('__pwned')));
}

/** The vfs-path → content map helper for page.evaluate (mkdir -p + write). */
export async function writeFiles(page, files) {
  await page.evaluate((files) => {
    const fs = window.fs;
    for (const [p, content] of Object.entries(files)) {
      // segment by segment: BrowserFS's recursive mkdir fails with 2+ missing levels
      let cur = '';
      for (const part of p.split('/').slice(1, -1)) { cur += '/' + part; if (!fs.existsSync(cur)) fs.mkdirSync(cur); }
      fs.writeFileSync(p, content);
    }
  }, files);
}
