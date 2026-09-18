import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.settings'), '20-managers')", window.platform);
  });
  await page.waitForTimeout(2000);

  let f = null;
  for (const fr of page.frames()) {
    if (fr.url().includes('settings/main.html')) { f = fr; break; }
  }
  if (!f) { console.log('settings frame not found'); await browser.close(); return; }

  const el = await f.locator('p.muted-small', { hasText: 'DESKTOP ICONS' }).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'testing/screenshots/managers-desktop-icons-section.png' });

  await browser.close();
})();
