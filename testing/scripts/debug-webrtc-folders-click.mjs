import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103;
const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(3000); await p.reload(); await p.waitForTimeout(3000); await p.reload(); await p.waitForTimeout(9000);
await p.evaluate(() => window.platform.host.execCommand("service('001-core.layout','open-window') (command('ui.webrtc'))", window.platform));
await p.waitForTimeout(2500);
let f; for (const fr of p.frames()) { try { if (await fr.locator('#me-name').count()) f = fr; } catch (_) {} }
for (const label of ['Folders', 'Settings', 'Join…']) {
  await f.locator(`button:has-text("${label}")`).first().click({ force: true });
  await p.waitForTimeout(400);
  console.log(label, 'modals:', await f.locator('.modal').count());
  await f.evaluate(() => document.querySelectorAll('.modal-head button').forEach(b => b.click()));
}
await b.close();
