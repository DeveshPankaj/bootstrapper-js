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

  console.log('\n=== TEST 4: CSV numbers -> number (regression) ===');
  await f.setInputFiles('#datasetFileInput', path.join(FIXTURES, 'numbers-number.csv'));
  await page.waitForTimeout(500);
  await setColumnRole(f, 'x1', 'input', 'number');
  await setColumnRole(f, 'x2', 'input', 'number');
  await setColumnRole(f, 'y', 'output', 'number');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(1000);
  const afterLoad4 = await f.evaluate(() => ({
    isRegression: TASKS.custom.isRegression,
    outputActivation: TASKS.custom.outputActivation,
    outputSize: TASKS.custom.outputSize,
  }));
  console.log(JSON.stringify(afterLoad4));
  await f.fill('#epochInput', '150');
  await f.click('#build', { force: true });
  await page.waitForTimeout(3000);
  const train4 = await f.evaluate(() => ({ badge: document.getElementById('statBadge').textContent, loss: document.getElementById('statLoss').textContent, lossHistory: lossHistory.slice() }));
  console.log('Badge:', train4.badge, 'Final loss:', train4.loss, 'Decreased:', train4.lossHistory[train4.lossHistory.length-1] < train4.lossHistory[0]);
  await f.evaluate(() => { const inputs = document.querySelectorAll('#testInputs input'); inputs[0].value = '0.5'; inputs[1].value = '0.5'; });
  await f.click('#predictBtn', { force: true });
  await page.waitForTimeout(300);
  console.log('Predict text:', await f.evaluate(() => document.getElementById('testResult').textContent));

  console.log('\n=== TEST 5: JSON image -> image (reconstruction, isImageOutput thumbnail) ===');
  await f.setInputFiles('#datasetFileInput', path.join(FIXTURES, 'image-image.json'));
  await page.waitForTimeout(500);
  const parsedCheck5 = await f.evaluate(() => ({ columns: dsParsed.columns, rowCount: dsParsed.records.length }));
  console.log(JSON.stringify(parsedCheck5));
  await f.evaluate(() => { options_gridSize = 4; });
  await setColumnRole(f, 'input_img', 'input', 'image');
  await f.evaluate(() => { dsColumnConfig.input_img.imageEncoding = 'pixels'; });
  await setColumnRole(f, 'target_img', 'output', 'image');
  await f.evaluate(() => { dsColumnConfig.target_img.imageEncoding = 'pixels'; });
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(1000);
  const afterLoad5 = await f.evaluate(() => ({
    error: document.getElementById('dsErrorMsg') ? document.getElementById('dsErrorMsg').textContent : null,
    isImage: TASKS.custom ? TASKS.custom.isImage : null,
    isImageOutput: TASKS.custom ? TASKS.custom.isImageOutput : null,
    outputGrid: TASKS.custom ? TASKS.custom.outputGrid : null,
    outputSize: TASKS.custom ? TASKS.custom.outputSize : null,
  }));
  console.log(JSON.stringify(afterLoad5));
  await f.fill('#epochInput', '200');
  await f.click('#build', { force: true });
  await page.waitForTimeout(4000);
  const train5 = await f.evaluate(() => ({ badge: document.getElementById('statBadge').textContent, loss: document.getElementById('statLoss').textContent, lossHistory: lossHistory.slice() }));
  console.log('Badge:', train5.badge, 'Final loss:', train5.loss, 'Decreased:', train5.lossHistory[train5.lossHistory.length-1] < train5.lossHistory[0]);
  await f.click('#predictBtn', { force: true });
  await page.waitForTimeout(300);
  const predictCanvas5 = await f.evaluate(() => {
    const el = document.getElementById('testResult');
    const canvas = el.querySelector('canvas');
    return { hasCanvas: !!canvas, width: canvas ? canvas.width : null, text: el.textContent };
  });
  console.log('Image-output prediction result:', JSON.stringify(predictCanvas5));

  console.log('\n=== TEST 6: SQLite .db numbers -> class ===');
  await f.setInputFiles('#datasetFileInput', path.join(FIXTURES, 'numbers-class.db'));
  await page.waitForTimeout(3000); // sql.js WASM load takes a moment
  const modalOpen6 = await f.evaluate(() => document.getElementById('dsOverlay').classList.contains('show'));
  const parsedCheck6 = await f.evaluate(() => dsParsed ? { columns: dsParsed.columns, rowCount: dsParsed.records.length, table: dsParsed.table } : null);
  console.log('Modal opened:', modalOpen6, 'Parsed:', JSON.stringify(parsedCheck6));
  if (parsedCheck6) {
    await setColumnRole(f, 'feat1', 'input', 'number');
    await setColumnRole(f, 'feat2', 'input', 'number');
    await setColumnRole(f, 'label', 'output', 'class');
    await f.click('#dsConfirmBtn', { force: true });
    await page.waitForTimeout(1000);
    const afterLoad6 = await f.evaluate(() => ({ classNames: TASKS.custom ? TASKS.custom.classNames : null, error: document.getElementById('dsErrorMsg') ? document.getElementById('dsErrorMsg').textContent : null }));
    console.log(JSON.stringify(afterLoad6));
    await f.fill('#epochInput', '100');
    await f.click('#build', { force: true });
    await page.waitForTimeout(3000);
    const train6 = await f.evaluate(() => ({ badge: document.getElementById('statBadge').textContent, loss: document.getElementById('statLoss').textContent }));
    console.log('Badge:', train6.badge, 'Final loss:', train6.loss);
  }

  console.log('\nFrame errors:', frameErrors.length ? frameErrors : 'none');
  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
