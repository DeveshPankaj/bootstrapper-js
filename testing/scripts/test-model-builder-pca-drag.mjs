import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8106;
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

function canvasFingerprint(f, selector) {
  return f.evaluate((sel) => {
    const canvas = document.querySelector(sel);
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    // A simple content hash so we can tell if two frames actually differ.
    let hash = 0;
    for (let i = 0; i < data.length; i += 37) hash = (hash * 31 + data[i]) >>> 0;
    return hash;
  }, selector);
}

async function dragCanvas(f, selector, dx, dy) {
  await f.evaluate(({ selector, dx, dy }) => {
    const canvas = document.querySelector(selector);
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, pointerId: 1, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: cx + dx, clientY: cy + dy, pointerId: 1, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: cx + dx, clientY: cy + dy, pointerId: 1, bubbles: true }));
  }, { selector, dx, dy });
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

  console.log('\n=== Load iris-real.csv (4 inputs, >3D -> PCA path) and activate PCA view ===');
  await f.setInputFiles('#datasetFileInput', path.join(SAMPLES, 'iris-real.csv'));
  await page.waitForTimeout(800);
  await setColumnRole(f, 'sepal_length', 'input', 'number');
  await setColumnRole(f, 'sepal_width', 'input', 'number');
  await setColumnRole(f, 'petal_length', 'input', 'number');
  await setColumnRole(f, 'petal_width', 'input', 'number');
  await setColumnRole(f, 'species', 'output', 'class');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(800);
  await f.click('#plotNote button', { force: true });
  await page.waitForTimeout(300);
  const title = await f.evaluate(() => document.getElementById('plotCardTitle').textContent);
  console.log('Title (confirms PCA view is active):', title);

  const rotationBefore = await f.evaluate(() => ({ ...plot3dRotation }));
  const fingerprintBefore = await canvasFingerprint(f, '#plot3d');
  console.log('Rotation before drag:', JSON.stringify(rotationBefore));

  console.log('--- Dragging the PCA 3D canvas (the reported broken case) ---');
  await dragCanvas(f, '#plot3d', 80, -40);
  await page.waitForTimeout(300);
  const rotationAfter = await f.evaluate(() => ({ ...plot3dRotation }));
  const fingerprintAfter = await canvasFingerprint(f, '#plot3d');
  console.log('Rotation after drag (state should change):', JSON.stringify(rotationAfter));
  console.log('Canvas fingerprint before/after (should DIFFER — this is the actual bug: state changed but canvas never redrew):', fingerprintBefore, '->', fingerprintAfter);
  console.log('Rotation state changed:', JSON.stringify(rotationBefore) !== JSON.stringify(rotationAfter));
  console.log('Canvas visibly redrew:', fingerprintBefore !== fingerprintAfter);

  console.log('\n=== Sanity check: native 3D scatter (penguins-3d.csv) still drags fine too ===');
  await f.setInputFiles('#datasetFileInput', path.join(SAMPLES, 'penguins-3d.csv'));
  await page.waitForTimeout(800);
  await setColumnRole(f, 'bill_length_mm', 'input', 'number');
  await setColumnRole(f, 'bill_depth_mm', 'input', 'number');
  await setColumnRole(f, 'flipper_length_mm', 'input', 'number');
  await setColumnRole(f, 'species', 'output', 'class');
  await f.click('#dsConfirmBtn', { force: true });
  await page.waitForTimeout(800);
  const fp1 = await canvasFingerprint(f, '#plot3d');
  await dragCanvas(f, '#plot3d', -70, 50);
  await page.waitForTimeout(300);
  const fp2 = await canvasFingerprint(f, '#plot3d');
  console.log('Native 3D canvas redrew after drag:', fp1 !== fp2);

  console.log('\nFrame errors:', frameErrors.length ? frameErrors : 'none');
  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
