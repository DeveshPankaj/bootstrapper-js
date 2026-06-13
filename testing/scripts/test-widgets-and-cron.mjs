import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage();

page.on('console', (msg) => console.log('CONSOLE:', msg.text()));

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });

await page.waitForTimeout(2000);

const widgets = await page.locator('.widget').all();
console.log('widget count:', widgets.length);

for (const w of widgets) {
  const name = await w.getAttribute('data-widget');
  const text = await w.innerText();
  console.log(`widget [${name}]:`, JSON.stringify(text));
}

await page.screenshot({ path: 'testing/screenshots/widgets-panel.png' });

// wait a bit for the public-ip widget to refresh after its self-triggered fetch
await page.waitForTimeout(8000);

const ipWidget = page.locator('.widget[data-widget="public-ip"]');
console.log('public-ip widget text after wait:', JSON.stringify(await ipWidget.innerText()));

await page.screenshot({ path: 'testing/screenshots/widgets-panel-2.png' });

await browser.close();
