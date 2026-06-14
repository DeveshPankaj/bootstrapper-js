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

// --- Test 1: toolbar widget hidden by default ---
const widgetNames = await page.locator('.widget').evaluateAll(els => els.map(el => el.getAttribute('data-widget')));
console.log('widgets visible by default:', JSON.stringify(widgetNames));

// --- Test 2: open Settings -> Widgets, check toolbar checkbox state, enable it ---
await page.evaluate(() => {
  window.platform.host.execCommand(`service('root', 'exec') ('/home/user1/settings.html');`, window.platform);
});
await page.waitForTimeout(1500);

let settingsFrame = null;
for (let i = 0; i < 30 && !settingsFrame; i++) {
  await page.waitForTimeout(200);
  for (const f of page.frames()) {
    try {
      if (await f.locator('.settings-nav-item', { hasText: 'Widgets' }).count() > 0) { settingsFrame = f; break; }
    } catch (e) { /* ignore */ }
  }
}
console.log('settings frame found:', !!settingsFrame);

await settingsFrame.locator('.settings-nav-item', { hasText: 'Widgets' }).click({ force: true });
await page.waitForTimeout(500);

const widgetRows = await settingsFrame.locator('.settings-page .settings-row').evaluateAll(els =>
  els.map(el => ({ title: el.querySelector('.settings-row-title')?.textContent, checked: el.querySelector('input[type=checkbox]')?.checked }))
);
console.log('widget rows:', JSON.stringify(widgetRows));

// Enable toolbar widget
await settingsFrame.locator('.settings-page .settings-row', { hasText: 'Toolbar' }).locator('input[type=checkbox]').check({ force: true });
await page.waitForTimeout(500);

const widgetNamesAfterEnable = await page.locator('.widget').evaluateAll(els => els.map(el => el.getAttribute('data-widget')));
console.log('widgets visible after enabling toolbar:', JSON.stringify(widgetNamesAfterEnable));

// --- Test 3: dynamic settings section (register via the 'settings' service) ---
await page.evaluate(() => {
  const platform = window.platform;
  const settings = platform.getService('settings');
  settings.registerSection('demo-section', (container, api) => {
    container.innerHTML = '<h1>Demo Section</h1><p id="demo-marker">Hello from a dynamic settings section</p>';
  }, { title: 'Demo', icon: 'science', color: '#ff0000' });
});
await page.waitForTimeout(500);

const navItems = await settingsFrame.locator('.settings-nav-item').allTextContents();
console.log('settings nav items after registering section:', JSON.stringify(navItems));

await settingsFrame.locator('.settings-nav-item', { hasText: 'Demo' }).click({ force: true });
await page.waitForTimeout(300);
console.log('demo section content:', await settingsFrame.locator('#demo-marker').textContent());

// Unregister and verify it disappears
await page.evaluate(() => {
  window.platform.getService('settings').unregisterSection('demo-section');
});
await page.waitForTimeout(300);
const navItemsAfter = await settingsFrame.locator('.settings-nav-item').allTextContents();
console.log('settings nav items after unregistering section:', JSON.stringify(navItemsAfter));

await page.screenshot({ path: 'testing/screenshots/settings-dynamic-section.png' });

// --- Test 4: tree command in terminal ---
await page.evaluate(() => {
  window.platform.host.execCommand(`service('root', 'exec') ('/home/user1/apps/xtermjs.html');`, window.platform);
});
await page.waitForTimeout(1500);

let termFrame = null;
for (let i = 0; i < 30 && !termFrame; i++) {
  await page.waitForTimeout(200);
  for (const f of page.frames()) {
    try {
      const has = await f.evaluate(() => !!window.__terminalApp).catch(() => false);
      if (has) { termFrame = f; break; }
    } catch (e) { /* ignore */ }
  }
}
console.log('terminal frame found:', !!termFrame);

await page.waitForTimeout(1000);

await termFrame.evaluate(async () => {
  const app = window.__terminalApp;
  const session = app.sessions ? app.sessions[0] : app.activeSession;
  await session.processCommand('tree /home/user1');
});
await page.waitForTimeout(500);

const treeOutput = await termFrame.evaluate(() => {
  const app = window.__terminalApp;
  const session = app.sessions ? app.sessions[0] : app.activeSession;
  const buf = session.terminal.buffer.active;
  const lines = [];
  for (let i = 0; i < buf.length; i++) {
    lines.push(buf.getLine(i).translateToString(true));
  }
  return lines.join('\n');
});
console.log('tree output:\n', treeOutput);

await page.screenshot({ path: 'testing/screenshots/tree-command.png' });

await browser.close();
