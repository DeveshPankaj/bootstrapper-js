import { chromium } from 'playwright';
const PORT = process.env.PORT || 8085;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(`http://localhost:${PORT}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/ts-ide/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.ts-ide'))", window.platform);
  });
  await page.waitForTimeout(2000);

  let f = null;
  for (const fr of page.frames()) { if (fr.url().includes('ts-ide/main.html')) { f = fr; break; } }
  if (!f) { console.log('Frame not found'); await browser.close(); return; }
  await page.waitForTimeout(500);

  console.log('=== Load Webapp Starter (existing, unchanged files) ===');
  const stIdx = await f.evaluate(() => STARTERS.findIndex(s => s.name === 'Webapp Starter'));
  await f.evaluate((i) => loadStarter(i), stIdx);
  await page.waitForTimeout(500);

  await f.click('#run-btn', { force: true });
  await page.waitForTimeout(1500);

  const iframeContent = await f.evaluate(() => {
    var ifr = document.getElementById('iframe-preview');
    try {
      var doc = ifr.contentDocument;
      return { h1: doc.querySelector('h1') ? doc.querySelector('h1').textContent : null, hasButton: !!doc.getElementById('inc') };
    } catch (e) { return { error: e.message }; }
  });
  console.log('Webapp iframe rendered:', JSON.stringify(iframeContent));

  // Click the button inside the iframe, confirm the click handler (from app.ts) works.
  const ifrHandle = await f.$('#iframe-preview');
  const innerFrame = await ifrHandle.contentFrame();
  await innerFrame.click('#inc', { force: true });
  await page.waitForTimeout(300);
  const countText = await innerFrame.evaluate(() => document.querySelector('p:nth-of-type(2)') ? document.body.textContent : document.body.textContent);
  console.log('Body text includes Count: 1?', countText.includes('Count: 1'));

  const consoleLog = await f.evaluate(() => [...document.querySelectorAll('#console-lines .log')].map(l => l.textContent));
  console.log('Console:', JSON.stringify(consoleLog));

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
