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

  const canvas = f.locator('#sim-canvas');
  const canvasBox = await canvas.boundingBox();

  // Use locator.click({position, force:true}) — the CLAUDE.md-documented
  // workaround for the draggable window overlay intercepting raw
  // page.mouse events in headless mode.
  await canvas.click({ position: { x: canvasBox.width/2 - 50, y: canvasBox.height/2 + 30 }, force: true });
  await page.waitForTimeout(200);
  await canvas.click({ position: { x: canvasBox.width/2, y: canvasBox.height/2 + 30 }, force: true });
  await page.waitForTimeout(200);
  await f.click('[data-terrain-tool="platform"]', { force: true });
  await canvas.click({ position: { x: canvasBox.width/2 + 50, y: canvasBox.height/2 + 30 }, force: true });
  await page.waitForTimeout(200);

  const terrainCount = await f.evaluate(() => terrain.length);
  console.log('Terrain pieces after placing 3:', terrainCount);

  const ndc = await f.evaluate(() => {
    var v = terrainMeshes[2].position.clone().project(camera);
    return { x: v.x, y: v.y };
  });
  const posX = (ndc.x*0.5+0.5)*canvasBox.width;
  const posY = (-ndc.y*0.5+0.5)*canvasBox.height;

  await f.click('[data-terrain-tool="delete"]', { force: true });
  await canvas.click({ position: { x: posX, y: posY }, force: true });
  await page.waitForTimeout(300);
  const terrainCountAfterDelete = await f.evaluate(() => terrain.length);
  console.log('Terrain pieces after 1 delete:', terrainCountAfterDelete);

  await f.click('#terrain-toolbar button:has-text("Done")', { force: true });
  await page.waitForTimeout(500);

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
