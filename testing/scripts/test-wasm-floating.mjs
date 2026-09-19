import { chromium } from 'playwright';

const SCREENSHOTS = '/Users/pankajdevesh/Desktop/Gitea-Workspaces/bootstrapper-js/testing/screenshots';

const browser = await chromium.launch({
  headless: false,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });

console.log('Loading…');
await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

// 1. Check SW controller state
const swState = await page.evaluate(() => {
  return {
    controllerExists: !!navigator.serviceWorker.controller,
    controllerState: navigator.serviceWorker.controller?.state,
    readyState: navigator.serviceWorker.ready ? 'has-ready-promise' : 'no',
  };
});
console.log('SW controller state:', JSON.stringify(swState));

// 2. VFS check
const vfsCheck = await page.evaluate(() => ({
  hasHtml: window.fs?.existsSync('/opt/apps/alpine-wasm/main.html'),
  htmlSize: (() => { try { return window.fs?.readFileSync('/opt/apps/alpine-wasm/main.html')?.length; } catch(e) { return e.message; } })(),
}));
console.log('VFS check:', JSON.stringify(vfsCheck));

// 3. Test sending fs/file-request manually with a timeout
console.log('Testing manual fs/file-request round-trip…');
const rpcTest = await page.evaluate(async () => {
  return new Promise(resolve => {
    const id = 'test-' + Date.now();

    // Set up timeout
    const timeout = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('message', handler);
      resolve({ result: 'TIMEOUT after 5s', controllerId: navigator.serviceWorker.controller?.state });
    }, 5000);

    // Listen for reply from SW
    const handler = (event) => {
      if (event.data?.type === 'fs/reply' && event.data?.payload?.request_id === id) {
        clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener('message', handler);
        const payload = event.data.payload;
        resolve({
          result: 'got-reply',
          hasError: !!payload.error,
          errorMsg: payload.error || null,
          dataType: typeof payload.data,
          dataLen: payload.data?.length || payload.data?.byteLength || 0,
        });
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);

    // Manually send fs/file-request to the SW controller
    if (!navigator.serviceWorker.controller) {
      clearTimeout(timeout);
      resolve({ result: 'NO_CONTROLLER' });
      return;
    }
    navigator.serviceWorker.controller.postMessage({
      type: 'fs/file-request',
      payload: { path: '/opt/apps/alpine-wasm/main.html', request_id: id }
    });
  });
});
console.log('RPC test result:', JSON.stringify(rpcTest));

// 4. Try to directly call the sw-bridge handler (simulate what happens when SW sends fs/file-request)
console.log('\nSimulating sw-bridge handler…');
const bridgeTest = await page.evaluate(() => {
  const fs = window.fs;
  if (!fs) return { error: 'no fs' };

  const path = '/opt/apps/alpine-wasm/main.html';

  // Simulate what sw-bridge does
  try {
    const exists = fs.existsSync(path);
    if (!exists) return { error: 'file not found in VFS' };

    // Try to read the file
    const data = fs.readFileSync(path);

    // Check if it's transferable (can it be postMessage'd?)
    const isUint8Array = data instanceof Uint8Array;
    const isArrayBuffer = data instanceof ArrayBuffer;
    const constructor = data?.constructor?.name;

    // Try to clone it
    try {
      const cloned = structuredClone(data);
      return {
        ok: true,
        exists,
        dataLen: data.length || data.byteLength,
        isUint8Array,
        isArrayBuffer,
        constructor,
        clonedLen: cloned?.length || cloned?.byteLength,
        controllerExists: !!navigator.serviceWorker.controller,
      };
    } catch(cloneErr) {
      return {
        cloneError: String(cloneErr),
        exists,
        isUint8Array,
        isArrayBuffer,
        constructor,
        dataLen: data?.length || data?.byteLength,
      };
    }
  } catch(e) {
    return { readError: String(e) };
  }
});
console.log('Bridge simulation:', JSON.stringify(bridgeTest));

// 5. Open the window and wait longer
console.log('\nOpening app window…');
await page.evaluate(() => {
  const p = window.platform;
  const fs = window.fs;
  const src = fs.readFileSync('/opt/apps/alpine-wasm/main.js', 'utf8');
  p.host.execString(src, '/opt/apps/alpine-wasm/main.js');
  p.host.callCommand('ui.alpine-wasm');
});

// Wait up to 15s and check iframe state every 5s
for (let i = 1; i <= 3; i++) {
  await page.waitForTimeout(5000);
  const state = await page.evaluate(() => {
    const draggable = document.querySelector('iframe.draggable');
    if (!draggable) return { error: 'no draggable iframe' };
    try {
      const doc = draggable.contentDocument;
      const inner = doc?.querySelector('iframe[sandbox]');
      if (!inner) return { outer: doc?.URL, noInner: true };
      const innerUrl = (() => { try { return inner.contentDocument?.URL; } catch(e) { return e.message; } })();
      const innerBodyLen = (() => { try { return inner.contentDocument?.body?.innerHTML?.length; } catch(e) { return e.message; } })();
      return { innerSrc: inner.src, innerUrl, innerBodyLen };
    } catch(e) { return { err: e.message }; }
  });
  console.log(`t+${i*5}s:`, JSON.stringify(state));
  await page.screenshot({ path: `${SCREENSHOTS}/fw-t${i*5}.png` });
}

console.log('\nErrors:', errors);
await browser.close();
console.log('Done');
