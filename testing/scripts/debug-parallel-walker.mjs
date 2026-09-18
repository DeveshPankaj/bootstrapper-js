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

  await f.click('[data-robot="walker"]', { force: true });
  await page.waitForTimeout(500);
  await f.selectOption('#parallel-sel', '4');
  await page.waitForTimeout(500);

  const check = await f.evaluate(() => ({
    instanceCount: instances.length,
    bodiesPerInstance: instances.map(i => i.robot.bodies.length),
    meshesInScene: scene.children.filter(c => c.type === 'Mesh').length,
  }));
  console.log('Walker x4 parallel setup:', JSON.stringify(check));

  await f.click('#btn-train', { force: true });
  await page.waitForTimeout(10000);
  const stats = await f.evaluate(() => ({
    episode: document.getElementById('s-ep').textContent,
    avg: document.getElementById('s-avg').textContent,
    instanceCount: instances.length,
  }));
  console.log('Walker x4 after 10s:', JSON.stringify(stats));

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
