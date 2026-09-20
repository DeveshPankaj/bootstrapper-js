import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));
  await page.goto('http://localhost:8085');
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/ts-ide/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.ts-ide'))", window.platform);
  });
  await page.waitForTimeout(2500);
  let f = null;
  for (const fr of page.frames()) { if (fr.url().includes('ts-ide/main.html')) { f = fr; break; } }
  await page.waitForTimeout(1000);

  const frameErrors = [];
  f.on('console', msg => { if (msg.type() === 'error') frameErrors.push(msg.text()); });
  f.on('pageerror', e => frameErrors.push('PAGEERROR: ' + e.message));

  const raw = await f.evaluate(() => document.getElementById('sb-content').innerHTML);
  console.log('sb-content innerHTML length:', raw.length);
  console.log('sb-content innerHTML:', raw.slice(0, 300));

  console.log('=== manually calling refreshSidebar() ===');
  const manualResult = await f.evaluate(async () => {
    try {
      await refreshSidebar();
      return { ok: true, html: document.getElementById('sb-content').innerHTML.slice(0,200) };
    } catch (e) {
      return { ok: false, error: e.message, stack: e.stack };
    }
  });
  console.log(JSON.stringify(manualResult, null, 2));

  console.log('Frame console errors:', frameErrors);
  console.log('Page console errors:', consoleErrors);
  await browser.close();
})();
