// Test that app iframes are sandboxed and AppSDK works via postMessage bridge.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
const SHOT = './testing/screenshots';

const browser = await chromium.launch({ headless: true });
const page    = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

await page.goto(BASE, { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(4000);

// Open model-builder
await page.evaluate(() => window.platform.host.callCommand('ui.model-builder'));
await page.waitForTimeout(4000);
await page.screenshot({ path: `${SHOT}/sandbox-model-builder.png` });

// ── 1. Check sandbox attribute on the app iframe ──────────────────────────────
const sandboxCheck = await page.evaluate(() => {
  const collect = (doc) => {
    const frames = [];
    try {
      for (const f of doc.querySelectorAll('iframe')) {
        frames.push(f);
        try { frames.push(...collect(f.contentDocument)); } catch (_) {}
      }
    } catch (_) {}
    return frames;
  };
  for (const f of collect(document)) {
    if (!(f.src || '').includes('model-builder')) continue;
    return {
      hasSandbox: f.hasAttribute('sandbox'),
      sandboxValue: f.getAttribute('sandbox'),
      noSameOrigin: !(f.getAttribute('sandbox') || '').includes('allow-same-origin'),
    };
  }
  return { notFound: true };
});
console.log('1. Sandbox attribute:', JSON.stringify(sandboxCheck));
console.log('   Sandboxed (no same-origin):', sandboxCheck.noSameOrigin ? 'YES ✓' : 'NO ✗');

// ── 2. AppSDK works via postMessage bridge (inside the sandboxed frame) ───────
const modelBuilderFrames = page.frames().filter(f => f.url().includes('model-builder'));
console.log('2. Sandboxed frames:', modelBuilderFrames.length);

if (modelBuilderFrames.length > 0) {
  const f = modelBuilderFrames[0];

  // What does the frame's head look like? (check bootstrap presence)
  const headHtml = await f.evaluate(() => document.head?.innerHTML?.slice(0, 500) || '(no head)');
  const hasBootstrap = headHtml.includes('wos-appsdk-bootstrap');
  console.log('3. Bootstrap in frame head:', hasBootstrap ? 'YES ✓' : 'NO ✗');

  // AppSDK and VFS test
  const sdkTest = await f.evaluate(async () => {
    const hasSDK = typeof window.AppSDK !== 'undefined';
    let vfsOk = false;
    let topBlocked = false;
    if (hasSDK && typeof window.AppSDK.writeText === 'function') {
      try {
        await window.AppSDK.writeText('/tmp/sandbox-test.txt', 'sandboxed-ok');
        const back = await window.AppSDK.readText('/tmp/sandbox-test.txt');
        vfsOk = back === 'sandboxed-ok';
      } catch (e) { return { hasSDK, vfsOk: false, writeError: String(e) }; }
    }
    try {
      // Cross-origin check: window.top.platform should be inaccessible
      const t = window.top.platform;
      topBlocked = (t === undefined || t === null);
    } catch (_) { topBlocked = true; }
    return { hasSDK, vfsOk, topBlocked };
  });
  console.log('4. AppSDK + isolation:', JSON.stringify(sdkTest));
} else {
  console.log('3. Bootstrap: could not find frame');
  console.log('4. AppSDK: skipped');
}

// ── 5. snake-game also sandboxed ─────────────────────────────────────────────
await page.evaluate(() => window.platform.host.callCommand('ui.snake-game'));
await page.waitForTimeout(2000);
const snakeCheck = await page.evaluate(() => {
  const collect = (doc) => {
    const frames = [];
    try {
      for (const f of doc.querySelectorAll('iframe')) {
        frames.push(f);
        try { frames.push(...collect(f.contentDocument)); } catch (_) {}
      }
    } catch (_) {}
    return frames;
  };
  for (const f of collect(document)) {
    if (!(f.src || '').includes('snake-game')) continue;
    return { hasSandbox: f.hasAttribute('sandbox'), noSameOrigin: !(f.getAttribute('sandbox') || '').includes('allow-same-origin') };
  }
  return { notFound: true };
});
console.log('5. snake-game sandbox:', JSON.stringify(snakeCheck));

await browser.close();
