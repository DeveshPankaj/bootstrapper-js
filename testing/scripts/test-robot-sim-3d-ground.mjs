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

  // With training/demo off, no forces are applied — the robot should
  // just settle on the ground under gravity alone. Track its Y position
  // over a couple of seconds: it must stabilize near its resting height,
  // not fall indefinitely.
  for (const robotType of ['ball', 'car', 'walker', 'drone']) {
    await f.click(`[data-robot="${robotType}"]`, { force: true });
    await page.waitForTimeout(300);
    // Manually step physics without training so gravity alone settles it
    await f.evaluate(() => {
      for (let i = 0; i < 120; i++) { world.step(1/60); }
    });
    const y = await f.evaluate(() => robot.main.position.y);
    console.log(`${robotType} resting Y after 120 physics steps (no actions):`, y.toFixed(3));
  }

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
