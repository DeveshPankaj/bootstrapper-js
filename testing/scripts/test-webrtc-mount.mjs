// WebRTC remote-folder mounts: FS.mount/umount kernel API, live clone into /mnt/webrtc,
// editing via the REAL file explorer + notepad, bidirectional sync, ro enforcement, CLI.
import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103, URL = `http://localhost:${PORT}`, SHOT = 'testing/screenshots';
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (_) {} await sleep(300); } return false; }
async function boot(page) { await page.goto(URL); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(9000); }
async function appFrame(page, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { for (const fr of page.frames()) { try { if (await fr.locator('#me-name').count() && await fr.evaluate(() => !!window.__webrtcApp)) return fr; } catch (_) {} } await sleep(400); }
  throw new Error('webrtc app frame not found');
}
async function explorerFrame(page, text, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { for (const fr of page.frames()) { try { if (await fr.locator(`text=${text}`).count()) return fr; } catch (_) {} } await sleep(300); }
  throw new Error('explorer frame with "' + text + '" not found');
}
const cli = (page, cmd) => page.evaluate((c) => window.platform.host.getCommand('webrtc.api').exec(...c.split(' ')), cmd);
const connectMesh = async (pA, pB, fA, fB) => {
  const inv = await fA.evaluate(async () => (await window.__webrtcApp.createInvite('Alice')).link);
  await pB.goto(inv);
  let fresh; try { fresh = await appFrame(pB, 40000); } catch (e) { console.log('B url', pB.url(), 'wins', await pB.evaluate(() => document.querySelectorAll('.window').length).catch(()=>'-')); throw e; }
  await waitFor(() => fresh.evaluate(() => window.__webrtcApp.joins.size === 1));
  const ans = await fresh.evaluate(async () => { const j = [...window.__webrtcApp.joins.values()][0]; await window.__webrtcApp.generateAnswer(j, 'Bob'); return j.link; });
  await fA.evaluate((l) => window.__webrtcApp.handleIncomingCode(l), ans);
  await waitFor(() => fA.evaluate(() => window.__webrtcApp.peers.size === 1), 30000);
  return fresh;
};

const browser = await chromium.launch();
const pA = await (await browser.newContext()).newPage(), pB = await (await browser.newContext()).newPage();
const errs = []; pA.on('pageerror', e => errs.push('A ' + e.message)); pB.on('pageerror', e => errs.push('B ' + e.message));
await boot(pA);
await pA.evaluate(() => window.platform.host.execCommand("service('001-core.layout','open-window') (command('ui.webrtc'))", window.platform));
const fA = await appFrame(pA);
const fB = await connectMesh(pA, pB, fA, null);

// ── Alice shares a folder, grants Bob rw ──
await fA.evaluate(() => {
  const fs = window.platform.host.getFS();
  for (const d of ['/home/user1/mnt-share', '/home/user1/mnt-share/docs']) { try { fs.mkdirSync(d); } catch (_) {} }
  fs.writeFileSync('/home/user1/mnt-share/readme.txt', 'original content');
  fs.writeFileSync('/home/user1/mnt-share/docs/inner.txt', 'inner original');
});
const share = await fA.evaluate(() => window.__webrtcApp.addShare('/home/user1/mnt-share', 'mnt-proj', 'rw'));
const bId = await fA.evaluate(() => [...window.__webrtcApp.peers.values()][0].id);
await fA.evaluate(({ b, sid }) => { const app = window.__webrtcApp; app.setGrant(app.peers.get(b), app.shares.get(sid), 'rw'); }, { b: bId, sid: share.id });
await waitFor(() => fB.evaluate(() => (window.__webrtcApp.peers.get([...window.__webrtcApp.peers.keys()][0]) || {}).remoteShares?.length === 1));

// ── kernel FS.mount/umount sanity (independent of the webrtc feature) ──
const kernelOk = await pB.evaluate(async () => {
  const fs = window.platform.host.getFS();
  if (typeof fs.mount !== 'function' || typeof fs.umount !== 'function' || typeof fs.createBackend !== 'function') return 'missing kernel API';
  const backend = await fs.createBackend('InMemory', {});
  fs.mount('/mnt/__kerneltest__', backend);
  fs.writeFileSync('/mnt/__kerneltest__/x.txt', 'hi');
  const ok = fs.readFileSync('/mnt/__kerneltest__/x.txt', 'utf8') === 'hi' && fs.readdirSync('/mnt').includes('__kerneltest__');
  fs.umount('/mnt/__kerneltest__');
  return ok && !fs.readdirSync('/mnt').includes('__kerneltest__') ? 'ok' : 'mismatch';
});
check('kernel FS.mount/createBackend/umount round-trip', kernelOk === 'ok', kernelOk);

