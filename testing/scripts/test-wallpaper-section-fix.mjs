import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('=== Open Settings directly with 04-wallpapers arg ===');
  await page.evaluate(() => {
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.settings'), '04-wallpapers')", window.platform);
  });
  await page.waitForTimeout(2500);

  let settingsFrame = null;
  for (const fr of page.frames()) {
    if (fr.url().includes('settings/main.html')) { settingsFrame = fr; break; }
  }
  console.log('Settings frame opened:', !!settingsFrame);
  if (settingsFrame) {
    const activeNav = await settingsFrame.evaluate(() => {
      const el = document.querySelector('.settings-nav-item.active');
      return el ? el.textContent.trim() : null;
    });
    console.log('Active settings nav item:', activeNav);
    const hasWallpaperGrid = await settingsFrame.evaluate(() => !!document.querySelector('.wallpaper-grid'));
    console.log('Wallpaper grid visible:', hasWallpaperGrid);
  }

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
