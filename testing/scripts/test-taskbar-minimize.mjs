import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

page.on('pageerror', err => console.log('PAGEERROR:', err.message));
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Taskbar should be visible with the settings icon
const taskbar = page.locator('.taskbar').first();
console.log('taskbar visible:', await taskbar.isVisible());
console.log('settings icon present:', await page.locator('.taskbar-settings').count());

// Open a window (Notes.md) via desktop icon double click
const icon = page.locator('.desktop-icons .file-item, .desktop-icons div').filter({ hasText: 'Notes.md' }).first();
await icon.dblclick({ force: true });
await page.waitForTimeout(1500);

// A taskbar window icon should now show up
console.log('taskbar window icons after open:', await page.locator('.taskbar-window-icon').count());

// /proc/<pid> should exist with meta.json
const proc = await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  const pids = fs.readdirSync('/proc');
  const result = {};
  for (const pid of pids) {
    result[pid] = JSON.parse(fs.readFileSync(`/proc/${pid}/meta.json`, 'utf-8'));
  }
  return result;
});
console.log('/proc entries:', JSON.stringify(proc));

// Minimize the window via its header minimize button
const win = page.locator('.window:not(.hidden)').last();
const winPid = await win.getAttribute('data-pid');
const header = win.locator('.window-header').first();
const minimizeIcon = header.locator('.material-symbols-outlined.window-action', { hasText: 'remove' }).first();
await minimizeIcon.click({ force: true });
await page.waitForTimeout(1000);

console.log('window has .minimized class:', await win.evaluate(el => el.classList.contains('minimized')));
console.log('window visible after minimize:', await win.isVisible());

// Check screenshot file got written
const screenshot = await page.evaluate((pid) => {
  const fs = window.platform.host.getFS();
  const path = `/proc/${pid}/screenshot.png`;
  return fs.existsSync(path) ? fs.readFileSync(path, 'utf-8').slice(0, 40) : null;
}, winPid);
console.log('screenshot data (prefix):', screenshot);

// Hover over the taskbar window icon corresponding to the minimized window
const taskbarIcon = page.locator(`.taskbar-window-icon[aria-label="window-${winPid}"]`).first();
await taskbarIcon.hover({ force: true });
await page.waitForTimeout(500);
console.log('preview visible on hover:', await taskbarIcon.locator('.taskbar-preview').isVisible());
console.log('preview has image:', await taskbarIcon.locator('.taskbar-preview img').count());

// Click the taskbar icon to restore the window
await taskbarIcon.click({ force: true });
await page.waitForTimeout(1000);
console.log('window visible after restore:', await win.isVisible());
console.log('window has .minimized class after restore:', await win.evaluate(el => el.classList.contains('minimized')));

await page.screenshot({ path: 'testing/screenshots/taskbar-windows11-style.png' });

await browser.close();
