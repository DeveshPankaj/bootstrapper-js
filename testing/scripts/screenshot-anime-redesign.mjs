import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    window.platform.host.callCommand('set-wallpaper', 'canvas:/usr/share/wallpapers/anime-peek.js');
  });
  await page.waitForTimeout(2500);

  // Move mouse near her so eyes react, and crop toward bottom-left where she peeks
  await page.mouse.move(200, 500);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'testing/screenshots/anime-redesign.png' });

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
