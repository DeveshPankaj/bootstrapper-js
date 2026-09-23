import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8099;
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
  page.on('pageerror', err => errors.push(err.message));
  const f = await openModelBuilder(page);
  console.log('Frame found:', !!f);
  if (!f) { await browser.close(); return; }
  const frameErrors = [];
  f.on('pageerror', e => frameErrors.push(e.message));

  console.log('\n=== Sample: classification.csv (2 numeric inputs -> class), check 2D plot fix ===');
  await f.setInputFiles('#datasetFileInput', path.join(SAMPLES, 'classification.csv'));
  await page.waitForTimeout(500);
  const parsed1 = await f.evaluate(() => ({ columns: dsParsed.columns, rows: dsParsed.records.length }));
  console.log(JSON.stringify(parsed1));
  await setColumnRole(f, 'x1', 'input', 'number');
  await setColumnRole(f, 'x2', 'input', 'number');
  await setColumnRole(f, 'label', 'output', 'class');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(500);
  const taskCheck1 = await f.evaluate(() => ({ plot2D: TASKS.custom.plot2D, classNames: TASKS.custom.classNames, error: document.getElementById('dsErrorMsg') ? document.getElementById('dsErrorMsg').textContent : null }));
  console.log('plot2D:', taskCheck1.plot2D, 'classNames:', JSON.stringify(taskCheck1.classNames));

  await f.fill('#epochInput', '200');
  await f.click('#build', { force: true });
  await page.waitForTimeout(4000);
  const train1 = await f.evaluate(() => ({ badge: document.getElementById('statBadge').textContent, loss: document.getElementById('statLoss').textContent }));
  console.log('Badge:', train1.badge, 'Loss:', train1.loss);

  // Check the plot canvas actually has non-background pixels (decision surface drawn)
  const plotPixelCheck = await f.evaluate(() => {
    const canvas = document.getElementById('plot');
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonBackground = 0;
    for (let i = 0; i < data.length; i += 4) {
      // background fill is #16161a = (22,22,26)
      if (!(data[i] === 22 && data[i+1] === 22 && data[i+2] === 26)) nonBackground++;
    }
    return { totalPixels: data.length / 4, nonBackground, canvasDisplay: getComputedStyle(canvas).display };
  });
  console.log('Plot canvas non-background pixels:', plotPixelCheck.nonBackground, '/', plotPixelCheck.totalPixels, 'display:', plotPixelCheck.canvasDisplay);
  const plotTitle = await f.evaluate(() => document.getElementById('plotCardTitle').textContent);
  console.log('Plot title:', plotTitle);

  console.log('\n=== Sample: image-classification.csv (base64 PNG images -> class) ===');
  await f.setInputFiles('#datasetFileInput', path.join(SAMPLES, 'image-classification.csv'));
  await page.waitForTimeout(500);
  const parsed2 = await f.evaluate(() => ({ columns: dsParsed.columns, rows: dsParsed.records.length, sampleLen: dsParsed.records[0].image.length }));
  console.log(JSON.stringify(parsed2));
  await f.evaluate(() => { options_gridSize = 16; });
  await setColumnRole(f, 'image', 'input', 'image');
  await setColumnRole(f, 'label', 'output', 'class');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(3000); // base64 PNG decode via <img> for 60 rows takes a moment
  const taskCheck2 = await f.evaluate(() => ({
    error: document.getElementById('dsErrorMsg') ? document.getElementById('dsErrorMsg').textContent : null,
    isImage: TASKS.custom ? TASKS.custom.isImage : null,
    classNames: TASKS.custom ? TASKS.custom.classNames : null,
    hint: TASKS.custom ? TASKS.custom.hint : null,
  }));
  console.log(JSON.stringify(taskCheck2, null, 2));
  await f.fill('#epochInput', '80');
  await f.click('#build', { force: true });
  await page.waitForTimeout(4000);
  const train2 = await f.evaluate(() => ({ badge: document.getElementById('statBadge').textContent, loss: document.getElementById('statLoss').textContent }));
  console.log('Badge:', train2.badge, 'Loss:', train2.loss);

  console.log('\n=== Sample: image-segmentation.csv (base64 image -> base64 mask) ===');
  await f.setInputFiles('#datasetFileInput', path.join(SAMPLES, 'image-segmentation.csv'));
  await page.waitForTimeout(500);
  const parsed3 = await f.evaluate(() => ({ columns: dsParsed.columns, rows: dsParsed.records.length }));
  console.log(JSON.stringify(parsed3));
  await f.evaluate(() => { options_gridSize = 16; });
  await setColumnRole(f, 'image', 'input', 'image');
  await setColumnRole(f, 'mask', 'output', 'image');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(4000); // decoding 120 base64 PNGs (input+mask x60 rows)
  const taskCheck3 = await f.evaluate(() => ({
    error: document.getElementById('dsErrorMsg') ? document.getElementById('dsErrorMsg').textContent : null,
    isImage: TASKS.custom ? TASKS.custom.isImage : null,
    isImageOutput: TASKS.custom ? TASKS.custom.isImageOutput : null,
    outputGrid: TASKS.custom ? TASKS.custom.outputGrid : null,
    hint: TASKS.custom ? TASKS.custom.hint : null,
  }));
  console.log(JSON.stringify(taskCheck3, null, 2));
  await f.evaluate(() => { const opt = nodes.find(n => n.type === 'optimizer'); opt.lr = 0.03; render(); });
  await f.fill('#epochInput', '150');
  await f.click('#build', { force: true });
  await page.waitForTimeout(6000);
  const train3 = await f.evaluate(() => ({ badge: document.getElementById('statBadge').textContent, loss: document.getElementById('statLoss').textContent, history: lossHistory.slice() }));
  console.log('Badge:', train3.badge, 'Loss:', train3.loss, 'Any NaN:', train3.history.some(l => Number.isNaN(l)));
  await f.click('#predictBtn', { force: true });
  await page.waitForTimeout(300);
  const predictCheck3 = await f.evaluate(() => {
    const canvas = document.getElementById('testResult').querySelector('canvas');
    return { hasCanvas: !!canvas };
  });
  console.log('Segmentation predict thumbnail rendered:', predictCheck3.hasCanvas);

  console.log('\nFrame errors:', frameErrors.length ? frameErrors : 'none');
  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
