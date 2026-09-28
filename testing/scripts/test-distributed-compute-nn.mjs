// test-distributed-compute-nn.mjs — real-browser Playwright end-to-end test
// for the neural-net-training example, run through the actual UI (single tab,
// local-only fallback -- zero WebRTC peers connected). Verifies:
//   - selecting the NN example and clicking Run actually trains (loss
//     decreases with a real numeric downward trend across epochs, not just
//     "it ran without throwing"),
//   - editing a training parameter (epochs) in the code editor and re-running
//     changes training behavior to match the edit (proves the editor content
//     drives the actual training loop, not a hardcoded one).
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

  const launch = await page.evaluate(({ appDir }) => {
    try {
      window.platform.host.exec(window.platform, appDir + '/main.js');
      window.platform.host.execCommand(
        "service('001-core.layout', 'open-window') (command('ui.distributed-compute'))",
        window.platform
      );
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e) }; }
  }, { appDir: APP_DIR });
  check('app launches via ui.distributed-compute command', launch.ok, launch.error);

  await page.waitForTimeout(1000);
  const frame = await findAppFrame(page);
  check('app window frame found', !!frame);
  if (!frame) { await browser.close(); process.exit(1); }
  await frame.waitForFunction(() => window.__distComputeReady === true, { timeout: 15000 });

  // Select the neural-net-training example.
  await frame.selectOption('#example-select', 'neural-net-training');
  const sourceAfterSelect = await frame.evaluate(() => window.__distComputeGetSource());
  check('selecting the NN example loads its source into the editor', sourceAfterSelect.includes('workerStepSource'));

  // Reduce epochs for test speed by editing the CODE EDITOR content itself
  // (proves the editable training loop, not a hardcoded one, drives the run).
  const fastSource = sourceAfterSelect.replace('epochs: 40', 'epochs: 60');
  await frame.evaluate((src) => window.__distComputeSetSource(src), fastSource);

  await frame.locator('#run-btn').click();
  await frame.waitForFunction(() => Array.isArray(window.__lastNNLosses) && window.__lastNNLosses.length >= 60, { timeout: 60000 });

  const losses25 = await frame.evaluate(() => window.__lastNNLosses.slice());
  check('training produced one loss value per configured epoch (60, matching the edited editor value)', losses25.length === 60, losses25.length);

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const firstQuarter = losses25.slice(0, Math.max(1, Math.floor(losses25.length / 4)));
  const lastQuarter = losses25.slice(-Math.max(1, Math.floor(losses25.length / 4)));
  const avgFirst = avg(firstQuarter);
  const avgLast = avg(lastQuarter);
  check('loss shows a real numeric downward trend across epochs (last quarter < first quarter)', avgLast < avgFirst, { avgFirst, avgLast, losses25 });
  check('final epoch loss is meaningfully lower than the first epoch loss', losses25[losses25.length - 1] < losses25[0] * 0.85, { first: losses25[0], last: losses25[losses25.length - 1] });

  // --- Re-run with epochs edited again (10) to prove the editor param controls the run, not a fixed loop ---
  const evenFasterSource = fastSource.replace('epochs: 60', 'epochs: 10');
  await frame.evaluate((src) => window.__distComputeSetSource(src), evenFasterSource);
  await frame.evaluate(() => { window.__lastNNLosses = null; });
  await frame.locator('#run-btn').click();
  await frame.waitForFunction(() => Array.isArray(window.__lastNNLosses) && window.__lastNNLosses.length >= 10, { timeout: 60000 });
  const losses10 = await frame.evaluate(() => window.__lastNNLosses.slice());
  check('editing epochs to 10 and re-running produces exactly 10 loss values', losses10.length === 10, losses10.length);

  await frame.locator('#loss-canvas').screenshot({ path: 'testing/screenshots/distributed-compute-nn-loss-chart.png' }).catch(() => {});

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
