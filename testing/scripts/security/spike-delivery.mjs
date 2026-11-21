// Spike Q1 — how can app code reach an opaque-origin iframe (sandbox="allow-scripts", no
// allow-same-origin) created by the booted OS?
//   1a  src="/(sw)/tmp/spike/a.html" (vfs file served by the SW): navigation + subresources
//   1b  src="/public/mount/opt/apps/distributed-compute/main.html" (real static file)
//   1c  srcdoc + <base href=".../public/mount/opt/apps/distributed-compute/">
//   1d+ vfs-only delivery candidates: parent blob: URL, data: URL, sandbox-made blob: URL,
//       import map remapping absolute URLs → data: URLs
// Run: node testing/scripts/security/spike-delivery.mjs   (dev server on :8080)
import { launch, bootOS, addFrame, writeVfs, print, OS_URL } from './spike-lib.mjs';

const browser = await launch();
const context = await browser.newContext();
const page = await bootOS(context);

const net = [];
page.on('response', async (r) => {
  const url = r.url();
  if (!/\(sw\)\/tmp\/spike|distributed-compute|unpkg\.com\/codemirror|public\/mount\/meta\.json/.test(url)) return;
  let origin = '';
  try { origin = (await r.request().allHeaders())['origin'] ?? '(none)'; } catch (_) {}
  let frameName = '';
  try { frameName = r.frame()?.name() ?? ''; } catch (_) {}
  net.push({ url: url.replace(OS_URL, ''), status: r.status(), fromSW: r.fromServiceWorker(), origin, frame: frameName });
});

// ---- 1a fixtures in the vfs ----
const RESULT_HEAD = `<script>
  window.__r = { origin: self.origin, href: location.href,
    controlled: (() => { try { return !!(navigator.serviceWorker && navigator.serviceWorker.controller) } catch (e) { return 'ERR ' + e.name } })() };
  window.mark = (k, v) => { window.__r[k] = v };
</script>`;
const SW_SUBRESOURCES = `
<script src="/(sw)/tmp/spike/classic.js" onload="mark('classicTag','load')" onerror="mark('classicTag','error')"></script>
<script type="module" src="/(sw)/tmp/spike/mod2.js" onerror="mark('moduleTag','error')"></script>
<script type="module">import('/(sw)/tmp/spike/mod.js').then(m => mark('dynImport', m.v)).catch(e => mark('dynImport', 'ERR ' + e.message));</script>
<script>fetch('/(sw)/tmp/spike/data.json').then(async r => mark('fetch', r.status + ' ' + (await r.text()).slice(0, 20))).catch(e => mark('fetch', 'ERR ' + e.message));</script>`;
const A_HTML = `<!doctype html><html><head><title>spike-a</title>${RESULT_HEAD}${SW_SUBRESOURCES}</head><body>spike-a</body></html>`;
await writeVfs(page, {
  '/tmp/spike/a.html': A_HTML,
  '/tmp/spike/classic.js': `mark('classicRan', 'yes')`,
  '/tmp/spike/mod.js': `export const v = 'mod-ok'`,
  '/tmp/spike/mod2.js': `window.__r.moduleTagRan = 'yes'`,
  '/tmp/spike/data.json': `{"spike":1}`,
});

const read = async (frame, wait = 3000) => {
  await frame.waitForTimeout(wait);
  return frame.evaluate(() => ({ title: document.title, body: (document.body?.innerText || '').slice(0, 60), r: window.__r ?? null }))
    .catch(e => ({ evalError: e.message }));
};

// 1a — vfs page through the SW, three sandbox variants
for (const [name, sandbox] of [['a-sbx', 'allow-scripts'], ['a-sbx-sameorigin', 'allow-scripts allow-same-origin'], ['a-nosandbox', null]]) {
  const f = await addFrame(page, { name, sandbox, src: '/(sw)/tmp/spike/a.html' });
  print(`1a ${name} (sandbox=${sandbox ?? 'none'}) src=/(sw)/tmp/spike/a.html`, await read(f));
}
// 1a' — same subresources from a sandboxed srcdoc (does srcdoc inherit the SW controller?)
{
  const f = await addFrame(page, { name: 'a-srcdoc-sbx', sandbox: 'allow-scripts',
    srcdoc: `<!doctype html><html><head><title>spike-srcdoc</title>${RESULT_HEAD}${SW_SUBRESOURCES}</head><body>srcdoc</body></html>` });
  print(`1a' sandboxed srcdoc requesting /(sw)/ subresources`, await read(f));
}
// 1a'' — parent-made blob: URL navigation of a sandboxed iframe
{
  const blobUrl = await page.evaluate((html) => URL.createObjectURL(new Blob([html], { type: 'text/html' })), A_HTML);
  const f = await addFrame(page, { name: 'a-blobnav-sbx', sandbox: 'allow-scripts', src: blobUrl });
  print(`1a'' sandboxed iframe navigated to parent blob: URL`, await read(f));
}

