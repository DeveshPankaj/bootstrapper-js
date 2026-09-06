import { chromium } from 'playwright';

(async () => {
  const b = await chromium.launch({ headless: false, slowMo: 30 });
  const p = await b.newPage();
  await p.setViewportSize({ width: 1400, height: 900 });

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

  // Capture console from the model-builder frame
  let mbFrame = null;
  for (const frame of p.frames()) {
    try {
      const url = frame.url();
      if (url.includes('model-builder')) { mbFrame = frame; break; }
    } catch(_) {}
  }

  if (mbFrame) {
    // Get all JS errors and check DOM state
    const state = await mbFrame.evaluate(() => {
      const panel = document.querySelector('.panel');
      const main = document.querySelector('.main');
      const canvas = document.querySelector('canvas');
      const toolbar = document.querySelector('.toolbar');
      return {
        panelBB: panel?.getBoundingClientRect(),
        mainBB: main?.getBoundingClientRect(),
        canvasBB: canvas?.getBoundingClientRect(),
        toolbarBB: toolbar?.getBoundingClientRect(),
        bodyBG: getComputedStyle(document.body).backgroundColor,
        panelWidth: panel ? getComputedStyle(panel).width : 'no panel',
        innerHTML_short: document.body.innerHTML.slice(0, 500),
      };
    });
    console.log('Model builder DOM state:', JSON.stringify(state, null, 2));

    // Run a quick test: try fetching data file
    const dataTest = await mbFrame.evaluate(async () => {
      try {
        const r = await fetch('/opt/apps/model-builder/mnist-data.json');
        return { status: r.status, ok: r.ok };
      } catch(e) { return { error: e.message }; }
    });
    console.log('Data fetch test:', JSON.stringify(dataTest));

    // Check for any uncaught errors via window.onerror
    const errTest = await mbFrame.evaluate(() => {
      return {
        hasError: !!window.__error,
        lastError: window.__error || null,
      };
    });
    console.log('Window errors:', JSON.stringify(errTest));
  } else {
    console.log('Could not find model-builder frame');
  }

  await p.screenshot({ path: 'testing/screenshots/model-builder-state.png' });
  await b.close();
})();
