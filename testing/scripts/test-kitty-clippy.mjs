import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    window.platform.host.callCommand('set-wallpaper', 'canvas:/usr/share/wallpapers/kitty-parallax.js');
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'testing/screenshots/kitty-clippy-hidden.png' });
  console.log('Screenshot 1 (should be hidden/tucked away) saved.');

  console.log('Waiting up to 14s for the kitty to pop up...');
  await page.waitForTimeout(14000);
  await page.screenshot({ path: 'testing/screenshots/kitty-clippy-popup.png' });
  console.log('Screenshot 2 (should show popped-up kitty with speech bubble) saved.');

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
