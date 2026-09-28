// Distributed KV app — end-to-end UI test against a MOCKED webrtc.mesh.* bridge.
// Each simulated peer is a separate Playwright BrowserContext (fully isolated
// storage/IndexedDB — a true separate "person", not just a tab sharing the same vfs)
// booting its own full webOS instance. Messages between peers are relayed at the
// Node/Playwright layer (via page.exposeFunction + page.evaluate), which is the most
// faithful mock available without a real WebRTC data channel: the app under test
// still goes through its real lib/mesh-client.js -> platform.host.getCommand
// ('webrtc.mesh.*') path end to end, only the transport underneath is swapped out.
// The REAL (not mocked) two/three-tab mesh integration lives in
// test-distributed-kv-real-mesh.mjs.
//
// Covers: (1) local-only mode (banner + working KV table) when the bridge doesn't
// exist at all, (2) set replication A -> B (and bidirectionally B -> A), (3) delete
// replication, (4) late joiner catch-up (a third, fresh page/peer selects the group
// after A/B already have data), (5) deterministic LWW conflict resolution on a
// simultaneous same-key write from two peers.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 8110;
const URL = `http://localhost:${PORT}`;
const SHOT = 'testing/screenshots';
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await fn()) return true; } catch (_) {}
    await sleep(250);
  }
  return false;
}

const APP_DIR = '/opt/apps/distributed-kv';
const appFiles = {
  'main.html': fs.readFileSync('docs/public/mount/opt/apps/distributed-kv/main.html', 'utf8'),
  'main.js': fs.readFileSync('docs/public/mount/opt/apps/distributed-kv/main.js', 'utf8'),
  'ui/app.js': fs.readFileSync('docs/public/mount/opt/apps/distributed-kv/ui/app.js', 'utf8'),
  'lib/kv-store.js': fs.readFileSync('docs/public/mount/opt/apps/distributed-kv/lib/kv-store.js', 'utf8'),
  'lib/mesh-client.js': fs.readFileSync('docs/public/mount/opt/apps/distributed-kv/lib/mesh-client.js', 'utf8'),
};

async function boot(page) {
  await page.goto(URL);
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
}

async function injectApp(page) {
  await page.waitForFunction(() => !!window.platform && !!window.platform.host, { timeout: 45000 });
  await page.evaluate(({ appDir, files }) => {
    const fs = window.platform.host.getFS();
    const mkdirp = (dir) => { let cur = ''; for (const part of dir.split('/').filter(Boolean)) { cur += '/' + part; try { fs.mkdirSync(cur); } catch (_) {} } };
    mkdirp(appDir);
    mkdirp(appDir + '/lib');
    mkdirp(appDir + '/ui');
    for (const [rel, content] of Object.entries(files)) fs.writeFileSync(appDir + '/' + rel, content);
    window.platform._appDir = appDir;
    window.platform.host.exec(window.platform, appDir + '/main.js');
    delete window.platform._appDir;
  }, { appDir: APP_DIR, files: appFiles });
}

async function openApp(page) {
  await page.waitForFunction(() => {
    try { return !!window.platform.host.getService('001-core.layout', 'open-window'); } catch (_) { return false; }
  }, { timeout: 30000 });
  await page.evaluate(() => {
    window.platform.host.execCommand(
      "service('001-core.layout', 'open-window') (command('ui.distributed-kv'))",
      window.platform
    );
  });
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    for (const fr of page.frames()) {
      try { if (await fr.locator('#kv-form').count()) return fr; } catch (_) {}
    }
    await sleep(300);
  }
  throw new Error('distributed-kv app frame not found');
}

// ---- Node-side mesh relay: routes messages between independent peer pages ----
const peerPages = new Map(); // peerId -> page

async function deliverToPeer(peerId, msg) {
  const page = peerPages.get(peerId);
  if (!page) return;
  try {
    await page.evaluate(({ gid, channel, payload, fromPeerId, fromName }) => {
      const subs = window.__dkvSubs && window.__dkvSubs.get(channel);
      if (subs) for (const h of subs) { try { h(gid, fromPeerId, fromName, payload); } catch (_) {} }
    }, msg);
  } catch (_) {}
}

