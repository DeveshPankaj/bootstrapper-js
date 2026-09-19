import { chromium } from 'playwright';

const PORT = process.env.PORT || 8085;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
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
  if (!f) { console.log('Notebook frame not found'); console.log(page.frames().map(x => x.url())); await browser.close(); return; }
  await page.waitForTimeout(1000);

  console.log('=== Confirm all expected default cells exist ===');
  const cellSources = await f.evaluate(() => cells.map(c => c.type === 'code' ? c.cm.getValue().split('\n')[0] : c.mdEl ? c.mdEl.textContent : ''));
  console.log(JSON.stringify(cellSources, null, 2));

  // Find our new cells by their leading comment/heading text.
  const findCellIndex = (needle) => cellSources.findIndex(s => s.includes(needle));
  const idxLoad = findCellIndex('8. mini_torch');
  const idxAutograd = findCellIndex('9. Basic autograd');
  const idxTrain = findCellIndex('10. Model building');
  const idxConv3d = findCellIndex('11. Conv3d');
  console.log('Cell indices:', { idxLoad, idxAutograd, idxTrain, idxConv3d });

  const runCell = async (idx) => {
    const result = await f.evaluate(async (i) => {
      const cell = cells[i];
      const out = await execPython(cell.cm.getValue());
      return out;
    }, idx);
    return result;
  };

  console.log('=== Run cell 8: load mini_torch ===');
  const r8 = await runCell(idxLoad);
  console.log('stdout:', r8.stdout);
  console.log('error:', r8.error || 'none');

  console.log('=== Run cell 9: basic autograd ===');
  const r9 = await runCell(idxAutograd);
  console.log('stdout:', r9.stdout);
  console.log('error:', r9.error || 'none');

  console.log('=== Run cell 10: full training loop (BaseModel/Sequential/Conv2d/Linear/SGD) ===');
  const r10 = await runCell(idxTrain);
  console.log('stdout:', r10.stdout);
  console.log('error:', r10.error || 'none');

  console.log('=== Run cell 11: Conv3d check ===');
  const r11 = await runCell(idxConv3d);
  console.log('stdout:', r11.stdout);
  console.log('error:', r11.error || 'none');

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
