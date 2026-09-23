import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8098;
const FIXTURES = path.join(__dirname, '..', 'fixtures');

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

  await f.setInputFiles('#datasetFileInput', path.join(FIXTURES, 'image-image.json'));
  await page.waitForTimeout(500);
  await f.evaluate(() => { options_gridSize = 4; });
  await f.evaluate(() => { dsColumnConfig.input_img.role = 'input'; dsColumnConfig.input_img.type = 'image'; dsColumnConfig.input_img.imageEncoding = 'pixels'; renderDatasetModal(); });
  await f.evaluate(() => { dsColumnConfig.target_img.role = 'output'; dsColumnConfig.target_img.type = 'image'; dsColumnConfig.target_img.imageEncoding = 'pixels'; renderDatasetModal(); });
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(1000);

  console.log('Hint:', await f.evaluate(() => TASKS.custom.hint));

  await f.evaluate(() => { const opt = nodes.find(n => n.type === 'optimizer'); opt.lr = 0.03; render(); });
  await f.fill('#epochInput', '400');
  await f.click('#build', { force: true });
  await page.waitForTimeout(5000);
  const result = await f.evaluate(() => ({ badge: document.getElementById('statBadge').textContent, loss: document.getElementById('statLoss').textContent, history: lossHistory.slice() }));
  console.log('Badge:', result.badge, 'Final loss:', result.loss);
  console.log('First 3:', result.history.slice(0,3), 'Last 3:', result.history.slice(-3));
  console.log('Any NaN:', result.history.some(l => Number.isNaN(l)));
  console.log('Decreased:', result.history[result.history.length-1] < result.history[0]);

  await browser.close();
})();
