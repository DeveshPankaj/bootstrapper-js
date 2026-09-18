import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/robot-sim/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.robot-sim'))", window.platform);
  });
  await page.waitForTimeout(3000);

  for (const f of page.frames()) {
    let btnCount = -1, title = '';
    try { btnCount = await f.locator('#btn-train').count(); } catch(e) {}
    try { title = await f.title(); } catch(e) {}
    console.log('frame url=', f.url(), 'btn-train count=', btnCount, 'title=', title);
  }

  await browser.close();
})();
