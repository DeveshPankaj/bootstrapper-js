/**
 * Test: TrainBoard — write VFS logs from Notebook, verify charts render
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

mkdirSync('./testing/screenshots', { recursive: true });

const TRAIN_CODE = `import json, math
from js import window

class TrainLogger:
    def __init__(self, run="run1", log_dir="/home/user1/trainboard"):
        self._path = f"{log_dir}/{run}.jsonl"
        self._bridge = getattr(window, '__nbBridge')
        self._bridge.writeFile(self._path, "")  # clear / create

    def log(self, step, **metrics):
        row = json.dumps({"step": step, **{k: float(v) for k, v in metrics.items()}})
        buf = self._bridge.readFile(self._path) or ""
        self._bridge.writeFile(self._path, buf + row + "\\n")

logger = TrainLogger("test_run")
for epoch in range(20):
    loss = math.exp(-epoch * 0.2)
    acc  = 1 - loss / 2
    logger.log(epoch, loss=loss, accuracy=acc)

print(f"Wrote 20 steps to VFS")`;

const browser = await chromium.launch({ headless: true });
const page    = await browser.newPage();
page.setDefaultTimeout(300_000);

await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });

await page.waitForFunction(() => !!window.platform?.host?.getFS?.());
console.log('platform ready');

// Load notebook (already in VFS via meta.json)
await page.evaluate(() => {
  try {
    window.platform._appDir = '/opt/apps/notebook';
    window.platform.host.exec(window.platform, '/opt/apps/notebook/main.js');
  } catch (e) { console.warn('notebook', e.message); }
  finally { delete window.platform._appDir; }
});

// TrainBoard is App-Manager-only (not in meta.json) — simulate install:
// fetch files from the dev server and write them to VFS, then exec
await page.evaluate(async () => {
  const fs = window.platform.host.getFS();
  try { fs.mkdirSync('/opt/apps/trainboard', { recursive: true }); } catch (_) {}
  const files = ['main.js', 'board.html'];
  for (const f of files) {
    const res  = await fetch(`/public/mount/opt/apps/trainboard/${f}`);
    const text = await res.text();
    fs.writeFileSync(`/opt/apps/trainboard/${f}`, text);
  }
  window.platform._appDir = '/opt/apps/trainboard';
  window.platform.host.exec(window.platform, '/opt/apps/trainboard/main.js');
  delete window.platform._appDir;
});
console.log('apps loaded');

// ── Open Notebook ──────────────────────────────────────────────────────────────
await page.evaluate(() => window.platform.host.callCommand('ui.notebook'));
await page.waitForTimeout(2000);

let nbFrame = null;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(400);
  for (const f of page.frames()) {
    try { if (await f.locator('#k-dot').count() > 0) { nbFrame = f; break; } } catch {}
  }
  if (nbFrame) break;
}
if (!nbFrame) throw new Error('notebook frame not found');
console.log('notebook frame found');

console.log('waiting for Pyodide kernel…');
await nbFrame.waitForSelector('#k-dot.ready', { timeout: 120_000 });
console.log('kernel ready ✓');

// Set TrainLogger code into first code cell and run it
await nbFrame.evaluate((code) => {
  const cell = [...document.querySelectorAll('.cell')].find(c => c.querySelector('.cell-badge.code'));
  if (!cell) throw new Error('no code cell');
  const cm = cell.querySelector('.CodeMirror')?.CodeMirror;
  if (!cm) throw new Error('no CodeMirror');
  cm.setValue(code);
  cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}, TRAIN_CODE);

await page.waitForTimeout(300);
const runBtn = nbFrame.locator('.cell.selected .act-btn.run').first();
await runBtn.click({ force: true });

await nbFrame.waitForSelector('#k-dot.busy',  { timeout: 10_000 }).catch(() => {});
await nbFrame.waitForSelector('#k-dot.ready', { timeout: 60_000 });
await page.waitForTimeout(300);

// Check cell output
const outputText = await nbFrame.locator('.cell-output.has-output').innerText().catch(() => '');
console.log('notebook output:', outputText.trim());
if (!outputText.includes('20 steps')) throw new Error('TrainLogger did not print expected output');
console.log('VFS write ✓');

await page.screenshot({ path: 'testing/screenshots/trainboard-notebook-run.png' });

// ── Open TrainBoard ────────────────────────────────────────────────────────────
await page.evaluate(() => window.platform.host.callCommand('ui.trainboard'));
await page.waitForTimeout(3000);

let tbFrame = null;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(400);
  for (const f of page.frames()) {
    try { if (await f.locator('#run-list').count() > 0) { tbFrame = f; break; } } catch {}
  }
  if (tbFrame) break;
}
if (!tbFrame) throw new Error('TrainBoard frame not found');
console.log('TrainBoard frame found');

// Click Refresh to load the newly written log
await tbFrame.locator('#btn-refresh').click();
await page.waitForTimeout(800);

// Verify run appears in sidebar
const runItems = await tbFrame.locator('.run-item').count();
console.log('run items in sidebar:', runItems);

// Verify charts rendered
const chartCards = await tbFrame.locator('.chart-card').count();
console.log('chart cards:', chartCards);

await page.screenshot({ path: 'testing/screenshots/trainboard-charts.png' });

const pass = runItems > 0 && chartCards >= 2;  // loss + accuracy
console.log(`\nRun items:  ${runItems > 0 ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`Chart cards: ${chartCards >= 2 ? `PASS ✓ (${chartCards})` : `FAIL ✗ (${chartCards})`}`);
console.log(pass ? '\nTrainBoard PASS ✓' : '\nTrainBoard FAIL ✗');

await browser.close();
process.exit(pass ? 0 : 1);
