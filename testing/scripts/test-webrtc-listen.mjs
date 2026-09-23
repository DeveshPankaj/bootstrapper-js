// Listen Together: shared synced playback in a group, from a VFS file or a local upload,
// per-user local mute, "now playing" header, anyone can control, stop for everyone.
import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103, URL = `http://localhost:${PORT}`, SHOT = 'testing/screenshots';
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (_) {} await sleep(300); } return false; }
async function boot(page) { await page.goto(URL); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(9000); }
async function appFrame(page, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { for (const fr of page.frames()) { try { if (await fr.locator('#me-name').count() && await fr.evaluate(() => !!window.__webrtcApp)) return fr; } catch (_) {} } await sleep(400); }
  throw new Error('webrtc app frame not found');
}
const cli = (page, cmd) => page.evaluate((c) => window.platform.host.getCommand('webrtc.api').exec(...c.split(' ')), cmd);

const browser = await chromium.launch();
const pA = await (await browser.newContext()).newPage(), pB = await (await browser.newContext()).newPage(), pC = await (await browser.newContext()).newPage();
const errs = []; for (const [n, p] of [['A', pA], ['B', pB], ['C', pC]]) p.on('pageerror', e => errs.push(`${n}: ${e.message}`));
await boot(pA);
await pA.evaluate(() => window.platform.host.execCommand("service('001-core.layout','open-window') (command('ui.webrtc'))", window.platform));
const fA = await appFrame(pA);

// connect Bob and Carol to Alice (mesh connects them to each other too)
async function connect(pX, name) {
  const inv = await fA.evaluate(async () => (await window.__webrtcApp.createInvite('Alice')).link);
  await pX.goto(inv);
  const fX = await appFrame(pX, 40000);
  await waitFor(() => fX.evaluate(() => window.__webrtcApp.joins.size === 1));
  const ans = await fX.evaluate(async (nm) => { const j = [...window.__webrtcApp.joins.values()][0]; await window.__webrtcApp.generateAnswer(j, nm); return j.link; }, name);
  await fA.evaluate((l) => window.__webrtcApp.handleIncomingCode(l), ans);
  await fX.evaluate(() => document.querySelectorAll('.modal-head button').forEach(b => b.click()));
  return fX;
}
const fB = await connect(pB, 'Bob');
await waitFor(() => fA.evaluate(() => window.__webrtcApp.peers.size === 1), 20000);
const fC = await connect(pC, 'Carol');
await waitFor(() => fA.evaluate(() => window.__webrtcApp.peers.size === 2), 20000);
await waitFor(() => fB.evaluate(() => window.__webrtcApp.peers.size === 2), 20000);   // mesh: Bob<->Carol
await fA.evaluate(() => document.querySelectorAll('.modal-head button').forEach(b => b.click()));

// group with all three
const bId = await fA.evaluate(() => [...window.__webrtcApp.peers.values()].find(p => p.name === 'Bob').id);
const cId = await fA.evaluate(() => [...window.__webrtcApp.peers.values()].find(p => p.name === 'Carol').id);
const gid = await fA.evaluate(({ b, c }) => window.__webrtcApp.createGroup('Jam', [b, c]).gid, { b: bId, c: cId });
await waitFor(() => fB.evaluate(() => [...window.__webrtcApp.groups.values()].length === 1));
await waitFor(() => fC.evaluate(() => [...window.__webrtcApp.groups.values()].length === 1));
// everyone switch to the group so the "now playing" header is visible
for (const fr of [fA, fB, fC]) await fr.evaluate(() => { const item = [...document.querySelectorAll('#chat-list .item')].find(el => el.textContent.includes('Jam')); if (item) item.click(); });

check('before starting: "Listen together" button shown in header', await fA.locator('#now-playing button:has-text("Listen together")').count().then(n => n > 0));

// a short synthetic wav (silence) so <audio> has real duration/metadata
const wavBase64 = 'UklGRjIAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQwAAACAgICAgICAgICAgIA=';
await fA.evaluate(async (b64) => {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const B = window.top.Buffer || window.Buffer;
  window.platform.host.getFS().writeFileSync('/home/user1/jam.wav', B ? B.from(bytes) : bytes);
}, wavBase64);

