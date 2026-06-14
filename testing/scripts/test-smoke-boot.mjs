import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
const warnings = [];
page.on('pageerror', err => { errors.push(err.message); console.log('PAGEERROR:', err.message); });
page.on('console', msg => {
  if (msg.type() === 'error' && !msg.text().includes('check-public-ip') && !msg.text().includes('Failed to load resource')) {
    errors.push(msg.text()); console.log('CONSOLE ERROR:', msg.text());
  }
  if (msg.type() === 'warning') { warnings.push(msg.text()); console.log('CONSOLE WARN:', msg.text()); }
});

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

console.log('errors:', errors);
console.log('warnings:', warnings);

await page.screenshot({ path: 'testing/screenshots/smoke-boot.png' });
await browser.close();
