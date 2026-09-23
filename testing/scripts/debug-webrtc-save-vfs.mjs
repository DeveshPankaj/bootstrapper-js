import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103, URL = `http://localhost:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function boot(page) { await page.goto(URL); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(9000); }
async function appFrame(page, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { for (const fr of page.frames()) { try { if (await fr.locator('#me-name').count() && await fr.evaluate(() => !!window.__webrtcApp)) return fr; } catch (_) {} } await sleep(400); }
  throw new Error('not found');
}
async function waitFor(fn, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (_) {} await sleep(300); } return false; }
const b = await chromium.launch();
const pA = await (await b.newContext()).newPage(), pB = await (await b.newContext()).newPage();
await boot(pA);
await pA.evaluate(() => window.platform.host.execCommand("service('001-core.layout','open-window') (command('ui.webrtc'))", window.platform));
const fA = await appFrame(pA);
const inv = await fA.evaluate(async () => (await window.__webrtcApp.createInvite('Alice')).link);
await pB.goto(inv);
const fB = await appFrame(pB, 40000);
await waitFor(() => fB.evaluate(() => window.__webrtcApp.joins.size === 1));
const ans = await fB.evaluate(async () => { const j = [...window.__webrtcApp.joins.values()][0]; await window.__webrtcApp.generateAnswer(j, 'Bob'); return j.link; });
await fA.evaluate((l) => window.__webrtcApp.handleIncomingCode(l), ans);
await waitFor(() => fA.evaluate(() => window.__webrtcApp.peers.size === 1), 20000);
await fB.evaluate(() => document.querySelectorAll('.modal-head button').forEach(b => b.click()));

// text file: check both buttons appear on both sides
await fA.evaluate(() => window.__webrtcApp.sendFilesTo('all', [new File(['hello'], 'doc.txt', { type: 'text/plain' })]));
await waitFor(() => fB.evaluate(() => window.__webrtcApp.convs.get('all').messages.some(m => m.file && m.file.state === 'done')));
const btnsB = await fB.locator('.file-card button[title="Save to Files"]').count();
const dlB = await fB.locator('.file-card a[title="Download to this device"]').count();
console.log('receiver: save-to-files buttons', btnsB, 'download links', dlB);
const btnsA = await fA.locator('.file-card button[title="Save to Files"]').count();
console.log('sender: save-to-files buttons (own sent file)', btnsA);

// click Save to Files on receiver, pick a folder, verify write
await fB.locator('.file-card button[title="Save to Files"]').first().click({ force: true });
await pB.waitForTimeout(400);
console.log('modal count:', await fB.locator('.modal').count());
console.log('modal title:', await fB.locator('.modal-head').first().textContent().catch(()=>'ERR'));
await fB.locator('.modal button:has-text("Save here")').click({ force: true });
await pB.waitForTimeout(400);
const saved = await pB.evaluate(() => window.platform.host.getFS().readFileSync('/home/user1/doc.txt', 'utf8').catch?.() ?? window.platform.host.getFS().readFileSync('/home/user1/doc.txt', 'utf8'));
console.log('saved content at /home/user1/doc.txt:', saved);

// image: check buttons appear too
await fA.evaluate(() => { const c = document.createElement('canvas'); c.width=10;c.height=10; const x=c.getContext('2d'); x.fillStyle='#0f0'; x.fillRect(0,0,10,10); return new Promise(res=>c.toBlob(b=>{const f=new File([b],'p.png',{type:'image/png'}); window.__webrtcApp.sendFilesTo('all',[f]).then(res);},'image/png')); });
await waitFor(() => fB.evaluate(() => window.__webrtcApp.convs.get('all').messages.some(m => m.file && m.file.name === 'p.png' && m.file.state === 'done')));
console.log('image save button count on B:', await fB.locator('img.preview').locator('xpath=../..').locator('button[title="Save to Files"]').count());
await b.close();
