import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') console.log('[console]', msg.text()); });
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  console.log('=== Check default desktop DOM ===');
  const domCheck = await page.evaluate(() => {
    const desktop = document.querySelector('.desktop');
    return {
      desktopHtmlSnippet: desktop ? desktop.innerHTML.slice(0, 800) : 'NOT FOUND',
      vfsDesktopIconCount: document.querySelectorAll('.vfs-desktop-icon').length,
      fileItemCount: document.querySelectorAll('.file-item').length,
      desktopIconsFileCount: document.querySelectorAll('.desktop-icons .file').length,
    };
  });
  console.log(JSON.stringify(domCheck, null, 2));

  console.log('=== Switch to scifi via command ===');
  await page.evaluate(() => window.platform.host.callCommand('open-vfs-desktop', 'scifi'));
  await page.waitForTimeout(500);
  const managersJsonAfterCmd = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    return fs.existsSync('/etc/managers.json') ? fs.readFileSync('/etc/managers.json', 'utf-8') : 'MISSING';
  });
  console.log('managers.json after open-vfs-desktop command only (no settings update call):', managersJsonAfterCmd);

  console.log('=== Now write config directly and reload ===');
  await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    const cfg = fs.existsSync('/etc/managers.json') ? JSON.parse(fs.readFileSync('/etc/managers.json', 'utf-8')) : {};
    cfg.desktopManager = 'scifi';
    fs.writeFileSync('/etc/managers.json', JSON.stringify(cfg, null, 2));
  });
  const managersJsonAfterWrite = await page.evaluate(() => window.platform.host.getFS().readFileSync('/etc/managers.json', 'utf-8'));
  console.log('managers.json after direct write:', managersJsonAfterWrite);

  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const afterReload = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    return {
      managersJson: fs.existsSync('/etc/managers.json') ? fs.readFileSync('/etc/managers.json', 'utf-8') : 'MISSING',
      sfCount: document.querySelectorAll('.sf-icon').length,
      vfsDesktopIconCount: document.querySelectorAll('.vfs-desktop-icon').length,
    };
  });
  console.log('After reload:', JSON.stringify(afterReload, null, 2));

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
