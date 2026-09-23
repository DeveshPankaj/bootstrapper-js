// TURN / connection-servers test with two browser instances.
// Needs: webpack serve on :8103 and a local TURN server on 127.0.0.1:3478 (user wrtc / password secret),
// e.g. `npm i node-turn` in a scratch dir and:
//   new (require('node-turn'))({authMech:'long-term',credentials:{wrtc:'secret'},listeningPort:3478,
//     listeningIps:['127.0.0.1'],relayIps:['127.0.0.1'],externalIps:'127.0.0.1'}).start()
import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103, URL = `http://localhost:${PORT}`, SHOT = 'testing/screenshots';
const TURN = 'turn:127.0.0.1:3478?transport=udp';
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (_) {} await sleep(300); } return false; }
async function appFrame(page, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { for (const fr of page.frames()) { try { if (await fr.locator('#me-name').count() && await fr.evaluate(() => !!window.__webrtcApp)) return fr; } catch (_) {} } await sleep(500); }
  throw new Error('app frame not found');
}
const cli = (page, cmd) => page.evaluate((c) => window.platform.host.getCommand('webrtc.api').exec(...c.split(' ')), cmd);

const browser = await chromium.launch();
const pA = await (await browser.newContext()).newPage(), pB = await (await browser.newContext()).newPage();
const errs = []; pA.on('pageerror', e => errs.push('A ' + e.message)); pB.on('pageerror', e => errs.push('B ' + e.message));
await pA.goto(URL); await pA.waitForTimeout(3000); await pA.reload(); await pA.waitForTimeout(3000); await pA.reload(); await pA.waitForTimeout(9000);
await pA.evaluate(() => window.platform.host.execCommand("service('001-core.layout','open-window') (command('ui.webrtc'))", window.platform));
const fA = await appFrame(pA);

// 1. no servers → clear "same network only" warning on the invite card
let o = await cli(pA, 'ice'); check('defaults: STUN servers listed', /stun\.l\.google\.com/.test(o.out) && /cloudflare/.test(o.out), o.out.replace(/\n/g, ' | '));
for (let i = 0; i < 2; i++) await cli(pA, 'ice rm 1');
o = await cli(pA, 'ice test'); check('no servers → only local address, warning printed', /0 public/.test(o.out) && /add a TURN/.test(o.out), o.out.replace(/\n/g, ' | '));
await fA.evaluate(() => window.__webrtcApp.createInvite('Alice'));
await fA.evaluate(() => document.querySelector('#connect-row button').click());
check('invite card warns: same-network only', await waitFor(() => fA.locator('.warnbox:has-text("Same-network only")').count().then(n => n > 0)));
await pA.screenshot({ path: `${SHOT}/webrtc-turn-warning.png` });
await fA.evaluate(() => { document.querySelectorAll('.modal-head button').forEach(b => b.click()); [...window.__webrtcApp.invites.values()].forEach(i => i.pc.close()); window.__webrtcApp.invites.clear(); });

// 2. add TURN via the Settings UI, Test servers
await fA.evaluate(() => document.querySelector('#side-foot button:last-child').click());
await fA.locator('.modal button:has-text("Add server")').click({ force: true });
await fA.locator('.modal input[placeholder^="stun:host"]').last().fill(TURN);
await fA.locator('.modal input[placeholder="TURN username"]').fill('wrtc');
await fA.locator('.modal input[placeholder^="TURN password"]').fill('secret');
await fA.locator('.modal button:has-text("Test servers")').click({ force: true });
check('settings Test: relay address allocated from TURN', await waitFor(() => fA.locator('.modal :text("1 relay")').count().then(n => n > 0), 15000));
await pA.screenshot({ path: `${SHOT}/webrtc-turn-settings.png` });
await fA.evaluate(() => document.querySelectorAll('.modal input[type=checkbox]')[1].click());   // always use relay
await fA.evaluate(() => [...document.querySelectorAll('.modal button')].find(b => b.textContent.trim() === 'Save').click());
check('settings saved (TURN + relay-only)', await fA.evaluate(() => window.__webrtcApp.settings.relayOnly && window.__webrtcApp.settings.ice.some(e => /turn:/.test([].concat(e.urls)[0]) && e.username === 'wrtc')));

