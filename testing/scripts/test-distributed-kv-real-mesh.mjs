// Real end-to-end integration: distributed-kv's replicated store actually replicates
// key/value writes across THREE SEPARATE browser tabs over the real webrtc.mesh.*
// bridge (not a mock) -- two tabs connect first, exchange writes both ways, then a
// third tab joins the same group LATE (after both existing peers already hold data)
// and must catch up via a real kv-sync-req/kv-sync-res round trip over the actual
// WebRTC data channels, converging to the same visible key set (tombstones respected).
//
// Boot/invite/answer/group-creation boilerplate copied and adapted from
// testing/scripts/test-distributed-compute-e2e-mesh.mjs (the sibling mesh-bridge app's
// proven-working real-mesh test) per the task's instructions. distributed-kv is a
// CORE_APP (see docs/public/mount/opt/apps/pkg-manager/loader.js), so it's already
// loaded at boot -- no file injection needed, just `open-window`.
import { chromium } from 'playwright';
const PORT = process.env.PORT || 8110, URL = `http://localhost:${PORT}`, SHOT = 'testing/screenshots';
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (_) {} await sleep(300); } return false; }
async function boot(page) {
  await page.goto(URL, { timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(9000);
  await page.waitForFunction(() => !!window.platform && !!window.platform.host, { timeout: 60000 });
  await page.waitForFunction(() => {
    try { return !!window.platform.host.getCommand('ui.webrtc') && !!window.platform.host.getCommand('ui.distributed-kv'); } catch (_) { return false; }
  }, { timeout: 60000 });
}
async function appFrame(page, urlPart, timeout = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const fr of page.frames()) {
      try { if (fr.url().includes(urlPart) && await fr.evaluate(() => true).catch(() => false)) return fr; } catch (_) {}
    }
    await sleep(400);
  }
  throw new Error('frame not found: ' + urlPart);
}
async function openWindow(page, cmd) {
  for (let i = 0; i < 20; i++) {
    const ok = await page.evaluate((c) => { try { window.platform.host.execCommand(`service('001-core.layout','open-window')(command('${c}'))`, window.platform); return true; } catch (_) { return false; } }, cmd);
    if (ok) return;
    await sleep(500);
  }
}
async function connectPeer(fA, pX, name) {
  // fA = Alice's already-open webrtc frame (invites/accepts every connection in this test)
  const inv = await fA.evaluate(async () => (await window.__webrtcApp.createInvite('Alice')).link);
  await pX.goto(inv, { timeout: 60000 });
  await pX.waitForTimeout(3000);
  const fX = await appFrame(pX, 'webrtc/main.html', 60000);
  await waitFor(() => fX.evaluate(() => window.__webrtcApp && window.__webrtcApp.joins.size === 1), 30000);
  const ans = await fX.evaluate(async (nm) => { const j = [...window.__webrtcApp.joins.values()][0]; await window.__webrtcApp.generateAnswer(j, nm); return j.link; }, name);
  await fA.evaluate((l) => window.__webrtcApp.handleIncomingCode(l), ans);
  await fX.evaluate(() => document.querySelectorAll('.modal-head button').forEach((b) => b.click()));
  return fX;
}
async function selectGroupInUi(frame, gid) {
  await frame.evaluate((gid) => {
    const sel = document.getElementById('group-select');
    sel.value = gid;
    sel.dispatchEvent(new Event('change'));
  }, gid);
}
async function setKeyInUi(frame, key, value) {
  await frame.locator('#kv-key').fill(key);
  await frame.locator('#kv-value').fill(value);
  await frame.locator('#kv-form button[type=submit]').click();
}
async function rowExists(frame, key) {
  return (await frame.locator(`tr:has(td.key-cell:text-is("${key}"))`).count()) > 0;
}

const browser = await chromium.launch();
const pA = await (await browser.newContext()).newPage();
const pB = await (await browser.newContext()).newPage();
const pC = await (await browser.newContext()).newPage();
const errs = [];
for (const [n, p] of [['A', pA], ['B', pB], ['C', pC]]) p.on('pageerror', (e) => errs.push(`${n}: ${e.message}`));

await boot(pA);
await openWindow(pA, 'ui.webrtc');
const fA = await appFrame(pA, 'webrtc/main.html');
await fA.locator('#me-name').waitFor({ timeout: 20000 }).catch(() => {});

const fB = await connectPeer(fA, pB, 'Bob');
check('Alice and Bob connected over real WebRTC', await waitFor(() => fA.evaluate(() => window.__webrtcApp.peers.size === 1), 30000));
await fA.evaluate(() => document.querySelectorAll('.modal-head button').forEach((b) => b.click()));

const bobId = await fA.evaluate(() => [...window.__webrtcApp.peers.values()][0].id);
const gid = await fA.evaluate((b) => window.__webrtcApp.createGroup('KV Test', [b]).gid, bobId);
check('real group created and Bob sees it', await waitFor(() => fB.evaluate(() => window.__webrtcApp.groups.size === 1)));

// ---- Open Distributed KV on both A and B (already a core app, no injection needed) ----
await openWindow(pA, 'ui.distributed-kv');
await openWindow(pB, 'ui.distributed-kv');
const dkvA = await appFrame(pA, 'distributed-kv/main.html');
const dkvB = await appFrame(pB, 'distributed-kv/main.html');
await waitFor(() => dkvA.evaluate(() => window.__kvReady === true));
await waitFor(() => dkvB.evaluate(() => window.__kvReady === true));

