import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

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

// Simulate explorer.js not having registered the 'explorer' command by removing it,
// then invoke command('explorer') the way a folder double-click / context menu does.
const result = await page.evaluate(() => {
  const platform = window.platform;
  // remove all currently-registered 'explorer' commands (simulating explorer.js
  // failing to register one, e.g. stale copy from an old localStorage fs)
  const before = platform.host.commands.getValue();
  platform.host.commands.next(before.filter(c => !(c.name === 'explorer' && c.servicePlatformName !== 'root')));

  try {
    platform.host.execCommand(`service('001-core.layout', 'open-window') (command('explorer'), '/home/user1')`, platform);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});
console.log('result:', JSON.stringify(result));

await page.waitForTimeout(1000);
await page.screenshot({ path: 'testing/screenshots/explorer-fallback.png' });
console.log('errors:', errors);

await browser.close();
