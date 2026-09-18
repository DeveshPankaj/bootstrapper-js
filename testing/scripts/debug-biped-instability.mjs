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

  await f.click('[data-robot="custom"]', { force: true });
  await page.waitForTimeout(300);
  await f.selectOption('#preset-sel', 'biped');
  await page.waitForTimeout(500);

  // Step physics manually with a fixed action sequence and watch velocity magnitude
  const trace = await f.evaluate(() => {
    var log = [];
    for (var i = 0; i < 300; i++) {
      var action = i % 4; // cycle through muscle actions
      applyAction(robot, action);
      world.step(1/60);
      if (i % 20 === 0) {
        log.push({
          step: i,
          y: robot.main.position.y.toFixed(2),
          vx: robot.main.velocity.x.toFixed(2),
          vy: robot.main.velocity.y.toFixed(2),
          vz: robot.main.velocity.z.toFixed(2),
          speed: Math.hypot(robot.main.velocity.x, robot.main.velocity.y, robot.main.velocity.z).toFixed(2),
        });
      }
    }
    return log;
  });
  console.log('Biped velocity trace (fixed action cycle, no RL):');
  trace.forEach(t => console.log(JSON.stringify(t)));

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
