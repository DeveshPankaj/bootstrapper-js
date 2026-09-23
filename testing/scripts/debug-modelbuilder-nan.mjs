import { chromium } from 'playwright';
const PORT = process.env.PORT || 8098;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(10000);
  await page.evaluate(() => {
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.model-builder'))", window.platform);
  });
  let f = null;
  for (let attempt = 0; attempt < 10 && !f; attempt++) {
    await page.waitForTimeout(1000);
    for (const fr of page.frames()) { if (fr.url().includes('model-builder/main.html')) { f = fr; break; } }
  }
  if (!f) { console.log('frame not found'); await browser.close(); return; }

  console.log('=== Built-in housePrice task, default graph (Dense(6), lr=0.5, sgd), no changes ===');
  await f.selectOption('#task', 'housePrice');
  await page.waitForTimeout(300);
  await f.fill('#epochInput', '150');
  await f.click('#build', { force: true });
  await page.waitForTimeout(3000);
  const r1 = await f.evaluate(() => ({ badge: document.getElementById('statBadge').textContent, loss: document.getElementById('statLoss').textContent, history: lossHistory.slice() }));
  console.log(JSON.stringify({ badge: r1.badge, loss: r1.loss, first3: r1.history.slice(0,3), last3: r1.history.slice(-3) }));

  console.log('\n=== Same task, but with a lower learning rate (0.05) ===');
  await f.evaluate(() => { const opt = nodes.find(n => n.type === 'optimizer'); opt.lr = 0.05; render(); });
  await f.click('#build', { force: true });
  await page.waitForTimeout(3000);
  const r2 = await f.evaluate(() => ({ badge: document.getElementById('statBadge').textContent, loss: document.getElementById('statLoss').textContent, history: lossHistory.slice() }));
  console.log(JSON.stringify({ badge: r2.badge, loss: r2.loss, first3: r2.history.slice(0,3), last3: r2.history.slice(-3) }));

  await browser.close();
})();