// 1b — real static file, opaque origin
{
  const f = await addFrame(page, { name: 'b-static-sbx', sandbox: 'allow-scripts', src: '/public/mount/opt/apps/distributed-compute/main.html' });
  await f.waitForTimeout(5000);
  const res = await f.evaluate(async () => {
    const out = { origin: self.origin, href: location.href, codemirror: typeof window.CodeMirror };
    try { const r = await fetch('/public/mount/meta.json'); out.fetchStatic = r.status + ' ok=' + r.ok + ' type=' + r.type; } catch (e) { out.fetchStatic = 'ERR ' + e.message; }
    out.classicRelative = await new Promise((res) => {
      const s = document.createElement('script'); s.src = './main.js';
      s.onload = () => res('load'); s.onerror = () => res('error');
      document.head.appendChild(s);
    });
    return out;
  }).catch(e => ({ evalError: e.message }));
  print('1b sandboxed src=/public/mount/opt/apps/distributed-compute/main.html', res);
}

// 1c — srcdoc + <base>
{
  const base = `${OS_URL}/public/mount/opt/apps/distributed-compute/`;
  const f = await addFrame(page, { name: 'c-srcdoc-base-sbx', sandbox: 'allow-scripts', srcdoc: `<!doctype html><html><head>
<base href="${base}">${RESULT_HEAD}
<script>window.__r.baseURI = document.baseURI</script>
<script src="main.js" onload="mark('classicRel','load')" onerror="mark('classicRel','error')"></script>
<script type="module">
  import * as nn from './lib/tiny-nn.js';
  import { runTask } from './lib/task-runtime.js';
  mark('moduleRel', 'ok exports=' + Object.keys(nn).length + ' runTask=' + typeof runTask);
</script>
<script type="module" src="./lib/worker-task-runtime.js" onload="mark('moduleSrcRel','load')" onerror="mark('moduleSrcRel','error')"></script>
<script>fetch('../../../meta.json').then(r => mark('fetchRel', r.status)).catch(e => mark('fetchRel', 'ERR ' + e.message))</script>
</head><body>c</body></html>` });
  print('1c sandboxed srcdoc + <base> to static app dir', await read(f));
}

// 1d.. — candidate delivery mechanisms for vfs-only apps
{
  const parentBlob = await page.evaluate(() => URL.createObjectURL(new Blob(["export const v = 'parent-blob-module'"], { type: 'text/javascript' })));
  const parentBlobClassic = await page.evaluate(() => URL.createObjectURL(new Blob(["mark('parentBlobClassic', 'ran')"], { type: 'text/javascript' })));
  const V = 'http://wos.invalid/app/';
  const dataB = 'data:text/javascript,' + encodeURIComponent(`export const b = 2`);
  const dataA = 'data:text/javascript,' + encodeURIComponent(`import { b } from '${V}lib/b.js'; export const a = b + 1`);
  const dataRel = 'data:text/javascript,' + encodeURIComponent(`import { b } from './b.js'; export const r = b`);
  const importMap = JSON.stringify({ imports: { [`${V}lib/a.js`]: dataA, [`${V}lib/b.js`]: dataB, [`${V}lib/rel.js`]: dataRel } });
  const f = await addFrame(page, { name: 'd-vfs-candidates-sbx', sandbox: 'allow-scripts', srcdoc: `<!doctype html><html><head>
<script type="importmap">${importMap}</script>
${RESULT_HEAD}
<script src="${parentBlobClassic}" onerror="mark('parentBlobClassic','error')"></script>
<script type="module">
  import('${parentBlob}').then(m => mark('parentBlobModule', m.v)).catch(e => mark('parentBlobModule', 'ERR ' + e.message));
  import('data:text/javascript,export const v = 1').then(m => mark('dataModule', 'ok v=' + m.v)).catch(e => mark('dataModule', 'ERR ' + e.message));
  const own = URL.createObjectURL(new Blob(["export const v = 'own-blob'"], { type: 'text/javascript' }));
  import(own).then(m => mark('ownBlobModule', m.v + ' url=' + own.slice(0, 12))).catch(e => mark('ownBlobModule', 'ERR ' + e.message));
  import('${V}lib/a.js').then(m => mark('importMapAbsolute', 'ok a=' + m.a)).catch(e => mark('importMapAbsolute', 'ERR ' + e.message));
  import('${V}lib/rel.js').then(m => mark('importMapRelativeInsideData', 'ok r=' + m.r)).catch(e => mark('importMapRelativeInsideData', 'ERR ' + e.message));
</script>
</head><body>d</body></html>` });
  print('1d vfs-only delivery candidates (sandboxed srcdoc)', await read(f));
}

console.log('\n=== network (filtered)');
for (const n of net) console.log(`  ${String(n.status).padEnd(4)} sw=${String(n.fromSW).padEnd(5)} origin=${String(n.origin).padEnd(22)} frame=${n.frame.padEnd(22)} ${n.url}`);

await browser.close();
