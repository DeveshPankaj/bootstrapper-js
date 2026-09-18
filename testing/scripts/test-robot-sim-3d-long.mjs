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

  const robotType = process.argv[2] || 'car';
  await f.click(`[data-robot="${robotType}"]`, { force: true });
  await page.waitForTimeout(500);
  await f.click('#btn-train', { force: true });
  console.log(`Training ${robotType} for 60s...`);

  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(10000);
    const stats = await f.evaluate(() => ({
      episode: document.getElementById('s-ep').textContent,
      dist: document.getElementById('s-dist').textContent,
      vel: document.getElementById('s-vel').textContent,
      rew: document.getElementById('s-rew').textContent,
      best: document.getElementById('s-best').textContent,
      avg: document.getElementById('s-avg').textContent,
      eps: document.getElementById('cfg-eps').textContent,
    }));
    console.log(`[t=${(i+1)*10}s]`, JSON.stringify(stats));
  }
  console.log('Page errors:', errors.length ? errors : 'none');

  await browser.close();
})();
