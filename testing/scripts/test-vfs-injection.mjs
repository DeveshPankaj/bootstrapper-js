import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
const SHOT = './testing/screenshots';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

page.on('console', m => {
  if (m.type() === 'error') console.log('[page error]', m.text());
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// Check all 7 commands are registered
const cmds = ['ui.model-builder', 'ui.trainboard', 'ui.nn-ide',
               'ui.snake-game', 'ui.snake-lstm', 'ui.snake-qlearning', 'ui.snake-cnn3d'];
for (const cmd of cmds) {
  const found = await page.evaluate((c) => {
    return !!window.platform.host.getCommand(c);
  }, cmd);
  console.log(`${found ? 'OK' : 'MISSING'}: command ${cmd}`);
}

// Open model-builder
await page.evaluate(() => window.platform.host.callCommand('ui.model-builder'));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOT}/vfs-test-model-builder.png` });

// Find model-builder iframe and test AppSDK
const result = await page.evaluate(async () => {
  const iframes = [...document.querySelectorAll('iframe')];
  // walk into layout iframes to find app-level iframes
  const allFrames = [];
  for (const f of iframes) {
    allFrames.push(f);
    try {
      const inner = [...(f.contentDocument?.querySelectorAll('iframe') || [])];
      allFrames.push(...inner);
    } catch (_) {}
  }

  for (const f of allFrames) {
    try {
      const win = f.contentWindow;
      if (!win) continue;
      const src = f.src || '';
      if (!src.includes('model-builder')) continue;

      const hasSDK = typeof win.AppSDK !== 'undefined' && typeof win.AppSDK.readText === 'function';
      if (!hasSDK) return { ok: false, reason: 'AppSDK not injected yet', src };

      // Test VFS write+read
      const testPath = '/tmp/vfs-inject-test.txt';
      await win.AppSDK.writeText(testPath, 'vfs-works');
      const back = await win.AppSDK.readText(testPath);
      const vfsOk = back === 'vfs-works';

      // Get visible content
      const bodyText = win.document.body ? win.document.body.innerText.slice(0, 150) : '';

      return { ok: true, hasSDK, vfsOk, bodyText: bodyText.trim(), src };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  return { ok: false, reason: 'model-builder iframe not found', count: allFrames.length };
});

console.log('\nModel-builder VFS injection test:', JSON.stringify(result, null, 2));

// Open snake-game
await page.evaluate(() => window.platform.host.callCommand('ui.snake-game'));
await page.waitForTimeout(2000);
await page.screenshot({ path: `${SHOT}/vfs-test-snake-game.png` });

const snakeResult = await page.evaluate(async () => {
  const allFrames = [];
  for (const f of [...document.querySelectorAll('iframe')]) {
    allFrames.push(f);
    try { allFrames.push(...[...(f.contentDocument?.querySelectorAll('iframe') || [])]); } catch (_) {}
  }
  for (const f of allFrames) {
    try {
      const win = f.contentWindow;
      if (!win || !(f.src || '').includes('snake-game')) continue;
      const hasSDK = typeof win.AppSDK !== 'undefined';
      const bodyText = win.document.body ? win.document.body.innerText.slice(0, 80) : '';
      return { hasSDK, bodyText: bodyText.trim(), src: f.src };
    } catch (e) { return { error: e.message }; }
  }
  return { reason: 'snake-game iframe not found' };
});
console.log('\nSnake-game test:', JSON.stringify(snakeResult));

await browser.close();
