import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:8105';
const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const BIN_DIR = path.join(REPO_ROOT, 'docs/public/mount/bin');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', err => console.log('PAGEERROR:', err.message));
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });

await page.goto(BASE);
await page.reload({ waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2000);
await page.waitForFunction(() => !!window.platform, { timeout: 30000 }).catch(() => {});
await page.waitForSelector('.content-area', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1000);

for (const name of ['du', 'cut']) {
  const src = fs.readFileSync(path.join(BIN_DIR, `${name}.run`), 'utf8');
  await page.evaluate(({ name, src }) => {
    window.platform.host.getFS().writeFileSync(`/bin/${name}.run`, src);
  }, { name, src });
}

await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  try { fs.mkdirSync('/tmp/dbg'); } catch (_) {}
  fs.writeFileSync('/tmp/dbg/a.txt', 'x'.repeat(1000));
  fs.writeFileSync('/tmp/dbg/data.csv', 'a,b,c\n1,2,3\n');
});

await page.evaluate(() => window.platform.host.callCommand('ui.terminal'));
await page.waitForTimeout(1500);

let termFrames = [];
for (let i = 0; i < 30 && !termFrames.length; i++) {
  await page.waitForTimeout(200);
  for (const f of page.frames()) {
    try { if (await f.evaluate(() => !!window.__terminalApp).catch(() => false)) { termFrames.push(f); } } catch (_) {}
  }
}
console.log('terminal frames found:', termFrames.length, termFrames.map(f => f.url()));
const termFrame = termFrames[termFrames.length - 1];
const sessInfo = await termFrame.evaluate(() => ({
  sessCount: window.__terminalApp.sessions.length,
  hasElement: !!window.__terminalApp.sessions[0]?.terminal?.element,
  isOpen: !!window.__terminalApp.sessions[0]?.terminal?.element?.isConnected,
}));
console.log('session info:', sessInfo);

const result = await termFrame.evaluate(async () => {
  const app = window.__terminalApp;
  const session = app.sessions[0];
  const dump = () => {
    const buf = session.terminal.buffer.active;
    const lines = [];
    for (let i = 0; i < buf.length; i++) lines.push(buf.getLine(i)?.translateToString(true) ?? '');
    return lines;
  };
  const before = dump();
  const busyBefore = session.busy;
  let error = null;
  try {
    await session.processCommand('echo hello-marker-xyz');
  } catch (e) {
    error = e && e.message ? e.message : String(e);
  }
  await new Promise(r => setTimeout(r, 300));
  const after = dump();
  return { before, after, error, busyBefore, cursorY: session.terminal.buffer.active.cursorY, baseY: session.terminal.buffer.active.baseY };
});

console.log('error:', result.error, 'busyBefore:', result.busyBefore, 'cursorY:', result.cursorY, 'baseY:', result.baseY);
console.log('before.length:', result.before.length, 'after.length:', result.after.length);
console.log('--- before (non-blank) ---');
console.log(result.before.filter(l => l.trim()).join('\n'));
console.log('--- after (non-blank) ---');
console.log(result.after.filter(l => l.trim()).join('\n'));

await browser.close();
