import { chromium } from 'playwright';
const PORT = process.env.PORT || 8085;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://localhost:${PORT}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(4000);
  await page.waitForFunction(() => !!(window.platform && window.platform.host), { timeout: 15000 });
  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/notebook/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.notebook'))", window.platform);
  });
  await page.waitForTimeout(2500);
  let f = null;
  for (const fr of page.frames()) { if (fr.url().includes('notebook/notebook.html')) { f = fr; break; } }
  await page.waitForTimeout(1000);

  // Run cells 8-10 in order (using the app's own runCell, same as a real
  // Shift+Enter), then scroll to and screenshot cell 10's output.
  for (const needle of ['8. mini_torch', '9. Basic autograd', '10. Model building']) {
    const idx = await f.evaluate((n) => cells.findIndex(c => c.type === 'code' && c.cm.getValue().includes(n)), needle);
    await f.evaluate(async (i) => { await runCell(cells[i], true); }, idx);
    await page.waitForTimeout(800);
  }
  const lastIdx = await f.evaluate(() => cells.findIndex(c => c.type === 'code' && c.cm.getValue().includes('10. Model building')));
  await f.evaluate((i) => cells[i].el.scrollIntoView({ block: 'center' }), lastIdx);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'testing/screenshots/notebook-mini-torch-training.png' });
  await browser.close();
})();
