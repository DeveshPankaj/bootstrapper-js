import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8100;
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

function canvasHasContent(f, selector) {
  return f.evaluate((sel) => {
    const canvas = document.querySelector(sel);
    if (!canvas || !canvas.width || !canvas.height) return { exists: !!canvas, nonBlank: false };
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonZero = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 0 || data[i+1] !== 0 || data[i+2] !== 0) nonZero++;
    }
    return { exists: true, nonBlank: nonZero > 0, nonZeroPixels: nonZero };
  }, selector);
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

  console.log('\n=== BUG FIX CHECK: image-classification.csv — sample should render BEFORE clicking Build & Train ===');
  await f.setInputFiles('#datasetFileInput', path.join(SAMPLES, 'image-classification.csv'));
  await page.waitForTimeout(500);
  await f.evaluate(() => { options_gridSize = 16; });
  await setColumnRole(f, 'image', 'input', 'image');
  await setColumnRole(f, 'label', 'output', 'class');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(3000); // base64 PNG decode for 60 rows

  const preTrainState = await f.evaluate(() => ({
    trainDataLen: trainData.length,
    pendingImageSample: !!pendingImageSample,
    netIsNull: net === null,
    predictDisabled: predictBtn.disabled,
  }));
  console.log('Before training:', JSON.stringify(preTrainState));
  const sampleCanvasBeforeTrain = await canvasHasContent(f, '#sampleCanvas');
  console.log('Sample canvas before training:', JSON.stringify(sampleCanvasBeforeTrain));

  console.log('--- Click "Random Test Sample" again to confirm the button itself also works ---');
  await f.click('#testInputs button', { force: true });
  await page.waitForTimeout(300);
  const sampleCanvasAfterClick = await canvasHasContent(f, '#sampleCanvas');
  console.log('Sample canvas after clicking Random Test Sample:', JSON.stringify(sampleCanvasAfterClick));

  console.log('--- Now actually train it ---');
  await f.fill('#epochInput', '80');
  await f.click('#build', { force: true });
  await page.waitForTimeout(4000);
  const train1 = await f.evaluate(() => ({ badge: document.getElementById('statBadge').textContent, loss: document.getElementById('statLoss').textContent }));
  console.log('Badge:', train1.badge, 'Loss:', train1.loss);
  const predictEnabledAfterTrain = await f.evaluate(() => !predictBtn.disabled);
  console.log('Predict enabled after training:', predictEnabledAfterTrain);
  await f.click('#predictBtn', { force: true });
  await page.waitForTimeout(300);
  console.log('Predict result:', await f.evaluate(() => document.getElementById('testResult').textContent));

  console.log('\n=== BUG FIX CHECK: image-segmentation.csv — sample should render BEFORE training ===');
  await f.setInputFiles('#datasetFileInput', path.join(SAMPLES, 'image-segmentation.csv'));
  await page.waitForTimeout(500);
  await f.evaluate(() => { options_gridSize = 16; });
  await setColumnRole(f, 'image', 'input', 'image');
  await setColumnRole(f, 'mask', 'output', 'image');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(4000);
  const preTrainState2 = await f.evaluate(() => ({ trainDataLen: trainData.length, netIsNull: net === null }));
  console.log('Before training:', JSON.stringify(preTrainState2));
  const sampleCanvas2 = await canvasHasContent(f, '#sampleCanvas');
  console.log('Sample canvas before training (segmentation input image):', JSON.stringify(sampleCanvas2));
  await f.evaluate(() => { const opt = nodes.find(n => n.type === 'optimizer'); opt.lr = 0.03; render(); });
  await f.fill('#epochInput', '150');
  await f.click('#build', { force: true });
  await page.waitForTimeout(6000);
  const train2 = await f.evaluate(() => ({ badge: document.getElementById('statBadge').textContent, loss: document.getElementById('statLoss').textContent, history: lossHistory.slice() }));
  console.log('Badge:', train2.badge, 'Loss:', train2.loss, 'Any NaN:', train2.history.some(l => Number.isNaN(l)));

  console.log('\n=== Re-verify classification.csv (2D plot) still trains fine after this change ===');
  await f.setInputFiles('#datasetFileInput', path.join(SAMPLES, 'classification.csv'));
  await page.waitForTimeout(500);
  await setColumnRole(f, 'x1', 'input', 'number');
  await setColumnRole(f, 'x2', 'input', 'number');
  await setColumnRole(f, 'label', 'output', 'class');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(500);
  await f.fill('#epochInput', '200');
  await f.click('#build', { force: true });
  await page.waitForTimeout(4000);
  const train3 = await f.evaluate(() => ({ badge: document.getElementById('statBadge').textContent, loss: document.getElementById('statLoss').textContent }));
  console.log('Badge:', train3.badge, 'Loss:', train3.loss);

  console.log('\nFrame errors:', frameErrors.length ? frameErrors : 'none');
  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
