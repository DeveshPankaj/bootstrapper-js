import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
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

  console.log('=== Canvas fills preview area before any Run ===');
  const initial = await f.evaluate(() => {
    var cv = document.getElementById('canvas-preview');
    var body = document.getElementById('preview-body');
    return { cvW: cv.width, cvH: cv.height, bodyW: body.clientWidth, bodyH: body.clientHeight };
  });
  console.log(JSON.stringify(initial));

  console.log('=== Run GLSL example, check canvas matches container ===');
  const glslIdx = await f.evaluate(() => EXAMPLES.findIndex(e => e.lang === 'glsl'));
  await f.evaluate((i) => loadExample(i), glslIdx);
  await page.waitForTimeout(300);
  await f.click('#run-btn', { force: true });
  await page.waitForTimeout(500);
  const afterGlslRun = await f.evaluate(() => {
    var cv = document.getElementById('canvas-preview');
    var body = document.getElementById('preview-body');
    return { cvW: cv.width, cvH: cv.height, bodyW: body.clientWidth, bodyH: body.clientHeight };
  });
  console.log(JSON.stringify(afterGlslRun));

  console.log('=== Drag right resizer to grow preview panel while GLSL is running ===');
  const rightResizer = f.locator('#resizer-right');
  const box = await rightResizer.boundingBox();
  await page.mouse.move(box.x + 2, box.y + box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x - 120, box.y + box.height/2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400); // let ResizeObserver + a GLSL frame fire

  const afterResize = await f.evaluate(() => {
    var cv = document.getElementById('canvas-preview');
    var body = document.getElementById('preview-body');
    return { cvW: cv.width, cvH: cv.height, bodyW: body.clientWidth, bodyH: body.clientHeight };
  });
  console.log(JSON.stringify(afterResize));
  console.log('Canvas grew to match new container size:', afterResize.cvW === afterResize.bodyW && afterResize.cvH === afterResize.bodyH);
  console.log('Canvas actually got bigger than before:', afterResize.cvW > afterGlslRun.cvW);

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
