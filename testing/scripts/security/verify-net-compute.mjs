// NET-1 (TODO 1E.1) + NET-5 (1E.4): Distributed Compute must not run peer-sent task code
// by default; accepted tasks run in an opaque-origin sandbox with no network/storage; the
// roster renders peer names as text.
// Run: node testing/scripts/security/verify-net-compute.mjs   (dev server on :8080)
import { launchBrowser, bootPage, connectPair, openWindow, appFrame, waitFor, check, finish, sleep } from './verify-net-lib.mjs';
import { MeshClient } from '../../../docs/public/mount/opt/apps/distributed-compute/lib/mesh-client.js';
import { Scheduler } from '../../../docs/public/mount/opt/apps/distributed-compute/lib/scheduler.js';
import { runTask } from '../../../docs/public/mount/opt/apps/distributed-compute/lib/task-runtime.js';

// ── Node-level: a result is only accepted from the worker the chunk was sent to ──
{
  const peers = new Map();
  const host = (id) => ({ getCommand: (n) => ({
    'webrtc.mesh.available': { exec: () => true },
    'webrtc.mesh.myId': { exec: () => ({ id, name: id }) },
    'webrtc.mesh.groups': { exec: () => [{ gid: 'g1', name: 'g', members: [...peers.keys()].map((p) => ({ id: p, name: p, online: true })) }] },
    'webrtc.mesh.send': { exec: (gid, ch, payload) => { for (const [p, subs] of peers) if (p !== id) for (const h of subs) setTimeout(() => h(gid, id, id, payload), 1); return { ok: true }; } },
    'webrtc.mesh.subscribe': { exec: (ch, h) => { peers.get(id).push(h); return { unsubscribe() {} }; } },
  }[n] || null) });
  for (const id of ['A', 'B', 'C']) peers.set(id, []);
  const sA = new Scheduler(new MeshClient(host('A')), { myId: 'A' }); sA.startResponder();
  // B is slow but honest; C forges a result for every task it sees addressed to B.
  const sB = new Scheduler(new MeshClient(host('B')), { myId: 'B', acceptTask: () => true, runInWorker: (s, a) => ({ promise: new Promise((r) => setTimeout(() => r(runTask(s, a)), 80)), kill: () => false }) }); sB.startResponder();
  const meshC = new MeshClient(host('C'));
  meshC.onMessage((gid, from, name, m) => { if (m && m.type === 'dc-task' && m.to === 'B') meshC.send(gid, { type: 'dc-result', to: from, taskId: m.taskId, ok: true, result: 666 }); });
  const { combined } = await sA.run({ gid: 'g1', chunkCount: 1, taskSource: 'return 7;', buildArgs: () => ({}), combineSource: 'return args.results[0];', workers: [{ id: 'B', name: 'B' }], timeoutMs: 2000, maxRetries: 0 });
  check('NET-1 node: a forged dc-result from a third member is ignored (only the assigned worker may answer)', combined === 7, `combined=${combined}`);
  const sD = new Scheduler(new MeshClient(host('A')), { myId: 'D' });
  check('NET-1 node: a scheduler without an opt-in refuses by default', sD._acceptTask('g1', 'X') === false);
}

const browser = await launchBrowser();
const pA = await bootPage(browser), pB = await bootPage(browser);
const { fA, fB, idB } = await connectPair(pA, pB);
check('two peers connected', !!idB);

// NET-5 payload: Alice renames herself to an XSS name before the group exists.
const XSS_NAME = '<img src=x onerror="window.__xss=1">';
await fA.evaluate((n) => { window.__webrtcApp.runCli(['name', n]); }, XSS_NAME).catch(() => {});

const gid = await fA.evaluate((b) => window.__webrtcApp.createGroup('Compute', [b]).gid, idB);
check('Bob is in the group (accepted the invitation)', await waitFor(() => fB.evaluate((g) => window.__webrtcApp.groups.has(g), gid), 20000));

