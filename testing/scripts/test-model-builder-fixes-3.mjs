import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8101;
const FIXTURES = path.join(__dirname, '..', 'fixtures');
const SAMPLES = path.join(__dirname, '..', '..', 'docs', 'public', 'mount', 'opt', 'apps', 'model-builder', 'sample-datasets');

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
  const dialogs = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
  const f = await openModelBuilder(page);
  console.log('Frame found:', !!f);
  if (!f) { await browser.close(); return; }
  const frameErrors = [];
  const frameDialogs = [];
  f.on('pageerror', e => frameErrors.push(e.message));
  f.on('dialog', d => { frameDialogs.push(d.message()); d.dismiss(); });

  console.log('\n=== XSS/escaping check: malicious column name + class label ===');
  await f.setInputFiles('#datasetFileInput', path.join(FIXTURES, 'xss-test.csv'));
  await page.waitForTimeout(500);
  const columns = await f.evaluate(() => dsParsed.columns);
  console.log('Columns:', JSON.stringify(columns));
  const labelCol = columns.find(c => c.includes('label'));
  await setColumnRole(f, 'x1', 'input', 'number');
  await setColumnRole(f, 'x2', 'input', 'number');
  await setColumnRole(f, labelCol, 'output', 'class');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(500);

  // Did the malicious column-name/label injection actually execute any script?
  const xssFired = await f.evaluate(() => !!(window.__xssFired || window.__xssFired2));
  console.log('XSS payload executed (should be false):', xssFired);
  console.log('Dialogs triggered (should be empty):', JSON.stringify([...dialogs, ...frameDialogs]));

  // Confirm the raw HTML in the modal is escaped, not interpreted as real tags
  const colNameRendered = await f.evaluate((labelCol) => {
    const rows = [...document.querySelectorAll('.dsColRow')];
    const row = rows.find(r => r.dataset.col === labelCol);
    return row ? row.querySelector('.dsColName').innerHTML : null;
  }, labelCol);
  console.log('Column name cell innerHTML (should show &lt;img... not a real <img>):', colNameRendered);
  const hasRealImgTag = await f.evaluate(() => !!document.querySelector('.dsColName img'));
  console.log('Real <img> tag present in modal (should be false):', hasRealImgTag);

  console.log('--- Train + check confusion matrix / predict panel are escaped ---');
  await f.fill('#epochInput', '80');
  await f.click('#build', { force: true });
  await page.waitForTimeout(2000);
  const confusionHasRealTag = await f.evaluate(() => !!document.querySelector('#confusionWrap img, #confusionWrap script'));
  console.log('Confusion matrix has a real injected tag (should be false):', confusionHasRealTag);
  await f.click('#predictBtn', { force: true });
  await page.waitForTimeout(300);
  const predictHasRealTag = await f.evaluate(() => !!document.querySelector('#testResult img, #testResult script'));
  console.log('Predict panel has a real injected tag (should be false):', predictHasRealTag);
  console.log('Predict panel text (truncated, escaped):', await f.evaluate(() => document.getElementById('testResult').textContent));

  console.log('\n=== Validation error: picking a base64 image column as class output ===');
  await f.setInputFiles('#datasetFileInput', path.join(SAMPLES, 'image-classification.csv'));
  await page.waitForTimeout(500);
  await setColumnRole(f, 'label', 'input', 'number'); // give it *some* input column so we reach the output validation
  await setColumnRole(f, 'image', 'output', 'class'); // deliberately wrong: image column as class output
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(500);
  const errMsg = await f.evaluate(() => document.getElementById('dsErrorMsg').textContent);
  console.log('Error message shown:', errMsg);
  const modalStillOpen = await f.evaluate(() => document.getElementById('dsOverlay').classList.contains('show'));
  console.log('Modal still open (should be true, load blocked):', modalStillOpen);

  console.log('\n=== Grid-size auto-detect: image-classification.csv (16x16 real images), via REAL UI interaction ===');
  await f.setInputFiles('#datasetFileInput', path.join(SAMPLES, 'image-classification.csv'));
  await page.waitForTimeout(500);
  const gridBefore = await f.evaluate(() => options_gridSize);
  console.log('Grid size before assigning role:', gridBefore);
  // Real <select> interaction (fires a genuine 'change' event, unlike
  // setColumnRole()'s direct state mutation) so it actually goes through
  // roleSel.onchange -> maybeAutoDetectGridSize(), the real code path.
  await f.selectOption('.dsColRow[data-col="image"] .dsRole', 'input');
  await page.waitForTimeout(800); // async image decode for detection
  const gridAfter = await f.evaluate(() => options_gridSize);
  console.log('Grid size after auto-detect (should be 16, not the old fixed default of 14):', gridAfter);
  const hintText = await f.evaluate(() => {
    const label = [...document.querySelectorAll('.dsRow2 label')].find(l => l.textContent.includes('grid size'));
    return label ? label.textContent : null;
  });
  console.log('Grid size field hint text:', hintText);

  console.log('--- Manually overriding it should stick (not get clobbered by another detect pass) ---');
  await f.fill('#dsGridSize', '20');
  await f.evaluate(() => document.getElementById('dsGridSize').dispatchEvent(new Event('input')));
  await f.selectOption('.dsColRow[data-col="label"] .dsRole', 'output');
  await f.selectOption('.dsColRow[data-col="label"] .dsType', 'class');
  await page.waitForTimeout(500);
  const gridAfterManualOverride = await f.evaluate(() => options_gridSize);
  console.log('Grid size after manual override + further changes (should stay 20):', gridAfterManualOverride);

  console.log('\nFrame errors:', frameErrors.length ? frameErrors : 'none');
  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
