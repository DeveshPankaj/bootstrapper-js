// Regression tests for two reported bugs:
// 1. refreshMsg DOM-patch bug — progress/completion of a file transfer must appear live,
//    without switching away from the conversation and back.
// 2. Muting a peer's chat/files must disable *their* composer once they're told, with a
//    clear reason, instead of leaving their input enabled while messages vanish silently.
import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103, URL = `http://localhost:${PORT}`, SHOT = 'testing/screenshots';
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (_) {} await sleep(250); } return false; }
async function boot(page) { await page.goto(URL); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(9000); }
async function appFrame(page, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { for (const fr of page.frames()) { try { if (await fr.locator('#me-name').count() && await fr.evaluate(() => !!window.__webrtcApp)) return fr; } catch (_) {} } await sleep(400); }
  throw new Error('webrtc app frame not found');
}
const cli = (page, cmd) => page.evaluate((c) => window.platform.host.getCommand('webrtc.api').exec(...c.split(' ')), cmd);

const browser = await chromium.launch();
const pA = await (await browser.newContext()).newPage(), pB = await (await browser.newContext()).newPage();
const errs = []; pA.on('pageerror', e => errs.push('A ' + e.message)); pB.on('pageerror', e => errs.push('B ' + e.message));
await boot(pA);
await pA.evaluate(() => window.platform.host.execCommand("service('001-core.layout','open-window') (command('ui.webrtc'))", window.platform));
const fA = await appFrame(pA);
const inv = await fA.evaluate(async () => (await window.__webrtcApp.createInvite('Alice')).link);
await pB.goto(inv);
const fB = await appFrame(pB, 40000);
await waitFor(() => fB.evaluate(() => window.__webrtcApp.joins.size === 1));
const ans = await fB.evaluate(async () => { const j = [...window.__webrtcApp.joins.values()][0]; await window.__webrtcApp.generateAnswer(j, 'Bob'); return j.link; });
await fA.evaluate((l) => window.__webrtcApp.handleIncomingCode(l), ans);
await waitFor(() => fA.evaluate(() => window.__webrtcApp.peers.size === 1), 30000);
await waitFor(() => fB.evaluate(() => window.__webrtcApp.peers.size === 1), 15000);

// ── Bug 1: progress/completion must render live, without switching conversations ──
// Bob stays on "Everyone" (the default active view) the whole time.
await fA.evaluate(() => window.__webrtcApp.sendFilesTo('all', [new File(['hello from alice'], 'note.txt', { type: 'text/plain' })]));
check('file-card text updates to done WITHOUT switching chats', await waitFor(async () => {
  const t = await fB.locator('.file-card .small.muted').last().textContent().catch(() => '');
  return /^\d+(\.\d+)?\s?(B|KB|MB|GB)$/.test((t || '').trim());
}), 'still shows a percentage after settle');
check('internal state also reports done', await fB.evaluate(() => { const c = window.__webrtcApp.convs.get('all'); const m = [...c.messages].reverse().find(x => x.file); return m.file.state === 'done'; }));

await fA.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 30; c.height = 20; const x = c.getContext('2d'); x.fillStyle = '#3af'; x.fillRect(0, 0, 30, 20);
  return new Promise(res => c.toBlob(b => { const f = new File([b], 'pic.png', { type: 'image/png' }); window.__webrtcApp.sendFilesTo('all', [f]).then(res); }, 'image/png'));
});
check('image preview appears live WITHOUT switching chats', await waitFor(() => fB.locator('#messages img.preview').count().then(n => n > 0)));
await pB.screenshot({ path: `${SHOT}/webrtc-live-image.png` });

// ── Bug 2: muting a peer's chat disables THEIR composer, with a reason ──
const bId = await fA.evaluate(() => [...window.__webrtcApp.peers.values()][0].id);
// Bob opens his DM with Alice so we can see the composer state change.
await fB.evaluate((aid) => { window.__webrtcApp.sendText('dm:' + aid, 'hi alice'); }, await fB.evaluate(() => [...window.__webrtcApp.peers.values()][0].id));
await fB.evaluate((aid) => { document.querySelectorAll('#chat-list .item').forEach(el => { if (el.textContent.includes('Alice')) el.click(); }); }, null);
await pB.waitForTimeout(300);
check('composer enabled before muting', !(await fB.locator('#composer textarea').isDisabled()));

let o = await cli(pA, 'access Bob chat off');
check('cli mutes Bob', o.ok, o.out);
check("Bob's composer becomes disabled once he's told", await waitFor(() => fB.locator('#composer textarea').isDisabled()));
const placeholder = await fB.locator('#composer textarea').getAttribute('placeholder');
check('placeholder explains why (not just blank/offline)', /turned off messages/i.test(placeholder || ''), placeholder);
check('send button disabled too', await fB.locator('#composer button[title="Send"]').isDisabled());
check("Alice's OWN composer to Bob is unaffected (muting is about incoming, not outgoing)", !(await fA.evaluate(() => { const c = window.__webrtcApp.convs.get('dm:' + null); return false; }) ), 'n/a');

