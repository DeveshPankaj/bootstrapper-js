import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
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

  await page.waitForTimeout(3000); // wait for TF.js

  await targetFrame.click('[data-robot="walker"]', { force: true });
  await page.waitForTimeout(1000);
  await targetFrame.click('#btn-train', { force: true });
  console.log('Training walker (4-action gait primitives)...');

  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(15000);
    const stats = await targetFrame.evaluate(() => ({
      episode: document.getElementById('s-ep').textContent,
      dist: document.getElementById('s-dist').textContent,
      vel: document.getElementById('s-vel').textContent,
      rew: document.getElementById('s-rew').textContent,
      best: document.getElementById('s-best').textContent,
      avg: document.getElementById('s-avg').textContent,
      eps: document.getElementById('cfg-eps').textContent,
    }));
    console.log(`[t=${(i+1)*15}s]`, JSON.stringify(stats));
  }

  await browser.close();
})();
