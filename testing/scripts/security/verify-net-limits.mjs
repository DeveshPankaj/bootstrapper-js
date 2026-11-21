// NET-13 (TODO 1E.11): resource-exhaustion limits — the WebRTC invite/answer link is inflated
// with a streaming cap, and the Distributed Compute / Distributed KV mesh clients cap chunk
// counts, partial reassemblies and buffered size, key partials by sender, and expire them.
// Run: node testing/scripts/security/verify-net-limits.mjs   (dev server on :8080)
import zlib from 'node:zlib';
import { MeshClient as DcMesh } from '../../../docs/public/mount/opt/apps/distributed-compute/lib/mesh-client.js';
import { MeshClient as KvMesh } from '../../../docs/public/mount/opt/apps/distributed-kv/lib/mesh-client.js';
import { launchBrowser, bootPage, openWindow, appFrame, waitFor, waitForCommand, check, finish } from './verify-net-lib.mjs';

// ── mesh clients (pure logic: the subscribe handler is driven directly) ──
for (const [label, Mesh] of [['distributed-compute', DcMesh], ['distributed-kv', KvMesh]]) {
  let handlerFn = null; const sent = [];
  const host = { getCommand: (n) => ({
    'webrtc.mesh.subscribe': { exec: (ch, h) => { handlerFn = h; return { unsubscribe() {} }; } },
    'webrtc.mesh.send': { exec: (gid, ch, payload) => { sent.push(payload); return { ok: true }; } },
  }[n] || null) };
  const mesh = new Mesh(host);
  const got = [];
  mesh.onMessage((gid, from, name, m) => got.push({ from, m }));
  const feed = (from, payload) => handlerFn('g1', from, from, payload);

  feed('evil', { id: 'm1', seq: 0, total: 1e9, chunk: 'x' });
  feed('evil', { id: 'm2', seq: 5, total: 3, chunk: 'x' });
  feed('evil', { id: 'm3', seq: -1, total: 3, chunk: 'x' });
  feed('evil', { id: 'm4', seq: 0.5, total: 3, chunk: 'x' });
  check(`NET-13 ${label}: absurd total / out-of-range seq allocate nothing`, mesh._reassembly.size === 0, String(mesh._reassembly.size));

  for (let i = 0; i < 50; i++) feed('evil', { id: 'flood' + i, seq: 0, total: 2, chunk: 'x' });
  check(`NET-13 ${label}: one peer can hold only a few partial messages`, [...mesh._reassembly.values()].filter((e) => e.peer === 'g1\nevil').length <= 8, String(mesh._reassembly.size));
  const big = 'y'.repeat(40000);
  for (let i = 0; i < 40; i++) for (let s = 0; s < 3; s++) feed('p' + i, { id: 'big' + i, seq: s, total: 64, chunk: big });
  check(`NET-13 ${label}: partial messages are capped in number and buffered size`, mesh._reassembly.size <= 32 && mesh._bufferedChars <= 8 * 1024 * 1024, `${mesh._reassembly.size} partials, ${mesh._bufferedChars} chars`);

  // A peer can't complete (or poison) another peer's message.
  const json = JSON.stringify({ hello: 'world', pad: 'z'.repeat(50000) });
  const parts = [json.slice(0, 40000), json.slice(40000)];
  got.length = 0;
  feed('alice', { id: 'shared-id', seq: 0, total: 2, chunk: parts[0] });
  feed('mallory', { id: 'shared-id', seq: 1, total: 2, chunk: '"}' });
  check(`NET-13 ${label}: chunks are keyed by sender (another peer can't complete the message)`, got.length === 0);
  feed('alice', { id: 'shared-id', seq: 1, total: 2, chunk: parts[1] });
  check(`NET-13 ${label}: the sender's own chunks still reassemble (even right after a flood filled the table)`, got.length === 1 && got[0].from === 'alice' && got[0].m.hello === 'world', JSON.stringify(got.map((g) => g.from)));

  // Stale partials expire.
  mesh._expirePartials(Date.now() + 61000);
  check(`NET-13 ${label}: stale partial messages are dropped`, mesh._reassembly.size === 0 && mesh._bufferedChars === 0, `${mesh._reassembly.size} / ${mesh._bufferedChars}`);

  // The sender refuses what receivers would drop.
  const r = mesh.send('g1', { blob: 'q'.repeat(64 * 40000 + 10) });
  check(`NET-13 ${label}: send() refuses a message over the chunk cap`, r.ok === false && /too large/.test(r.err), JSON.stringify(r));
  const ok = mesh.send('g1', { blob: 'q'.repeat(100000) });
  check(`NET-13 ${label}: a normal multi-chunk message still sends`, ok.ok === true && sent.at(-1).total === 3);
}

// ── WebRTC invite links: streaming decompression cap ──
const bomb = 'wrtc1.' + zlib.deflateRawSync(Buffer.alloc(60 * 1024 * 1024, 0x61), { level: 9 }).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
console.log(`(bomb link: ${bomb.length} chars → 60 MB inflated)`);
const browser = await launchBrowser(['--enable-precise-memory-info']);
const page = await bootPage(browser);
await waitForCommand(page, 'ui.webrtc');
await openWindow(page, 'ui.webrtc');
const f = await appFrame(page, 'webrtc/main.html');
await waitFor(() => f.evaluate(() => !!window.__webrtcApp), 20000);
const res = await f.evaluate(async (code) => {
  const before = performance.memory ? performance.memory.usedJSHeapSize : 0;
  let peak = before; const sampler = setInterval(() => { if (performance.memory) peak = Math.max(peak, performance.memory.usedJSHeapSize); }, 5);
  const t0 = performance.now();
  let err = null; try { await window.__webrtcApp.handleIncomingCode(code); } catch (e) { err = e.message; }
  clearInterval(sampler);
  return { err, ms: Math.round(performance.now() - t0), growMB: Math.round((peak - before) / 1048576) };
}, bomb);
check('NET-13 webrtc: a high-ratio link is refused as too large', res.err === 'Code is too large', JSON.stringify(res));
check('NET-13 webrtc: …without inflating it (no large allocation, fast)', res.growMB < 20 && res.ms < 3000, JSON.stringify(res));
const own = await f.evaluate(async () => { const inv = await window.__webrtcApp.createInvite('Me'); try { await window.__webrtcApp.handleIncomingCode(inv.link); return 'accepted?'; } catch (e) { return e.message; } });
check('NET-13 webrtc: a normal invite link still decodes', /your own invite/.test(own), own);

check('no page errors', !page.__errors.length, page.__errors.join(' | '));
await finish(browser);
