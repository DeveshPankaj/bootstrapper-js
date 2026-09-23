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
const cli = (page, cmd) => page.evaluate((c) => window.platform.host.getCommand('webrtc.api').exec(...c.split(' ')), cmd);
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

// CLI sendfile
await fA.evaluate(() => window.platform.host.getFS().writeFileSync('/home/user1/note-to-send.txt', 'from the vfs'));
const o = await cli(pA, 'sendfile everyone /home/user1/note-to-send.txt');
console.log('cli sendfile:', JSON.stringify(o));
console.log('B got it:', await waitFor(() => fB.evaluate(() => window.__webrtcApp.convs.get('all').messages.some(m => m.file && m.file.name === 'note-to-send.txt' && m.file.state === 'done'))));

// UI: click the "From Files" button, navigate, pick a file
await fA.locator('#composer button[title*="Files (VFS)"]').click({ force: true });
await fA.waitForTimeout(300);
await fA.locator('.li.click:has-text("note-to-send.txt")').click({ force: true });
await fA.waitForTimeout(500);
console.log('B got second copy via UI picker:', await waitFor(() => fB.evaluate(() => window.__webrtcApp.convs.get('all').messages.filter(m => m.file && m.file.name === 'note-to-send.txt').length >= 2)));
await b.close();
