import { chromium } from 'playwright';

const PORT = process.env.PORT || 8085;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(`http://localhost:${PORT}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(4000);
  await page.waitForFunction(() => !!(window.platform && window.platform.host), { timeout: 15000 });

  const readAmbient = () => page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return {
      bg: s.getPropertyValue('--ambient-bg').trim(),
      fg: s.getPropertyValue('--ambient-fg').trim(),
      blur: s.getPropertyValue('--ambient-blur').trim(),
    };
  });

  console.log('=== Test 1: dark gradient wallpaper ===');
  await page.evaluate(() => window.platform.host.callCommand('set-wallpaper', 'linear-gradient(90deg, #0a0a12 0%, #1a1a2e 100%)'));
  await page.waitForTimeout(500);
  const dark = await readAmbient();
  console.log(JSON.stringify(dark));

  console.log('=== Test 2: bright gradient wallpaper ===');
  await page.evaluate(() => window.platform.host.callCommand('set-wallpaper', 'linear-gradient(90deg, #fdf6e3 0%, #ffffff 100%)'));
  await page.waitForTimeout(500);
  const bright = await readAmbient();
  console.log(JSON.stringify(bright));

  console.log('=== Test 3: distinct hue gradient (red vs blue) should differ from both above ===');
  await page.evaluate(() => window.platform.host.callCommand('set-wallpaper', 'linear-gradient(90deg, #b91c1c 0%, #7f1d1d 100%)'));
  await page.waitForTimeout(500);
  const red = await readAmbient();
  console.log(JSON.stringify(red));

  console.log('=== Test 4: canvas wallpaper -> neutral fallback, no crash ===');
  await page.evaluate(() => window.platform.host.callCommand('set-wallpaper', 'canvas:/usr/share/wallpapers/minimal-drift.js'));
  await page.waitForTimeout(500);
  const canvasFallback = await readAmbient();
  console.log(JSON.stringify(canvasFallback));

  console.log('=== Test 5: real image wallpaper (same-origin vfs via /(sw)/) ===');
  await page.evaluate(() => window.platform.host.callCommand('set-wallpaper', '/public/wp-11.jpg'));
  await page.waitForTimeout(1000);
  const imageWallpaper = await readAmbient();
  console.log(JSON.stringify(imageWallpaper));

  console.log('=== Test 6: context menu actually renders with ambient CSS applied ===');
  await page.evaluate(() => window.platform.host.callCommand('set-wallpaper', 'linear-gradient(90deg, #b91c1c 0%, #7f1d1d 100%)'));
  await page.waitForTimeout(500);
  await page.mouse.click(600, 400, { button: 'right' });
  await page.waitForTimeout(500);
  const menuStyle = await page.evaluate(() => {
    // .contextmenu is the OUTER positioned wrapper (background/blur live
    // here, see src/core/layout/styles/contextmenu.ts) - the inner
    // [id^="context-menu-"] div from ContextMenu's own render has no
    // background of its own, it just inherits `color` from this parent.
    const el = document.querySelector('.contextmenu');
    if (!el) return null;
    const s = getComputedStyle(el);
    return { background: s.backgroundColor, backdropFilter: s.backdropFilter || s.webkitBackdropFilter, color: s.color };
  });
  console.log(JSON.stringify(menuStyle));
  await page.screenshot({ path: 'testing/screenshots/ambient-contextmenu-red.png' });

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
