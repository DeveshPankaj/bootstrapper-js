// Remote Machines, first visit with no bridge running: the "Get the SSH bridge" box offers
// bridge.mjs and the zip; both download with the SHA-256 the manifest names.
//   PORT=8105 node testing/scripts/remote-machines-bridge-download.mjs
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const PORT = process.env.PORT || 8080;
const SHOTS = new URL('../screenshots/', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (k, v) => console.log(k.padEnd(26), typeof v === 'string' ? v : JSON.stringify(v));
const manifest = JSON.parse(readFileSync(new URL('../../docs/public/downloads/remote-machines/manifest.json', import.meta.url), 'utf8'));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`); await sleep(3000); await page.reload(); await sleep(3000); await page.reload(); await sleep(9000);
await page.evaluate(() => window.platform.host.execCommand("service('001-core.layout','open-window') (command('ui.remote-machines'))", window.platform));
let f; for (let i = 0; i < 40 && !f; i++) { for (const fr of page.frames()) { try { if (await fr.locator('#bridge').count()) f = fr; } catch (_) {} } await sleep(250); }
for (let i = 0; i < 30; i++) { if (await f.locator('.dl').count()) break; await sleep(300); }
log('bridge box', (await f.locator('#bridge').innerText()).replace(/\s+/g, ' '));
log('first screen offers', (await f.locator('.empty .dl').innerText().catch(() => '(no box)')).replace(/\s+/g, ' ').slice(0, 200));
await page.screenshot({ path: `${SHOTS}remote-machines-get-bridge.png` });
const grab = async (selector) => {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), f.locator(selector).first().dispatchEvent('click')]);
  const path = await dl.path();
  const bytes = readFileSync(path);
  return { name: dl.suggestedFilename(), size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
};
const mjs = await grab('.empty .dl a.btn.primary');
log('bridge.mjs downloaded', { name: mjs.name, size: mjs.size, shaMatches: mjs.sha256 === manifest.mjs.sha256 });
const zip = await grab('.empty .dl a.btn:not(.primary)');
log('zip downloaded', { name: zip.name, size: zip.size, shaMatches: zip.sha256 === manifest.zip.sha256 });
await f.locator('#bridge').dispatchEvent('click');
await sleep(500);
log('settings offers', (await f.locator('.modal .dl').innerText().catch(() => '(no box)')).replace(/\s+/g, ' ').slice(0, 120));
await page.screenshot({ path: `${SHOTS}remote-machines-bridge-settings.png` });
log('page errors', errors);
await b.close();