// ── Bob mounts Alice's share via the CLI ──
let o = await cli(pB, `mount Alice ${share.name}`);
check('cli mount succeeds', o.ok, o.out);
const mountPath = await fB.evaluate(() => [...window.__webrtcApp.mounts.values()][0].path);
check('mount path under /mnt/webrtc', mountPath.startsWith('/mnt/webrtc/'), mountPath);
check('remote tree cloned locally immediately', await pB.evaluate((p) => window.platform.host.getFS().readFileSync(p + '/readme.txt', 'utf8'), mountPath) === 'original content');
check('nested dir cloned', await pB.evaluate((p) => window.platform.host.getFS().readFileSync(p + '/docs/inner.txt', 'utf8'), mountPath) === 'inner original');

// ── Bob browses it with the REAL file explorer (not a webrtc-specific dialog) ──
await pB.evaluate((p) => window.platform.host.execCommand("service('001-core.layout','open-window')(command('explorer'), $args[0])", window.platform, p), mountPath);
const fExp = await explorerFrame(pB, 'readme.txt');
check('real file explorer lists the mounted remote file', true);
await pB.screenshot({ path: `${SHOT}/webrtc-mount-explorer.png` });

// ── Edit via the real file explorer's Edit action → Notepad → Save (direct remote edit) ──
await fExp.locator('.file-item:has-text("readme.txt")').first().click({ button: 'right', force: true }).catch(() => {});
await pB.waitForTimeout(300);
let editedViaMenu = false;
try {
  // Context menus render at the top level (LayoutShell's .contextmenu), not inside the explorer's own iframe.
  const menuItem = pB.locator('.contextmenu :text("Edit")').first();
  if (await menuItem.count()) { await menuItem.click({ force: true, timeout: 5000 }); editedViaMenu = true; }
} catch (_) {}
if (!editedViaMenu) {
  // Fall back to double-click (explorer's default open action for .txt is typically the editor too).
  await fExp.locator('.file-item:has-text("readme.txt")').first().dblclick({ force: true });
}
await pB.waitForTimeout(500);
let fNote = null;
for (let i = 0; i < 20 && !fNote; i++) { for (const fr of pB.frames()) { if (fr === fB || fr.url().includes('webrtc/main.html')) continue; try { if (await fr.locator('textarea, [contenteditable]').count()) fNote = fr; } catch (_) {} } if (!fNote) await pB.waitForTimeout(500); }
check('notepad (or equivalent editor) opened on the mounted file', !!fNote);
if (fNote) {
  const box = fNote.locator('.cm-content, textarea, [contenteditable]').first();
  await box.click({ force: true });
  await box.press('Control+a');
  await box.pressSequentially('edited by bob via notepad');
  const saveBtn = fNote.locator('[aria-label="save"], [title="save"]').first();
  if (await saveBtn.count()) await saveBtn.click({ force: true });
  await pB.waitForTimeout(500);
}
check('edit saved locally in the mount', await waitFor(() => pB.evaluate((p) => window.platform.host.getFS().readFileSync(p + '/readme.txt', 'utf8').includes('edited by bob'), mountPath)));
await pB.screenshot({ path: `${SHOT}/webrtc-mount-edit.png` });

// ── the edit propagates to Alice's real local file (push side of the sync loop) ──
check('edit propagated to the owner (Alice) real file', await waitFor(() => fA.evaluate(() => window.platform.host.getFS().readFileSync('/home/user1/mnt-share/readme.txt', 'utf8').includes('edited by bob')), 12000));

// ── new file created inside the mount propagates too ──
await pB.evaluate((p) => window.platform.host.getFS().writeFileSync(p + '/new-from-bob.txt', 'brand new'), mountPath);
check('new file pushed to owner', await waitFor(() => fA.evaluate(() => window.platform.host.getFS().existsSync('/home/user1/mnt-share/new-from-bob.txt') && window.platform.host.getFS().readFileSync('/home/user1/mnt-share/new-from-bob.txt', 'utf8') === 'brand new'), 12000));

