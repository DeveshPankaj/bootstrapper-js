import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('pageerror', err => { errors.push(err.message); console.log('PAGEERROR:', err.message); });
page.on('console', msg => { if (msg.type() === 'error') { errors.push(msg.text()); console.log('CONSOLE ERROR:', msg.text()); } });

const responses = [];
page.on('response', res => {
  if (res.url().includes('5C27') || res.url().includes('(sw)')) {
    responses.push({ url: res.url(), status: res.status() });
  }
});

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Write a file with a space in its name (mimics a dropped file) and open it via ui.iframe.
await page.evaluate(() => {
  const fs = window.fs;
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const bytes = Uint8Array.from(atob(pngBase64), c => c.charCodeAt(0));
  fs.writeFileSync('/home/user1/apps/5C27-EN - Detailed version.jpg', Buffer.from(bytes));
});

await page.evaluate(() => {
  window.platform.host.execCommand(`service('001-core.layout', 'open-window') (command('ui.iframe'), '/home/user1/apps/5C27-EN - Detailed version.jpg')`, window.platform);
});
await page.waitForTimeout(2000);

console.log('responses for the file:', JSON.stringify(responses, null, 2));
console.log('errors:', errors);

await page.screenshot({ path: 'testing/screenshots/sw-encoded-path-test.png' });
await browser.close();
