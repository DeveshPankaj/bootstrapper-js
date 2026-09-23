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
console.log('connected');

// B stays on "Everyone" (default active) the whole time — no tab switching.
// A sends an 8MB file so the transfer takes long enough to observe multiple progress ticks.
await fA.evaluate(() => window.__webrtcApp.sendFilesTo('all', [new File([new Uint8Array(8 * 1024 * 1024).fill(9)], 'big.bin')]));

const readouts = [];
for (let i = 0; i < 20; i++) {
  await sleep(300);
  const domText = await fB.locator('.file-card .small.muted').first().textContent().catch(() => 'N/A');
  const stateVal = await fB.evaluate(() => { const c = window.__webrtcApp.convs.get('all'); const m = [...c.messages].reverse().find(x => x.file); return m ? { state: m.file.state, progress: m.file.progress } : null; });
  readouts.push({ t: i * 300, domText, stateVal });
}
console.log(JSON.stringify(readouts, null, 1));
await b.close();
