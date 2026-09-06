import { chromium } from 'playwright';

(async () => {
  const b = await chromium.launch({ headless: false, slowMo: 30 });
  const p = await b.newPage();
  await p.setViewportSize({ width: 1400, height: 900 });

  const consoleErrors = [];
  p.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  p.on('pageerror', err => consoleErrors.push('PAGE ERROR: ' + err.message));

  await p.goto('http://localhost:8080');
  await p.waitForTimeout(3000);
  await p.reload({ waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(5000);

  // Open model-builder
  await p.evaluate(() => {
    window.platform?.host?.execCommand?.(
      "service('001-core.layout','open-window')(command('ui.model-builder'))",
      window.platform
    );
  });
  await p.waitForTimeout(3000);

  // Check all iframes for errors
  const frameInfo = [];
  for (const frame of p.frames()) {
    try {
      const url = frame.url();
      if (url.includes('model-builder') || url.includes('(sw)')) {
        const info = await frame.evaluate(() => ({
          url: location.href,
          readyState: document.readyState,
          bodyHTML: document.body?.innerHTML?.slice(0, 200),
          hasAppSDK: typeof window.AppSDK !== 'undefined',
          error: window.__lastError || null,
        }));
        frameInfo.push(info);
      }
    } catch(e) { frameInfo.push({ frameError: e.message }); }
  }
  console.log('Frame info:', JSON.stringify(frameInfo, null, 2));

  // Check if /(sw)/opt/apps/model-builder/main.html is served
  const swCheck = await p.evaluate(async () => {
    try {
      const r = await fetch('/(sw)/opt/apps/model-builder/main.html');
      return { status: r.status, ok: r.ok, type: r.headers.get('content-type') };
    } catch(e) { return { error: e.message }; }
  });
  console.log('SW fetch check:', JSON.stringify(swCheck));

  await p.screenshot({ path: 'testing/screenshots/model-builder-debug.png' });
  console.log('Console errors:', consoleErrors.slice(0, 10));

  await b.close();
})();
