import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  console.log('=== Right-click desktop ===');
  await page.mouse.click(600, 400, { button: 'right' });
  await page.waitForTimeout(1000);

  const menuItems = await page.evaluate(() => {
    const el = document.querySelector('[id^="context-menu-"]');
    return el ? [...el.querySelectorAll('button')].map(b => b.textContent.trim()) : null;
  });
  console.log('Menu items:', JSON.stringify(menuItems));

  console.log('=== Click "Change Wallpaper" ===');
  const clicked = await page.evaluate(() => {
    const el = document.querySelector('[id^="context-menu-"]');
    if (!el) return false;
    const btn = [...el.querySelectorAll('button')].find(b => b.textContent.trim() === 'Change Wallpaper');
    if (!btn) return false;
    btn.click();
    return true;
  });
  console.log('Clicked:', clicked);
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
    console.log('Active nav item:', activeNav);
  }

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
