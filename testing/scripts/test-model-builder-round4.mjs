import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8105;
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

  console.log('\n=== BUG FIX: image-segmentation.csv should NOT show NaN loss with default settings anymore ===');
  await f.setInputFiles('#datasetFileInput', path.join(SAMPLES, 'image-segmentation.csv'));
  await page.waitForTimeout(800);
  await f.evaluate(() => { options_gridSize = 16; });
  await setColumnRole(f, 'image', 'input', 'image');
  await setColumnRole(f, 'mask', 'output', 'image');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(2000);
  const optimizerLr = await f.evaluate(() => nodes.find(n => n.type === 'optimizer').lr);
  console.log('Optimizer lr auto-applied (should be 0.03, not the 0.5 default):', optimizerLr);
  const lrInputDisplayed = await f.evaluate(() => {
    const optNode = nodes.find(n => n.type === 'optimizer');
    const el = document.querySelector(`[data-node-id="${optNode.id}"] .lr`);
    return el ? el.value : null;
  });
  console.log('Optimizer lr shown in the node UI (should also read 0.03):', lrInputDisplayed);

  console.log('--- Train with NO manual changes (the exact bug-report scenario) ---');
  await f.fill('#epochInput', '150');
  await f.click('#build', { force: true });
  await page.waitForTimeout(6000);
  const result = await f.evaluate(() => ({ badge: document.getElementById('statBadge').textContent, loss: document.getElementById('statLoss').textContent, history: lossHistory.slice() }));
  console.log('Badge:', result.badge, 'Final loss:', result.loss);
  console.log('Any NaN in loss history:', result.history.some(l => Number.isNaN(l)));

  console.log('\n=== NEW FEATURE: penguins-3d.csv (real dataset, exactly 3 numeric inputs) -> native 3D scatter ===');
  await f.setInputFiles('#datasetFileInput', path.join(SAMPLES, 'penguins-3d.csv'));
  await page.waitForTimeout(800);
  await setColumnRole(f, 'bill_length_mm', 'input', 'number');
  await setColumnRole(f, 'bill_depth_mm', 'input', 'number');
  await setColumnRole(f, 'flipper_length_mm', 'input', 'number');
  await setColumnRole(f, 'species', 'output', 'class');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(800);
  const taskPenguins = await f.evaluate(() => ({ plotDims: TASKS.custom.plotDims, classNames: TASKS.custom.classNames, inputSize: TASKS.custom.inputSize }));
  console.log('Task flags (plotDims should be 3, inputSize 3):', JSON.stringify(taskPenguins));

  console.log('\n=== NEW FEATURE: iris-real.csv (4 real numeric inputs, >3D) -> PCA button appears, PCA projection works ===');
  await f.setInputFiles('#datasetFileInput', path.join(SAMPLES, 'iris-real.csv'));
  await page.waitForTimeout(800);
  await setColumnRole(f, 'sepal_length', 'input', 'number');
  await setColumnRole(f, 'sepal_width', 'input', 'number');
  await setColumnRole(f, 'petal_length', 'input', 'number');
  await setColumnRole(f, 'petal_width', 'input', 'number');
  await setColumnRole(f, 'species', 'output', 'class');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(800);
  const noteButtons = await f.evaluate(() => [...document.querySelectorAll('#plotNote button')].map(b => b.textContent));
  console.log('Buttons in plotNote before training (should include "View in 3D (PCA)"):', JSON.stringify(noteButtons));
  await f.click('#plotNote button', { force: true });
  await page.waitForTimeout(500);
  const pcaState = await f.evaluate(() => ({
    pcaActive: typeof pcaActive !== 'undefined' ? pcaActive : null,
    hasCoords: typeof pcaCoords !== 'undefined' && !!pcaCoords,
    coordsLen: typeof pcaCoords !== 'undefined' && pcaCoords ? pcaCoords.length : null,
    plot3dVisible: getComputedStyle(document.getElementById('plot3d')).display !== 'none',
    title: document.getElementById('plotCardTitle').textContent,
  }));
  console.log('PCA state after clicking button:', JSON.stringify(pcaState));
  const pca3dStats = await f.evaluate(() => {
    const canvas = document.getElementById('plot3d');
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let i = 0; i < data.length; i += 4) colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);
    return { distinctColors: colors.size };
  });
  console.log('PCA 3D canvas distinct colors (should be many, real scatter):', pca3dStats.distinctColors);
  const backButtons = await f.evaluate(() => [...document.querySelectorAll('#plotNote button')].map(b => b.textContent));
  console.log('Buttons after activating PCA (should show "Back to confusion matrix"):', JSON.stringify(backButtons));

  console.log('\n=== NEW FEATURE: expandable right panel ===');
  const widthBefore = await f.evaluate(() => document.getElementById('sidePanel').getBoundingClientRect().width);
  console.log('Side panel width before resize:', widthBefore);
  await f.evaluate(() => {
    const resizer = document.getElementById('sideResizer');
    const rect = resizer.getBoundingClientRect();
    const startX = rect.left + rect.width / 2, startY = rect.top + rect.height / 2;
    resizer.dispatchEvent(new PointerEvent('pointerdown', { clientX: startX, clientY: startY, pointerId: 1, bubbles: true }));
    resizer.dispatchEvent(new PointerEvent('pointermove', { clientX: startX - 150, clientY: startY, pointerId: 1, bubbles: true }));
    resizer.dispatchEvent(new PointerEvent('pointerup', { clientX: startX - 150, clientY: startY, pointerId: 1, bubbles: true }));
  });
  await page.waitForTimeout(300);
  const widthAfter = await f.evaluate(() => document.getElementById('sidePanel').getBoundingClientRect().width);
  console.log('Side panel width after dragging resizer left by 150px (should be ~150px wider):', widthAfter);
  const canvasBackingSize = await f.evaluate(() => ({ w: document.getElementById('plot3d').width, h: document.getElementById('plot3d').height }));
  console.log('Plot3d canvas backing buffer size after resize (should have grown from 200):', JSON.stringify(canvasBackingSize));

  console.log('\nFrame errors:', frameErrors.length ? frameErrors : 'none');
  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
