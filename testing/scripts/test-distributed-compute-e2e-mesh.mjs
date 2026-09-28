// Real end-to-end integration: distributed-compute's map/reduce actually dispatches
// chunks across TWO SEPARATE browser tabs over the real webrtc.mesh.* bridge (not the
// mocked harness the app was built/tested against), and combines a correct result.
import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103, URL = `http://localhost:${PORT}`, SHOT = 'testing/screenshots';
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (_) {} await sleep(300); } return false; }
async function boot(page) {
  await page.goto(URL); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(9000);
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) { if (await page.evaluate(() => !!window.platform?.host?.getCommand('ui.webrtc') && !!window.platform?.host?.getCommand('ui.distributed-compute')).catch(() => false)) return; await sleep(1000); }
}
async function appFrame(page, urlPart, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { for (const fr of page.frames()) { try { if (fr.url().includes(urlPart) && await fr.evaluate(() => true).catch(() => false)) return fr; } catch (_) {} } await sleep(400); }
  throw new Error('frame not found: ' + urlPart);
}
async function openWindow(page, cmd) {
  for (let i = 0; i < 20; i++) {
    const ok = await page.evaluate((c) => { try { window.platform.host.execCommand(`service('001-core.layout','open-window')(command('${c}'))`, window.platform); return true; } catch (_) { return false; } }, cmd);
    if (ok) return;
    await sleep(500);
  }
}

const browser = await chromium.launch();
const pA = await (await browser.newContext()).newPage(), pB = await (await browser.newContext()).newPage();
const errs = []; pA.on('pageerror', e => errs.push('A ' + e.message)); pB.on('pageerror', e => errs.push('B ' + e.message));
await boot(pA);
await openWindow(pA, 'ui.webrtc');
const fA = await appFrame(pA, 'webrtc/main.html');
await fA.locator('#me-name').waitFor({ timeout: 20000 }).catch(() => {});
const inv = await fA.evaluate(async () => (await window.__webrtcApp.createInvite('Alice')).link);
await pB.goto(inv);
await pB.waitForTimeout(3000);
const fB = await appFrame(pB, 'webrtc/main.html', 40000);
await waitFor(() => fB.evaluate(() => window.__webrtcApp && window.__webrtcApp.joins.size === 1));
const ans = await fB.evaluate(async () => { const j = [...window.__webrtcApp.joins.values()][0]; await window.__webrtcApp.generateAnswer(j, 'Bob'); return j.link; });
await fA.evaluate((l) => window.__webrtcApp.handleIncomingCode(l), ans);
await waitFor(() => fA.evaluate(() => window.__webrtcApp.peers.size === 1), 30000);
await fA.evaluate(() => document.querySelectorAll('.modal-head button').forEach(b => b.click()));
await fB.evaluate(() => document.querySelectorAll('.modal-head button').forEach(b => b.click()));

const bId = await fA.evaluate(() => [...window.__webrtcApp.peers.values()][0].id);
const gid = await fA.evaluate((b) => window.__webrtcApp.createGroup('Compute', [b]).gid, bId);
await waitFor(() => fB.evaluate(() => window.__webrtcApp.groups.size === 1));

// Now open distributed-compute on BOTH sides.
await openWindow(pA, 'ui.distributed-compute');
await openWindow(pB, 'ui.distributed-compute');
const dcA = await appFrame(pA, 'distributed-compute/main.html');
const dcB = await appFrame(pB, 'distributed-compute/main.html');
await waitFor(() => dcA.evaluate(() => window.__distComputeReady === true));
await waitFor(() => dcB.evaluate(() => window.__distComputeReady === true));

check('A: mesh bridge reports available inside distributed-compute', await waitFor(() => dcA.evaluate(() => window.__distComputeMesh.isAvailable())));
check('A: sees the "Compute" group with Bob online', await waitFor(() => dcA.evaluate((gid) => { const g = window.__distComputeMesh.groups().find(x => x.gid === gid); return !!g && g.members.some(m => m.name === 'Bob' && m.online); }, gid)));

// Select the group in A's UI, then run the default map-reduce example across BOTH workers.
await dcA.evaluate((gid) => { const sel = document.getElementById('group-select'); sel.value = gid; sel.dispatchEvent(new Event('change')); }, gid);
await dcA.waitForTimeout(300);

// Instrument Bob's mesh client to prove HE actually executed a chunk himself and sent a real
// dc-result back over the wire — not just Alice quietly falling back to running everything locally.
await dcB.evaluate(() => {
  const mesh = window.__distComputeMesh;
  const origSend = mesh.send.bind(mesh);
  window.__bobResultsSent = 0;
  mesh.send = (gid, message) => { if (message && message.type === 'dc-result') window.__bobResultsSent++; return origSend(gid, message); };
});

const clickRun = async (frame) => frame.evaluate(() => document.getElementById('run-btn').click());
await clickRun(dcA);
check('A: run completes with a combined result', await waitFor(() => dcA.evaluate(() => document.getElementById('result-value').textContent !== '--'), 25000));
const resultText = await dcA.evaluate(() => document.getElementById('result-value').textContent);
console.log('combined result on A:', resultText);
await pA.screenshot({ path: `${SHOT}/distributed-compute-mesh-e2e.png` });

check('Bob actually executed at least one chunk and sent a real dc-result back over the mesh (true cross-peer distribution, not local fallback)', await waitFor(() => dcB.evaluate(() => window.__bobResultsSent > 0), 15000));

// Sanity: the combined result must be numerically correct for the default demo's sum-of-squares
// dataset (0..399, chunked 40 at a time -> 10 chunks), regardless of how work was split
// across the two peers.
const expected = Array.from({ length: 400 }, (_, i) => i * i).reduce((a, b) => a + b, 0);
check('combined result is numerically correct despite being split across two real peers', resultText === String(expected), `${resultText} vs expected ${expected}`);

check('no page errors', errs.length === 0, errs.slice(0, 5).join(' || '));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
await browser.close(); process.exit(failed ? 1 : 0);
