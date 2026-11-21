// Peer / mesh findings.
//
// Part A — one OS, an in-page fake mesh bridge (webrtc.mesh.* registered before Distributed Compute
// opens; the real bridge only exists while the WebRTC window is open), a "peer" sends raw messages:
//   NET-1  a dc-task is not executed before the user opts in for that group
//   NET-1  after opting in, the task runs with an opaque origin: no IndexedDB, no network
//   NET-5  a peer display name with markup renders as text in the compute roster
// Part B — two real WebRTC Chat instances (attacker M, victim V) connected over invite/answer:
//   NET-11 autoMesh is off for a fresh profile; a group `create` from a peer needs V's consent
//   NET-3  M serves traversal names for a share V mounts → nothing lands outside /mnt/webrtc/<label>
//   NET-6  another app's `webrtc.api share add … rw` is refused/prompted (prompt declined → no share)
//   NET-10 a read-write share of /etc is refused even when the user confirms
import { BASE_URL, newSession, boot, openWindow, findFrame, step, report, done, sleep, pollFor, vfsWrite, vfsFindMarker, isInside, waitForCommand } from './lib/harness.mjs';

const GID = 'sec-net1-group';
const XSS_NAME = '<img src=x onerror="window.__sec_dc_xss=1">';
const PROBE = `
  const out = { origin: String(self.origin) };
  try { indexedDB.open('sec-dc-probe'); out.idb = 'ALLOWED'; } catch (e) { out.idb = 'BLOCKED ' + e.name; }
  try { const x = new XMLHttpRequest(); x.open('GET', ${JSON.stringify(BASE_URL + '/public/mount/meta.json')}, false); x.send(); out.xhr = 'ALLOWED ' + x.status; } catch (e) { out.xhr = 'BLOCKED ' + e.name; }
  try { out.top = typeof window !== 'undefined' && !!window.top && !!window.top.platform; } catch (e) { out.top = 'BLOCKED ' + e.name; }
  out.caches = typeof caches;
  return out;`;

