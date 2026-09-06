import { chromium } from 'playwright';

const BASE  = 'http://localhost:8080';
const SHOT  = './testing/screenshots';

const browser = await chromium.launch({ headless: true });
const page    = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// ── 1. ProcessManager singleton exists ──────────────────────────────────────
const hasPM = await page.evaluate(() => {
  try {
    const pm = window.platform?.host?.getProcessManager?.();
    return !!(pm && typeof pm.spawn === 'function' && typeof pm.list === 'function');
  } catch (_) { return false; }
});
console.log('ProcessManager on host:', hasPM ? 'OK' : 'MISSING');

// ── 2. Open model-builder — should spawn a Namespace + pass ProxyFS ─────────
await page.evaluate(() => window.platform.host.callCommand('ui.model-builder'));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SHOT}/rings-model-builder.png` });

// ── 3. Check a process was spawned in ProcessManager ────────────────────────
const processes = await page.evaluate(() => {
  try {
    return window.platform.host.getProcessManager().list().map(p => ({
      pid: p.pid, id: p.id, label: p.label,
    }));
  } catch (_) { return []; }
});
console.log('Processes after open:', JSON.stringify(processes));

const mbProc = processes.find(p => p.id === 'ui.model-builder');
console.log('model-builder process spawned:', mbProc ? `pid=${mbProc.pid}` : 'MISSING');

// ── 4. Check AppSDK inside the iframe came from ProxyFS.toAppSDK() ──────────
const iframeResult = await page.evaluate(async () => {
  const iframes = [...document.querySelectorAll('iframe')];
  const allFrames = [];
  for (const f of iframes) {
    allFrames.push(f);
    try { allFrames.push(...[...(f.contentDocument?.querySelectorAll('iframe') || [])]); } catch (_) {}
  }
  for (const f of allFrames) {
    if (!(f.src || '').includes('model-builder')) continue;
    try {
      const win = f.contentWindow;
      if (!win) continue;
      const hasSDK = typeof win.AppSDK !== 'undefined';
      // Test VFS round-trip
      let vfsOk = false;
      if (hasSDK && typeof win.AppSDK.writeText === 'function') {
        await win.AppSDK.writeText('/tmp/ring-test.txt', 'ring1');
        const back = await win.AppSDK.readText('/tmp/ring-test.txt');
        vfsOk = back === 'ring1';
      }
      // Check body renders real content (not black)
      const bodyText = win.document.body?.innerText?.slice(0, 120) ?? '';
      return { hasSDK, vfsOk, bodyText: bodyText.trim() };
    } catch (e) { return { error: String(e) }; }
  }
  return { notFound: true };
});
console.log('model-builder iframe:', JSON.stringify(iframeResult));

// ── 5. Open snake-game — check its process too ───────────────────────────────
await page.evaluate(() => window.platform.host.callCommand('ui.snake-game'));
await page.waitForTimeout(1500);

const processesAfter = await page.evaluate(() => {
  try { return window.platform.host.getProcessManager().list().map(p => ({ pid: p.pid, id: p.id })); }
  catch (_) { return []; }
});
const snakeProc = processesAfter.find(p => p.id === 'ui.snake-game');
console.log('snake-game process spawned:', snakeProc ? `pid=${snakeProc.pid}` : 'MISSING');
console.log('Total processes:', processesAfter.length);

await page.screenshot({ path: `${SHOT}/rings-multi-windows.png` });

await browser.close();