await openWindow(pA, 'ui.distributed-compute');
await openWindow(pB, 'ui.distributed-compute');
const dcA = await appFrame(pA, 'distributed-compute/main.html');
const dcB = await appFrame(pB, 'distributed-compute/main.html');
await waitFor(() => dcA.evaluate(() => window.__distComputeReady === true));
await waitFor(() => dcB.evaluate(() => window.__distComputeReady === true));

// Count Workers constructed in Bob's app realm (the sandbox frame has its own Worker global).
await dcB.evaluate(() => { const W = window.Worker; window.__appWorkers = 0; window.Worker = function (...a) { window.__appWorkers++; return new W(...a); }; });

// The attacker (Alice) sends Bob a raw dc-task, the way NET-1's exploit does.
const PROBE = `
  const out = { origin: String(self.origin), hasWindow: typeof window !== 'undefined', hasPlatform: typeof self.platform !== 'undefined' };
  try { indexedDB.open('dc-probe'); out.idb = 'ALLOWED'; } catch (e) { out.idb = 'BLOCKED ' + e.name; }
  try { const x = new XMLHttpRequest(); x.open('GET', location.origin.startsWith('http') ? location.origin + '/public/mount/meta.json' : 'http://localhost:8080/public/mount/meta.json', false); x.send(); out.xhr = 'ALLOWED ' + x.status; } catch (e) { out.xhr = 'BLOCKED ' + e.name; }
  try { importScripts('http://localhost:8080/public/mount/meta.json'); out.importScripts = 'ALLOWED'; } catch (e) { out.importScripts = 'BLOCKED ' + e.name; }
  try { out.cachesType = typeof caches; } catch (e) { out.cachesType = 'BLOCKED'; }
  return out;`;
const sendRawTask = (taskId, taskSource, timeoutMs) => dcA.evaluate(({ gid, to, taskId, taskSource, timeoutMs }) => new Promise((resolve) => {
  const mesh = window.__distComputeMesh;
  const t = setTimeout(() => { sub.unsubscribe(); resolve({ timeout: true }); }, 20000);
  const sub = mesh.onMessage((g, from, name, m) => { if (m && m.type === 'dc-result' && m.taskId === taskId) { clearTimeout(t); sub.unsubscribe(); resolve(m); } });
  mesh.send(gid, { type: 'dc-task', to, taskId, taskSource, args: {}, timeoutMs });
}), { gid, to: idB, taskId, taskSource, timeoutMs });

const before = await sendRawTask('probe-before', PROBE);
check('NET-1: before opt-in, Bob refuses the task (no execution)', before.ok === false && before.refused === true, JSON.stringify(before));
check('NET-1: before opt-in, Bob has no worker activity', (await dcB.evaluate(() => window.__distComputeActivities().length)) === 0);
check('NET-1: "Run tasks for others" lists the group, unticked by default',
  await waitFor(() => dcB.evaluate((g) => { const b = document.querySelector(`#accept-list input[data-gid="${g}"]`); return !!b && b.checked === false; }, gid), 8000));
check('NET-1: the refusal is logged in Bob\'s window', await waitFor(() => dcB.evaluate(() => /refused a task/.test(document.getElementById('log').textContent)), 5000));

// Opt in through the UI (a real click on the checkbox).
await dcB.evaluate((g) => document.querySelector(`#accept-list input[data-gid="${g}"]`).click(), gid);
check('NET-1: ticking the group opts in', await waitFor(() => dcB.evaluate((g) => window.__distComputeAccepts(g), gid), 5000));
const saved = await pB.evaluate(() => { try { return JSON.parse(window.fs.readFileSync('/home/user1/.local/share/distributed-compute/settings.json', 'utf8')); } catch (e) { return String(e); } });
check('NET-1: opt-in persisted in the app\'s own data dir', !!(saved && Array.isArray(saved.acceptTasks) && saved.acceptTasks.some((e) => e.gid === gid)), JSON.stringify(saved));

