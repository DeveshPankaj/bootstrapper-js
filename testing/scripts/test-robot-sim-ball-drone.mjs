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

  let targetFrame = null;
  for (const f of page.frames()) {
    if (f.url().includes('robot-sim/main.html')) { targetFrame = f; break; }
  }
  if (!targetFrame) { console.log('Frame not found'); await browser.close(); return; }
  await page.waitForTimeout(3000);

  for (const robotType of ['ball', 'drone']) {
    await targetFrame.click(`[data-robot="${robotType}"]`, { force: true });
    await page.waitForTimeout(1000);
    await targetFrame.click('#btn-train', { force: true });
    console.log(`Training ${robotType}...`);
    await page.waitForTimeout(20000);
    const stats = await targetFrame.evaluate(() => ({
      episode: document.getElementById('s-ep').textContent,
      dist: document.getElementById('s-dist').textContent,
      vel: document.getElementById('s-vel').textContent,
      rew: document.getElementById('s-rew').textContent,
      best: document.getElementById('s-best').textContent,
      avg: document.getElementById('s-avg').textContent,
      eps: document.getElementById('cfg-eps').textContent,
    }));
    console.log(`${robotType} after 20s:`, JSON.stringify(stats));
    await targetFrame.click('#btn-train', { force: true }); // stop
  }

  await browser.close();
})();
