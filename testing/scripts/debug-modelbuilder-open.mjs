import { chromium } from 'playwright';
const PORT = process.env.PORT || 8098;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => console.log('PAGE:', m.type(), m.text()));
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto(`http://localhost:${PORT}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(10000);

  const cmdCheck = await page.evaluate(() => {
    const cmd = window.platform.host.getCommand('ui.model-builder');
    return { exists: !!cmd, meta: cmd ? cmd.meta : null };
  });
  console.log('Command check:', JSON.stringify(cmdCheck));

  const result = await page.evaluate(() => {
    try {
      window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.model-builder'))", window.platform);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message, stack: e.stack };
    }
  });
  console.log('Open result:', JSON.stringify(result));
  await page.waitForTimeout(3000);
  console.log('Frame count:', page.frames().length);
  console.log('Frames:', page.frames().map(f => f.url()));

  await browser.close();
})();