const after = await sendRawTask('probe-after', PROBE);
const r = after.result || {};
check('NET-1: after opt-in, the task runs and answers', after.ok === true, JSON.stringify(after));
check('NET-1: task Worker has an opaque origin', r.origin === 'null', r.origin);
check('NET-1: task has no window / platform', r.hasWindow === false && r.hasPlatform === false, JSON.stringify(r));
check('NET-1: IndexedDB is blocked inside the task', /^BLOCKED/.test(r.idb || ''), r.idb);
check('NET-1: network (sync XHR) is blocked inside the task', /^BLOCKED/.test(r.xhr || ''), r.xhr);
check('NET-1: importScripts from the network is blocked', /^BLOCKED/.test(r.importScripts || ''), r.importScripts);

const frameInfo = await dcB.evaluate(() => {
  const f = window.__distComputeSandbox.frame();
  return f ? { sandbox: f.getAttribute('sandbox'), csp: /default-src 'none'/.test(f.srcdoc), origin: window.__distComputeSandbox.origin() } : null;
});
check('NET-1: sandbox frame is sandbox="allow-scripts" only (no allow-same-origin)', frameInfo && frameInfo.sandbox === 'allow-scripts', JSON.stringify(frameInfo));
check('NET-1: sandbox frame carries default-src \'none\' CSP and reports origin null', frameInfo && frameInfo.csp && frameInfo.origin === 'null', JSON.stringify(frameInfo));
const workersInApp = await dcB.evaluate(() => window.__appWorkers);
check('NET-1: no task Worker was created from the app\'s own same-origin realm', workersInApp === 0, String(workersInApp));

// Per-task timeout: an endless loop is stopped.
const t0 = Date.now();
const loop = await sendRawTask('loop', 'for (;;) {}', 1500);
check('NET-1: an endless task is stopped by its timeout', loop.ok === false && /timed out/.test(loop.error || '') && Date.now() - t0 < 9000, JSON.stringify(loop) + ` after ${Date.now() - t0}ms`);
const again = await sendRawTask('after-loop', 'return 41 + 1;');
check('NET-1: the sandbox keeps working after a timeout', again.ok === true && again.result === 42, JSON.stringify(again));

// Kill: a running task is terminated from Bob's activity registry.
const killP = sendRawTask('to-kill', 'const s = Date.now(); while (Date.now() - s < 15000) {} return 1;', 30000);
check('NET-1: the running task shows up as a killable activity', await waitFor(() => dcB.evaluate(() => window.__distComputeActivities().some((a) => a.state === 'running' && a.meta.killable && a.meta.sandboxed)), 8000));
const killed = await dcB.evaluate(() => { const a = window.__distComputeActivities().find((x) => x.state === 'running'); return a ? !!window.platform.host.getCommand('activity.kill')?.exec(a.id) || a.id : null; });
const killRes = await killP;
check('NET-1: kill ends the task at once', !!killed && killRes.ok === false && /killed/.test(killRes.error || ''), JSON.stringify(killRes));

// Unticking stops accepting.
await dcB.evaluate((g) => window.__distComputeSetAccept(g, false), gid);
const off = await sendRawTask('probe-off', 'return 1;');
check('NET-1: after unticking, tasks are refused again', off.ok === false && off.refused === true, JSON.stringify(off));

// NET-5: the roster shows Alice's XSS name as text in Bob's window.
await dcB.evaluate((g) => { const sel = document.getElementById('group-select'); sel.value = g; sel.dispatchEvent(new Event('change')); }, gid);
await sleep(3500);
const roster = await dcB.evaluate(() => ({ html: document.getElementById('roster-list').innerHTML, text: document.getElementById('roster-list').textContent, imgs: document.querySelectorAll('#roster-list img').length, xss: window.__xss === 1 }));
check('NET-5: roster renders a peer name as text (no <img> element, no script)', roster.imgs === 0 && !roster.xss && roster.text.includes('<img'), JSON.stringify(roster).slice(0, 300));

check('no page errors', !pA.__errors.length && !pB.__errors.length, [...pA.__errors, ...pB.__errors].join(' | '));
await finish(browser);
