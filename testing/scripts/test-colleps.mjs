/**
 * Test: Colleps — install (App-Manager style), generate 2D, add a custom tile, generate 3D
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

mkdirSync('./testing/screenshots', { recursive: true });

const PORT = process.env.PORT || 8081;

const browser = await chromium.launch({ headless: true });
const page    = await browser.newPage();
page.setDefaultTimeout(60_000);
page.on('console', msg => { if (msg.type() === 'error') console.log('[page error]', msg.text()); });
page.on('pageerror', err => console.log('[page exception]', err.message));

await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });

await page.waitForFunction(() => !!window.platform?.host?.getFS?.());
console.log('platform ready');

// Colleps is App-Manager-only (not in meta.json) — simulate install like test-trainboard.mjs does
await page.evaluate(async (port) => {
  const fs = window.platform.host.getFS();
  try { fs.mkdirSync('/opt/apps/colleps', { recursive: true }); } catch (_) {}
  const files = ['main.js', 'colleps.html'];
  for (const f of files) {
    const res  = await fetch(`http://localhost:${port}/public/mount/opt/apps/colleps/${f}`);
    const text = await res.text();
    fs.writeFileSync(`/opt/apps/colleps/${f}`, text);
  }
  window.platform._appDir = '/opt/apps/colleps';
  window.platform.host.exec(window.platform, '/opt/apps/colleps/main.js');
  delete window.platform._appDir;
}, PORT);
await page.waitForTimeout(500);

// Open Colleps
await page.evaluate(() => window.platform.host.callCommand('ui.colleps'));
await page.waitForTimeout(2000);

let clFrame = null;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(400);
  for (const f of page.frames()) {
    try { if (await f.locator('#tile-list').count() > 0) { clFrame = f; break; } } catch {}
  }
  if (clFrame) break;
}
if (!clFrame) throw new Error('Colleps frame not found');
console.log('Colleps frame found');

// Wait for auto-generated initial 2D grid
await clFrame.waitForSelector('#canvas2d', { timeout: 10_000 });
await page.waitForTimeout(500);
const status1 = await clFrame.locator('#status-left').innerText();
console.log('initial status:', status1);
const has2dCanvas = await clFrame.evaluate(() => {
  const c = document.getElementById('canvas2d');
  return c.style.display !== 'none' && c.width > 0 && c.height > 0;
});
console.log('2D canvas rendered:', has2dCanvas);

await page.screenshot({ path: 'testing/screenshots/colleps-2d-initial.png' });

// Add a custom tile
await clFrame.locator('#btn-new-tile').click();
await page.waitForTimeout(200);
const nameInput = clFrame.locator('#ed-name');
await nameInput.fill('Lava');
await clFrame.locator('#ed-N').fill('lava');
await clFrame.locator('#ed-E').fill('lava');
await clFrame.locator('#ed-S').fill('lava');
await clFrame.locator('#ed-W').fill('lava');
const tileCount1 = await clFrame.locator('.tile-chip').count();
console.log('tile chips after adding custom tile:', tileCount1);

// Regenerate 2D with the new (isolated) tile in the mix — should still succeed (wildcards elsewhere)
await clFrame.locator('#btn-generate').click();
await page.waitForTimeout(800);
const status2 = await clFrame.locator('#status-left').innerText();
console.log('status after regenerate w/ custom tile:', status2);

// Switch to 3D and generate
await clFrame.locator('#mode-3d').click();
await page.waitForTimeout(300);
await clFrame.locator('#btn-generate').click();
await page.waitForTimeout(3000);
const status3 = await clFrame.locator('#status-left').innerText();
console.log('3D status:', status3);
const has3dCanvas = await clFrame.evaluate(() => {
  const el = document.getElementById('canvas3d-container');
  return el.style.display !== 'none' && !!el.querySelector('canvas');
});
console.log('3D canvas rendered:', has3dCanvas);

await page.screenshot({ path: 'testing/screenshots/colleps-3d.png' });

// Verify tile set persistence: save, reset, load
await clFrame.evaluate(() => { window.prompt = () => 'test-set'; window.confirm = () => true; });
await clFrame.locator('#btn-save-set').click();
await page.waitForTimeout(300);
await clFrame.locator('#btn-reset-set').click();
await page.waitForTimeout(200);
const tileCountAfterReset = await clFrame.locator('.tile-chip').count();
console.log('tile chips after reset (should be 4 defaults):', tileCountAfterReset);
await clFrame.evaluate(() => { window.prompt = () => 'test-set'; });
await clFrame.locator('#btn-load-set').click();
await page.waitForTimeout(300);
const tileCountAfterLoad = await clFrame.locator('.tile-chip').count();
console.log('tile chips after loading saved set (should include Lava, 5):', tileCountAfterLoad);

const pass = has2dCanvas && has3dCanvas
  && !status2.toLowerCase().includes('contradiction')
  && !status3.toLowerCase().includes('contradiction')
  && tileCount1 === 5
  && tileCountAfterReset === 4
  && tileCountAfterLoad === 5;

console.log(`\n2D render:     ${has2dCanvas ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`3D render:     ${has3dCanvas ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`New tile:      ${tileCount1 === 5 ? 'PASS ✓' : 'FAIL ✗'} (${tileCount1})`);
console.log(`Reset default: ${tileCountAfterReset === 4 ? 'PASS ✓' : 'FAIL ✗'} (${tileCountAfterReset})`);
console.log(`Load saved:    ${tileCountAfterLoad === 5 ? 'PASS ✓' : 'FAIL ✗'} (${tileCountAfterLoad})`);
console.log(pass ? '\nColleps PASS ✓' : '\nColleps FAIL ✗');

await browser.close();
process.exit(pass ? 0 : 1);
