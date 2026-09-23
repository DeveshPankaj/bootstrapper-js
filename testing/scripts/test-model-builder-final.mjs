import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8102;
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

async function uploadAndTrain(f, filename, mapping, epochs) {
  await f.setInputFiles('#datasetFileInput', path.join(SAMPLES, filename));
  await new Promise(r => setTimeout(r, 800));
  for (const [col, role, type] of mapping) await setColumnRole(f, col, role, type);
  await f.click('#dsConfirmBtn', { force: true });
  await new Promise(r => setTimeout(r, 1500));
  const err = await f.evaluate(() => document.getElementById('dsErrorMsg') ? document.getElementById('dsErrorMsg').textContent : '');
  if (err) return { error: err };
  const classNames = await f.evaluate(() => TASKS.custom.classNames);
  const plot2D = await f.evaluate(() => TASKS.custom.plot2D);
  await f.fill('#epochInput', String(epochs));
  await f.click('#build', { force: true });
  await new Promise(r => setTimeout(r, Math.max(3000, epochs * 25)));
  const result = await f.evaluate(() => ({ badge: document.getElementById('statBadge').textContent, loss: document.getElementById('statLoss').textContent }));
  return { classNames, plot2D, ...result };
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

  console.log('\n=== classification-4class.csv (synthetic, 4 classes, confusion matrix not plot2D) ===');
  console.log(JSON.stringify(await uploadAndTrain(f, 'classification-4class.csv', [['x1','input','number'],['x2','input','number'],['quadrant','output','class']], 150)));

  console.log('\n=== image-classification-4class.csv (synthetic, 4 shape classes) ===');
  await f.evaluate(() => { options_gridSize = 16; });
  console.log(JSON.stringify(await uploadAndTrain(f, 'image-classification-4class.csv', [['image','input','image'],['label','output','class']], 100)));

  console.log('\n=== iris-real.csv (REAL downloaded dataset, 3 species) ===');
  console.log(JSON.stringify(await uploadAndTrain(f, 'iris-real.csv', [
    ['sepal_length','input','number'],['sepal_width','input','number'],
    ['petal_length','input','number'],['petal_width','input','number'],
    ['species','output','class'],
  ], 200)));

  console.log('\n=== penguins.csv (REAL downloaded dataset, 3 species) ===');
  console.log(JSON.stringify(await uploadAndTrain(f, 'penguins.csv', [
    ['bill_length_mm','input','number'],['bill_depth_mm','input','number'],
    ['flipper_length_mm','input','number'],['body_mass_g','input','number'],
    ['species','output','class'],
  ], 150)));

  console.log('\n=== car-evaluation.csv (REAL downloaded dataset, 4 classes, categorical/text input) ===');
  console.log(JSON.stringify(await uploadAndTrain(f, 'car-evaluation.csv', [
    ['buying','input','text'],['maint','input','text'],['doors','input','text'],
    ['persons','input','text'],['lug_boot','input','text'],['safety','input','text'],
    ['acceptability','output','class'],
  ], 80)));

  console.log('\n=== FEATURE CHECK: image-segmentation.csv Input/Predicted/Actual comparison ===');
  await f.setInputFiles('#datasetFileInput', path.join(SAMPLES, 'image-segmentation.csv'));
  await page.waitForTimeout(800);
  await f.evaluate(() => { options_gridSize = 16; });
  await setColumnRole(f, 'image', 'input', 'image');
  await setColumnRole(f, 'mask', 'output', 'image');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(3000);
  await f.evaluate(() => { const opt = nodes.find(n => n.type === 'optimizer'); opt.lr = 0.03; render(); });
  await f.fill('#epochInput', '150');
  await f.click('#build', { force: true });
  await page.waitForTimeout(6000);
  await f.click('#predictBtn', { force: true });
  await page.waitForTimeout(500);
  const comparisonCheck = await f.evaluate(() => {
    const labels = [...document.querySelectorAll('#testResult div > div:first-child')].map(d => d.textContent);
    const canvases = document.querySelectorAll('#testResult canvas');
    return { labels, canvasCount: canvases.length };
  });
  console.log('Thumbnail labels shown:', JSON.stringify(comparisonCheck.labels), 'canvas count:', comparisonCheck.canvasCount);
  // Verify each canvas actually has distinct, non-blank content
  const canvasContents = await f.evaluate(() => {
    return [...document.querySelectorAll('#testResult canvas')].map(canvas => {
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i];
      return { width: canvas.width, sum };
    });
  });
  console.log('Canvas contents (non-zero sum = real image data):', JSON.stringify(canvasContents));

  console.log('\nFrame errors:', frameErrors.length ? frameErrors : 'none');
  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
