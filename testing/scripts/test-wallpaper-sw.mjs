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

// write a tiny PNG into the virtual fs (1x1 red pixel), simulating a mounted image
const result = await page.evaluate(() => {
  const fs = window.fs;
  if (!fs.existsSync('/mnt')) fs.mkdirSync('/mnt');
  if (!fs.existsSync('/mnt/public')) fs.mkdirSync('/mnt/public');
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const bytes = Uint8Array.from(atob(pngBase64), c => c.charCodeAt(0));
  fs.writeFileSync('/mnt/public/wp-5.png', Buffer.from(bytes));

  const fullUrl = `${window.location.origin}/(sw)/mnt/public/wp-5.png`;
  window.platform.host.callCommand('set-wallpaper', fullUrl);

  return { fullUrl };
});
console.log('set wallpaper:', JSON.stringify(result));

await page.waitForTimeout(500);

const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.layout-default')).backgroundImage);
console.log('computed background-image:', bg);

await page.screenshot({ path: 'testing/screenshots/wallpaper-sw-test.png' });
console.log('errors:', errors);

await browser.close();
