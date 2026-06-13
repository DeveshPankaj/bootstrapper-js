import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

page.on('pageerror', err => { console.log('PAGEERROR:', err.message); });
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

const result = await page.evaluate(async () => {
  const fs = window.fs;
  const out = {};
  out.iconDirExists = fs.existsSync('/usr/share/icons');
  out.usrExists = fs.existsSync('/usr');
  out.usrShareExists = fs.existsSync('/usr/share');

  // Try manually fetching & writing one icon
  try {
    const resp = await fetch('/public/mount/usr/share/icons/js-icon.png');
    out.fetchStatus = resp.status;
    const buf = await resp.arrayBuffer();
    out.bufLen = buf.byteLength;
    if (!fs.existsSync('/usr/share')) fs.mkdirSync('/usr/share', { recursive: true });
    fs.writeFileSync('/usr/share/icons-test.png', Buffer.from(buf));
    out.wroteOk = fs.existsSync('/usr/share/icons-test.png');
  } catch (err) {
    out.error = String(err) + ' ' + (err && err.stack);
  }

  // meta.json content as seen by app
  out.metaHasIcons = JSON.parse(fs.readFileSync('/meta.json', 'utf-8')).filter(x => x.path.includes('icons'));

  return out;
});

console.log(JSON.stringify(result, null, 2));

await browser.close();
