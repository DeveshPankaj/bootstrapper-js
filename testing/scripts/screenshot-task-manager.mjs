import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  await page.evaluate(() => window.platform.host.callCommand('ui.terminal'));
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/task-manager/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.task-manager'))", window.platform);
  });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'testing/screenshots/task-manager-flat.png' });

  let f = null;
  for (const fr of page.frames()) {
    const found = await fr.evaluate(() => !!document.querySelector('.task-manager')).catch(() => false);
    if (found) { f = fr; break; }
  }
  if (f) {
    await f.click('.tm-segmented button:has-text("Tree")', { force: true });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'testing/screenshots/task-manager-tree.png' });
  }

  await browser.close();
})();
