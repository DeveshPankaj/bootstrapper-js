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

  console.log('Found robot-sim frame');
  await page.waitForTimeout(3000); // wait for TF.js to load

  await targetFrame.click('#btn-train', { force: true });
  console.log('Clicked train (car, flat)');

  await page.waitForTimeout(20000);

  const carStats = await targetFrame.evaluate(() => ({
    episode: document.getElementById('s-ep').textContent,
    dist: document.getElementById('s-dist').textContent,
    vel: document.getElementById('s-vel').textContent,
    rew: document.getElementById('s-rew').textContent,
    best: document.getElementById('s-best').textContent,
    avg: document.getElementById('s-avg').textContent,
    loss: document.getElementById('s-loss').textContent,
    eps: document.getElementById('cfg-eps').textContent,
    mem: document.getElementById('cfg-mem').textContent,
  }));
  console.log('Car stats after 20s training:', JSON.stringify(carStats, null, 2));

  // Switch to walker and train
  await targetFrame.click('[data-robot="walker"]', { force: true });
  await page.waitForTimeout(1000);
  await targetFrame.click('#btn-train', { force: true });
  console.log('Clicked train (walker, flat)');
  await page.waitForTimeout(20000);

  const walkerStats = await targetFrame.evaluate(() => ({
    episode: document.getElementById('s-ep').textContent,
    dist: document.getElementById('s-dist').textContent,
    vel: document.getElementById('s-vel').textContent,
    rew: document.getElementById('s-rew').textContent,
    best: document.getElementById('s-best').textContent,
    avg: document.getElementById('s-avg').textContent,
    loss: document.getElementById('s-loss').textContent,
    eps: document.getElementById('cfg-eps').textContent,
    mem: document.getElementById('cfg-mem').textContent,
  }));
  console.log('Walker stats after 20s training:', JSON.stringify(walkerStats, null, 2));

  await browser.close();
})();
