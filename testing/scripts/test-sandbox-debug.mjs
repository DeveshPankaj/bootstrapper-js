// Debug: test if SW injects bootstrap and if frames load correctly.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
const browser = await chromium.launch({ headless: true });
const page    = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

await page.goto(BASE, { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(4000);

// 1. Test: fetch the app HTML through the SW from the main page context
// This verifies the SW injection works independently of the iframe
const swHtmlCheck = await page.evaluate(async () => {
  try {
    const res = await fetch('/(sw)/opt/apps/model-builder/main.html');
    const text = await res.text();
    return {
      status: res.status,
      hasBootstrap: text.includes('wos-appsdk-bootstrap'),
      headSlice: text.slice(0, 300),
    };
  } catch (e) { return { error: String(e) }; }
});
console.log('SW fetch /opt/apps/model-builder/main.html:', JSON.stringify(swHtmlCheck));

// 2. All frames before opening anything
console.log('Frames before open:', page.frames().length, page.frames().map(f => f.url().slice(0, 60)));

// 3. Open model-builder
await page.evaluate(() => window.platform.host.callCommand('ui.model-builder'));
await page.waitForTimeout(4000);

// 4. Frames after opening
const allFrames = page.frames();
console.log('Frames after open:', allFrames.length);
for (const f of allFrames) {
  const url = f.url();
  if (url !== 'about:blank' && url !== BASE + '/' && url !== BASE) {
    console.log('  -', url.slice(0, 80));
  }
}

// 5. Find model-builder frame and show its head
const mbFrame = allFrames.find(f => f.url().includes('model-builder'));
if (mbFrame) {
  const head = await mbFrame.evaluate(() => ({
    headHtml: document.head?.innerHTML?.slice(0, 600) || '(no head)',
    hasAppSDK: typeof window.AppSDK,
    bodyText: document.body?.innerText?.slice(0, 100) || '(no body)',
  }));
  console.log('model-builder frame head:', JSON.stringify(head));
} else {
  console.log('model-builder frame: NOT FOUND in page.frames()');
}

// 6. Check sandbox attribute on the iframe element in parent doc
const sandbox = await page.evaluate(() => {
  const collect = (doc) => {
    const res = [];
    try { for (const f of doc.querySelectorAll('iframe')) { res.push(f); try { res.push(...collect(f.contentDocument)); } catch (_) {} } } catch (_) {}
    return res;
  };
  for (const f of collect(document)) {
    if ((f.src || '').includes('model-builder')) return { src: f.src, sandbox: f.getAttribute('sandbox') };
  }
  return null;
});
console.log('iframe DOM sandbox check:', JSON.stringify(sandbox));

await browser.close();