// Installs the mock bridge in `page` for peer `peerId`/`peerName`. `groups` is the
// initial groups() list. Registers real platform.host commands so the app under test
// goes through its normal lib/mesh-client.js code path unmodified.
async function installMockBridge(page, { peerId, peerName, groups }) {
  peerPages.set(peerId, page);
  await page.exposeFunction(`__dkvRelay_${peerId}`, async (gid, channel, payload) => {
    for (const otherId of peerPages.keys()) {
      if (otherId === peerId) continue;
      await deliverToPeer(otherId, { gid, channel, payload, fromPeerId: peerId, fromName: peerName });
    }
  });
  await page.evaluate(({ peerId, peerName, groups, relayFnName }) => {
    const platform = window.platform;
    window.__dkvSubs = window.__dkvSubs || new Map();
    window.__dkvGroups = groups;
    platform.host.registerCommand('webrtc.mesh.available', () => true);
    platform.host.registerCommand('webrtc.mesh.myId', () => ({ id: peerId, name: peerName }));
    platform.host.registerCommand('webrtc.mesh.groups', () => window.__dkvGroups);
    platform.host.registerCommand('webrtc.mesh.send', (gid, channel, payload) => {
      window[relayFnName](gid, channel, payload);
      return { ok: true, sentTo: (window.__dkvGroups[0]?.members.length || 1) - 1 };
    });
    platform.host.registerCommand('webrtc.mesh.subscribe', (channel, handler) => {
      if (!window.__dkvSubs.has(channel)) window.__dkvSubs.set(channel, new Set());
      window.__dkvSubs.get(channel).add(handler);
      return { unsubscribe: () => { const s = window.__dkvSubs.get(channel); if (s) s.delete(handler); } };
    });
  }, { peerId, peerName, groups, relayFnName: `__dkvRelay_${peerId}` });
}

// Updates the groups() list a peer's mock bridge reports, WITHOUT touching its
// existing subscriptions (unlike re-running installMockBridge, which would wipe them).
async function updateGroups(page, groups) {
  await page.evaluate((groups) => { window.__dkvGroups = groups; }, groups);
}

async function selectGroup(frame, gid) {
  await frame.evaluate((gid) => window.__kvSelectGroup(gid), gid);
}

async function setKey(frame, key, value) {
  await frame.locator('#kv-key').fill(key);
  await frame.locator('#kv-value').fill(value);
  await frame.locator('#kv-form button[type=submit]').click();
}

async function rowValue(frame, key) {
  const cell = frame.locator(`tr:has(td.key-cell:text-is("${key}")) td.value-cell`);
  if (await cell.count() === 0) return null;
  return (await cell.first().textContent()).trim();
}

async function rowExists(frame, key) {
  return (await frame.locator(`tr:has(td.key-cell:text-is("${key}"))`).count()) > 0;
}

const browser = await chromium.launch();

// ---- Test 1: local-only mode when the bridge doesn't exist at all ----
{
  const context = await browser.newContext();
  const page = await context.newPage();
  await boot(page);
  await injectApp(page);
  const frame = await openApp(page);
  await waitFor(() => frame.evaluate(() => window.__kvReady === true));
  check('mesh-banner reports "unavailable / local-only" when webrtc.mesh.* does not exist at all',
    await waitFor(async () => /unavailable/i.test(await frame.locator('#mesh-banner').textContent())));
  check('group picker only offers "None (run locally only)" when no bridge exists',
    (await frame.locator('#group-select option').count()) === 1);
  // The KV table/form must still be usable in local-only mode (this is a real working
  // mode per the task spec, not a blocked screen).
  await setKey(frame, 'local-key', 'local-value');
  check('local-only set works and appears in the table with no mesh at all', await rowExists(frame, 'local-key'));
  check('local-only set is reflected in the __kvGet test hook too', await frame.evaluate(() => window.__kvGet('local-key')) === 'local-value');
  await page.screenshot({ path: `${SHOT}/distributed-kv-local-only.png` }).catch(() => {});
  await context.close();
}

// ---- Test 2-4: two peers (separate contexts/realms) with a mocked bridge ----
const contextA = await browser.newContext();
const contextB = await browser.newContext();
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();

let groupMembers = [
  { id: 'peer-alice', name: 'Alice', online: true },
  { id: 'peer-bob', name: 'Bob', online: true },
];
const groupsFor = (members) => [{ gid: 'grp-1', name: 'Test Group', members }];

await boot(pageA);
await boot(pageB);
await injectApp(pageA);
await injectApp(pageB);
await installMockBridge(pageA, { peerId: 'peer-alice', peerName: 'Alice', groups: groupsFor(groupMembers) });
await installMockBridge(pageB, { peerId: 'peer-bob', peerName: 'Bob', groups: groupsFor(groupMembers) });

const frameA = await openApp(pageA);
const frameB = await openApp(pageB);
await waitFor(() => frameA.evaluate(() => window.__kvReady === true));
await waitFor(() => frameB.evaluate(() => window.__kvReady === true));

