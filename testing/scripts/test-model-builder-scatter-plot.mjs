import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8104;
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

function canvasStats(f, selector) {
  return f.evaluate((sel) => {
    const canvas = document.querySelector(sel);
    if (!canvas) return { exists: false };
    const style = getComputedStyle(canvas);
    if (style.display === 'none') return { exists: true, visible: false };
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colorCounts = {};
    for (let i = 0; i < data.length; i += 4) {
      const key = `${data[i]},${data[i+1]},${data[i+2]}`;
      colorCounts[key] = (colorCounts[key] || 0) + 1;
    }
    return { exists: true, visible: true, distinctColors: Object.keys(colorCounts).length };
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

  console.log('\n=== TEST A: classification-4class.csv (2D input, 4 classes, NEW scatter — not the old binary heatmap) ===');
  await f.setInputFiles('#datasetFileInput', path.join(SAMPLES, 'classification-4class.csv'));
  await page.waitForTimeout(500);
  await setColumnRole(f, 'x1', 'input', 'number');
  await setColumnRole(f, 'x2', 'input', 'number');
  await setColumnRole(f, 'quadrant', 'output', 'class');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(500);
  const taskA = await f.evaluate(() => ({ plot2D: TASKS.custom.plot2D, plotDims: TASKS.custom.plotDims, classNames: TASKS.custom.classNames }));
  console.log('Task flags:', JSON.stringify(taskA));
  const titleA = await f.evaluate(() => document.getElementById('plotCardTitle').textContent);
  console.log('Plot title:', titleA);
  const legendA = await f.evaluate(() => document.getElementById('plotLegend').textContent.trim());
  console.log('Legend text:', legendA);
  const plotStatsA = await canvasStats(f, '#plot');
  console.log('#plot canvas stats:', JSON.stringify(plotStatsA));
  const plot3dVisibleA = await f.evaluate(() => getComputedStyle(document.getElementById('plot3d')).display !== 'none');
  console.log('#plot3d visible (should be false):', plot3dVisibleA);

  console.log('\n=== TEST B: classification.csv (2D input, 2 classes — should KEEP the old binary heatmap, not the new scatter) ===');
  await f.setInputFiles('#datasetFileInput', path.join(SAMPLES, 'classification.csv'));
  await page.waitForTimeout(500);
  await setColumnRole(f, 'x1', 'input', 'number');
  await setColumnRole(f, 'x2', 'input', 'number');
  await setColumnRole(f, 'label', 'output', 'class');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(500);
  const taskB = await f.evaluate(() => ({ plot2D: TASKS.custom.plot2D, plotDims: TASKS.custom.plotDims }));
  console.log('Task flags (plot2D should be true, plotDims should be 0):', JSON.stringify(taskB));
  const titleB = await f.evaluate(() => document.getElementById('plotCardTitle').textContent);
  console.log('Plot title (should be "Decision surface"):', titleB);

  console.log('\n=== TEST C: classification-3d.csv (3 numeric inputs, 3 classes -> NEW 3D interactive scatter) ===');
  await f.setInputFiles('#datasetFileInput', path.join(FIXTURES, 'classification-3d.csv'));
  await page.waitForTimeout(500);
  await setColumnRole(f, 'x1', 'input', 'number');
  await setColumnRole(f, 'x2', 'input', 'number');
  await setColumnRole(f, 'x3', 'input', 'number');
  await setColumnRole(f, 'label', 'output', 'class');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(500);
  const taskC = await f.evaluate(() => ({ plotDims: TASKS.custom.plotDims, classNames: TASKS.custom.classNames }));
  console.log('Task flags (plotDims should be 3):', JSON.stringify(taskC));
  const titleC = await f.evaluate(() => document.getElementById('plotCardTitle').textContent);
  console.log('Plot title:', titleC);
  const plot2dVisibleC = await f.evaluate(() => getComputedStyle(document.getElementById('plot')).display !== 'none');
  console.log('#plot (2D) visible (should be false):', plot2dVisibleC);
  const plot3dStatsC = await canvasStats(f, '#plot3d');
  console.log('#plot3d canvas stats before training (should show scatter already, since trainData populates on upload):', JSON.stringify(plot3dStatsC));

  console.log('--- Train, then check the 3D scatter re-renders and drag rotation works ---');
  await f.fill('#epochInput', '100');
  await f.click('#build', { force: true });
  await page.waitForTimeout(3000);
  const plot3dStatsAfterTrain = await canvasStats(f, '#plot3d');
  console.log('#plot3d canvas stats after training:', JSON.stringify(plot3dStatsAfterTrain));

  // page.mouse.* targets real screen coordinates, which in headless mode get
  // intercepted by the window's own draggable overlay iframe (see CLAUDE.md's
  // testing notes) — dispatch real PointerEvents straight at the canvas
  // element instead, which exercises the exact same app-side listener logic.
  const rotationBefore = await f.evaluate(() => ({ ...plot3dRotation }));
  await f.evaluate(() => {
    const canvas = document.getElementById('plot3d');
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, pointerId: 1, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: cx + 60, clientY: cy - 30, pointerId: 1, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: cx + 60, clientY: cy - 30, pointerId: 1, bubbles: true }));
  });
  await page.waitForTimeout(200);
  const rotationAfter = await f.evaluate(() => ({ ...plot3dRotation }));
  console.log('Rotation before drag:', JSON.stringify(rotationBefore));
  console.log('Rotation after drag (should differ):', JSON.stringify(rotationAfter));
  const plot3dStatsAfterDrag = await canvasStats(f, '#plot3d');
  console.log('#plot3d canvas stats after drag-rotate:', JSON.stringify(plot3dStatsAfterDrag));

  console.log('\nFrame errors:', frameErrors.length ? frameErrors : 'none');
  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