let o = await cli(pA, 'listen #Jam /home/user1/jam.wav');
check('cli listen starts a session', o.ok, o.out);
check('B receives the track and it becomes ready', await waitFor(() => fB.evaluate(() => { const s = window.__webrtcApp.listenSessions.get([...window.__webrtcApp.groups.keys()][0]); return s && s.ready; })));
check('C receives the track and it becomes ready', await waitFor(() => fC.evaluate(() => { const s = window.__webrtcApp.listenSessions.get([...window.__webrtcApp.groups.keys()][0]); return s && s.ready; })));
check('A now-playing header shows the track name', await fA.locator('#now-playing').textContent().then(t => t.includes('jam.wav')));
check('B now-playing header shows the track name too', await fB.locator('#now-playing').textContent().then(t => t.includes('jam.wav')));
await pA.screenshot({ path: `${SHOT}/webrtc-listen-together.png` });

// playback state: A is playing, B/C should be playing too (not paused)
check('A is playing', await fA.evaluate(() => { const s = [...window.__webrtcApp.listenSessions.values()][0]; return s.status === 'playing'; }));
check('B mirrors playing state', await waitFor(() => fB.evaluate(() => { const s = [...window.__webrtcApp.listenSessions.values()][0]; return s.status === 'playing'; })));

// Bob (not the originator) can pause — everyone including Alice reflects it
await fB.evaluate(() => { const s = [...window.__webrtcApp.listenSessions.values()][0]; window.__webrtcApp.listenTogglePlay(s); });
check('Bob (non-originator) pausing propagates to Alice', await waitFor(() => fA.evaluate(() => [...window.__webrtcApp.listenSessions.values()][0].status === 'paused')));
check('...and to Carol too', await waitFor(() => fC.evaluate(() => [...window.__webrtcApp.listenSessions.values()][0].status === 'paused')));

// Carol seeks — position propagates
await fC.evaluate(() => { const s = [...window.__webrtcApp.listenSessions.values()][0]; window.__webrtcApp.listenSeek(s, 0.05 * 1000); });
check('Carol seeking propagates position to Alice', await waitFor(() => fA.evaluate(() => Math.abs([...window.__webrtcApp.listenSessions.values()][0].posMs - 50) < 5)));

// per-user mute is local only — muting on Bob must not affect Alice/Carol's mute state
await fB.evaluate(() => { const s = [...window.__webrtcApp.listenSessions.values()][0]; window.__webrtcApp.listenToggleMute(s); });
check('Bob muted locally', await fB.evaluate(() => [...window.__webrtcApp.listenSessions.values()][0].muted === true));
check("Bob's mute did not affect Alice", await fA.evaluate(() => [...window.__webrtcApp.listenSessions.values()][0].muted === false));
check("Bob's mute did not affect Carol", await fC.evaluate(() => [...window.__webrtcApp.listenSessions.values()][0].muted === false));

// stop for everyone
o = await cli(pA, 'listen-stop #Jam');
check('cli listen-stop works', o.ok, o.out);
check('session gone on Bob', await waitFor(() => fB.evaluate(() => window.__webrtcApp.listenSessions.size === 0)));
check('session gone on Carol', await waitFor(() => fC.evaluate(() => window.__webrtcApp.listenSessions.size === 0)));
check('header reverts to "Listen together" button', await waitFor(() => fA.locator('#now-playing button:has-text("Listen together")').count().then(n => n > 0)));

// error paths
o = await cli(pA, 'listen #NoSuchGroup /home/user1/jam.wav'); check('cli errors on unknown group', !o.ok, o.out);
o = await cli(pA, 'listen-stop #Jam'); check('cli errors stopping when nothing is playing', !o.ok, o.out);

// UI flow: pick from VFS via the picker button
await fA.locator('#now-playing button:has-text("Listen together")').click({ force: true });
await fA.locator('.modal button:has-text("From Files")').click({ force: true });
await fA.waitForTimeout(300);
await fA.locator('.li.click:has-text("jam.wav")').click({ force: true });
check('UI picker starts a session', await waitFor(() => fA.evaluate(() => window.__webrtcApp.listenSessions.size === 1)));
check('B receives it via the UI-started session too', await waitFor(() => fB.evaluate(() => { const s = [...window.__webrtcApp.listenSessions.values()][0]; return s && s.ready; })));
// clicking play/pause in the actual header UI
await fA.locator('#now-playing button[title="Pause"], #now-playing button[title="Play"]').first().click({ force: true });
await pA.screenshot({ path: `${SHOT}/webrtc-listen-controls.png` });
check('no page errors', errs.length === 0, errs.slice(0, 5).join(' || '));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
await browser.close(); process.exit(failed ? 1 : 0);
