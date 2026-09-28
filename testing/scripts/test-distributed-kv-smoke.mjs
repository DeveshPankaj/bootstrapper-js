// Smoke test: confirms native ES module imports (relative ./lib/*.js, ../lib/*.js
// paths) resolve correctly when served through the vfs /(sw)/ mechanism for a plain
// (non-sandboxed, ui.iframe-opened) app page, and that the app boots to its ready
// state (window.__kvReady) with no uncaught page errors. Cheap, fast regression check
// to run before the heavier mocked/real mesh suites.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8110;
const URL = `http://localhost:${PORT}`;
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const APP_DIR = '/opt/apps/distributed-kv';
const files = {
  'main.html': fs.readFileSync('docs/public/mount/opt/apps/distributed-kv/main.html', 'utf8'),
  'main.js': fs.readFileSync('docs/public/mount/opt/apps/distributed-kv/main.js', 'utf8'),
  'ui/app.js': fs.readFileSync('docs/public/mount/opt/apps/distributed-kv/ui/app.js', 'utf8'),
  'lib/kv-store.js': fs.readFileSync('docs/public/mount/opt/apps/distributed-kv/lib/kv-store.js', 'utf8'),
  'lib/mesh-client.js': fs.readFileSync('docs/public/mount/opt/apps/distributed-kv/lib/mesh-client.js', 'utf8'),
};

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(URL);
await page.waitForTimeout(3000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.waitForFunction(() => !!window.platform && !!window.platform.host, { timeout: 45000 });

// Inject app files into the live VFS and boot it exactly the way the real launcher
// (main.js -> registerCommand('ui.distributed-kv')) does.
await page.evaluate(({ appDir, files }) => {
  const fs = window.platform.host.getFS();
  const mkdirp = (dir) => { let cur = ''; for (const part of dir.split('/').filter(Boolean)) { cur += '/' + part; try { fs.mkdirSync(cur); } catch (_) {} } };
  mkdirp(appDir);
  mkdirp(appDir + '/lib');
  mkdirp(appDir + '/ui');
  for (const [rel, content] of Object.entries(files)) fs.writeFileSync(appDir + '/' + rel, content);
  window.platform._appDir = appDir;
  window.platform.host.exec(window.platform, appDir + '/main.js');
  delete window.platform._appDir;
}, { appDir: APP_DIR, files });

await page.waitForFunction(() => {
  try { return !!window.platform.host.getService('001-core.layout', 'open-window'); } catch (_) { return false; }
}, { timeout: 30000 });
await page.evaluate(() => {
  window.platform.host.execCommand(
    "service('001-core.layout', 'open-window') (command('ui.distributed-kv'))",
    window.platform
  );
});

// Find the app's iframe among all frames — app.js renders window.__kvReady only once
// its module graph (ui/app.js -> lib/mesh-client.js, lib/kv-store.js) has fully loaded
// and executed.
let appFrame = null;
const t0 = Date.now();
while (Date.now() - t0 < 15000 && !appFrame) {
  for (const fr of page.frames()) {
    try { if (await fr.locator('#kv-form').count()) { appFrame = fr; break; } } catch (_) {}
  }
  if (!appFrame) await sleep(300);
}
check('app frame found', !!appFrame);

if (appFrame) {
  const ready = await (async () => {
    const t1 = Date.now();
    while (Date.now() - t1 < 10000) {
      if (await appFrame.evaluate(() => window.__kvReady === true).catch(() => false)) return true;
      await sleep(200);
    }
    return false;
  })();
  check('ES modules (ui/app.js importing ../lib/kv-store.js and ../lib/mesh-client.js) resolved through /(sw)/ and ran', ready);
  check('mesh-banner rendered some status text', (await appFrame.locator('#mesh-banner').textContent()).length > 0);
}
check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
