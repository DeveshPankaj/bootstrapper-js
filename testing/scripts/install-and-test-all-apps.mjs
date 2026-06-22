import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:8080';
const SCREENSHOT_DIR = path.resolve('testing/screenshots/install-test');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function findPkgFrame(page) {
  for (const frame of page.frames()) {
    if (frame.url() !== 'about:blank') continue;
    try {
      const count = await frame.locator('[class*="pkg-"]').count();
      if (count > 0) return frame;
    } catch (_) {}
  }
  return null;
}

const results = { installed: [], failed_install: [], opened: [], failed_open: [], skipped: [] };
let idx = 0;
async function shot(page, label) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${String(++idx).padStart(2,'0')}-${label}.png` });
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 30 });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  // Capture browser console for debugging
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error' || (type === 'warn' && msg.text().includes('pkg-manager'))) {
      console.log(`  [browser ${type}] ${msg.text().slice(0, 200)}`);
    }
  });
  page.on('pageerror', err => console.log(`  [page error] ${err.message.slice(0, 200)}`));

  // ── BOOT ─────────────────────────────────────────────────────────────────
  console.log('Booting...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(5000);
  await shot(page, 'boot');
  console.log('Boot done');

  // ── OPEN APP MANAGER ─────────────────────────────────────────────────────
  console.log('Opening app drawer...');
  const gridIcon = page.locator('span.material-symbols-outlined').filter({ hasText: 'grid_view' }).first();
  if (await gridIcon.count() > 0) {
    await gridIcon.click({ force: true });
  } else {
    await page.mouse.click(744, 841);
  }
  await sleep(2000);

  // App drawer is an overlay in the main page DOM — find "App Manager" there
  const appMgrCard = page.locator('.ad-card').filter({ hasText: 'App Manager' }).first();
  if (await appMgrCard.count() > 0) {
    await appMgrCard.dblclick({ force: true });
    console.log('Opened App Manager from drawer');
  } else {
    await page.keyboard.press('Escape');
    await page.mouse.click(400, 400, { button: 'right' });
    await sleep(500);
    const mi = page.locator('text="App Manager"').first();
    if (await mi.count() > 0) { await mi.click({ force: true }); console.log('Opened from context menu'); }
    else { await page.keyboard.press('Escape'); console.log('WARNING: could not open App Manager'); }
  }

  await sleep(2500);
  await shot(page, 'app-manager-open');

  // ── FIND PKG FRAME ───────────────────────────────────────────────────────
  let pkgFrame = null;
  for (let i = 0; i < 8; i++) {
    pkgFrame = await findPkgFrame(page);
    if (pkgFrame) break;
    console.log(`  Waiting for pkg frame (${i+1})...`);
    await sleep(1200);
  }
  if (!pkgFrame) {
    console.log('ERROR: Could not find pkg-manager frame. Frames:');
    for (const f of page.frames()) {
      const body = await f.locator('body').textContent().catch(() => '');
      if (body.trim()) console.log(`  [${f.url()}] ${body.trim().slice(0,60)}`);
    }
    await shot(page, 'error');
    await browser.close();
    return;
  }
  console.log('Found pkg-manager frame');

  // ── COLLECT ALL REGISTRY APPS ────────────────────────────────────────────
  // Navigate to Discover
  const discoverNav = pkgFrame.locator('.pkg-nav-item').filter({ hasText: 'Discover' }).first();
  if (await discoverNav.count() > 0) { await discoverNav.click({ force: true }); await sleep(1500); }

  // Wait for app cards to load
  await pkgFrame.locator('.pkg-card').first().waitFor({ timeout: 15000 }).catch(() => {});
  await sleep(500);

  const totalCards = await pkgFrame.locator('.pkg-card').count();
  console.log(`Found ${totalCards} app cards in registry`);
  await shot(page, 'discover-view');

  // ── INSTALL ALL APPS ──────────────────────────────────────────────────────
  // Strategy: scroll through the list and click each Install button one at a time.
  // After each install the button becomes a badge; we move to the next.
  let installed = 0;
  let failedInstall = 0;
  const installedNames = [];

  for (let cardIdx = 0; cardIdx < totalCards; cardIdx++) {
    // Re-find the frame each iteration (stays valid but be safe)
    const card = pkgFrame.locator('.pkg-card').nth(cardIdx);
    if (await card.count() === 0) continue;

    // Get app name
    let appName = `app-${cardIdx}`;
    try {
      appName = (await card.locator('.pkg-card-name').textContent()).trim();
    } catch (_) {}

    // Check if Install button exists (not already installed)
    const installBtn = card.getByRole('button', { name: 'Install' });
    if (await installBtn.count() === 0) {
      console.log(`  [${cardIdx+1}/${totalCards}] ${appName}: already installed, skipping`);
      continue;
    }

    console.log(`  [${cardIdx+1}/${totalCards}] Installing: ${appName}...`);
    try {
      await card.scrollIntoViewIfNeeded();
      await installBtn.click({ force: true });

      // Wait for install to complete: watch for badge or error to appear
      // The button should disappear and badge appear within ~10s
      await Promise.race([
        card.locator('.pkg-installed-badge').waitFor({ timeout: 15000 }),
        sleep(12000)
      ]).catch(() => {});

      // Check result
      const hasBadge = await card.locator('.pkg-installed-badge').count() > 0;
      const cardBtns = card.locator('button');
      const cardBtnCount = await cardBtns.count();
      const btnTexts = [];
      for (let bi = 0; bi < cardBtnCount; bi++) {
        btnTexts.push((await cardBtns.nth(bi).textContent().catch(() => '?')).trim().slice(0, 20));
      }
      const stillHasInstallBtn = btnTexts.some(t => t === 'Install');

      if (hasBadge) {
        console.log(`    ✓ ${appName}`);
        results.installed.push(appName);
        installedNames.push(appName);
        installed++;
      } else if (stillHasInstallBtn) {
        const errText = (await pkgFrame.locator('.pkg-error').textContent().catch(() => '')).trim().slice(0, 100);
        const errMsg = errText || `btns=[${btnTexts.join('|')}]`;
        console.log(`    ✗ ${appName}: ${errMsg}`);
        results.failed_install.push({ name: appName, error: errMsg });
        failedInstall++;
      } else {
        // Buttons show "Installing..." still — install in progress
        console.log(`    ? ${appName}: btns=[${btnTexts.join('|')}]`);
        results.installed.push(appName);
        installedNames.push(appName);
        installed++;
      }
    } catch (e) {
      console.log(`    ✗ ${appName}: ${e.message}`);
      results.failed_install.push({ name: appName, error: e.message });
      failedInstall++;
    }
  }

  console.log(`\nInstalled: ${installed}, Failed: ${failedInstall}`);
  await shot(page, 'all-installed');

  // ── TEST OPENING EACH APP ─────────────────────────────────────────────────
  console.log('\n=== TESTING OPENING APPS ===\n');

  // Switch to Installed view and wait for rows
  // Re-find frame in case of any stale reference
  pkgFrame = await findPkgFrame(page);
  if (!pkgFrame) { console.log('ERROR: lost pkg frame'); await browser.close(); return; }

  const instNav = pkgFrame.locator('.pkg-nav-item').filter({ hasText: 'Installed' }).first();
  if (await instNav.count() > 0) {
    await instNav.click({ force: true });
    await sleep(1500);
  }
  // Wait for rows
  await pkgFrame.locator('.pkg-list-row').first().waitFor({ timeout: 10000 }).catch(() => {});
  await shot(page, 'installed-view');

  const rowCount = await pkgFrame.locator('.pkg-list-row').count();
  console.log(`Found ${rowCount} installed rows`);

  for (let ri = 0; ri < rowCount; ri++) {
    const row = pkgFrame.locator('.pkg-list-row').nth(ri);
    const name = (await row.locator('.pkg-list-name').textContent().catch(() => `app-${ri}`)).trim();
    const safeName = name.replace(/[^a-z0-9]/gi, '_').slice(0, 25);
    console.log(`Opening [${ri+1}/${rowCount}]: ${name}`);

    const openBtn = row.locator('button').filter({ hasText: 'Open' }).first();
    if (await openBtn.count() === 0) {
      console.log(`  ✗ no Open button`);
      results.skipped.push(name);
      continue;
    }

    try {
      const winsBefore = await page.locator('.window').count();
      await row.scrollIntoViewIfNeeded();
      await openBtn.click({ force: true });
      await sleep(3500);
      const winsAfter = await page.locator('.window').count();
      await shot(page, `open-${safeName}`);

      if (winsAfter > winsBefore) {
        console.log(`  ✓ opened (${winsBefore}→${winsAfter} windows)`);
        results.opened.push(name);
      } else {
        console.log(`  ~ opened (overlay/same count)`);
        results.opened.push(`${name} [overlay]`);
      }

      // Close newly opened window(s)
      const closeBtn = page.locator('.window-close, [title="Close"]').last();
      if (await closeBtn.count() > 0) { await closeBtn.click({ force: true }).catch(() => {}); await sleep(400); }
    } catch (e) {
      console.log(`  ✗ ${e.message}`);
      results.failed_open.push({ name, error: e.message });
      await shot(page, `error-${safeName}`);
    }
  }

  // ── FINAL REPORT ─────────────────────────────────────────────────────────
  await shot(page, 'final');
  console.log('\n══════════════════════════════════════');
  console.log('RESULTS');
  console.log('══════════════════════════════════════');
  console.log(`✓ Installed:      ${results.installed.length}`);
  console.log(`✗ Install failed: ${results.failed_install.length}`);
  console.log(`✓ Opened:         ${results.opened.length}`);
  console.log(`✗ Open failed:    ${results.failed_open.length}`);
  console.log(`- Skipped:        ${results.skipped.length}`);
  if (results.failed_install.length > 0) {
    console.log('\nFailed installs:');
    results.failed_install.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
  }
  if (results.failed_open.length > 0) {
    console.log('\nFailed opens:');
    results.failed_open.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
  }
  if (results.skipped.length > 0) console.log('\nSkipped:', results.skipped.join(', '));

  fs.writeFileSync(`${SCREENSHOT_DIR}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
