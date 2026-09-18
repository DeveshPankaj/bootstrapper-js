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
  await page.waitForTimeout(2000);

  let f = null;
  for (const fr of page.frames()) {
    if (fr.url().includes('robot-sim/main.html')) { f = fr; break; }
  }
  if (!f) { console.log('Frame not found'); await browser.close(); return; }
  await page.waitForTimeout(3000);

  await f.click('#btn-terrain', { force: true });
  await page.waitForTimeout(500);

  const canvasBox = await f.locator('#sim-canvas').boundingBox();
  const cx = canvasBox.x + canvasBox.width/2, cy = canvasBox.y + canvasBox.height/2;

  await page.mouse.click(cx - 50, cy + 30);
  await page.waitForTimeout(200);
  await page.mouse.click(cx, cy + 30);
  await page.waitForTimeout(200);
  await f.click('[data-terrain-tool="platform"]', { force: true });
  await page.mouse.click(cx + 50, cy + 30);
  await page.waitForTimeout(200);

  const ndc = await f.evaluate(() => {
    var v = terrainMeshes[2].position.clone().project(camera);
    return { x: v.x, y: v.y };
  });
  const screenX = canvasBox.x + (ndc.x*0.5+0.5)*canvasBox.width;
  const screenY = canvasBox.y + (-ndc.y*0.5+0.5)*canvasBox.height;
  console.log('canvasBox:', JSON.stringify(canvasBox));
  console.log('target screen:', screenX, screenY);

  // Check what element is at that point, from the TOP page's perspective
  const elAtTop = await page.evaluate(({x,y}) => {
    var el = document.elementFromPoint(x, y);
    return el ? el.tagName + '#' + el.id + '.' + el.className : 'none';
  }, { x: screenX, y: screenY });
  console.log('Element at point (top page):', elAtTop);

  await f.click('[data-terrain-tool="delete"]', { force: true });

  // Check what element is at that point INSIDE the iframe (frame-local coords needed)
  const frameLocal = await f.evaluate(() => {
    var rect = simCanvas.getBoundingClientRect();
    var v = terrainMeshes[2].position.clone().project(camera);
    return { x: rect.left + (v.x*0.5+0.5)*rect.width, y: rect.top + (-v.y*0.5+0.5)*rect.height };
  });
  const elAtFrame = await f.evaluate(({x,y}) => {
    var el = document.elementFromPoint(x, y);
    return el ? el.tagName + '#' + el.id + '.' + el.className : 'none';
  }, frameLocal);
  console.log('Element at point (inside iframe):', elAtFrame);

  await page.mouse.click(screenX, screenY);
  await page.waitForTimeout(300);
  const terrainCountAfterDelete = await f.evaluate(() => terrain.length);
  console.log('Terrain pieces after 1 delete:', terrainCountAfterDelete);

  await browser.close();
})();
