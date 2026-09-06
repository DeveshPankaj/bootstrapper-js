import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on('console', msg => {
  if (msg.text().includes('dock') || msg.text().includes('[CONSOLE ERR]'))
    console.log(`[${msg.type()}]`, msg.text());
});

await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

// Check VFS dock iframe
const dockIframe = await page.$('#vfs-dock-iframe');
console.log('VFS dock iframe present:', !!dockIframe);
if (dockIframe) {
  const h = await dockIframe.getAttribute('style');
  console.log('dock style:', h?.match(/height:[^;]+/)?.[0]);
}

// Check body class
const bodyClass = await page.evaluate(() => document.body.className);
console.log('body class:', bodyClass);

// Check toolbar and footer visibility
const toolbarVisible = await page.evaluate(() => {
  const el = document.querySelector('.toolbar');
  if (!el) return 'not found';
  const s = window.getComputedStyle(el);
  return s.display;
});
const footerVisible = await page.evaluate(() => {
  const el = document.querySelector('.footer');
  if (!el) return 'not found';
  const s = window.getComputedStyle(el);
  return s.display;
});
console.log('.toolbar display:', toolbarVisible);
console.log('.footer display:', footerVisible);

// Open a window via the desktop context menu or directly
await page.evaluate(() => {
  try {
    const cmd = window?.platform?.host?.getCommand?.('ui.notepad');
    if (cmd) {
      // create window directly via open-window service
      const svc = window?.platform?.getService?.('001-core.layout', 'open-window');
      if (svc) svc(cmd);
    }
  } catch(e) {}
});
await page.waitForTimeout(3000);

// Check dock iframe content after window open
if (dockIframe) {
  const frame = await dockIframe.contentFrame();
  if (frame) {
    const dockEl = await frame.$('#dock');
    if (dockEl) {
      const html = await frame.evaluate(el => el.innerHTML, dockEl).catch(() => '');
      console.log('dock #dock innerHTML:', html ? html.substring(0, 300) : '(empty)');
    }
  }
}

await browser.close();
console.log('done');
