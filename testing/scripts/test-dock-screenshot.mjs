import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

mkdirSync('testing/screenshots', { recursive: true });

const browser = await chromium.launch({ headless: false, args: ['--window-size=1400,900'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

page.on('console', msg => {
  const t = msg.text();
  if (t.includes('dock') || t.includes('IPC') || t.includes('wm.') || msg.type() === 'error')
    console.log(`[${msg.type()}]`, t.substring(0, 120));
});

// Three reloads to ensure service worker is active
await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

await page.screenshot({ path: 'testing/screenshots/01-initial.png', fullPage: false });
console.log('Screenshot 01: initial load');

// Check dock is present
const dockIframe = await page.$('#vfs-dock-iframe');
console.log('Dock iframe present:', !!dockIframe);
const bodyClass = await page.evaluate(() => document.body.className);
console.log('Body class:', bodyClass);

// Open apps via desktop right-click context menu
await page.mouse.click(700, 400, { button: 'right' });
await page.waitForTimeout(800);
await page.screenshot({ path: 'testing/screenshots/02-contextmenu.png' });
console.log('Screenshot 02: right-click context menu');

// Look for any menu items — try to click the first action item
const menuItems = await page.$$('.context-menu-item, [class*="contextmenu"] li, [class*="menu-item"]');
console.log('Menu items found:', menuItems.length);
if (menuItems.length > 0) {
  const text = await menuItems[0].textContent();
  console.log('First menu item:', text);
  await menuItems[0].click();
  await page.waitForTimeout(2000);
} else {
  // Try pressing Escape and use keyboard shortcut or find desktop icons
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Try double-clicking a desktop icon if any
  const desktopIcons = await page.$$('.vfs-desktop-icon, .desktop-icon, [class*="desktop"] .file-item');
  console.log('Desktop icons found:', desktopIcons.length);
  if (desktopIcons.length > 0) {
    await desktopIcons[0].dblclick({ force: true });
    await page.waitForTimeout(2000);
  }
}

await page.screenshot({ path: 'testing/screenshots/03-after-open-attempt.png' });

// Try opening notepad directly via the platform API
await page.evaluate(() => {
  try {
    const h = window?.platform?.host;
    if (!h) return;
    const cmd = h.getCommand('ui.notepad') || h.getCommand('notepad');
    if (cmd) {
      const svc = window?.platform?.getService('001-core.layout', 'open-window');
      if (typeof svc === 'function') svc(cmd, '/home/user1/welcome/readme.md');
    }
  } catch(e) { console.error('open notepad failed:', e.message); }
});
await page.waitForTimeout(2500);

await page.screenshot({ path: 'testing/screenshots/04-after-notepad.png' });
console.log('Screenshot 04: after notepad open attempt');

// Try explorer too
await page.evaluate(() => {
  try {
    const h = window?.platform?.host;
    const cmd = h?.getCommand('explorer') || h?.getCommand('ui.file-explorer');
    const svc = window?.platform?.getService('001-core.layout', 'open-window');
    if (cmd && typeof svc === 'function') svc(cmd);
  } catch(e) { console.error('open explorer failed:', e.message); }
});
await page.waitForTimeout(2500);

await page.screenshot({ path: 'testing/screenshots/05-after-explorer.png' });
console.log('Screenshot 05: after explorer open attempt');

// Check windows and dock state
const wmBridge = await page.evaluate(() => {
  const b = window.__wosWmBridge;
  if (!b) return null;
  try { return b.getWindows(); } catch(e) { return { error: e.message }; }
});
console.log('WM bridge windows:', JSON.stringify(wmBridge));

// Check dock iframe content
if (dockIframe) {
  const frame = await dockIframe.contentFrame();
  if (frame) {
    const dockHtml = await frame.$eval('#dock', el => el.innerHTML).catch(() => 'error');
    console.log('Dock HTML:', dockHtml ? dockHtml.substring(0, 500) : '(empty)');
    const items = await frame.$$('.win-icon');
    console.log('Dock items:', items.length);
  } else {
    console.log('Could not access dock frame');
  }
}

// Final screenshot with everything settled
await page.waitForTimeout(2000);
await page.screenshot({ path: 'testing/screenshots/06-final.png', fullPage: false });
console.log('Screenshot 06: final state');

await browser.close();
console.log('\nScreenshots saved to testing/screenshots/');
