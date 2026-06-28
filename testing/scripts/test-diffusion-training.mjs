import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:8080';
const SCREENSHOT_DIR = path.resolve('testing/screenshots/diffusion-test');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let idx = 0;
async function shot(page, label) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${String(++idx).padStart(2,'0')}-${label}.png` });
}

function findNnIdeFrame(page) {
  for (const frame of page.frames()) {
    if (frame.url() === 'about:blank') {
      try {
        // nn-ide has the #app > #hdr > #logo element
        const loc = frame.locator('#logo');
        if (loc) return frame;
      } catch (_) {}
    }
  }
  return null;
}

async function waitForNnIdeFrame(page, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const frame of page.frames()) {
      if (frame.url().includes('nn-ide')) return frame;
      try {
        const count = await frame.locator('#logo').count();
        if (count > 0) {
          const text = await frame.locator('#logo').textContent();
          if (text && text.includes('Neural Network')) return frame;
        }
      } catch (_) {}
    }
    await sleep(500);
  }
  return null;
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 20 });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  // Capture console
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text().slice(0, 300)}`);
    if (msg.type() === 'error') {
      console.log(`  [browser error] ${msg.text().slice(0, 200)}`);
    }
  });
  page.on('pageerror', err => console.log(`  [page error] ${err.message.slice(0, 200)}`));

  // ── BOOT ──
  console.log('1. Booting app...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(5000);
  await shot(page, 'boot');
  console.log('   Boot complete.');

  // ── OPEN NN-IDE via context menu ──
  console.log('2. Opening Neural Network IDE...');
  // Right-click on the desktop to open context menu
  const contentArea = page.locator('.content-area');
  await contentArea.click({ button: 'right', position: { x: 400, y: 300 }, force: true });
  await sleep(1000);
  await shot(page, 'context-menu');

  // Look for NN-IDE in context menu
  const menuItems = page.locator('.ctx-menu-item, [class*="context-menu"] [class*="item"]');
  const count = await menuItems.count();
  console.log(`   Found ${count} context menu items`);
  let foundNnIde = false;
  for (let i = 0; i < count; i++) {
    const text = await menuItems.nth(i).textContent();
    if (text && text.includes('Neural Network')) {
      console.log(`   Clicking: ${text}`);
      await menuItems.nth(i).click({ force: true });
      foundNnIde = true;
      break;
    }
  }

  if (!foundNnIde) {
    console.log('   NN-IDE not in context menu, trying command execution...');
    // Execute command directly via page evaluate
    await page.evaluate(() => {
      try {
        const cmd = window.__platform?.host?.getCommand('ui.nn-ide');
        if (cmd) { cmd.exec(); return; }
      } catch (_) {}
      try {
        window.__platform?.host?.callCommand('ui.nn-ide');
      } catch (_) {}
    });
  }

  await sleep(3000);
  await shot(page, 'nn-ide-opening');

  // Find the nn-ide iframe
  console.log('3. Looking for NN-IDE frame...');
  let nnFrame = await waitForNnIdeFrame(page);
  if (!nnFrame) {
    console.log('   NN-IDE frame not found. Trying to open via initd...');
    // Try opening via the global platform
    await page.evaluate(async () => {
      try {
        const plat = Object.values(window).find(v => v?.host?.callCommand);
        if (plat) plat.host.callCommand('ui.nn-ide');
      } catch (_) {}
    });
    await sleep(3000);
    nnFrame = await waitForNnIdeFrame(page);
  }

  if (!nnFrame) {
    console.log('   FAIL: Could not find NN-IDE frame. Taking debug screenshot.');
    await shot(page, 'no-nnide-frame');
    // List all frames
    for (const f of page.frames()) {
      try {
        const html = await f.evaluate(() => document.body?.innerHTML?.slice(0, 100) || '');
        console.log(`     Frame ${f.url()}: ${html}`);
      } catch (_) {}
    }
    await browser.close();
    return;
  }
  console.log('   Found NN-IDE frame!');
  await shot(page, 'nn-ide-loaded');

  // ── LOAD DIFFUSION PRESET ──
  console.log('4. Loading Diffusion 32x32 preset...');
  const diffBtn = nnFrame.locator('button', { hasText: 'Diffusion' });
  const diffBtnCount = await diffBtn.count();
  console.log(`   Found ${diffBtnCount} diffusion buttons`);
  if (diffBtnCount > 0) {
    await diffBtn.first().click({ force: true });
  } else {
    // Try calling loadPreset directly
    await nnFrame.evaluate(() => { loadPreset('diffusion-32'); });
  }
  await sleep(1000);
  await shot(page, 'diffusion-preset');
  console.log('   Diffusion preset loaded.');

  // ── VERIFY WE'RE ON DIFFUSION TAB ──
  const diffTab = nnFrame.locator('#bt-diffusion');
  if (await diffTab.count() > 0) {
    await diffTab.click({ force: true });
    await sleep(500);
  }

  // ── LOAD DATASET ──
  console.log('5. Loading diffusion dataset...');
  // Set smaller params for quick test: 2 epochs, small batch
  await nnFrame.evaluate(() => {
    document.getElementById('df-epochs').value = '2';
    document.getElementById('df-bs').value = '16';
    document.getElementById('df-steps').value = '20';
    document.getElementById('df-prev').value = '1';
  });

  // Click Load dataset button
  const loadDatasetBtn = nnFrame.locator('button', { hasText: 'Load' });
  if (await loadDatasetBtn.count() > 0) {
    await loadDatasetBtn.first().click({ force: true });
  } else {
    await nnFrame.evaluate(() => { DF.loadDataset(); });
  }
  await sleep(2000);
  await shot(page, 'dataset-loaded');

  // Check dataset status
  const dsStatus = await nnFrame.locator('#df-status').textContent();
  console.log(`   Dataset status: ${dsStatus}`);

  if (dsStatus.includes('Error') || dsStatus.includes('No samples')) {
    console.log('   FAIL: Dataset could not be loaded.');
    await browser.close();
    return;
  }

  // ── START TRAINING ──
  console.log('6. Starting diffusion training...');
  const trainBtn = nnFrame.locator('#train-btn');
  await trainBtn.click({ force: true });

  // Wait for training to progress — poll the status + log
  console.log('   Waiting for training epochs...');
  let lastStatus = '';
  let trainingStarted = false;
  let lossValues = [];

  for (let tick = 0; tick < 120; tick++) {
    await sleep(2000);

    const status = await nnFrame.locator('#df-status').textContent().catch(() => '');
    const logHtml = await nnFrame.locator('#log').textContent().catch(() => '');

    if (status !== lastStatus) {
      console.log(`   Status: ${status}`);
      lastStatus = status;
    }

    // Extract loss values from log
    const lossMatches = logHtml.match(/loss=([0-9.]+)/g);
    if (lossMatches && lossMatches.length > lossValues.length) {
      for (let i = lossValues.length; i < lossMatches.length; i++) {
        const val = parseFloat(lossMatches[i].replace('loss=', ''));
        lossValues.push(val);
        console.log(`   Epoch ${lossValues.length} loss: ${val}`);
      }
    }

    if (status.includes('complete') || status.includes('Stopped') || status.includes('Error')) {
      break;
    }

    // Also check if training finished by looking for 'done' or 'complete' in log
    if (logHtml.includes('done!') || logHtml.includes('complete')) {
      break;
    }

    // Check for stuck at TF loading
    if (tick === 10 && !status.includes('Epoch')) {
      console.log('   Still waiting for first epoch...');
      await shot(page, 'waiting-for-epoch');
    }

    if (tick === 30 && !status.includes('Epoch')) {
      console.log('   TIMEOUT: No epoch completed after 60s');
      break;
    }
  }

  await shot(page, 'training-done');

  // ── ANALYZE RESULTS ──
  console.log('\n=== RESULTS ===');
  console.log(`Total epochs completed: ${lossValues.length}`);

  if (lossValues.length === 0) {
    console.log('FAIL: No epochs completed');
  } else {
    const allZero = lossValues.every(v => v === 0 || v < 1e-10);
    const firstLoss = lossValues[0];
    const lastLoss = lossValues[lossValues.length - 1];

    console.log(`First epoch loss: ${firstLoss}`);
    console.log(`Last epoch loss:  ${lastLoss}`);
    console.log(`All losses: ${lossValues.join(', ')}`);

    if (allZero) {
      console.log('FAIL: All losses are zero — training is broken');
    } else if (firstLoss > 0) {
      console.log('PASS: Loss is non-zero from first epoch');
      if (lastLoss < firstLoss) {
        console.log('PASS: Loss decreased during training (model is learning)');
      } else {
        console.log('WARN: Loss did not decrease (might need more epochs or tuning)');
      }
    }
  }

  // Check preview images
  const previews = await nnFrame.locator('#df-previews canvas').count();
  console.log(`Preview images rendered: ${previews}`);

  // Take final screenshot showing the diffusion tab
  if (await nnFrame.locator('#bt-diffusion').count() > 0) {
    await nnFrame.locator('#bt-diffusion').click({ force: true });
    await sleep(500);
  }
  await shot(page, 'final-diffusion-tab');

  // Also switch to log tab for full training log
  if (await nnFrame.locator('#bt-log').count() > 0) {
    await nnFrame.locator('#bt-log').click({ force: true });
    await sleep(500);
  }
  await shot(page, 'final-log-tab');

  const fullLog = await nnFrame.locator('#log').textContent().catch(() => '');
  console.log('\n=== TRAINING LOG ===');
  console.log(fullLog.slice(-1500));

  await browser.close();
  console.log('\nDone. Screenshots in testing/screenshots/diffusion-test/');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
