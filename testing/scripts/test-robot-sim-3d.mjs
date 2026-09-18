import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console.error: ' + msg.text()); });
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
  await page.waitForTimeout(3000); // three/cannon/TF.js load

  console.log('--- initial load errors ---', errors.length ? errors : 'none');

  // Check libraries loaded
  const libCheck = await f.evaluate(() => ({
    hasTHREE: !!window.THREE,
    hasCANNON: !!window.CANNON,
    hasTF: !!window.tf,
    robotExists: !!robot,
    robotType: robot ? robot.type : null,
    bodiesCount: robot ? robot.bodies.length : 0,
  }));
  console.log('Lib/robot check:', JSON.stringify(libCheck));

  for (const robotType of ['car', 'ball', 'walker', 'drone']) {
    await f.click(`[data-robot="${robotType}"]`, { force: true });
    await page.waitForTimeout(500);
    await f.click('#btn-train', { force: true });
    console.log(`Training ${robotType}...`);
    await page.waitForTimeout(12000);
    const stats = await f.evaluate(() => ({
      episode: document.getElementById('s-ep').textContent,
      dist: document.getElementById('s-dist').textContent,
      vel: document.getElementById('s-vel').textContent,
      rew: document.getElementById('s-rew').textContent,
      avg: document.getElementById('s-avg').textContent,
      mem: document.getElementById('cfg-mem').textContent,
    }));
    console.log(`${robotType} after 12s:`, JSON.stringify(stats));
    await f.click('#btn-train', { force: true }); // stop
    console.log(`Errors so far: `, errors.length ? errors.slice(0,5) : 'none');
  }

  await browser.close();
})();
