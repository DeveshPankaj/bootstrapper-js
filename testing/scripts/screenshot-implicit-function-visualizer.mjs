// Screenshots of the Implicit Function Visualizer in both modes (testing/screenshots/).
// Usage: node testing/scripts/screenshot-implicit-function-visualizer.mjs   (dev server on :8080)
import { launch, bootReady, findFrame, pollFor, sleep } from './security/verify-files-lib.mjs';

const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await bootReady(context);
// Install the way App Manager does after a click (same code path as the test).
await page.evaluate(() => window.platform.host.openWindow('ui.pkg-manager', 'Implicit Function Visualizer'));
const pm = await findFrame(page, '.pkg-card .pkg-card-name:text-is("Implicit Function Visualizer")', { timeout: 20000 });
await pm.locator('.pkg-card button', { hasText: 'Install' }).first().click({ force: true });
await pollFor(() => page.evaluate(() => !!window.platform.host.getCommand('ui.implicit-function-visualizer')), { timeout: 20000 });
await page.evaluate(() => document.querySelectorAll('.window').forEach(w => w.querySelector('[data-action="close"], .close, button[title="close"]')?.click()));
await page.evaluate(() => window.platform.host.openWindow('ui.implicit-function-visualizer'));
const f = await findFrame(page, '#mode2d', { timeout: 20000 });
const plotted = () => pollFor(() => f.evaluate(() => document.getElementById('status').textContent === 'Plotted.'), { timeout: 30000 });
await plotted(); await sleep(800);
await page.screenshot({ path: 'testing/screenshots/implicit-function-visualizer-2d.png' });
await f.click('#viewSolid', { force: true }); await sleep(600);
await page.screenshot({ path: 'testing/screenshots/implicit-function-visualizer-2d-solid.png' });
await f.click('#mode3d', { force: true }); await plotted();
await f.check('#showSlice', { force: true }); await sleep(800);
await page.screenshot({ path: 'testing/screenshots/implicit-function-visualizer-3d.png' });
await browser.close();
console.log('saved 3 screenshots');
