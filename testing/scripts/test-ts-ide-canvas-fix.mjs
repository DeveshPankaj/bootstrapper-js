import { chromium } from 'playwright';

const PORT = process.env.PORT || 8085;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  const consoleLines = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => consoleLines.push(msg.text()));
  await page.goto(`http://localhost:${PORT}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);

  const execResult = await page.evaluate(() => {
    try {
      window.platform.host.exec(window.platform, '/opt/apps/ts-ide/main.js');
      window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.ts-ide'))", window.platform);
      return 'ok';
    } catch (e) { return 'ERROR: ' + e.message; }
  });
  console.log('exec result:', execResult);
  await page.waitForTimeout(3000);

  let f = null;
  for (const fr of page.frames()) {
    if (fr.url().includes('ts-ide/main.html')) { f = fr; break; }
  }
  if (!f) { console.log('Frame not found'); console.log('urls:', page.frames().map(x => x.url())); await browser.close(); return; }
  await page.waitForTimeout(1000);

  console.log('=== Test 1: default (canvas 2D) example ===');
  await f.click('#run-btn', { force: true });
  await page.waitForTimeout(1000);
  const canvasSize1 = await f.evaluate(() => {
    const cv = document.getElementById('canvas-preview');
    return { mirrorW: cv.width, mirrorH: cv.height };
  });
  console.log('Mirror canvas size:', JSON.stringify(canvasSize1));
  const logLine1 = consoleLines.find(l => l.includes('Canvas rendered'));
  console.log('Console log:', logLine1);

  // Check the mirror canvas actually has non-blank pixel data (not just non-zero size)
  const hasPixels1 = await f.evaluate(() => {
    const cv = document.getElementById('canvas-preview');
    const ctx = cv.getContext('2d');
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 0 || data[i+1] !== 0 || data[i+2] !== 0) return true;
    }
    return false;
  });
  console.log('Mirror canvas has non-black pixels:', hasPixels1);

  console.log('=== Test 2: WebGL Triangle example ===');
  const glIdx = await f.evaluate(() => EXAMPLES.findIndex(e => e.name === 'WebGL Triangle'));
  console.log('WebGL Triangle index:', glIdx);
  if (glIdx >= 0) {
    await f.evaluate((i) => loadExample(i), glIdx);
    await page.waitForTimeout(300);
    await f.click('#run-btn', { force: true });
    await page.waitForTimeout(1000);
    const canvasSize2 = await f.evaluate(() => {
      const cv = document.getElementById('canvas-preview');
      return { mirrorW: cv.width, mirrorH: cv.height };
    });
    console.log('WebGL mirror canvas size:', JSON.stringify(canvasSize2));
    const hasPixels2 = await f.evaluate(() => {
      const cv = document.getElementById('canvas-preview');
      const ctx = cv.getContext('2d');
      const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== 0 || data[i+1] !== 0 || data[i+2] !== 0) return true;
      }
      return false;
    });
    console.log('WebGL mirror canvas has non-black pixels:', hasPixels2);
  }

  await page.screenshot({ path: 'testing/screenshots/ts-ide-canvas-fix.png' });

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
