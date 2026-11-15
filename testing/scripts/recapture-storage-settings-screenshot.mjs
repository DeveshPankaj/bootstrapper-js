import { chromium } from 'playwright';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('pageerror', err => { errors.push(err.message); console.log('PAGEERROR:', err.message); });
page.on('console', msg => { if (msg.type() === 'error') { errors.push(msg.text()); console.log('CONSOLE ERROR:', msg.text()); } });

await page.goto('http://localhost:8080');
await page.waitForTimeout(3000);
await page.reload();
await page.waitForTimeout(3000);
await page.reload();
await page.waitForTimeout(3000);

{
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const ok = await page.evaluate(() => !!window.platform?.host?.getCommand?.('ui.settings')).catch(() => false);
    if (ok) break;
    await sleep(1000);
  }
}

for (let i = 0; i < 10; i++) {
  const ok = await page.evaluate(() => {
    try { window.platform.host.callCommand('ui.settings'); return true; } catch (_) { return false; }
  }).catch(() => false);
  if (ok) break;
  await sleep(500);
}
await page.waitForTimeout(1500);

let settingsFrame = null;
{
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && !settingsFrame) {
    for (const frame of page.frames()) {
      try { if (await frame.locator('text=Storage').count() > 0) { settingsFrame = frame; break; } } catch (_) {}
    }
    if (!settingsFrame) await sleep(500);
  }
}
console.log('settings frame found:', !!settingsFrame);

await settingsFrame.locator('text=Storage').first().click({ force: true });
await page.waitForTimeout(500);

await page.screenshot({ path: 'testing/screenshots/storage-settings.png' });
console.log('captured storage-settings.png');
console.log('errors:', errors);

await browser.close();
