import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

page.on('pageerror', err => console.log('PAGEERROR:', err.message));
page.on('console', msg => { if (msg.type() === 'error' || /Opening|Cannot/.test(msg.text())) console.log('CONSOLE:', msg.text()); });

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const countWindowIcons = () => page.locator('.taskbar-window-icon').count();

console.log('initial taskbar window icons:', await countWindowIcons());

// Open Notes.md from the desktop
await page.locator('text=Notes.md').first().dblclick({ force: true });
await page.waitForTimeout(2500);

const windows1 = await page.locator('.window').evaluateAll(els => els.map(el => ({
  name: el.getAttribute('data-name'),
  pid: el.getAttribute('data-pid'),
})));
console.log('windows after opening Notes.md:', JSON.stringify(windows1));
console.log('taskbar window icons after opening Notes.md:', await countWindowIcons());

// Close the visible window via its close icon
const visibleWindow = page.locator('.window:not(.hidden)').first();
await visibleWindow.locator('.window-header .material-symbols-outlined', { hasText: 'close' }).first().click({ force: true });
await page.waitForTimeout(1000);

console.log('taskbar window icons after closing Notes.md window:', await countWindowIcons());

const windows2 = await page.locator('.window').evaluateAll(els => els.map(el => ({
  name: el.getAttribute('data-name'),
  pid: el.getAttribute('data-pid'),
})));
console.log('windows after closing:', JSON.stringify(windows2));

await page.screenshot({ path: 'testing/screenshots/md-taskbar-fix.png' });

// --- Webamp ---
await page.locator('.taskbar .material-symbols-outlined', { hasText: 'music_note' }).first().click({ force: true });
await page.waitForTimeout(4000);

console.log('taskbar window icons after opening webamp:', await countWindowIcons());

await page.screenshot({ path: 'testing/screenshots/webamp-taskbar-fix.png' });

await browser.close();
