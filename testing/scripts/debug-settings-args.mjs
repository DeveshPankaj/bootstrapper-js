import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => { if (msg.text().includes('settings-debug')) logs.push(msg.text()); });
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.settings'), '04-wallpapers')", window.platform);
  });
  await page.waitForTimeout(2500);

  const activeNav = await (async () => {
    for (const fr of page.frames()) {
      if (fr.url().includes('settings/main.html')) {
        return fr.evaluate(() => {
          const el = document.querySelector('.settings-nav-item.active');
          return el ? el.textContent.trim() : null;
        });
      }
    }
    return null;
  })();
  console.log('Active nav:', activeNav);
  console.log('Debug logs:');
  logs.forEach(l => console.log(' ', l));

  await browser.close();
})();