const S = await newSession();
try {
  // ══ Part A: fake mesh ═══════════════════════════════════════════════════
  const page = await boot(S.context, { dialogPolicy: 'dismiss' });
  await page.evaluate(({ GID, XSS_NAME }) => {
    const subs = [];
    window.__secMeshSent = [];
    const reg = (n, f) => window.platform.host.registerCommand(n, f, { callable: false });
    reg('webrtc.mesh.available', () => true);
    reg('webrtc.mesh.myId', () => ({ id: 'sec-victim', name: 'Victim' }));
    reg('webrtc.mesh.groups', () => [{ gid: GID, name: 'Compute', creator: 'sec-attacker', members: [{ id: 'sec-victim', name: 'Victim', online: true }, { id: 'sec-attacker', name: XSS_NAME, online: true }] }]);
    reg('webrtc.mesh.send', (g, ch, payload) => { window.__secMeshSent.push({ g, ch, payload }); return { ok: true, sentTo: ['sec-attacker'] }; });
    reg('webrtc.mesh.subscribe', (ch, h) => { subs.push({ ch, h }); return { unsubscribe() { const i = subs.findIndex((s) => s.h === h); if (i >= 0) subs.splice(i, 1); } }; });
    window.__secMeshDeliver = (ch, payload) => { for (const s of subs.slice()) if (s.ch === ch) { try { s.h(GID, 'sec-attacker', 'Attacker', payload); } catch (e) { console.warn(e); } } return subs.length; };
  }, { GID, XSS_NAME });

  const openDc = async () => {
    await openWindow(page, 'ui.distributed-compute');
    const f = await findFrame(page, { urlPart: 'distributed-compute/main.html', predicate: () => window.__distComputeReady === true, timeout: 30000 });
    return f;
  };
  let dc = await openDc();
  // A raw task, the way NET-1's exploit sends it; returns the dc-result the victim sent back (or null).
  let n = 0;
  const sendTask = async (taskSource, waitMs = 8000) => {
    const taskId = 'sec-task-' + (++n);
    const subs = await page.evaluate(({ taskId, taskSource }) => {
      window.__secMeshSent = [];
      return window.__secMeshDeliver('distributed-compute', { id: 'sec-msg-' + taskId, seq: 0, total: 1, chunk: JSON.stringify({ type: 'dc-task', to: 'sec-victim', taskId, taskSource, args: {}, timeoutMs: 6000 }) });
    }, { taskId, taskSource });
    const res = await pollFor(() => page.evaluate((taskId) => {
      for (const s of window.__secMeshSent) {
        try { const m = JSON.parse(s.payload.chunk); if (m && m.type === 'dc-result' && m.taskId === taskId) return m; } catch (_) {}
      }
      return null;
    }, taskId), waitMs, 300);
    return { subs, res };
  };

  await step('NET-1', 'dc-task-not-run-before-opt-in', async () => {
    if (!dc) return { pass: null, detail: 'Distributed Compute did not open' };
    const { subs, res } = await sendTask(PROBE);
    if (!subs) return { pass: null, detail: 'Distributed Compute never subscribed to the mesh' };
    const ran = !!(res && res.ok === true);
    return { pass: !ran, detail: `subscribers=${subs}; reply=${JSON.stringify(res).slice(0, 220)}` };
  });

  await step('NET-1', 'dc-task-after-opt-in-is-opaque', async () => {
    if (!dc) return { pass: null, detail: 'Distributed Compute did not open' };
    // opt in for this group the way the app records it (hook → settings file → checkbox)
    let how = 'none needed';
    const hook = await dc.evaluate((g) => { if (typeof window.__distComputeSetAccept === 'function') { window.__distComputeSetAccept(g, true); return true; } return false; }, GID).catch(() => false);
    if (hook) how = 'hook';
    else {
      const box = await dc.$(`#accept-list input[data-gid="${GID}"]`);
      if (box) { await box.click({ force: true }); how = 'checkbox'; }
      else {
        await vfsWrite(page, { '/home/user1/.local/share/distributed-compute/settings.json': JSON.stringify({ acceptTasks: [{ gid: GID }] }) });
        await page.evaluate(() => document.querySelectorAll('.window[data-name="ui.distributed-compute"]').forEach((w) => w.remove()));
        dc = await openDc(); how = 'settings-file';
      }
    }
    await sleep(500);
    const { res } = await sendTask(PROBE, 12000);
    if (!res) return { pass: null, detail: `opted in via ${how}; no reply to the task` };
    if (res.ok !== true) return { pass: null, detail: `opted in via ${how}; task did not run: ${JSON.stringify(res).slice(0, 200)}` };
    const r = res.result || {};
    const pass = r.origin === 'null' && /^BLOCKED/.test(r.idb || '') && /^BLOCKED/.test(r.xhr || '') && r.top !== true;
    return { pass, detail: `opted in via ${how}; task sees ${JSON.stringify(r)}` };
  });

  await step('NET-5', 'roster-peer-name-is-text', async () => {
    if (!dc) return { pass: null, detail: 'Distributed Compute did not open' };
    await dc.evaluate((g) => { const sel = document.getElementById('group-select'); if (sel) { sel.value = g; sel.dispatchEvent(new Event('change')); } }, GID);
    await sleep(3500);
    const r = await dc.evaluate(() => ({ imgs: document.querySelectorAll('#roster-list img').length, text: (document.getElementById('roster-list') || {}).textContent || '', xss: window.__sec_dc_xss === 1 }));
    if (!r.text) return { pass: null, detail: 'roster empty (group not selected?)' };
    return { pass: r.imgs === 0 && !r.xss, detail: JSON.stringify(r).slice(0, 240) };
  });
  await page.close().catch(() => {});

  // ══ Part B: two real peers ═══════════════════════════════════════════════
  const ctxV = S.context;
  const ctxM = await S.browser.newContext();
  const pV = await boot(ctxV, { dialogPolicy: 'accept' });
  const pM = await boot(ctxM, { dialogPolicy: 'accept' });

  const webrtcFrame = (p) => findFrame(p, { urlPart: 'webrtc/main.html', predicate: () => !!window.__webrtcApp, timeout: 40000 });
  const connect = async () => {
    await waitForCommand(pM, 'ui.webrtc');
    await openWindow(pM, 'ui.webrtc');
    const fM = await webrtcFrame(pM);
    const inv = await fM.evaluate(async () => (await window.__webrtcApp.createInvite('Mallory')).link);
    await waitForCommand(pV, 'ui.webrtc');
    await openWindow(pV, 'ui.webrtc', inv);
    const fV = await webrtcFrame(pV);
    if (!(await pollFor(() => fV.evaluate(() => window.__webrtcApp.joins.size === 1), 30000))) throw new Error('victim never picked up the invite');
    const ans = await fV.evaluate(async () => { const j = [...window.__webrtcApp.joins.values()][0]; await window.__webrtcApp.generateAnswer(j, 'Victor'); return j.link; });
    await fM.evaluate((l) => window.__webrtcApp.handleIncomingCode(l), ans);
    const ok = await pollFor(async () => (await fM.evaluate(() => window.__webrtcApp.peers.size >= 1)) && (await fV.evaluate(() => window.__webrtcApp.peers.size >= 1)), 40000, 500);
    for (const f of [fM, fV]) await f.evaluate(() => document.querySelectorAll('.modal-head button').forEach((b) => b.click())).catch(() => {});
    return { fM, fV, ok, idV: await fV.evaluate(() => window.__webrtcApp.myId), idM: await fM.evaluate(() => window.__webrtcApp.myId) };
  };
  let C = null;
  try { C = await connect(); } catch (e) { C = { error: String(e && e.message || e) }; }
  const connected = C && C.ok;

  await step('NET-11', 'auto-mesh-off-by-default', async () => {
    if (!C || C.error) return { pass: null, detail: 'webrtc did not start: ' + (C && C.error) };
    const v = await C.fV.evaluate(() => window.__webrtcApp.settings.autoMesh);
    return { pass: v === false, detail: `fresh profile settings.autoMesh=${JSON.stringify(v)}` };
  });

  await step('NET-11', 'group-add-needs-consent', async () => {
    if (!connected) return { pass: null, detail: 'peers did not connect: ' + JSON.stringify(C && (C.error || C.ok)) };
    pV.__dialogPolicy = 'dismiss';
    const d0 = pV.__dialogs.length;
    const gid = await C.fM.evaluate((v) => window.__webrtcApp.createGroup('Trap', [v]).gid, C.idV);
    await sleep(5000);
    const member = await C.fV.evaluate((g) => window.__webrtcApp.groups.has(g), gid);
    const asked = pV.__dialogs.slice(d0).map((d) => d.message.slice(0, 80));
    pV.__dialogPolicy = 'accept';
    return { pass: !member, detail: `victim became a member without consent=${member}; prompts (declined)=${JSON.stringify(asked)}` };
  });

  await step('NET-3', 'mount-traversal-stays-inside', async () => {
    if (!connected) return { pass: null, detail: 'peers did not connect' };
    await vfsWrite(pM, { '/home/user1/sec-shared/real.txt': 'real' });
    await C.fM.evaluate((v) => { const app = window.__webrtcApp; const s = app.addShare('/home/user1/sec-shared', 'stuff', 'rw'); app.setGrant(app.peers.get(v), s, 'rw'); }, C.idV);
    if (!(await pollFor(() => C.fV.evaluate(() => { const p = [...window.__webrtcApp.peers.values()][0]; return p && p.remoteShares && p.remoteShares.length === 1; }), 15000))) return { pass: null, detail: 'victim never saw the share' };
    await C.fM.evaluate(() => {
      const EVIL = {
        '': [
          { n: '../../../etc/widgets/sec-net3.js', d: false, s: 11, m: 1 }, { n: '..', d: true, s: 0, m: 1 }, { n: 'ok.txt', d: false, s: 11, m: 1 },
          { n: '..\\..\\sec-net3-bs.txt', d: false, s: 11, m: 1 }, { n: 'sub', d: true, s: 0, m: 1 },
        ],
        'sub': [{ n: '../../../../../home/user1/sec-net3-home.txt', d: false, s: 11, m: 1 }, { n: 'inner.txt', d: false, s: 11, m: 1 }],
      };
      // eslint-disable-next-line no-global-assign
      handleVfsRequest = function (peer, m) {
        if (m.op === 'list') return sendPeer(peer, { t: 'vfs-res', rid: m.rid, ok: true, op: 'list', entries: EVIL[m.path] || [] });
        if (m.op === 'read') return void sendBlob(peer.conn, new Blob(['SEC-NET3-XX']), { name: 'f', mime: 'text/plain', kind: 'vfs', rid: m.rid }).catch(() => {});
        return sendPeer(peer, { t: 'vfs-res', rid: m.rid, ok: true });
      };
    });
    const mounted = await C.fV.evaluate(async () => {
      const app = window.__webrtcApp; const p = [...app.peers.values()][0];
      const t = new Promise((res) => setTimeout(() => res({ ok: false, err: 'mountShare did not settle in 20s', pending: true }), 20000));
      try { return await Promise.race([app.mountShare(p, p.remoteShares[0]).then((m) => ({ ok: true, path: m.path })), t]); } catch (e) { return { ok: false, err: e.message }; }
    });
    // a mount that throws or hangs may still have written files: scan regardless
    if (!mounted.ok) mounted.path = await C.fV.evaluate(() => { const m = [...window.__webrtcApp.mounts.values()][0]; return m ? m.path : '/mnt/webrtc'; });
    await sleep(4500);
    await pV.evaluate((p) => { try { window.fs.readdirSync(p + '/sub'); } catch (_) {} }, mounted.path);
    await sleep(2500);
    const hits = await vfsFindMarker(pV, 'SEC-NET3-XX');
    const outside = hits.filter((h) => !isInside(mounted.path, h));
    if (!mounted.ok && !hits.length) return { pass: null, detail: 'mount failed (' + mounted.err + ') and nothing reached the vfs' };
    return { pass: outside.length === 0, detail: `mount=${mounted.path}${mounted.ok ? '' : ' (' + mounted.err + ')'}; outside=${JSON.stringify(outside)}; inside=${hits.filter((h) => isInside(mounted.path, h)).length}` };
  });

  await step('NET-6', 'webrtc-api-share-from-other-app-refused', async () => {
    if (!C || C.error) return { pass: null, detail: 'webrtc did not start' };
    await vfsWrite(pV, { '/home/user1/sec-net6/a.txt': 'a' });
    pV.__dialogPolicy = 'dismiss';
    const d0 = pV.__dialogs.length;
    const out = await pV.evaluate(async () => { try { return String(await window.platform.host.getCommand('webrtc.api').exec('share', 'add', '/home/user1/sec-net6', 'sec6', 'rw')).slice(0, 120); } catch (e) { return 'threw ' + e.message; } });
    await sleep(800);
    const shares = await C.fV.evaluate(() => [...window.__webrtcApp.shares.values()].map((s) => s.path + ':' + s.mode));
    const asked = pV.__dialogs.slice(d0).map((d) => d.message.slice(0, 80));
    pV.__dialogPolicy = 'accept';
    return { pass: !shares.some((s) => s.startsWith('/home/user1/sec-net6')), detail: `result=${JSON.stringify(out)}; shares=${JSON.stringify(shares)}; prompts (declined)=${JSON.stringify(asked)}` };
  });

  await step('NET-10', 'no-rw-share-of-system-folder', async () => {
    if (!C || C.error) return { pass: null, detail: 'webrtc did not start' };
    pV.__dialogPolicy = 'accept';
    const out = {};
    for (const p of ['/etc', '/opt']) {
      out[p] = await pV.evaluate(async (p) => { try { return String(await window.platform.host.getCommand('webrtc.api').exec('share', 'add', p, 'sys' + p.slice(1), 'rw')).slice(0, 100); } catch (e) { return 'threw ' + e.message; } }, p);
      out[p + ':direct'] = await C.fV.evaluate((p) => { try { window.__webrtcApp.addShare(p, 'sysd' + p.slice(1), 'rw'); return 'added'; } catch (e) { return 'refused: ' + e.message.slice(0, 80); } }, p);
    }
    await sleep(500);
    const shares = await C.fV.evaluate(() => [...window.__webrtcApp.shares.values()].map((s) => s.path + ':' + s.mode));
    const rwSystem = shares.filter((s) => /^\/(etc|opt)(\/|:)/.test(s) && s.endsWith(':rw'));
    return { pass: rwSystem.length === 0, detail: `rw system shares=${JSON.stringify(rwSystem)}; attempts=${JSON.stringify(out).slice(0, 300)}` };
  });
  await ctxM.close().catch(() => {});
} catch (e) {
  report('NET-1', null, 'script error: ' + (e && e.stack || e), { check: 'harness' });
} finally {
  await S.close();
}
done('test-peer');
