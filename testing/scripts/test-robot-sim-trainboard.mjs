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

  await f.click('#btn-train', { force: true });
  console.log('Training car for 15s (should log to TrainBoard each episode)...');
  await page.waitForTimeout(15000);
  await f.click('#btn-train', { force: true }); // stop

  // Check the shared log file directly via the top-level platform fs
  const logCheck = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    const path = '/home/user1/.local/share/trainboard/log.jsonl';
    try {
      const exists = fs.existsSync(path);
      const content = exists ? fs.readFileSync(path, 'utf-8') : null;
      const rows = content ? content.trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
      return { exists, rowCount: rows.length, sample: rows.slice(0, 5), runs: [...new Set(rows.map(r => r.run))] };
    } catch (e) { return { error: e.message }; }
  });
  console.log('TrainBoard log file check:', JSON.stringify(logCheck, null, 2));

  // Now open TrainBoard itself and confirm it renders the data
  await page.evaluate(() => {
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.trainboard'))", window.platform);
  });
  await page.waitForTimeout(2000);

  let tb = null;
  for (const fr of page.frames()) {
    if (fr.url().includes('trainboard/main.html')) { tb = fr; break; }
  }
  if (!tb) { console.log('TrainBoard frame not found'); await browser.close(); return; }
  await page.waitForTimeout(1500);

  const tbState = await tb.evaluate(() => ({
    status: document.getElementById('status').textContent,
    runPills: document.querySelectorAll('.run-pill').length,
    chartCards: document.querySelectorAll('.chart-card').length,
    runNames: [...document.querySelectorAll('.run-pill')].map(p => p.textContent.trim()),
  }));
  console.log('TrainBoard UI state:', JSON.stringify(tbState));

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
