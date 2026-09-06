import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const ipcErrors = [];
page.on('console', msg => {
  const t = msg.text();
  if (t.includes('Unknown IPC') || t.includes('wos-ipc') || t.includes('wm.'))
    console.log(`[${msg.type()}]`, t);
  if (t.includes('Unknown IPC')) ipcErrors.push(t);
});

await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

// Verify WM bridge is set on main window
const bridgeSet = await page.evaluate(() => typeof window.__wosWmBridge?.getWindows === 'function');
console.log('__wosWmBridge set on main window:', bridgeSet);

// Verify dock iframe exists
const dockIframe = await page.$('#vfs-dock-iframe');
console.log('VFS dock iframe:', !!dockIframe);

// Get windows via the bridge directly
const windows = await page.evaluate(() => window.__wosWmBridge?.getWindows() ?? []);
console.log('windows on load:', windows.length);

// Open a window by simulating what the desktop does
await page.evaluate(() => {
  // Find the open-window service and call it with notepad command
  try {
    const svc = window?.platform?.getService?.('001-core.layout', 'open-window');
    if (svc) {
      const cmd = window?.platform?.host?.getCommand?.('ui.notepad');
      if (cmd) svc(cmd);
    }
  } catch(e) { console.error('open err:', e.message); }
});
await page.waitForTimeout(3000);

const windowsAfter = await page.evaluate(() => window.__wosWmBridge?.getWindows() ?? []);
console.log('windows after open:', windowsAfter.length, windowsAfter.map(w => w.name));

// Check dock content
if (dockIframe) {
  const frame = await dockIframe.contentFrame();
  if (frame) {
    await frame.waitForTimeout(1000);
    const dockHtml = await frame.$eval('#dock', el => el.innerHTML).catch(() => '(error)');
    console.log('dock HTML after open:', dockHtml.substring(0, 400) || '(empty)');
  }
}

console.log('IPC errors:', ipcErrors.length);
await browser.close();
