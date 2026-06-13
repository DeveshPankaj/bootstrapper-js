import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage();

page.on('console', (msg) => console.log('CONSOLE:', msg.text()));

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });

await page.waitForTimeout(2000);

const findFrameWithSelector = async (selector) => {
  for (const frame of page.frames()) {
    try {
      if (await frame.locator(selector).count() > 0) return frame;
    } catch {}
  }
  return null;
};

// Open notepad (ui.notepad) so we have a process to inspect/kill.
let layoutFrame = await findFrameWithSelector('[aria-label="ui.notepad"]');
console.log('found layout frame:', !!layoutFrame);
await layoutFrame.locator('[aria-label="ui.notepad"]').click({ force: true });
await page.waitForTimeout(1000);

// Open task manager
layoutFrame = await findFrameWithSelector('[aria-label="ui.task-manager"]');
await layoutFrame.locator('[aria-label="ui.task-manager"]').click({ force: true });
await page.waitForTimeout(1500);

const findFrame = async (text) => {
  for (const frame of page.frames()) {
    try {
      if (await frame.locator(`text=${text}`).count() > 0) return frame;
    } catch {}
  }
  return null;
};

const tmFrame = await findFrame('Task Manager');
console.log('found task-manager frame:', !!tmFrame);

const rowsText = await page.evaluate(() => {
  for (const f of document.querySelectorAll('iframe')) {
    try {
      const tbody = f.contentDocument?.querySelector('.task-manager tbody');
      if (tbody) return tbody.innerText;
    } catch {}
  }
  return null;
});
console.log('task manager rows:\n', rowsText);

await page.screenshot({ path: 'testing/screenshots/task-manager.png' });

// Now check /proc via getFS in page context
const procList = await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  return fs.readdirSync('/proc');
});
console.log('proc dirs:', procList);

// Check process.list command
const processList = await page.evaluate(() => {
  return window.platform.host.getCommand('process.list')?.exec();
});
console.log('process.list:', JSON.stringify(processList, null, 2));

// Test process.send-message + onMessage via /proc inbox
await page.evaluate((pid) => {
  window.platform.host.getCommand('process.send-message')?.exec(pid, 'hello-from-test');
}, processList[0].pid);

await page.waitForTimeout(500);

const inbox = await page.evaluate((pid) => {
  const fs = window.platform.host.getFS();
  const path = `/proc/${pid}/inbox.json`;
  return fs.existsSync(path) ? fs.readFileSync(path, 'utf-8').toString() : null;
}, processList[0].pid);
console.log('inbox for pid', processList[0].pid, ':', inbox);

// Kill the first process (notepad) and check it disappears
const killPid = processList.find(p => p.name === 'ui.notepad')?.pid;
console.log('killing pid', killPid);
await page.evaluate((pid) => {
  window.platform.host.getCommand('process.kill')?.exec(pid);
}, killPid);

await page.waitForTimeout(500);

const procListAfter = await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  return fs.existsSync('/proc') ? fs.readdirSync('/proc') : [];
});
console.log('proc dirs after kill:', procListAfter);

const processListAfter = await page.evaluate(() => {
  return window.platform.host.getCommand('process.list')?.exec();
});
console.log('process.list after kill:', JSON.stringify(processListAfter.map(p => ({pid: p.pid, name: p.name})), null, 2));

await page.screenshot({ path: 'testing/screenshots/task-manager-after-kill.png' });

await browser.close();
