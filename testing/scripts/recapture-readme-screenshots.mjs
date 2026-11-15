import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('pageerror', err => { errors.push(err.message); console.log('PAGEERROR:', err.message); });
page.on('console', msg => { if (msg.type() === 'error') { errors.push(msg.text()); console.log('CONSOLE ERROR:', msg.text()); } });

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Boot-poll for core apps to finish registering (loader.js now has more CORE_APPS than before)
{
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const ok = await page.evaluate(() => !!window.platform?.host?.getCommand?.('ui.file-explorer')).catch(() => false);
    if (ok) break;
    await page.waitForTimeout(1000);
  }
}
await page.waitForTimeout(1000);

// 1st screenshot: desktop
await page.screenshot({ path: 'testing/screenshots/desktop-current.png' });
console.log('captured desktop-current.png');

// 5th screenshot: Task Manager app
const t0 = Date.now();
while (Date.now() - t0 < 30000) {
  const ok = await page.evaluate(() => !!window.platform?.host?.getCommand?.('ui.task-manager')).catch(() => false);
  if (ok) break;
  await page.waitForTimeout(1000);
}
await page.evaluate(() => {
  window.platform.host.execCommand(`service('001-core.layout', 'open-window') (command('ui.task-manager'))`, window.platform);
});
await page.waitForTimeout(1500);
await page.screenshot({ path: 'testing/screenshots/task-manager-current.png' });
console.log('captured task-manager-current.png');

console.log('errors:', errors);
await browser.close();
