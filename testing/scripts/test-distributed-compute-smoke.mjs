// Smoke test: confirms native ES module <script type="module"> + relative import
// actually resolves when a vfs-injected app is served through the service worker's
// /(sw)/opt/apps/<name>/... path. Run BEFORE building the rest of the distributed-compute
// app on top of the ES-module assumption. See CLAUDE.md testing conventions.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8107';
// A separate, throwaway vfs path -- deliberately NOT the real app's files
// (those were built on top of the assumption this test proved out; re-reading
// them here would just be testing "did I not break main.html", which the
// other, fuller e2e tests already cover). This stays self-contained so it
// keeps working standing alone, at any time, as the original proof that
// native ES modules resolve through the /(sw)/... path.
const APP_DIR = '/opt/apps/_distributed-compute-smoke-check';
const files = [
  ['main.html', `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>smoke</title></head>
<body>
<div id="out">not loaded</div>
<script type="module">
  import { ping } from './lib/smoke-lib.js';
  document.getElementById('out').textContent = ping();
  window.__smokeOk = ping();
</script>
</body>
</html>
`],
  ['lib/smoke-lib.js', `export function ping() { return 'smoke ok'; }\n`],
];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!(window.platform && window.platform.host), { timeout: 30000 });

  // Inject the vfs files for this app manually (meta.json is reserved / not yet wired).
  await page.evaluate(({ appDir, files, localDir }) => {
    const fs = window.platform.host.getFS();
    const mkdirp = (p) => {
      const parts = p.split('/').filter(Boolean);
      let cur = '';
      for (const part of parts) {
        cur += '/' + part;
        try { fs.mkdirSync(cur); } catch (e) { if (e.code !== 'EEXIST') throw e; }
      }
    };
    mkdirp(appDir);
    mkdirp(appDir + '/lib');
    for (const [dest, content] of files) {
      fs.writeFileSync(appDir + '/' + dest, content);
    }
  }, { appDir: APP_DIR, files });

  // Open the app's main.html directly in an iframe the same way ui.iframe does (same-origin src).
  const result = await page.evaluate(async ({ appDir }) => {
    return await new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.src = `/(sw)${appDir}/main.html`;
      iframe.style.cssText = 'width:400px;height:300px;';
      document.body.appendChild(iframe);
      iframe.addEventListener('load', () => {
        setTimeout(() => {
          try {
            const w = iframe.contentWindow;
            resolve({ ok: true, smokeOk: w.__smokeOk, text: w.document.getElementById('out')?.textContent });
          } catch (e) {
            resolve({ ok: false, error: String(e) });
          }
        }, 300);
      });
      iframe.addEventListener('error', (e) => resolve({ ok: false, error: 'iframe error' }));
    });
  }, { appDir: APP_DIR });

  console.log('SMOKE RESULT:', JSON.stringify(result));
  const pass = result.ok && result.smokeOk === 'smoke ok' && result.text === 'smoke ok';
  console.log(pass ? 'PASS: ES modules work through /(sw)/ path' : 'FAIL: ES modules did not resolve, need classic-script fallback');

  await browser.close();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
