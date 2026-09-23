// E2E for the WebRTC Chat app: link flows, cross-tab handoff, mesh, chat/group/DM,
// file + image preview, VFS sharing (ro/rw + traversal), CLI (/bin/webrtc.run + webrtc.api).
import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103;
const URL = `http://localhost:${PORT}`;
const SHOT = 'testing/screenshots';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function boot(page, hash = '') {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL + hash);
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'load' });   // 2nd reload consumes/keeps the hash? re-add below
  await page.waitForTimeout(3000);
  return errors;
}
async function bootClean(page) {
  await page.goto(URL); await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(9000);
}
async function appFrame(page, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const fr of page.frames()) { try { if (await fr.locator('#me-name').count() > 0 && await fr.evaluate(() => !!window.__webrtcApp)) return fr; } catch (_) {} }
    await sleep(500);
  }
  throw new Error('webrtc app frame not found');
}
async function openApp(page) {
  await page.evaluate(() => window.platform.host.execCommand("service('001-core.layout','open-window') (command('ui.webrtc'))", window.platform));
  return appFrame(page);
}
async function waitFor(fn, ms = 20000, step = 300) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (_) {} await sleep(step); } return false; }

(async () => {
  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const ctxB = await browser.newContext();
  const ctxC = await browser.newContext();
  const pA = await ctxA.newPage(), pB = await ctxB.newPage(), pC = await ctxC.newPage();
  const errs = [];
  for (const [n, p] of [['A', pA], ['B', pB], ['C', pC]]) p.on('pageerror', e => errs.push(`${n}: ${e.message}`));

  await bootClean(pA);
  const fA = await openApp(pA);
  check('app opens, command registered', await pA.evaluate(() => !!window.platform.host.getCommand('webrtc.api')));

  // ── A creates an invite (with a name) via the UI ──
  await fA.locator('text=Invite').first().click({ force: true });
  await fA.locator('.modal input[maxlength="40"]').first().fill('Alice');
  await fA.locator('button:has-text("Generate invite link")').click({ force: true });
  check('invite link generated', await waitFor(() => fA.evaluate(() => [...window.__webrtcApp.invites.values()].some(i => i.link))));
  const inv1 = await fA.evaluate(() => { const i = [...window.__webrtcApp.invites.values()][0]; return { link: i.link, id: i.id }; });
  check('link is a hash deep link with params', /#open=ui\.webrtc&app=webrtc&arg=wrtc[01]\./.test(inv1.link), inv1.link.slice(0, 90));
  check('A name saved', (await fA.evaluate(() => window.__webrtcApp.settings.name)) === 'Alice');
  await fA.locator('.modal button:has-text("Copy")').first().click({ force: true });
  check('copy button puts link on clipboard', (await pA.evaluate(() => navigator.clipboard.readText()).catch(() => '')) === inv1.link);
  await pA.screenshot({ path: `${SHOT}/webrtc-invite.png` });

  // ── B opens the link in a fresh tab → app opens with the offer ──
  await pB.goto(inv1.link);
  const fB = await appFrame(pB, 40000);
  check('B: link opened app and parsed the offer', await waitFor(() => fB.evaluate(() => window.__webrtcApp.joins.size === 1)));
  check('B: hash consumed from URL', !(await pB.evaluate(() => location.hash)));
  await fB.locator('.modal .card input[maxlength="40"]').first().fill('Bob');
  await fB.locator('button:has-text("Generate answer link")').click({ force: true });
  check('B: answer generated', await waitFor(() => fB.evaluate(() => [...window.__webrtcApp.joins.values()].some(j => j.link))));
  const ans1 = await fB.evaluate(() => [...window.__webrtcApp.joins.values()][0].link);
  await pB.screenshot({ path: `${SHOT}/webrtc-answer.png` });

  // ── answer link opened in a NEW TAB of A's browser → must hand off to A's existing tab ──
  const pA2 = await ctxA.newPage();
  await pA2.goto(ans1);
  check('A: answer delivered to existing tab (handoff) and connected', await waitFor(() => fA.evaluate(() => window.__webrtcApp.peers.size === 1), 30000));
  const notice = await waitFor(() => pA2.evaluate(() => document.body.innerText.includes('other tab')).catch(() => true), 5000);
  check('A2: new tab shows handoff notice / closed', notice);
  await pA2.close().catch(() => {});
  check('B: connected to Alice', await waitFor(() => fB.evaluate(() => [...window.__webrtcApp.peers.values()].some(p => p.name === 'Alice'))));

  // ── C joins via a second invite, answer pasted into the "Accept answer" box ──
  const inv2 = await fA.evaluate(async () => (await window.__webrtcApp.createInvite('Alice')).link);
  await pC.goto(inv2);
  let fC; try { fC = await appFrame(pC, 40000); } catch (e) { await pC.screenshot({ path: `${SHOT}/webrtc-c-fail.png` }); console.log('C url', pC.url(), 'hash', await pC.evaluate(() => location.hash.slice(0, 40)), 'wins', await pC.evaluate(() => document.querySelectorAll('.window').length), 'errs', errs.slice(-3)); throw e; }
  await waitFor(() => fC.evaluate(() => window.__webrtcApp.joins.size === 1));
  await fC.locator('.modal .card input[maxlength="40"]').first().fill('Carol');
  await fC.locator('button:has-text("Generate answer link")').click({ force: true });
  await waitFor(() => fC.evaluate(() => [...window.__webrtcApp.joins.values()].some(j => j.link)));
  const ans2 = await fC.evaluate(() => [...window.__webrtcApp.joins.values()][0].link);
  // paste into the input of the open invite card in A's modal
  await fA.evaluate(() => { document.querySelectorAll('.modal-head button').forEach(b => b.click()); });
  await fA.locator('text=Invite').first().click({ force: true });
  await fA.locator('.modal input[placeholder="Paste answer link or code"]').first().fill(ans2);
  await fA.locator('.modal button:has-text("Accept answer")').first().click({ force: true });
  check('A: pasted answer accepted → 2 peers', await waitFor(() => fA.evaluate(() => window.__webrtcApp.peers.size === 2), 30000));
  check('mesh: Bob and Carol auto-connected', await waitFor(() => fB.evaluate(() => [...window.__webrtcApp.peers.values()].some(p => p.name === 'Carol')), 40000));
  check('mesh: Carol sees Bob', await fC.evaluate(() => [...window.__webrtcApp.peers.values()].some(p => p.name === 'Bob')));
  check('mesh: id-collision guard — exactly 2 peers on B', (await fB.evaluate(() => window.__webrtcApp.peers.size)) === 2);
  // hardening: a bad code is rejected
  const bad = await fA.evaluate(async () => { try { await window.__webrtcApp.handleIncomingCode('wrtc1.AAAA'); return 'accepted'; } catch (e) { return e.message; } });
  check('garbage code rejected', bad !== 'accepted', bad);

  // ── chat ──
  await fA.evaluate(() => document.querySelectorAll('.modal-head button').forEach(b => b.click()));
  await fA.evaluate(() => window.__webrtcApp.sendText('all', 'hello everyone'));
  check('broadcast reaches B and C', await waitFor(async () => (await fB.evaluate(() => window.__webrtcApp.convs.get('all').messages.some(m => m.text === 'hello everyone'))) && (await fC.evaluate(() => window.__webrtcApp.convs.get('all').messages.some(m => m.text === 'hello everyone')))));
  const bId = await fA.evaluate(() => [...window.__webrtcApp.peers.values()].find(p => p.name === 'Bob').id);
  const cId = await fA.evaluate(() => [...window.__webrtcApp.peers.values()].find(p => p.name === 'Carol').id);
  const aId = await fA.evaluate(() => window.__webrtcApp.myId);
  // DM B → C (over the mesh link)
  await fB.evaluate((cid) => window.__webrtcApp.sendText('dm:' + cid, 'psst carol'), cId);
  check('DM B→C delivered to C only', await waitFor(() => fC.evaluate((bid) => (window.__webrtcApp.convs.get('dm:' + bid) || { messages: [] }).messages.some(m => m.text === 'psst carol'), bId)));
  check('DM not visible on A', !(await fA.evaluate(() => [...window.__webrtcApp.convs.values()].some(c => c.messages.some(m => m.text === 'psst carol')))));
  // group A + B (C excluded)
  await fA.evaluate((b) => window.__webrtcApp.createGroup('Duo', [b]), bId);
  await fA.evaluate(() => window.__webrtcApp.sendText([...window.__webrtcApp.convs.keys()].find(k => k.startsWith('g:')), 'group hi'));
  check('group msg reaches B', await waitFor(() => fB.evaluate(() => [...window.__webrtcApp.convs.values()].some(c => c.kind === 'group' && c.messages.some(m => m.text === 'group hi')))));
  check('group msg NOT on C', !(await fC.evaluate(() => [...window.__webrtcApp.convs.values()].some(c => c.messages.some(m => m.text === 'group hi')))));
  // forged group message from non-member C → B ignores
  await fC.evaluate((gidKeyless) => { const app = window.__webrtcApp; const b = [...app.peers.values()].find(p => p.name === 'Bob'); const gid = 'aaaaaaaaaaaa'; b.conn.dc.send(JSON.stringify({ t: 'msg', mid: 'x', c: { k: 'group', gid }, text: 'forged' })); }, 0);
  await sleep(500);
  check('forged group msg ignored', !(await fB.evaluate(() => [...window.__webrtcApp.convs.values()].some(c => c.messages.some(m => m.text === 'forged')))));

  // ── file + image preview ──
  await fA.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 40; c.height = 30; const x = c.getContext('2d'); x.fillStyle = '#e33'; x.fillRect(0, 0, 40, 30);
    return new Promise(res => c.toBlob(b => { const f = new File([b], 'red.png', { type: 'image/png' }); window.__webrtcApp.sendFilesTo('all', [f]).then(res); }, 'image/png'));
  });
  await fA.evaluate(() => window.__webrtcApp.sendFilesTo('all', [new File([new Uint8Array(200000).fill(7)], 'blob.bin', { type: 'application/x-foo' })]));
  check('B received image (state done)', await waitFor(() => fB.evaluate(() => window.__webrtcApp.convs.get('all').messages.some(m => m.file && m.file.name === 'red.png' && m.file.state === 'done'))));
  check('C received 200KB file with correct size', await waitFor(() => fC.evaluate(() => window.__webrtcApp.convs.get('all').messages.some(m => m.file && m.file.name === 'blob.bin' && m.file.state === 'done' && m.file.blob.size === 200000))));
  await fB.evaluate(() => { document.querySelector('#chat-list .item').click(); });   // select "Everyone"
  check('B shows <img> preview for the image', await waitFor(() => fB.evaluate(() => !!document.querySelector('#messages img.preview'))));
  await pB.screenshot({ path: `${SHOT}/webrtc-chat.png` });

  // ── VFS sharing ──
  await fA.evaluate(() => {
    const fs = window.platform.host.getFS();
    for (const d of ['/home/user1/wrtc-share', '/home/user1/wrtc-share/sub']) { try { fs.mkdirSync(d); } catch (_) {} }
    fs.writeFileSync('/home/user1/wrtc-share/hello.txt', 'hello from A');
    fs.writeFileSync('/home/user1/wrtc-share/sub/inner.txt', 'inner');
    fs.writeFileSync('/home/user1/secret.txt', 'TOP SECRET');
    try { fs.unlinkSync('/home/user1/wrtc-share/evil'); } catch (_) {}
    try { fs.symlinkSync('/home/user1/secret.txt', '/home/user1/wrtc-share/evil'); } catch (e) { window.__symErr = String(e); }
  });
  const share = await fA.evaluate(() => window.__webrtcApp.addShare('/home/user1/wrtc-share', 'proj', 'ro'));
  check('share is read-only, nobody has access by default', share.mode === 'ro');
  const rq = (f, peerName, op, path, extra) => f.evaluate(async ({ peerName, sid, op, path, extra }) => {
    const app = window.__webrtcApp; const peer = [...app.peers.values()].find(p => p.name === peerName);
    try { const r = await app.vfsCall(peer, { id: sid }, op, path, extra); return { ok: true, res: r.res }; } catch (e) { return { ok: false, err: e.message }; }
  }, { peerName, sid: share.id, op, path, extra });
  let r = await rq(fB, 'Alice', 'list', '');
  check('no grant → access denied', !r.ok && /denied/.test(r.err), r.err);
  await fA.evaluate(({ b, sid }) => { const app = window.__webrtcApp; app.setGrant(app.peers.get(b), app.shares.get(sid), 'ro'); }, { b: bId, sid: share.id });
  await waitFor(() => fB.evaluate(() => [...window.__webrtcApp.peers.values()].find(p => p.name === 'Alice').remoteShares.length === 1));
  r = await rq(fB, 'Alice', 'list', '');
  check('grant ro → list works, symlink hidden', r.ok && r.res.entries.some(e => e.n === 'hello.txt') && !r.res.entries.some(e => e.n === 'evil'), JSON.stringify(r.res && r.res.entries.map(e => e.n)));
  const dl = await fB.evaluate(async (sid) => { const app = window.__webrtcApp; const p = [...app.peers.values()].find(x => x.name === 'Alice'); const f = await app.vfsDownload(p, { id: sid }, 'hello.txt'); return await f.blob.text(); }, share.id);
  check('ro download works', dl === 'hello from A', dl);
  r = await rq(fB, 'Alice', 'list', '../');
  check('traversal "../" denied', !r.ok, r.err);
  r = await rq(fB, 'Alice', 'list', 'sub/../../');
  check('traversal "sub/../../" denied', !r.ok, r.err);
  const sl = await fB.evaluate(async (sid) => { const app = window.__webrtcApp; const p = [...app.peers.values()].find(x => x.name === 'Alice'); try { const f = await app.vfsDownload(p, { id: sid }, 'evil'); return 'LEAK:' + await f.blob.text(); } catch (e) { return 'blocked: ' + e.message; } }, share.id);
  console.log('note: symlink creation in this fs ->', await fA.evaluate(() => window.__symErr || 'created'), '(link traversal check is defense-in-depth)');
  check('symlink to outside file blocked', sl.startsWith('blocked'), sl);
  r = await rq(fB, 'Alice', 'mkdir', 'newdir');
  check('ro: write op refused', !r.ok && /read-only/.test(r.err), r.err);
  r = await rq(fC, 'Alice', 'list', '');
  check('other peer (no grant) still denied', !r.ok, r.err);
  // ceiling: grant rw on a ro share stays ro
  await fA.evaluate(({ b, sid }) => { const app = window.__webrtcApp; app.setGrant(app.peers.get(b), app.shares.get(sid), 'rw'); }, { b: bId, sid: share.id });
  r = await rq(fB, 'Alice', 'mkdir', 'newdir');
  check('grant rw on ro share still refused (ceiling)', !r.ok, r.err);
  // raise ceiling to rw
  await fA.evaluate((sid) => window.__webrtcApp.shares.get(sid).mode = 'rw', share.id);
  r = await rq(fB, 'Alice', 'mkdir', 'newdir');
  check('ceiling rw + grant rw → mkdir works', r.ok, r.err);
  const up = await fB.evaluate(async (sid) => { const app = window.__webrtcApp; const p = [...app.peers.values()].find(x => x.name === 'Alice'); try { await app.vfsUpload(p, { id: sid }, 'newdir/up.txt', new File(['uploaded'], 'up.txt')); return 'ok'; } catch (e) { return e.message; } }, share.id);
  check('rw upload works', up === 'ok', up);
  check('uploaded file in A\'s vfs', await fA.evaluate(() => window.platform.host.getFS().readFileSync('/home/user1/wrtc-share/newdir/up.txt', 'utf8')) === 'uploaded');
  const trav = await fB.evaluate(async (sid) => { const app = window.__webrtcApp; const p = [...app.peers.values()].find(x => x.name === 'Alice'); try { await app.vfsUpload(p, { id: sid }, '../pwn.txt', new File(['x'], 'pwn.txt')); return 'ok'; } catch (e) { return e.message; } }, share.id);
  check('upload traversal refused', trav !== 'ok' && !(await fA.evaluate(() => window.platform.host.getFS().existsSync('/home/user1/pwn.txt'))), trav);
  // revoke via grant to null → denied
  await fA.evaluate(({ b, sid }) => { const app = window.__webrtcApp; app.setGrant(app.peers.get(b), app.shares.get(sid), null); }, { b: bId, sid: share.id });
  r = await rq(fB, 'Alice', 'list', '');
  check('revoked → denied again', !r.ok, r.err);
  // UI browse dialog
  await fA.evaluate(({ b, sid }) => { const app = window.__webrtcApp; app.setGrant(app.peers.get(b), app.shares.get(sid), 'rw'); }, { b: bId, sid: share.id });
  await waitFor(() => fB.evaluate(() => [...window.__webrtcApp.peers.values()].find(p => p.name === 'Alice').remoteShares.length === 1));
  await fB.locator('button:has-text("Folders")').first().click({ force: true });
  if (!(await fB.locator('.modal').count())) await fB.evaluate(() => document.querySelector('#side-foot button').click());
  await fB.locator('.modal button:has-text("Browse")').first().click({ force: true });
  check('B: browse dialog lists remote files', await waitFor(() => fB.locator('.modal .li:has-text("hello.txt")').count().then(n => n > 0)));
  await pB.screenshot({ path: `${SHOT}/webrtc-browse.png` });
  await fB.evaluate(() => document.querySelectorAll('.modal-head button').forEach(b => b.click()));
  await fA.locator('button:has-text("Folders")').click({ force: true });
  await pA.waitForTimeout(500);
  check('A: activity log recorded', await fA.evaluate(() => window.__webrtcApp.activity.length > 3));
  await pA.screenshot({ path: `${SHOT}/webrtc-shares.png` });
  await fA.evaluate(() => document.querySelectorAll('.modal-head button').forEach(b => b.click()));

  // ── CLI ──
  const runCli = (cmd) => pA.evaluate((c) => window.platform.host.getCommand('webrtc.api').exec(...c.split(' ')), cmd);
  let o = await runCli('users');
  check('cli users lists Bob and Carol', /Bob/.test(o.out) && /Carol/.test(o.out), o.out.replace(/\n/g, ' | '));
  o = await runCli('shares'); check('cli shares lists proj', /proj/.test(o.out) && /Bob:rw/.test(o.out), o.out.replace(/\n/g, ' | '));
  o = await runCli('grant Bob proj ro'); check('cli grant', o.ok, o.out);
  r = await rq(fB, 'Alice', 'mkdir', 'x2'); check('cli grant ro → B cannot write', !r.ok, r.err);
  o = await runCli('revoke Bob proj'); r = await rq(fB, 'Alice', 'list', ''); check('cli revoke → B denied', !r.ok, r.err);
  o = await runCli('access Carol chat off'); check('cli access chat off', o.ok, o.out);
  await fC.evaluate(() => window.__webrtcApp.sendText('all', 'muted?'));
  await sleep(600);
  check('muted user message dropped', !(await fA.evaluate(() => window.__webrtcApp.convs.get('all').messages.some(m => m.text === 'muted?'))));
  o = await runCli('say @Bob from-cli'); check('cli say → B receives', await waitFor(() => fB.evaluate(() => (window.__webrtcApp.convs.get('dm:' + [...window.__webrtcApp.peers.values()].find(p => p.name === 'Alice').id) || { messages: [] }).messages.some(m => m.text === 'from-cli'))), o.out);
  o = await runCli('kick Carol --ban');
  check('cli kick removes Carol from A', await waitFor(() => fA.evaluate(() => ![...window.__webrtcApp.peers.values()].some(p => p.name === 'Carol'))), o.out);
  check('kicked Carol sees disconnect', await waitFor(() => fC.evaluate(() => ![...window.__webrtcApp.peers.values()].some(p => p.name === 'Alice'))));
  o = await runCli('bogus'); check('cli unknown command reports error', !o.ok, o.out);
  o = await runCli('kick nobody'); check('cli unknown user reports error', !o.ok, o.out);
  // real .run script through the terminal command path
  const runOut = await pA.evaluate(async () => { const out = []; window.platform.registerService && 0; const t = { write: (s) => out.push(s) }; const orig = window.platform.getService; window.platform.getService = (n) => n === 'terminal' ? t : orig.call(window.platform, n); try { await window.platform.host.exec(window.platform, '/bin/webrtc.run', '/', 'users'); } catch (e) { out.push('ERR ' + e.message); } window.platform.getService = orig; return out.join(''); });
  check('/bin/webrtc.run executes', /Bob/.test(runOut), runOut.replace(/\r?\n/g, ' | ').slice(0, 200));

  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' || '));
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