check('A: mesh bridge reports available inside distributed-kv', await waitFor(() => dkvA.evaluate(() => window.__kvMesh.isAvailable())));
check('A: sees the "KV Test" group with Bob online', await waitFor(() => dkvA.evaluate((gid) => { const g = window.__kvMesh.groups().find(x => x.gid === gid); return !!g && g.members.some(m => m.name === 'Bob' && m.online); }, gid)));
check('B: sees the "KV Test" group with Alice online', await waitFor(() => dkvB.evaluate((gid) => { const g = window.__kvMesh.groups().find(x => x.gid === gid); return !!g && g.members.some(m => m.name === 'Alice' && m.online); }, gid)));

// ---- Group picker UI: select the real group on both sides ----
await selectGroupInUi(dkvA, gid);
await selectGroupInUi(dkvB, gid);
await dkvA.waitForTimeout(300);
await dkvB.waitForTimeout(300);
check('A: mesh-banner reflects the selected real group', await waitFor(async () => /KV Test/.test(await dkvA.locator('#mesh-banner').textContent())));

await pA.screenshot({ path: `${SHOT}/distributed-kv-real-mesh-alice.png` }).catch(() => {});

// ---- Alice sets a key, Bob must receive it over the REAL data channel ----
await setKeyInUi(dkvA, 'greeting', 'hello over real webrtc');
check('Alice sees her own key locally', await rowExists(dkvA, 'greeting'));
check('Bob receives the key over the REAL mesh bridge/data channel (not mocked)', await waitFor(() => rowExists(dkvB, 'greeting'), 15000));
check('replicated value correct on Bob\'s side', await waitFor(async () => (await dkvB.evaluate(() => window.__kvGet('greeting'))) === 'hello over real webrtc'));
await pB.screenshot({ path: `${SHOT}/distributed-kv-real-mesh-bob.png` }).catch(() => {});

// ---- Bob sets a DIFFERENT key, Alice must receive it (bidirectional) ----
await setKeyInUi(dkvB, 'mood', 'excited');
check('Alice receives Bob\'s key over the real bridge', await waitFor(() => rowExists(dkvA, 'mood'), 15000));
check('replicated value correct on Alice\'s side', await waitFor(async () => (await dkvA.evaluate(() => window.__kvGet('mood'))) === 'excited'));

// ---- delete replication, real bridge ----
await dkvA.locator('tr:has(td.key-cell:text-is("greeting")) .del-btn').click();
check('delete replicates to Bob over the real bridge', await waitFor(async () => !(await rowExists(dkvB, 'greeting')), 15000));

// ---- Third tab (Carol) joins the mesh LATE, after Alice/Bob already have real data ----
const fC = await connectPeer(fA, pC, 'Carol');
check('Alice and Carol connected over real WebRTC', await waitFor(() => fA.evaluate(() => window.__webrtcApp.peers.size === 2), 30000));
await fA.evaluate(() => document.querySelectorAll('.modal-head button').forEach((b) => b.click()));
await fC.evaluate(() => document.querySelectorAll('.modal-head button').forEach((b) => b.click()));
// "Connect me to everyone in the room" (default on) should auto-mesh Carol <-> Bob too.
check('mesh auto-connect converges Carol to Bob as well (full mesh, not just Carol-Alice)', await waitFor(() => fC.evaluate(() => window.__webrtcApp.peers.size === 2), 20000));

// Add Carol to the existing "KV Test" group (Alice is the creator).
await fA.evaluate(({ gid, carolName }) => {
  const g = window.__webrtcApp.groups.get(gid);
  const carol = [...window.__webrtcApp.peers.values()].find((p) => p.name === carolName);
  g.members.add(carol.id);
  window.__webrtcApp.groupUpdate(g);
}, { gid, carolName: 'Carol' });
check('Carol\'s webrtc app learns about the group after being added', await waitFor(() => fC.evaluate(() => window.__webrtcApp.groups.size === 1), 15000));

// Open Distributed KV for Carol and select the group -- this is the late-joiner path:
// her store must start EMPTY, then catch up to Alice/Bob's current state via a real
// kv-sync-req/kv-sync-res round trip.
await openWindow(pC, 'ui.distributed-kv');
const dkvC = await appFrame(pC, 'distributed-kv/main.html');
await waitFor(() => dkvC.evaluate(() => window.__kvReady === true));
check('Carol starts with an empty local store before selecting the group', await dkvC.evaluate(() => Object.keys(window.__kvAll()).length === 0));
check('Carol\'s Distributed KV sees the real "KV Test" group', await waitFor(() => dkvC.evaluate((gid) => window.__kvMesh.groups().some((g) => g.gid === gid), gid), 15000));

await selectGroupInUi(dkvC, gid);

check('Carol (late joiner) catches up on the "mood" key via a REAL kv-sync-req/kv-sync-res round trip', await waitFor(() => rowExists(dkvC, 'mood'), 15000));
check('Carol does NOT see the "greeting" key -- it was deleted before she joined (tombstone respected)', await waitFor(async () => !(await rowExists(dkvC, 'greeting'))));
check('Carol\'s full snapshot (__kvAll) matches Alice\'s visible key set exactly', await waitFor(async () => {
  const [allA, allC] = await Promise.all([dkvA.evaluate(() => window.__kvAll()), dkvC.evaluate(() => window.__kvAll())]);
  return JSON.stringify(allA) === JSON.stringify(allC);
}));
await pC.screenshot({ path: `${SHOT}/distributed-kv-real-mesh-late-joiner-carol.png` }).catch(() => {});

check('no uncaught page errors during the real integration pass', errs.length === 0, errs.slice(0, 5).join(' || '));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
await browser.close();
process.exit(failed ? 1 : 0);
