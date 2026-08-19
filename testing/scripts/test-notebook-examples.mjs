/**
 * Test: Notebook default examples — URL image, VFS image, pandas CSV
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

mkdirSync('./testing/screenshots', { recursive: true });

const browser = await chromium.launch({ headless: true });
const page   = await browser.newPage();
page.setDefaultTimeout(300_000);

await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });

await page.waitForFunction(() => !!window.platform?.host?.getFS?.());

await page.evaluate(() => {
  window.platform._appDir = '/opt/apps/notebook';
  window.platform.host.exec(window.platform, '/opt/apps/notebook/main.js');
  delete window.platform._appDir;
});
await page.evaluate(() => window.platform.host.callCommand('ui.notebook'));
await page.waitForTimeout(2000);

let nbFrame = null;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(400);
  for (const f of page.frames()) {
    try { if (await f.locator('#toolbar').count() > 0) { nbFrame = f; break; } } catch {}
  }
  if (nbFrame) break;
}
if (!nbFrame) throw new Error('notebook frame not found');

console.log('waiting for kernel…');
await nbFrame.waitForSelector('#k-dot.ready', { timeout: 120_000 });
console.log('kernel ready ✓');

// Run code cell at given index via Playwright (fires mousedown → selects, then clicks run)
async function runCodeCell(codeIndex) {
  // Collect code cells in order
  const allCells = await nbFrame.locator('.cell').all();
  const codeCells = [];
  for (const c of allCells) {
    if (await c.locator('.cell-badge.code').count() > 0) codeCells.push(c);
  }
  if (!codeCells[codeIndex]) throw new Error(`no code cell at index ${codeIndex}`);

  // Playwright click fires mousedown → triggers selectCell() in the notebook
  await codeCells[codeIndex].click({ force: true });
  await page.waitForTimeout(300);

  const runBtn = nbFrame.locator('.cell.selected .act-btn.run').first();
  await runBtn.click({ force: true });

  await nbFrame.waitForSelector('#k-dot.busy',  { timeout: 10_000 }).catch(() => {});
  await nbFrame.waitForSelector('#k-dot.ready', { timeout: 240_000 });
  await page.waitForTimeout(300);
}

// Get output of code cell at index (img count + text)
async function cellOutput(codeIndex) {
  return nbFrame.evaluate((idx) => {
    const codeCells = [...document.querySelectorAll('.cell')].filter(c =>
      c.querySelector('.cell-badge.code')
    );
    const out = codeCells[idx]?.querySelector('.cell-output');
    if (!out) return { imgs: 0, text: '' };
    return {
      imgs: out.querySelectorAll('img').length,
      text: out.innerText || '',
    };
  }, codeIndex);
}

// Default cells layout:
//  code 0: Basic Python
//  code 1: matplotlib
//  code 2: Image from URL   ← test this
//  code 3: Image from VFS   ← test this
//  code 4: pandas CSV       ← test this

// ── URL image (code cell 2) ───────────────────────────────────────────────────
console.log('\n[3] Running URL image cell…');
await runCodeCell(2);
const urlOut = await cellOutput(2);
console.log(`  imgs: ${urlOut.imgs}`);
console.log(`  text: ${urlOut.text.trim().slice(0, 100)}`);

await nbFrame.evaluate(() => {
  const cells = [...document.querySelectorAll('.cell')].filter(c => c.querySelector('.cell-badge.code'));
  cells[2]?.querySelector('.cell-output img')?.scrollIntoView({ behavior: 'instant', block: 'center' });
});
await page.waitForTimeout(200);
await page.screenshot({ path: 'testing/screenshots/notebook-url-image.png' });
console.log('  screenshot: notebook-url-image.png');

// ── VFS image (code cell 3) ───────────────────────────────────────────────────
console.log('\n[4] Running VFS image cell…');
await runCodeCell(3);
const vfsOut = await cellOutput(3);
console.log(`  imgs: ${vfsOut.imgs}`);
console.log(`  text: ${vfsOut.text.trim().slice(0, 100)}`);

await nbFrame.evaluate(() => {
  const cells = [...document.querySelectorAll('.cell')].filter(c => c.querySelector('.cell-badge.code'));
  cells[3]?.querySelector('.cell-output img')?.scrollIntoView({ behavior: 'instant', block: 'center' });
});
await page.waitForTimeout(200);
await page.screenshot({ path: 'testing/screenshots/notebook-vfs-image.png' });
console.log('  screenshot: notebook-vfs-image.png');

// ── Pandas CSV (code cell 4) ──────────────────────────────────────────────────
console.log('\n[5] Running pandas CSV cell…');
await runCodeCell(4);
const pandasOut = await cellOutput(4);
console.log(`  text:\n${pandasOut.text.trim().slice(0, 400)}`);

await nbFrame.evaluate(() => {
  const cells = [...document.querySelectorAll('.cell')].filter(c => c.querySelector('.cell-badge.code'));
  cells[4]?.querySelector('.cell-output')?.scrollIntoView({ behavior: 'instant', block: 'center' });
});
await page.waitForTimeout(200);
await page.screenshot({ path: 'testing/screenshots/notebook-pandas.png' });
console.log('  screenshot: notebook-pandas.png');

// ── Results ───────────────────────────────────────────────────────────────────
const passUrl    = urlOut.imgs > 0;
const passVfs    = vfsOut.imgs > 0;
const passPandas = pandasOut.text.includes('New York');
const pass = passUrl && passVfs && passPandas;

console.log(`\nURL image:  ${passUrl    ? 'PASS ✓' : 'FAIL ✗ — ' + urlOut.text.trim().slice(0, 200)}`);
console.log(`VFS image:  ${passVfs    ? 'PASS ✓' : 'FAIL ✗ — ' + vfsOut.text.trim().slice(0, 200)}`);
console.log(`Pandas CSV: ${passPandas ? 'PASS ✓' : 'FAIL ✗ — ' + pandasOut.text.trim().slice(0, 200)}`);
console.log(pass ? '\nAll examples PASS ✓' : '\nSome examples FAILED');

await browser.close();
process.exit(pass ? 0 : 1);
