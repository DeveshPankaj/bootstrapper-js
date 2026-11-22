// Screenshot: Settings › Storage › Default Files (the Source field), dark and light.
// Usage: BASE_URL=http://localhost:8090 node testing/scripts/debug-storage-source.mjs
import { chromium } from 'playwright';
const BASE = (process.env.BASE_URL || 'http://localhost:8090').replace(/\/$/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
await page.goto(BASE);
for (let i = 0; i < 200 && !(await page.evaluate(() => document.querySelectorAll('.vfs-desktop-icon').length > 0).catch(() => false)); i++) await sleep(250);
await sleep(3000);
for (const mode of ['dark', 'light']) {
    await page.evaluate((m) => window.platform.host.callCommand('set-appearance-mode', m), mode);
    await page.evaluate(() => document.querySelectorAll('.window').forEach(w => w.remove()));
    await page.evaluate(() => window.platform.host.openWindow('ui.settings', '08-storage'));
    let f = null;
    for (let i = 0; i < 80 && !f; i++) { for (const fr of page.frames()) if (await fr.locator('#force-reload-source').count().catch(() => 0)) f = fr; await sleep(250); }
    await f.locator('#force-reload-source').fill('https://example.com');
    await f.locator('#force-reload-source').scrollIntoViewIfNeeded();
    await sleep(600);
    await page.screenshot({ path: `testing/screenshots/storage-source-${mode}.png` });
}
await browser.close();
