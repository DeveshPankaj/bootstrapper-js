import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push(err.message));

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Open settings.html via desktop icon
const settingsIcon = page.locator('.desktop-icons .file-item, .desktop-icons div').filter({ hasText: 'settings.html' }).first();
console.log('settings icon count:', await settingsIcon.count());
await settingsIcon.dblclick({ force: true });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'wm-debug.png' });

// Find the settings window's frame
const findFrame = async (text) => {
  for (const f of page.frames()) {
    try {
      const c = await f.locator(`text=${text}`).count();
      if (c > 0) return f;
    } catch (e) {}
  }
  return null;
}

let frame = await findFrame('Window Manager');
console.log('found settings frame:', !!frame);

// Click "Window Manager" nav tab
const navLink = frame.locator('a', { hasText: 'Window Manager' });
console.log('nav link count:', await navLink.count());
await navLink.click({ force: true });
await page.waitForTimeout(500);

// Re-find frame (it may have been a fresh iframe document after re-render)
frame = await findFrame('Corner radius');
console.log('found window-manager page frame:', !!frame);
await page.screenshot({ path: 'wm-settings.png' });

console.log('h2 text:', await frame.locator('h2').allTextContents());

// Change header background color and accent color via fill (color input)
console.log('all inputs:', await frame.locator('input').count());
const colorInputs = frame.locator('input[type="color"]');
console.log('color inputs:', await colorInputs.count());
await colorInputs.nth(0).fill('#ff0000'); // header background -> red
await page.waitForTimeout(300);

// Change border radius slider
const rangeInputs = frame.locator('input[type="range"]');
console.log('range inputs:', await rangeInputs.count());
await rangeInputs.nth(0).fill('20'); // border radius
await page.waitForTimeout(300);

await page.screenshot({ path: 'wm-settings-changed.png' });

// Now open the file explorer to see the window with new appearance
await page.evaluate(() => {
  const homeIcon = document.querySelector('.desktop-icons');
});

const appsFolder = page.locator('.desktop-icons .file-item, .desktop-icons div').filter({ hasText: 'apps' }).first();
await appsFolder.dblclick({ force: true });
await page.waitForTimeout(1000);
await page.screenshot({ path: 'wm-explorer-window.png' });

// Check CSS variable applied at document root
const cssVars = await page.evaluate(() => {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  return {
    headerBg: cs.getPropertyValue('--wm-header-bg'),
    radius: cs.getPropertyValue('--wm-radius'),
    accent: cs.getPropertyValue('--wm-accent'),
  };
});
console.log('css vars:', cssVars);

// Check /etc/wm/window-manager.json content
const wmJson = await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  return fs.readFileSync('/etc/wm/window-manager.json', 'utf-8');
});
console.log('wm json:', wmJson);

console.log('console errors:', errors);

await browser.close();
