// TODO 1F.8 / audit APP-12 — the TS/WebGL IDE runs project code in an opaque preview sandbox
// (sandbox="allow-scripts", no allow-same-origin). Preview code can't reach parent/top, the
// platform or the site's storage; console forwarding (postMessage) still works and only the
// preview may write to the console; canvas scripts render in the visible preview frame (the
// old contentDocument mirroring is gone). Smoke: a webapp starter runs. Control: the old
// "allow-scripts allow-same-origin" value lets the same code reach the top window.
//
// Run: node testing/scripts/security/verify-viewers-ts-ide.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootReady, check, finish, sleep, pollFor, openApp, installApp, findFrame, pwnedKeys, writeFiles } from './verify-viewers-lib.mjs';

const CODE = `console.log('hello from preview');
try { const p = parent.parent.platform; top.__pwned_ts_parent = 1; console.log('platform reachable: ' + typeof p); } catch (e) { console.log('parent blocked: ' + e.name); }
try { localStorage.setItem('ts-probe', '1'); top.__pwned_ts_ls = 1; console.log('storage reachable'); } catch (e) { console.log('storage blocked: ' + e.name); }
const c = document.getElementById('preview');
const g = c.getContext('2d');
g.fillStyle = 'rgb(255,0,0)'; g.fillRect(0, 0, 80, 80);
console.log('canvas ' + c.width + 'x' + c.height);
`;

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootReady(context);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await writeFiles(page, { '/home/user1/tsrun/evil.js': CODE });
  await installApp(page, 'ts-ide');
  await openApp(page, 'ui.ts-ide');
  // wait for script-rendered sidebar items (the page's script runs after CodeMirror/TypeScript load)
  const f = await findFrame(page, { urlPart: 'ts-ide/main.html', selector: '#sb-content .sb-item', timeout: 45000 });
  check('TS IDE opens', !!f);
  if (!f) throw new Error('ts-ide frame not found');
  check('preview frame sandbox is "allow-scripts" only', await f.evaluate(() => document.getElementById('iframe-preview').getAttribute('sandbox') === 'allow-scripts'));

  await f.evaluate(() => loadProjectFromDir('/home/user1/tsrun'));
  await pollFor(() => f.evaluate(() => activeFile === 'evil.js' || null), 10000);
  await f.evaluate(() => runCode());
  const lines = await pollFor(() => f.evaluate(() => {
    const l = [...document.querySelectorAll('#console-lines .log')].map((e) => e.textContent);
    return l.some((x) => x.startsWith('canvas ')) ? l : null;
  }), 15000);
  check('console forwarding still works', !!lines && lines.includes('hello from preview'), lines);
  check('preview code cannot reach parent.parent.platform', !!lines && lines.some((x) => x.startsWith('parent blocked: SecurityError')), lines);
  check('preview code cannot use the site storage', !!lines && lines.some((x) => x.startsWith('storage blocked')), lines);
  const size = lines && lines.find((x) => x.startsWith('canvas '));
  check('preview canvas has a real size (frame is shown)', !!size && !/canvas 0x|x0$/.test(size), size);

  const pf = f.childFrames().find((c) => c.url() === 'about:srcdoc');
  const px = pf ? await pf.evaluate(() => [...document.getElementById('preview').getContext('2d').getImageData(10, 10, 1, 1).data]) : null;
  check('canvas output renders in the visible preview frame', !!px && px[0] === 255 && px[1] === 0 && px[3] === 255, px);
  check('preview frame is displayed', await f.evaluate(() => getComputedStyle(document.getElementById('iframe-preview')).display === 'block'));

  // Only the preview may write to the console.
  await page.evaluate(() => {
    for (const w of [window, ...[...document.querySelectorAll('iframe')].map((i) => i.contentWindow)]) {
      try { for (let i = 0; i < w.frames.length; i++) w.frames[i].postMessage({ t: 'log', d: 'SPOOFED-LOG' }, '*'); } catch (_) {}
    }
  });
  await sleep(800);
  check('messages from other windows are ignored by the console', await f.evaluate(() => ![...document.querySelectorAll('#console-lines .log')].some((e) => e.textContent === 'SPOOFED-LOG')));
  check('no payload ran', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));

  // Smoke: a webapp starter builds and runs in the preview.
  await f.evaluate(() => { const i = STARTERS.findIndex((s) => /Webapp/i.test(s.name)); loadStarter(i); runCode(); });
  const web = await pollFor(async () => {
    const p = f.childFrames().find((c) => c.url() === 'about:srcdoc');
    if (!p) return null;
    const n = await p.evaluate(() => document.body && document.body.children.length).catch(() => 0);
    return n > 0 ? n : null;
  }, 15000);
  check('smoke: webapp starter renders in the preview', !!web, web);
  check('smoke: webapp run reports no console errors', await f.evaluate(() => !document.querySelector('#console-lines .log.err')));

  // Control: the previous sandbox value lets preview code reach the top window.
  await f.evaluate(() => { const c = document.createElement('iframe'); c.id = 'ctl'; c.setAttribute('sandbox', 'allow-scripts allow-same-origin'); c.srcdoc = '<script>top.__ctl_ts = 1<\/script>'; document.body.appendChild(c); });
  check('control: "allow-scripts allow-same-origin" reaches top', !!(await pollFor(() => page.evaluate(() => window.__ctl_ts === 1), 4000)));
  await f.evaluate(() => document.getElementById('ctl')?.remove());
} catch (e) {
  check('script error', false, String(e && e.stack || e));
} finally {
  await browser.close();
}
finish('verify-viewers-ts-ide');
