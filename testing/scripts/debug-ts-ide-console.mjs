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

  await f.click('#run-btn', { force: true });
  await page.waitForTimeout(3000);
  const logs = await f.evaluate(() => [...document.querySelectorAll('#console-lines .log')].map(l => l.textContent));
  console.log('Console after 3s:', JSON.stringify(logs));

  const exampleCount = await f.evaluate(() => EXAMPLES.map(e => e.name));
  console.log('EXAMPLES:', JSON.stringify(exampleCount));

  await browser.close();
})();
