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

  console.log('=== Examples list includes the new one ===');
  const examplesList = await f.evaluate(() => EXAMPLES.map(e => e.name));
  console.log(JSON.stringify(examplesList));

  const idx = await f.evaluate(() => EXAMPLES.findIndex(e => e.name === 'TF.js — Autograd Regression'));
  console.log('New example index:', idx);
  if (idx < 0) { console.log('EXAMPLE NOT FOUND'); await browser.close(); return; }

  await f.evaluate((i) => loadExample(i), idx);
  await page.waitForTimeout(300);

  console.log('=== Run the example ===');
  await f.click('#run-btn', { force: true });
  await page.waitForTimeout(6000); // 150 epochs * ~20ms draw delay + tf.js overhead

  const consoleLines = await f.evaluate(() => [...document.querySelectorAll('#console-lines .log')].map(l => l.textContent));
  console.log('--- console output (last 15 lines) ---');
  console.log(consoleLines.slice(-15).join('\n'));

  const errLines = await f.evaluate(() => [...document.querySelectorAll('#console-lines .err')].map(l => l.textContent));
  console.log('--- error lines ---');
  console.log(errLines.length ? errLines : 'none');

  console.log('=== Canvas actually has content ===');
  const canvasCheck = await f.evaluate(() => {
    const cv = document.getElementById('canvas-preview');
    const ctx = cv.getContext('2d');
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let nonBg = 0;
    for (let i = 0; i < data.length; i += 4) {
      // background is #0f172a-ish; count pixels that clearly aren't that
      if (data[i] > 40 || data[i+1] > 60 || data[i+2] > 90) nonBg++;
    }
    return { w: cv.width, h: cv.height, nonBgPixels: nonBg };
  });
  console.log(JSON.stringify(canvasCheck));

  await page.screenshot({ path: 'testing/screenshots/ts-ide-tfjs-autograd.png' });

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
