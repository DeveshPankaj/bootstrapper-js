import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103, URL = `http://localhost:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function boot(page) { await page.goto(URL); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(9000); }
async function appFrame(page, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { for (const fr of page.frames()) { try { if (await fr.locator('#me-name').count() && await fr.evaluate(() => !!window.__webrtcApp)) return fr; } catch (_) {} } await sleep(400); }
  throw new Error('not found');
}
const b = await chromium.launch();
const pA = await (await b.newContext()).newPage(), pB = await (await b.newContext()).newPage();
await boot(pA);
await pA.evaluate(() => window.platform.host.execCommand("service('001-core.layout','open-window') (command('ui.webrtc'))", window.platform));
const fA = await appFrame(pA);
const inv = await fA.evaluate(async () => (await window.__webrtcApp.createInvite('Alice')).link);
await pB.goto(inv);
const fB = await appFrame(pB, 40000);
await sleep(500);
const ans = await fB.evaluate(async () => { const j = [...window.__webrtcApp.joins.values()][0]; await window.__webrtcApp.generateAnswer(j, 'Bob'); return j.link; });
await fA.evaluate((l) => window.__webrtcApp.handleIncomingCode(l), ans);
await new Promise(async (resolve) => { const t0 = Date.now(); while (Date.now() - t0 < 20000) { if (await fA.evaluate(() => window.__webrtcApp.peers.size) === 1) return resolve(); await sleep(300); } resolve(); });

await fA.evaluate(() => window.__webrtcApp.sendFilesTo('all', [new File(['hi'], 'small.txt', { type: 'text/plain' })]));
await sleep(800);
const dbg = await fB.evaluate(() => {
  const app = window.__webrtcApp;
  const c = app.convs.get('all');
  const m = [...c.messages].reverse().find(x => x.file);
  const hasEl = !!m.el;
  const connected = m.el ? m.el.isConnected : null;
  const domNow = document.querySelector('#messages')?.textContent?.slice(-200);
  return { fileState: m.file.state, hasEl, connected, domNow };
});
console.log('before manual refresh:', JSON.stringify(dbg, null, 1));