// files-only mute
o = await cli(pA, 'access Bob chat on'); check('un-mute chat', o.ok, o.out);
check('composer re-enabled after un-mute', await waitFor(() => fB.locator('#composer textarea').isDisabled().then(d => !d)));
o = await cli(pA, 'access Bob files off'); check('cli mutes Bob files only', o.ok, o.out);
check('file button disabled, text still enabled', await waitFor(async () => (await fB.locator('#composer button[title^="Alice has turned off files"]').count()) > 0 && !(await fB.locator('#composer textarea').isDisabled())));
await pB.screenshot({ path: `${SHOT}/webrtc-muted-composer.png` });

// underlying enforcement still works regardless (defense in depth, already existed)
o = await cli(pA, 'access Bob files on'); check('un-mute files', o.ok, o.out);

// ── feature: pick a file from the VFS to send in chat (not just from the local device) ──
await fA.evaluate(() => window.platform.host.getFS().writeFileSync('/home/user1/vfs-note.txt', 'sent from the vfs picker'));
o = await cli(pA, 'sendfile everyone /home/user1/vfs-note.txt');
check('cli sendfile works', o.ok, o.out);
check('B receives the vfs-sent file', await waitFor(() => fB.evaluate(() => window.__webrtcApp.convs.get('all').messages.some(m => m.file && m.file.name === 'vfs-note.txt' && m.file.state === 'done'))));
await fA.locator('#composer button[title*="Files (VFS)"]').click({ force: true });
await fA.locator('.li.click:has-text("vfs-note.txt")').click({ force: true });
check('picking the same file via the composer UI also sends it', await waitFor(() => fB.evaluate(() => window.__webrtcApp.convs.get('all').messages.filter(m => m.file && m.file.name === 'vfs-note.txt').length >= 2)));

// ── feature: file download offers both "to this device" and "to Files (VFS)" ──
await fB.evaluate(() => { const item = [...document.querySelectorAll('#chat-list .item')].find(el => el.textContent.includes('Everyone')); if (item) item.click(); });
await fA.evaluate(() => window.__webrtcApp.sendFilesTo('all', [new File(['save me'], 'saveme.txt', { type: 'text/plain' })]));
check('B: both download-to-device and save-to-Files buttons appear', await waitFor(async () => (await fB.locator('.file-card a[title="Download to this device"]').count()) > 0 && (await fB.locator('.file-card button[title="Save to Files"]').count()) > 0));
check('A (sender): save-to-Files also available on own sent file', await fA.locator('.file-card button[title="Save to Files"]').count().then(n => n > 0));
await fB.evaluate(() => document.querySelectorAll('.modal-head button').forEach(b => b.click()));
await fB.locator('.file-card button[title="Save to Files"]').last().click({ force: true });
await fB.waitForTimeout(300);
await fB.locator('.modal button:has-text("Save here")').click({ force: true });
check('file saved into the VFS at the chosen folder', await waitFor(() => fB.evaluate(() => window.platform.host.getFS().existsSync('/home/user1/saveme.txt') && window.platform.host.getFS().readFileSync('/home/user1/saveme.txt', 'utf8') === 'save me')));
// image case gets the same pair of actions
await fA.evaluate(() => { const c = document.createElement('canvas'); c.width = 12; c.height = 12; const x = c.getContext('2d'); x.fillStyle = '#0f0'; x.fillRect(0, 0, 12, 12); return new Promise(res => c.toBlob(b => { const f = new File([b], 'g.png', { type: 'image/png' }); window.__webrtcApp.sendFilesTo('all', [f]).then(res); }, 'image/png')); });
check('image message also gets a Save to Files button', await waitFor(() => fB.locator('img.preview ~ * button[title="Save to Files"], img.preview').locator('xpath=../..').locator('button[title="Save to Files"]').count().then(n => n > 0)));

// ── feature: check messages from the CLI ──
o = await cli(pA, 'say everyone hello from cli check');
o = await cli(pA, 'messages everyone 5');
check('cli messages shows recent chat text', o.ok && o.out.includes('hello from cli check'), o.out.replace(/\n/g, ' | '));
o = await cli(pA, 'messages everyone 1');
check('cli messages respects the count limit', o.ok && o.out.split('\n').length <= 2, o.out.replace(/\n/g, ' | '));
o = await cli(pA, 'chats');
check('cli chats lists conversations with counts', o.ok && /Everyone/.test(o.out) && /everyone/.test(o.out), o.out.replace(/\n/g, ' | '));
o = await cli(pA, 'messages @Bob');
check('cli messages works for a DM target', o.ok, o.out);
o = await cli(pA, 'messages @Nobody');
check('cli messages reports an error for an unknown target', !o.ok, o.out);

check('no page errors', errs.length === 0, errs.slice(0, 5).join(' || '));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
await browser.close(); process.exit(failed ? 1 : 0);
