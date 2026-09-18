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

  console.log('=== Baseline: default icons present ===');
  console.log('icons before:', await page.evaluate(() => document.querySelectorAll('.vfs-desktop-icon').length));

  console.log('=== Switch to none ===');
  await page.evaluate(() => window.platform.host.callCommand('open-vfs-desktop', 'none'));
  await page.waitForTimeout(500);
  const afterNone = await page.evaluate(() => ({
    vfsIcons: document.querySelectorAll('.vfs-desktop-icon').length,
    fileItems: document.querySelectorAll('.file-item').length,
    desktopDiv: document.querySelector('.desktop') ? document.querySelector('.desktop').innerHTML.trim().length : -1,
  }));
  console.log('After none:', JSON.stringify(afterNone));
  await page.screenshot({ path: 'testing/screenshots/desktop-icons-none.png' });

  console.log('=== Switch back to default ===');
  await page.evaluate(() => window.platform.host.callCommand('open-vfs-desktop', 'default'));
  await page.waitForTimeout(500);
  console.log('icons after switching back:', await page.evaluate(() => document.querySelectorAll('.vfs-desktop-icon').length));

  console.log('=== Verify Settings > Managers shows None option ===');
  await page.evaluate(() => {
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.settings'), '20-managers')", window.platform);
  });
  await page.waitForTimeout(2000);
  let f = null;
  for (const fr of page.frames()) { if (fr.url().includes('settings/main.html')) { f = fr; break; } }
  if (f) {
    const hasNone = await f.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')];
      return buttons.filter(b => b.textContent.includes('No desktop icons')).length;
    });
    console.log('Desktop "None" option button found:', hasNone === 1);
  }

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
