// Spike helper — prints the OS boot readiness signals over time (fs / platform / SW controller).
import { chromium } from 'playwright';
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 160)); });
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 160)));
await page.goto('http://localhost:8080', { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(2500);
  const s = await page.evaluate(() => ({
    fs: !!window.fs, platform: !!window.platform, host: !!(window.platform && window.platform.host),
    swController: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
    contentArea: !!document.querySelector('.content-area'), wosHost: !!window.__wosHost,
    url: location.href,
  })).catch((e) => ({ err: e.message }));
  console.log(i, JSON.stringify(s));
}
await browser.close();
