import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const consoleMsgs = [];
  page.on('console', msg => consoleMsgs.push(msg.type() + ': ' + msg.text()));
  page.on('pageerror', err => consoleMsgs.push('PAGEERROR: ' + err.message));
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    window.platform.host.callCommand('set-wallpaper', 'canvas:/home/user1/wallpapers/plasma-waves.js');
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'testing/screenshots/canvas-wallpaper-plasma.png' });
  console.log('Screenshot saved: canvas-wallpaper-plasma.png');

  await page.evaluate(() => {
    window.platform.host.callCommand('set-wallpaper', 'canvas:/home/user1/wallpapers/slowmo-orbs.js');
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'testing/screenshots/canvas-wallpaper-slowmo.png' });
  console.log('Screenshot saved: canvas-wallpaper-slowmo.png');

  await page.evaluate(() => {
    window.platform.host.callCommand('set-wallpaper', 'canvas:/home/user1/wallpapers/particles-interactive.js');
  });
  await page.waitForTimeout(800);
  await page.mouse.move(500, 350);
  await page.waitForTimeout(300);
  await page.mouse.move(300, 200, { steps: 15 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'testing/screenshots/canvas-wallpaper-particles.png' });
  console.log('Screenshot saved: canvas-wallpaper-particles.png');

  console.log('Console/errors seen:', consoleMsgs.filter(m => /error/i.test(m)));
  await browser.close();
})();
