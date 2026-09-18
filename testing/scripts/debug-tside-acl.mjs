import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/ts-ide/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.ts-ide'))", window.platform);
  });
  await page.waitForTimeout(2000);

  let f = null;
  for (const fr of page.frames()) {
    if (fr.url().includes('ts-ide/main.html')) { f = fr; break; }
  }
  if (!f) { console.log('Frame not found'); await browser.close(); return; }
  await page.waitForTimeout(2000);

  const result = await f.evaluate(async () => {
    try {
      await sdk().mkdir('/home/user1/projects/ts/test1');
      await sdk().writeText('/home/user1/projects/ts/test1/index.html', '<html></html>');
      return 'ok';
    } catch (e) { return 'ERR: ' + e.message; }
  });
  console.log('Write to /home/user1/projects/ts:', result);

  const result2 = await f.evaluate(async () => {
    try {
      await sdk().mkdir('/home/user1/.local/share/ui.ts-ide/projects/test1');
      await sdk().writeText('/home/user1/.local/share/ui.ts-ide/projects/test1/index.html', '<html></html>');
      return 'ok';
    } catch (e) { return 'ERR: ' + e.message; }
  });
  console.log('Write to /home/user1/.local/share/ui.ts-ide:', result2);

  await browser.close();
})();
