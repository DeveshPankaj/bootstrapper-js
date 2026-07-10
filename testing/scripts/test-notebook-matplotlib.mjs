/**
 * Test: Notebook app — matplotlib image rendering
 *
 * Loads the notebook main.js via platform, opens a window, runs a matplotlib
 * plot cell, and verifies an <img> appears in the cell output.
 */
import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { mkdirSync } from 'fs';

mkdirSync('./testing/screenshots', { recursive: true });

const PLOT_CODE = `import micropip
await micropip.install('matplotlib')
import matplotlib.pyplot as plt

plt.figure(figsize=(6, 3))
plt.plot([0, 1, 2, 3, 4], [0, 1, 4, 9, 16], 'b-o', linewidth=2)
plt.title('y = x²  (matplotlib in Notebook)')
plt.xlabel('x')
plt.ylabel('y')
plt.grid(True, alpha=0.3)
plt.tight_layout()
print('chart rendered')`;

const browser = await chromium.launch({ headless: true });
const page   = await browser.newPage();
page.setDefaultTimeout(180_000);   // 3 min — Pyodide + matplotlib download

// ── navigate ──────────────────────────────────────────────────────────────────
console.log('navigating to http://localhost:8080 …');
await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });

// ── wait for platform ─────────────────────────────────────────────────────────
await page.waitForFunction(() => !!window.platform?.host?.getFS?.());
console.log('platform ready');

// ── load notebook main.js (bypasses App Manager install) ─────────────────────
const loaded = await page.evaluate(() => {
  try {
    window.platform._appDir = '/opt/apps/notebook';
    window.platform.host.exec(window.platform, '/opt/apps/notebook/main.js');
    return true;
  } catch(e) {
    return 'exec error: ' + e.message;
  } finally {
    delete window.platform._appDir;
  }
});
console.log('notebook main.js loaded:', loaded);

// ── open notebook window ──────────────────────────────────────────────────────
await page.evaluate(() => window.platform.host.callCommand('ui.notebook'));
console.log('notebook window opened');
await page.waitForTimeout(2000);

// ── find the notebook iframe ──────────────────────────────────────────────────
let nbFrame = null;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(500);
  for (const f of page.frames()) {
    try {
      if (await f.locator('#toolbar').count() > 0) { nbFrame = f; break; }
    } catch {}
  }
  if (nbFrame) break;
}
if (!nbFrame) throw new Error('notebook frame not found');
console.log('notebook frame found');

// ── take screenshot of initial state ─────────────────────────────────────────
await page.screenshot({ path: 'testing/screenshots/notebook-initial.png', fullPage: true });
console.log('screenshot: notebook-initial.png');

// ── wait for Pyodide kernel ready ─────────────────────────────────────────────
console.log('waiting for Pyodide kernel (this takes ~30s on first load) …');
await nbFrame.waitForSelector('#k-dot.ready', { timeout: 120_000 });
console.log('kernel ready ✓');

// ── set matplotlib code into the first CODE cell via CodeMirror API ──────────
const cellSet = await nbFrame.evaluate((code) => {
  // Find first code cell (badge has class 'code', not 'md')
  const codeCell = [...document.querySelectorAll('.cell')].find(c =>
    c.querySelector('.cell-badge.code')
  );
  if (!codeCell) return 'no code cell found';
  const cm = codeCell.querySelector('.cm-wrap .CodeMirror')?.CodeMirror;
  if (!cm) return 'no CodeMirror in code cell';
  cm.setValue(code);
  codeCell.click();   // select it
  return 'ok';
}, PLOT_CODE);
console.log('cell code set:', cellSet);

await page.waitForTimeout(500);

// ── click Run on the selected code cell ──────────────────────────────────────
const runBtn = nbFrame.locator('.cell.selected .act-btn.run').first();
await runBtn.click({ force: true });
console.log('run button clicked — waiting for matplotlib to install and render …');

// ── wait for kernel to go busy then come back to ready ───────────────────────
await nbFrame.waitForSelector('#k-dot.busy', { timeout: 10_000 }).catch(() => {});
console.log('kernel busy (running) …');
await nbFrame.waitForSelector('#k-dot.ready', { timeout: 150_000 });
console.log('cell execution complete ✓');

// ── check for image in output ─────────────────────────────────────────────────
const imgCount = await nbFrame.locator('.cell-output.has-output img').count();
const hasText  = await nbFrame.locator('.cell-output.has-output').innerText().catch(() => '');
console.log(`output img count: ${imgCount}`);
console.log(`output text:\n${hasText.trim()}`);

// ── scroll to output and screenshot ─────────────────────────────────────────
await nbFrame.evaluate(() => {
  const out = document.querySelector('.cell-output.has-output');
  if (out) out.scrollIntoView({ behavior: 'instant', block: 'center' });
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'testing/screenshots/notebook-matplotlib.png', fullPage: true });
console.log('screenshot: notebook-matplotlib.png');

if (imgCount === 0) {
  console.error('FAIL — no image rendered in cell output');
  await browser.close();
  process.exit(1);
} else {
  console.log('PASS — matplotlib image rendered successfully ✓');
}

await browser.close();
