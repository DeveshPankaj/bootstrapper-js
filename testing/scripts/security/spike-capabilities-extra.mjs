// Spike Q3 follow-ups inside an opaque-origin sandbox (sandbox="allow-scripts"):
//  - Worker variants: module worker from own blob / data:, classic worker from a static
//    URL (cross-origin to the opaque document), importScripts() of a static URL from a blob worker
//  - mic brokering: can the parent capture getUserMedia and hand the track to the sandbox?
//    (postMessage-transfer of a MediaStreamTrack, and an RTCPeerConnection relay as a fallback)
//  - clipboard with permissions granted to the OS origin (control vs sandbox), execCommand('copy')
// Run: node testing/scripts/security/spike-capabilities-extra.mjs   (dev server on :8080)
import { launch, bootOS, addFrame, print, PROBE_HELPERS, OS_URL } from './spike-lib.mjs';

const browser = await launch(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']);
const context = await browser.newContext();
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: OS_URL });
const page = await bootOS(context);
const consoleMsgs = [];
page.on('console', (m) => { if (/worker|Worker|track|clipboard|sandbox/i.test(m.text())) consoleMsgs.push(m.text().slice(0, 220)); });

const SRCDOC = `<!doctype html><html><head><script>${PROBE_HELPERS}
  window.__r = {};
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'spike-track') {
      const t = e.data.track;
      window.__r.trackTransfer = t ? ('received ' + t.kind + ' readyState=' + t.readyState + ' isTrack=' + (t instanceof MediaStreamTrack)) : 'no track';
    }
  });
</script></head><body><textarea id="ta">copy-me</textarea>
<button id="clip" onclick="navigator.clipboard.writeText('spike-clip').then(() => __r.clipboard = 'ALLOWED').catch(e => __r.clipboard = 'BLOCKED: ' + e.name + ': ' + e.message.slice(0,100))">clip</button>
<button id="copy" onclick="document.getElementById('ta').select(); __r.execCommandCopy = 'returned ' + document.execCommand('copy')">copy</button>
</body></html>`;

const workerProbes = ({ staticUrl, classicStaticUrl }) => {
  const ap = window.__aprobe;
  const run = (mk, label) => ap(() => new Promise((res, rej) => {
    let w;
    try { w = mk(); } catch (e) { rej(e); return; }
    w.onmessage = (e) => res(label + ': ' + e.data);
    w.onerror = (e) => { e.preventDefault?.(); rej(new Error('onerror: ' + (e.message || 'no message'))); };
    setTimeout(() => rej(new Error('timeout')), 5000);
  }));
  return (async () => ({
    moduleWorkerOwnBlob: await run(() => new Worker(URL.createObjectURL(new Blob(["postMessage('ok')"], { type: 'text/javascript' })), { type: 'module' }), 'module/own-blob'),
    moduleWorkerData: await run(() => new Worker('data:text/javascript,' + encodeURIComponent("postMessage('ok')"), { type: 'module' }), 'module/data'),
    classicWorkerData: await run(() => new Worker('data:text/javascript,' + encodeURIComponent("postMessage('ok ' + self.origin)")), 'classic/data'),
    classicWorkerStaticUrl: await run(() => new Worker(classicStaticUrl), 'classic/static-url'),
    blobWorkerImportScriptsStatic: await run(() => new Worker(URL.createObjectURL(new Blob([
      `try { importScripts(${JSON.stringify(classicStaticUrl)}); postMessage('importScripts ok') } catch (e) { postMessage('importScripts ERR ' + e.name + ': ' + e.message) }`]))), 'classic/blob+importScripts'),
    blobModuleWorkerStaticImport: await run(() => new Worker(URL.createObjectURL(new Blob([
      `import(${JSON.stringify(staticUrl)}).then(m => postMessage('dynamic import ok keys=' + Object.keys(m).length)).catch(e => postMessage('dynamic import ERR ' + e.message))`], { type: 'text/javascript' })), { type: 'module' }), 'module/blob+import(static)'),
    classicBlobWorkerDynamicImportStatic: await run(() => new Worker(URL.createObjectURL(new Blob([
      `import(${JSON.stringify(staticUrl)}).then(m => postMessage('dynamic import ok keys=' + Object.keys(m).length)).catch(e => postMessage('dynamic import ERR ' + e.message))`]))), 'classic/blob+import(static)'),
  }))();
};

const STATIC_MODULE = `${OS_URL}/public/mount/opt/apps/distributed-compute/lib/tiny-nn.js`;
const STATIC_CLASSIC = `${OS_URL}/public/mount/opt/apps/distributed-compute/main.js`;

for (const [name, sandbox] of [['x-sbx', 'allow-scripts'], ['x-ctrl-sameorigin', null]]) {
  const f = await addFrame(page, { name, sandbox, allow: 'microphone; camera; clipboard-write; clipboard-read', srcdoc: SRCDOC });
  const workers = await f.evaluate(workerProbes, { staticUrl: STATIC_MODULE, classicStaticUrl: STATIC_CLASSIC });

  // Mic brokering attempt: parent captures, then tries to transfer the track into the frame.
  const transfer = await page.evaluate(async (name) => {
    const f = document.querySelector(`iframe[name="${name}"]`);
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    const track = s.getAudioTracks()[0];
    try { f.contentWindow.postMessage({ type: 'spike-track', track }, '*', [track]); return 'postMessage with transfer list: no exception'; }
    catch (e) {
      try { f.contentWindow.postMessage({ type: 'spike-track', track }, '*'); return 'transfer threw ' + e.name + '; clone attempt: no exception'; }
      catch (e2) { return 'BLOCKED: transfer ' + e.name + ': ' + e.message.slice(0, 80) + ' / clone ' + e2.name + ': ' + e2.message.slice(0, 80); }
    }
  }, name).catch((e) => 'ERR ' + e.message);
  await page.waitForTimeout(800);

  await f.click('#clip', { force: true }).catch(() => {});
  await f.waitForTimeout(400);
  await f.click('#copy', { force: true }).catch(() => {});
  await f.waitForTimeout(400);
  const r = await f.evaluate(() => window.__r);
  print(`Q3-extra ${name} (sandbox=${sandbox ?? 'none'})`, { ...workers, parentTrackTransfer: transfer, ...r });
}

// Clipboard control from the top document itself (permission granted to the OS origin).
await page.bringToFront();
const topClip = await page.evaluate(() => navigator.clipboard.writeText('top-clip').then(() => 'ALLOWED').catch((e) => 'BLOCKED: ' + e.name + ': ' + e.message.slice(0, 100)));
print('Q3-extra top document clipboard (permission granted)', { topClip });

console.log('\n=== relevant console messages');
for (const m of [...new Set(consoleMsgs)].slice(0, 20)) console.log('  ' + m);
await browser.close();
