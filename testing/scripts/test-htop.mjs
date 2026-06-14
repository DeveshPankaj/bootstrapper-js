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
    } catch (e) {}
  }
}
console.log('terminal frame found:', !!termFrame);
await page.waitForTimeout(1000);

const dumpBuffer = async () => termFrame.evaluate(() => {
  const app = window.__terminalApp;
  const session = app.sessions[0];
  const buf = session.terminal.buffer.active;
  const lines = [];
  for (let i = 0; i < buf.length; i++) lines.push(buf.getLine(i).translateToString(true));
  return lines.join('\n');
});

// Start htop (don't await - it loops until 'q')
const runPromise = termFrame.evaluate(async () => {
  const app = window.__terminalApp;
  const session = app.sessions[0];
  window.__htopDone = false;
  session.processCommand('htop').then(() => { window.__htopDone = true; });
});
await runPromise;

await page.waitForTimeout(1500);
console.log('--- while running ---');
console.log(await dumpBuffer());

// Send 'q' by focusing the terminal and typing - xterm.js's onData fires from
// real keyboard/paste events on its textarea.
await termFrame.locator('.xterm-helper-textarea, textarea').first().focus();
await page.keyboard.press('q');

await page.waitForTimeout(500);
const done = await termFrame.evaluate(() => window.__htopDone);
console.log('htop done after q:', done);

console.log('--- after quitting ---');
console.log(await dumpBuffer());

await browser.close();