// wrong password is reported (test with only the bad server configured)
await cli(pA, 'ice rm 1'); await cli(pA, 'ice add turn:127.0.0.1:3478 wrtc wrong');
o = await cli(pA, 'ice test'); check('bad TURN password → no relay + server error shown', /0 relay/.test(o.out) && /401|nauthor|error/i.test(o.out), o.out.replace(/\n/g, ' | '));
await cli(pA, 'ice rm 1'); await cli(pA, `ice add ${TURN} wrtc secret`); await cli(pA, 'ice relay on');

// 3. connect over the relay only
const inv = await fA.evaluate(async () => { const i = await window.__webrtcApp.createInvite('Alice'); return { link: i.link, net: i.net, sdp: i.pc.localDescription.sdp }; });
check('relay-only invite offers only relay candidates', inv.net.relay > 0 && inv.net.host === 0 && inv.net.srflx === 0, JSON.stringify(inv.net));
check('invite SDP carries no TURN credentials', !/secret|wrtc:/.test(inv.link) && !/secret/.test(inv.sdp));
await pB.goto(inv.link);
const fB = await appFrame(pB, 40000);
await cli(pB, `ice add ${TURN} wrtc secret`); await cli(pB, 'ice rm 1'); await cli(pB, 'ice rm 1'); await cli(pB, 'ice relay on');
await waitFor(() => fB.evaluate(() => window.__webrtcApp.joins.size === 1));
const ans = await fB.evaluate(async () => { const j = [...window.__webrtcApp.joins.values()][0]; await window.__webrtcApp.generateAnswer(j, 'Bob'); return { link: j.link, net: j.net }; });
check('answer also relay-only', ans.net.relay > 0 && ans.net.host === 0, JSON.stringify(ans.net));
await fA.evaluate((l) => window.__webrtcApp.handleIncomingCode(l), ans.link);
check('A and B connected through TURN', await waitFor(async () => (await fA.evaluate(() => window.__webrtcApp.peers.size)) === 1 && (await fB.evaluate(() => window.__webrtcApp.peers.size)) === 1, 40000));
const pairs = await fA.evaluate(async () => { const p = [...window.__webrtcApp.peers.values()][0]; const st = await p.conn.ctx.pc.getStats(); const out = {}; st.forEach(r => out[r.id] = r); const sel = [...Object.values(out)].find(r => r.type === 'candidate-pair' && r.selected || (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded')); return sel ? { local: out[sel.localCandidateId].candidateType, remote: out[sel.remoteCandidateId].candidateType } : null; });
check('selected ICE pair uses a relay candidate', pairs && (pairs.local === 'relay' || pairs.remote === 'relay'), JSON.stringify(pairs));
await fA.evaluate(() => window.__webrtcApp.sendText('all', 'over the relay'));
check('chat message crosses the relay', await waitFor(() => fB.evaluate(() => window.__webrtcApp.convs.get('all').messages.some(m => m.text === 'over the relay'))));
await fB.evaluate(async () => window.__webrtcApp.sendFilesTo('all', [new File([new Uint8Array(300000).fill(3)], 'r.bin')]));
check('300 KB file crosses the relay', await waitFor(() => fA.evaluate(() => window.__webrtcApp.convs.get('all').messages.some(m => m.file && m.file.name === 'r.bin' && m.file.state === 'done' && m.file.blob.size === 300000))));

// 4. invalid inputs
o = await cli(pA, 'ice add http://evil.example'); check('non-ICE URL rejected', !o.ok, o.out);
o = await cli(pA, 'ice add turn:1.2.3.4:3478'); check('TURN without credentials rejected', !o.ok, o.out);

check('no page errors', errs.length === 0, errs.slice(0, 3).join(' || '));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
await browser.close(); process.exit(failed ? 1 : 0);
