import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('pageerror', err => { errors.push(err.message); console.log('PAGEERROR:', err.message); });
page.on('console', msg => { if (msg.type() === 'error') { errors.push(msg.text()); console.log('CONSOLE ERROR:', msg.text()); } });

await page.goto('http://localhost:8080/?fsBackend=localstorage');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

await page.screenshot({ path: 'testing/screenshots/explorer-localstorage.png' });

// check fs state inside the page
const state = await page.evaluate(() => {
  const fs = window.fs;
  const out = {};
  try { out.explorerExists = fs.existsSync('/home/user1/apps/explorer.js'); } catch(e) { out.explorerExistsErr = e.message; }
  try { out.initdExists = fs.existsSync('/home/user1/initd.run'); } catch(e) { out.initdExistsErr = e.message; }
  try { out.commands = window.platform.host.commands.getValue ? window.platform.host.commands.getValue().map(c=>c.name) : 'n/a'; } catch(e) { out.commandsErr = e.message; }
  return out;
});
console.log('state:', JSON.stringify(state, null, 2));

console.log('errors so far:', errors);

await browser.close();
