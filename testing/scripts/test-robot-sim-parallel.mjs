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

  // Set 8 parallel instances
  await f.selectOption('#parallel-sel', '8');
  await page.waitForTimeout(500);

  const initCheck = await f.evaluate(() => ({
    instanceCount: instances.length,
    positions: instances.map(i => ({ x: i.robot.main.position.x.toFixed(2), z: i.robot.main.position.z.toFixed(2) })),
  }));
  console.log('After setting 8 parallel:', JSON.stringify(initCheck, null, 2));

  // Confirm distinct random spawn locations (not all identical)
  const uniqueZ = new Set(initCheck.positions.map(p => p.z));
  console.log('Unique Z spawn positions:', uniqueZ.size, 'out of', initCheck.positions.length);

  await f.click('#btn-train', { force: true });
  console.log('Training 8 parallel cars for 15s...');
  await page.waitForTimeout(15000);

  const stats = await f.evaluate(() => ({
    episode: document.getElementById('s-ep').textContent,
    avg: document.getElementById('s-avg').textContent,
    best: document.getElementById('s-best').textContent,
    mem: document.getElementById('cfg-mem').textContent,
    instanceCount: instances.length,
    instanceStepCounts: instances.map(i => i.stepCount),
    allRobotsDistinct: new Set(instances.map(i => i.robot)).size,
  }));
  console.log('After 15s of parallel training:', JSON.stringify(stats, null, 2));

  await f.click('#btn-train', { force: true }); // stop

  // Now switch back to 1 instance and confirm it still works normally
  await f.selectOption('#parallel-sel', '1');
  await page.waitForTimeout(500);
  const single = await f.evaluate(() => ({ count: instances.length }));
  console.log('After switching back to 1:', JSON.stringify(single));

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
