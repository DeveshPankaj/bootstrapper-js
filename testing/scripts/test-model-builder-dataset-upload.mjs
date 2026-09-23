import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8098;
const FIXTURES = path.join(__dirname, '..', 'fixtures');

async function openModelBuilder(page) {
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
  return f;
}

async function setColumnRole(f, col, role, type) {
  await f.evaluate(({ col, role, type }) => {
    dsColumnConfig[col].role = role;
    if (type) dsColumnConfig[col].type = type;
    renderDatasetModal();
  }, { col, role, type });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  const f = await openModelBuilder(page);
  console.log('Frame found:', !!f);
  if (!f) { await browser.close(); return; }
  const frameErrors = [];
  f.on('pageerror', e => frameErrors.push(e.message));

  console.log('\n=== TEST 1: CSV numbers -> class ===');
  await f.setInputFiles('#datasetFileInput', path.join(FIXTURES, 'numbers-class.csv'));
  await page.waitForTimeout(500);
  const modalOpen1 = await f.evaluate(() => document.getElementById('dsOverlay').classList.contains('show'));
  console.log('Modal opened:', modalOpen1);
  const parsedCheck1 = await f.evaluate(() => ({ columns: dsParsed.columns, rowCount: dsParsed.records.length, sample: dsParsed.records[0] }));
  console.log(JSON.stringify(parsedCheck1));

  await setColumnRole(f, 'feat1', 'input', 'number');
  await setColumnRole(f, 'feat2', 'input', 'number');
  await setColumnRole(f, 'label', 'output', 'class');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(1000);

  const afterLoad1 = await f.evaluate(() => ({
    modalClosed: !document.getElementById('dsOverlay').classList.contains('show'),
    taskSelValue: document.getElementById('task').value,
    hasCustomOption: !!document.querySelector('#task option[value="custom"]'),
    taskHint: TASKS.custom ? TASKS.custom.hint : null,
    classNames: TASKS.custom ? TASKS.custom.classNames : null,
    outputSize: TASKS.custom ? TASKS.custom.outputSize : null,
  }));
  console.log(JSON.stringify(afterLoad1, null, 2));

  console.log('--- Train on it ---');
  await f.fill('#epochInput', '150');
  await f.click('#build', { force: true });
  await page.waitForTimeout(4000);
  const train1 = await f.evaluate(() => ({ badge: document.getElementById('statBadge').textContent, loss: document.getElementById('statLoss').textContent, lossHistory: lossHistory.slice() }));
  console.log('Badge:', train1.badge, 'Final loss:', train1.loss);
  console.log('Loss decreased:', train1.lossHistory[train1.lossHistory.length - 1] < train1.lossHistory[0]);
  const confusion1 = await f.evaluate(() => document.getElementById('confusionWrap').innerHTML.length > 0);
  console.log('Confusion matrix rendered:', confusion1);

  console.log('\n=== TEST 2: JSON text -> class (bag-of-words) ===');
  await f.setInputFiles('#datasetFileInput', path.join(FIXTURES, 'text-class.json'));
  await page.waitForTimeout(500);
  const parsedCheck2 = await f.evaluate(() => ({ columns: dsParsed.columns, rowCount: dsParsed.records.length }));
  console.log(JSON.stringify(parsedCheck2));
  await setColumnRole(f, 'review', 'input', 'text');
  await setColumnRole(f, 'sentiment', 'output', 'class');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(1000);
  const afterLoad2 = await f.evaluate(() => ({
    inputSize: TASKS.custom.inputSize,
    classNames: TASKS.custom.classNames,
    hint: TASKS.custom.hint,
  }));
  console.log(JSON.stringify(afterLoad2, null, 2));
  await f.fill('#epochInput', '100');
  await f.click('#build', { force: true });
  await page.waitForTimeout(3000);
  const train2 = await f.evaluate(() => ({ badge: document.getElementById('statBadge').textContent, loss: document.getElementById('statLoss').textContent }));
  console.log('Badge:', train2.badge, 'Final loss:', train2.loss);

  console.log('\n=== TEST 3: JSON pixel-array image -> class ===');
  await f.setInputFiles('#datasetFileInput', path.join(FIXTURES, 'image-class.json'));
  await page.waitForTimeout(500);
  const parsedCheck3 = await f.evaluate(() => ({ columns: dsParsed.columns, rowCount: dsParsed.records.length }));
  console.log(JSON.stringify(parsedCheck3));
  await f.evaluate(() => { options_gridSize = 4; });
  await setColumnRole(f, 'pixels', 'input', 'image');
  await f.evaluate(() => { dsColumnConfig.pixels.imageEncoding = 'pixels'; });
  await setColumnRole(f, 'shape', 'output', 'class');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(1000);
  const afterLoad3 = await f.evaluate(() => ({
    isImage: TASKS.custom.isImage,
    inputShape: TASKS.custom.inputShape,
    classNames: TASKS.custom.classNames,
    errorShown: document.getElementById('dsErrorMsg') ? document.getElementById('dsErrorMsg').textContent : null,
  }));
  console.log(JSON.stringify(afterLoad3, null, 2));
  await f.fill('#epochInput', '100');
  await f.click('#build', { force: true });
  await page.waitForTimeout(3000);
  const train3 = await f.evaluate(() => ({ badge: document.getElementById('statBadge').textContent, loss: document.getElementById('statLoss').textContent }));
  console.log('Badge:', train3.badge, 'Final loss:', train3.loss);
  const sampleCanvasVisible = await f.evaluate(() => !!document.getElementById('sampleCanvas'));
  console.log('Image test-sample canvas shown (isImage path):', sampleCanvasVisible);

  console.log('\nFrame errors:', frameErrors.length ? frameErrors : 'none');
  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
