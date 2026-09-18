import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  console.log('=== Test 1: default desktop icons render ===');
  const defaultCount = await page.evaluate(() => document.querySelectorAll('.desktop-icons .file, .vfs-desktop-icon').length);
  console.log('Default icon count:', defaultCount);
  await page.screenshot({ path: 'testing/screenshots/desktop-icons-default.png' });

  console.log('=== Test 2: hot-swap to windows-tiles via command (no reload) ===');
  await page.evaluate(() => window.platform.host.callCommand('open-vfs-desktop', 'windows-tiles'));
  await page.waitForTimeout(800);
  const tilesCount = await page.evaluate(() => document.querySelectorAll('.wt-tile').length);
  console.log('Tiles rendered:', tilesCount);
  await page.screenshot({ path: 'testing/screenshots/desktop-icons-windows-tiles.png' });

  console.log('=== Test 3: hot-swap to scifi ===');
  await page.evaluate(() => window.platform.host.callCommand('open-vfs-desktop', 'scifi'));
  await page.waitForTimeout(800);
  const sfCount = await page.evaluate(() => document.querySelectorAll('.sf-icon').length);
  console.log('Sci-fi icons rendered:', sfCount);
  await page.screenshot({ path: 'testing/screenshots/desktop-icons-scifi.png' });

  console.log('=== Test 4: hot-swap to interactive, verify magnify-on-mousemove ===');
  await page.evaluate(() => window.platform.host.callCommand('open-vfs-desktop', 'interactive'));
  await page.waitForTimeout(800);
  const ixCount = await page.evaluate(() => document.querySelectorAll('.ix-icon').length);
  console.log('Interactive icons rendered:', ixCount);
  const firstIconBox = await page.evaluate(() => {
    const el = document.querySelector('.ix-icon');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (firstIconBox) {
    await page.mouse.move(firstIconBox.x, firstIconBox.y);
    await page.waitForTimeout(300);
    const transform = await page.evaluate(() => document.querySelector('.ix-icon').style.transform);
    console.log('Icon transform under cursor:', transform);
  }
  await page.screenshot({ path: 'testing/screenshots/desktop-icons-interactive.png' });

  console.log('=== Test 5: settings schema commands ===');
  const wtSchema = await page.evaluate(() => { window.platform.host.callCommand('open-vfs-desktop', 'windows-tiles'); return null; });
  await page.waitForTimeout(500);
  const schema1 = await page.evaluate(() => window.platform.host.callCommand('get-desktop-schema'));
  console.log('windows-tiles schema:', JSON.stringify(schema1));
  await page.evaluate(() => window.platform.host.callCommand('set-desktop-setting', { key: 'tileSize', value: 128 }));
  await page.waitForTimeout(300);
  const tileSizeApplied = await page.evaluate(() => getComputedStyle(document.querySelector('.wt-grid')).getPropertyValue('--wt-size'));
  console.log('Tile size after setting change:', tileSizeApplied);
  const persisted = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    return fs.existsSync('/etc/desktop/windows-tiles.json') ? fs.readFileSync('/etc/desktop/windows-tiles.json', 'utf-8') : null;
  });
  console.log('Persisted settings file:', persisted);

  console.log('=== Test 6: Settings > Managers page shows Desktop Icons section ===');
  await page.evaluate(() => {
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.settings'), '20-managers')", window.platform);
  });
  await page.waitForTimeout(2000);
  let settingsFrame = null;
  for (const fr of page.frames()) {
    if (fr.url().includes('settings/main.html')) { settingsFrame = fr; break; }
  }
  console.log('Settings frame found:', !!settingsFrame);
  if (settingsFrame) {
    const hasDesktopOptions = await settingsFrame.evaluate(() => {
      const text = document.body.textContent;
      return { hasHeader: text.includes('DESKTOP ICONS'), hasTiles: text.includes('Windows Tiles'), hasScifi: text.includes('Sci-Fi HUD'), hasInteractive: text.includes('Interactive') };
    });
    console.log('Settings page content check:', JSON.stringify(hasDesktopOptions));

    console.log('=== Test 7: switching variant from Settings UI ===');
    const clicked = await settingsFrame.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')];
      const btn = buttons.find(b => b.textContent.includes('Sci-Fi HUD'));
      if (btn) { btn.click(); return true; }
      return false;
    });
    console.log('Clicked Sci-Fi HUD option:', clicked);
    await page.waitForTimeout(800);
    const sfAfterSettingsClick = await page.evaluate(() => document.querySelectorAll('.sf-icon').length);
    console.log('Sci-fi icons on desktop after Settings click:', sfAfterSettingsClick);
  }

  const managersJsonBeforeReload = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    return fs.existsSync('/etc/managers.json') ? fs.readFileSync('/etc/managers.json', 'utf-8') : 'MISSING';
  });
  console.log('managers.json right before reload:', managersJsonBeforeReload);

  console.log('=== Test 8: reload persists chosen variant ===');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const persistedVariantCount = await page.evaluate(() => document.querySelectorAll('.sf-icon').length);
  console.log('Sci-fi icons after full reload:', persistedVariantCount);

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