// ── deleting inside the mount propagates ──
await pB.evaluate((p) => window.platform.host.getFS().unlinkSync(p + '/docs/inner.txt'), mountPath);
check('delete pushed to owner', await waitFor(() => fA.evaluate(() => !window.platform.host.getFS().existsSync('/home/user1/mnt-share/docs/inner.txt')), 12000));

// ── owner-side change pulls down into the mount (directory traversal both ways) ──
await fA.evaluate(() => { const fs = window.platform.host.getFS(); fs.mkdirSync('/home/user1/mnt-share/from-alice'); fs.writeFileSync('/home/user1/mnt-share/from-alice/hi.txt', 'from alice'); });
check('remote-created file+dir pulled into the mount (traversal)', await waitFor(() => pB.evaluate((p) => { const fs = window.platform.host.getFS(); return fs.existsSync(p + '/from-alice/hi.txt') && fs.readFileSync(p + '/from-alice/hi.txt', 'utf8') === 'from alice'; }, mountPath), 15000));

// ── file icon reused from local convention: same extIconMap-driven icon as a normal .txt ──
await pB.evaluate((p) => window.platform.host.execCommand("service('001-core.layout','open-window')(command('explorer'), $args[0])", window.platform, p), mountPath);
const fExp2 = await explorerFrame(pB, 'from-alice');
const iconInfo = await fExp2.evaluate(() => [...document.querySelectorAll('.file-item .file')].map(el => ({ ext: el.dataset.ext, bg: el.style.backgroundImage })));
check('mounted files render local file-type icons (not a generic placeholder)', iconInfo.length > 0 && iconInfo.every(x => x.bg && x.bg !== "url('')"), JSON.stringify(iconInfo.slice(0, 6)));

// ── CLI: mounts / unmount / sync ──
o = await cli(pB, 'mounts'); check('cli mounts lists it', o.out.includes(mountPath), o.out.replace(/\n/g, ' | '));
o = await cli(pB, `sync ${mountPath.split('/').pop()}`); check('cli sync by path suffix', o.ok, o.out);
o = await cli(pB, 'mount Alice mnt-proj'); check('mounting an already-mounted share is a no-op, not an error', o.ok && o.out.includes(mountPath), o.out);

// ── /proc/<pid> introspection ──
const procJson = await fB.evaluate(() => { try { const app = window.__webrtcApp; const fs = window.platform.host.getFS(); return fs.existsSync(`/proc/${app.myPid}/webrtc-mounts.json`) ? fs.readFileSync(`/proc/${app.myPid}/webrtc-mounts.json`, 'utf8') : null; } catch (e) { return 'ERR ' + e.message; } });
check('/proc/<pid>/webrtc-mounts.json reflects the mount', !!procJson && procJson.includes(mountPath), String(procJson).slice(0, 200));

// ── read-only mount: local writes are refused immediately, not silently dropped ──
await cli(pB, `unmount ${mountPath.split('/').pop()}`);
await fA.evaluate(({ b, sid }) => { const app = window.__webrtcApp; app.shares.get(sid).mode = 'ro'; app.setGrant(app.peers.get(b), app.shares.get(sid), 'ro'); }, { b: bId, sid: share.id });
await waitFor(() => fB.evaluate(() => [...window.__webrtcApp.peers.values()][0].remoteShares[0]?.mode === 'ro'));
o = await cli(pB, `mount Alice ${share.name}`);
const roPath = o.out.match(/mounted at (\S+)/)?.[1];
check('ro mount reported as read-only', /read-only/.test(o.out), o.out);
const roWriteErr = await pB.evaluate((p) => { try { window.platform.host.getFS().writeFileSync(p + '/hack.txt', 'nope'); return 'wrote ok (BUG)'; } catch (e) { return e.code || e.message; } }, roPath);
check('write into a read-only mount throws immediately (EROFS)', roWriteErr === 'EROFS' || /read-only|EROFS/i.test(roWriteErr), roWriteErr);
check('no phantom file left behind after the refused write', !(await pB.evaluate((p) => window.platform.host.getFS().existsSync(p + '/hack.txt'), roPath)));

// ── unmount removes it from the vfs entirely ──
o = await cli(pB, `unmount ${roPath.split('/').pop()}`); check('cli unmount', o.ok, o.out);
check('path gone from /mnt/webrtc after unmount', !(await pB.evaluate((p) => window.platform.host.getFS().existsSync(p), roPath)));

check('no page errors', errs.length === 0, errs.slice(0, 5).join(' || '));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
await browser.close(); process.exit(failed ? 1 : 0);
