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

// Open the terminal app via the file explorer / exec helper
await page.evaluate(() => {
  window.platform.host.exec(window.platform, '/home/user1/apps/xtermjs.html');
});
await page.waitForTimeout(2000);

let termFrame = null;
for (const frame of page.frames()) {
  if (await frame.locator('#tab-bar').count() > 0) { termFrame = frame; break; }
}
console.log('terminal frame found:', !!termFrame);

await page.screenshot({ path: 'testing/screenshots/terminal-initial.png' });

// Click into the terminal to focus it
await termFrame.locator('.terminal-pane').first().click({ force: true });
await page.waitForTimeout(300);

const type = async (text) => {
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: 10 });
  }
};

// run "pwd" - not implemented internally, but ls should work
await type('ls');
await page.keyboard.press('Enter');
await page.waitForTimeout(500);

// echo with quoted args
await type('echo "hello world"');
await page.keyboard.press('Enter');
await page.waitForTimeout(500);

// history navigation: press up twice, should show "echo "hello world"" then "ls"
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(200);
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(200);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(200);

const dumpBuffer = () => termFrame.evaluate(() => {
  const session = window.__terminalApp.sessions.find(s => s.tabEl.classList.contains('active'));
  const buf = session.terminal.buffer.active;
  const lines = [];
  for (let i = 0; i < buf.length; i++) {
    lines.push(buf.getLine(i).translateToString(true));
  }
  return lines;
});

let buffer1 = await dumpBuffer();
console.log('--- after history nav ---');
console.log(buffer1.filter(l => l.trim() !== '').slice(-5).join('\n'));

// clear that line
await page.keyboard.press('Control+U').catch(()=>{});
for (let i = 0; i < 30; i++) await page.keyboard.press('Backspace');

// async sleep command
await type('sleep 1');
await page.keyboard.press('Enter');
const before = Date.now();
await page.waitForTimeout(1500);
const buffer2 = await dumpBuffer();
console.log('--- after sleep ---');
console.log(buffer2.filter(l => l.trim() !== '').slice(-6).join('\n'));

// new tab
await termFrame.locator('#new-tab').click({ force: true });
await page.waitForTimeout(500);
const tabCount = await termFrame.locator('.tab').count();
console.log('tab count after new tab:', tabCount);

await page.screenshot({ path: 'testing/screenshots/terminal-tabs.png' });

// switch back to first tab
await termFrame.locator('.tab').first().click({ force: true });
await page.waitForTimeout(300);

// close second tab
await termFrame.locator('.tab').nth(1).locator('.tab-close').click({ force: true });
await page.waitForTimeout(300);
const tabCountAfterClose = await termFrame.locator('.tab').count();
console.log('tab count after close:', tabCountAfterClose);

await page.screenshot({ path: 'testing/screenshots/terminal-final.png' });
console.log('errors:', errors);

await browser.close();