check('Alice\'s mesh client reports the bridge available', await waitFor(() => frameA.evaluate(() => window.__kvMesh.isAvailable())));
check('group picker shows the shared test group for Alice', await waitFor(async () => (await frameA.locator('#group-select').textContent()).includes('Test Group')));

// Select the shared group on both sides — this is what triggers the late-joiner
// sync-request in the real app, and is the "None -> a real group" transition the
// group-picker UI requirement calls for.
await selectGroup(frameA, 'grp-1');
await selectGroup(frameB, 'grp-1');
await sleep(300);

await pageA.screenshot({ path: `${SHOT}/distributed-kv-alice-ready.png` }).catch(() => {});

// set replication A -> B
await setKey(frameA, 'color', 'blue');
check('Alice sees her own key locally immediately', await rowExists(frameA, 'color'));
check('Bob receives Alice\'s "set" via replication', await waitFor(() => rowExists(frameB, 'color')));
check('replicated value is correct on Bob\'s side', await waitFor(async () => (await rowValue(frameB, 'color')) === 'blue'));
await pageB.screenshot({ path: `${SHOT}/distributed-kv-bob-replicated.png` }).catch(() => {});

// set replication B -> A (bidirectional)
await setKey(frameB, 'count', '42');
check('Alice receives Bob\'s "set" (bidirectional replication)', await waitFor(() => rowExists(frameA, 'count')));
check('numeric JSON value round-trips correctly', await waitFor(async () => (await rowValue(frameA, 'count')) === '42'));

// delete replication
await frameA.locator('tr:has(td.key-cell:text-is("color")) .del-btn').click();
check('key disappears locally on Alice after delete', await waitFor(async () => !(await rowExists(frameA, 'color'))));
check('delete replicates to Bob', await waitFor(async () => !(await rowExists(frameB, 'color'))));

// ---- Test 4: late joiner catch-up ----
const contextC = await browser.newContext();
const pageC = await contextC.newPage();
await boot(pageC);
await injectApp(pageC);
groupMembers = [...groupMembers, { id: 'peer-carol', name: 'Carol', online: true }];
await updateGroups(pageA, groupsFor(groupMembers));
await updateGroups(pageB, groupsFor(groupMembers));
await installMockBridge(pageC, { peerId: 'peer-carol', peerName: 'Carol', groups: groupsFor(groupMembers) });

const frameC = await openApp(pageC);
await waitFor(() => frameC.evaluate(() => window.__kvReady === true));
check('Carol (late joiner) starts with an empty local store before selecting the group',
  await frameC.evaluate(() => Object.keys(window.__kvAll()).length === 0));
await selectGroup(frameC, 'grp-1');
check('Carol starts caught up with the existing "count" key via kv-sync-req/kv-sync-res after selecting the group', await waitFor(() => rowExists(frameC, 'count'), 8000));
check('Carol does NOT see the deleted "color" key (tombstone respected)', await waitFor(async () => !(await rowExists(frameC, 'color'))));
check('Carol\'s __kvAll() snapshot matches Alice\'s visible keys', await waitFor(async () => {
  const [allA, allC] = await Promise.all([frameA.evaluate(() => window.__kvAll()), frameC.evaluate(() => window.__kvAll())]);
  return JSON.stringify(Object.keys(allA).sort()) === JSON.stringify(Object.keys(allC).sort());
}));
await pageC.screenshot({ path: `${SHOT}/distributed-kv-late-joiner.png` }).catch(() => {});

// ---- Test 5: simultaneous conflicting write resolves deterministically ----
// Both peers write the SAME key at nearly the same time. Our LWW policy compares
// (ts, peerId); the property that actually matters for correctness is that every
// peer converges to the IDENTICAL final value, not which specific write "won".
await Promise.all([
  setKey(frameA, 'conflict', 'alice-value'),
  setKey(frameB, 'conflict', 'bob-value'),
]);
await sleep(1500);
const aHas = await waitFor(() => rowExists(frameA, 'conflict'));
const bHas = await waitFor(() => rowExists(frameB, 'conflict'));
const cHas = await waitFor(() => rowExists(frameC, 'conflict'));
const aVal = aHas ? await rowValue(frameA, 'conflict') : null;
const bVal = bHas ? await rowValue(frameB, 'conflict') : null;
const cVal = cHas ? await rowValue(frameC, 'conflict') : null;
check('all three peers converge to the identical value after a simultaneous conflicting write',
  aVal !== null && aVal === bVal && bVal === cVal, `alice="${aVal}" bob="${bVal}" carol="${cVal}"`);
check('the converged value is one of the two conflicting writes (not corrupted)', aVal === 'alice-value' || aVal === 'bob-value', aVal);

await browser.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
