// test-distributed-compute.mjs — real-browser Playwright end-to-end test.
// Injects the app's actual vfs files (meta.json/registry.json/loader.js are
// reserved and not yet wired to this app, per the task brief), launches it
// through the real `ui.distributed-compute` command + window-manager path
// (main.js -> ui.iframe -> main.html -> ui/app.js), and drives the real UI:
//   - local-only fallback (zero WebRTC peers) runs the map/reduce example
//     correctly via the actual Run button,
//   - the code editor's content is genuinely used: editing a parameter
//     (chunkSize) in the editor and re-running changes the computed result
//     to match what that edit implies.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:8107';
const APP_DIR = '/opt/apps/distributed-compute';
const LOCAL_DIR = path.resolve('docs/public/mount/opt/apps/distributed-compute');

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else { failures++; console.log(`FAIL: ${label}${extra !== undefined ? ' -- ' + JSON.stringify(extra) : ''}`); }
}

function listFilesRecursive(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

async function findAppFrame(page) {
  for (const frame of page.frames()) {
    try {
      const count = await frame.locator('#run-btn').count();
      if (count > 0) return frame;
    } catch (_) {}
  }
  return null;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('PAGECONSOLE:', msg.text()));
  page.on('pageerror', (err) => console.log('PAGEERROR:', String(err)));
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!(window.platform && window.platform.host), { timeout: 30000 });
  await page.waitForSelector('.content-area', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const relFiles = listFilesRecursive(LOCAL_DIR);
  await page.evaluate(({ appDir, files }) => {
    const fs = window.platform.host.getFS();
    const mkdirp = (p) => {
      const parts = p.split('/').filter(Boolean);
      let cur = '';
      for (const part of parts) {
        cur += '/' + part;
        try { fs.mkdirSync(cur); } catch (e) { if (e.code !== 'EEXIST') throw e; }
      }
    };
    mkdirp(appDir);
    const dirsNeeded = new Set();
    for (const [rel] of files) {
      const parts = rel.split('/');
      if (parts.length > 1) dirsNeeded.add(appDir + '/' + parts.slice(0, -1).join('/'));
    }
    for (const d of dirsNeeded) mkdirp(d);
    for (const [rel, content] of files) fs.writeFileSync(appDir + '/' + rel, content);
  }, {
    appDir: APP_DIR,
    files: relFiles.map((rel) => [rel, fs.readFileSync(path.join(LOCAL_DIR, rel), 'utf8')]),
  });

  // Launch the app through the real command + window-manager path.
  const launch = await page.evaluate(({ appDir }) => {
    try {
      window.platform.host.exec(window.platform, appDir + '/main.js');
      window.platform.host.execCommand(
        "service('001-core.layout', 'open-window') (command('ui.distributed-compute'))",
        window.platform
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, { appDir: APP_DIR });
  check('app launches via ui.distributed-compute command', launch.ok, launch.error);

  await page.waitForTimeout(2000);
  console.log('FRAMES:', page.frames().map((f) => f.url()));
  const frame = await findAppFrame(page);
  check('app window frame found in page.frames()', !!frame);
  if (!frame) { await browser.close(); process.exit(1); }

  await frame.waitForFunction(() => window.__distComputeReady === true, { timeout: 15000 });

  const meshBannerText = await frame.locator('#mesh-banner').textContent();
  check('mesh banner reports local-only (no real bridge / no group) since zero peers are connected', /local-only/i.test(meshBannerText || ''), meshBannerText);

  const rosterText = await frame.locator('#roster-list').textContent();
  check('worker roster shows self as the only available worker', /you/i.test(rosterText || ''), rosterText);

  // --- Run 1: default map/reduce example (unedited) ---
  await frame.locator('#run-btn').click();
  await frame.waitForFunction(() => {
    const el = document.getElementById('result-value');
    return el && el.textContent && el.textContent !== '--';
  }, { timeout: 20000 });
  const result1Text = await frame.locator('#result-value').textContent();
  const result1 = Number(result1Text);
  const expected1 = Array.from({ length: 400 }, (_, i) => i).reduce((a, x) => a + x * x, 0);
  check('local-only run computes the correct default combined result', result1 === expected1, { result1, expected1 });

  // --- Editor genuinely used: shrink the dataset via the editor, re-run ---
  const editedSource = await frame.evaluate(() => window.__distComputeGetSource());
  const smallerSource = editedSource.replace('length: 400', 'length: 50');
  check('editor source contains the expected default dataset length (sanity check before editing)', editedSource.includes('length: 400'));

  await frame.evaluate((src) => window.__distComputeSetSource(src), smallerSource);
  const readBack = await frame.evaluate(() => window.__distComputeGetSource());
  check('editor setValue/getValue round-trips the edited source', readBack.includes('length: 50'));

  await frame.locator('#result-value').evaluate((el) => { el.textContent = '--'; }); // force a visible change so waitFor below is meaningful
  await frame.locator('#run-btn').click();
  await frame.waitForFunction(() => {
    const el = document.getElementById('result-value');
    return el && el.textContent && el.textContent !== '--';
  }, { timeout: 20000 });
  const result2Text = await frame.locator('#result-value').textContent();
  const result2 = Number(result2Text);
  const expected2 = Array.from({ length: 50 }, (_, i) => i).reduce((a, x) => a + x * x, 0);
  check('editing the code editor and re-running changes the result to match the edit', result2 === expected2 && result2 !== expected1, { result2, expected2, expected1 });

  await page.screenshot({ path: 'testing/screenshots/distributed-compute-map-reduce.png' }).catch(() => {});

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
