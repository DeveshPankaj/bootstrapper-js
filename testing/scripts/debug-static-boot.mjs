import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => console.log('PAGE:', m.type(), m.text()));
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  page.on('requestfailed', r => console.log('REQFAIL:', r.url(), r.failure()?.errorText));
  page.on('response', r => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
  await page.goto('http://localhost:8096');
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(6000);
  console.log('window.platform:', await page.evaluate(() => typeof window.platform));
  await browser.close();
})();
