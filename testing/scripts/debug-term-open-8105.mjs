import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', err => console.log('PAGEERROR:', err.message));
page.on('console', msg => console.log('CONSOLE', msg.type(), msg.text()));
await page.goto('http://localhost:8105');
await page.reload({ waitUntil: 'networkidle', timeout: 60000 }).catch(e => console.log('reload1 timeout:', e.message));
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle', timeout: 60000 }).catch(e => console.log('reload2 timeout:', e.message));
await page.waitForTimeout(2000);
await page.waitForFunction(() => !!window.platform, { timeout: 30000 }).catch(e => console.log('waitForFunction platform timeout:', e.message));
await page.waitForSelector('.content-area', { timeout: 30000 }).catch(e => console.log('waitForSelector content-area timeout:', e.message));
await page.waitForTimeout(1000);
const r = await page.evaluate(() => {
  try {
    window.platform.host.callCommand('ui.terminal');
    return 'ok';
  } catch (e) { return 'error: ' + e.message; }
});
console.log('call result:', r);
await page.waitForTimeout(2000);
console.log('frame count:', page.frames().length);
for (const f of page.frames()) {
  console.log(' - frame url:', f.url());
}
await page.screenshot({ path: 'testing/screenshots/debug-term.png' });
await browser.close();
