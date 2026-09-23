import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103;
const b = await chromium.launch(); const p = await b.newPage();
p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(3000); await p.reload(); await p.waitForTimeout(3000); await p.reload(); await p.waitForTimeout(9000);

// mount from the TOP frame, then open file explorer and iframe (different realms) to confirm visibility + RO wrapper behavior
const r = await p.evaluate(async () => {
  const fs = window.platform.host.getFS();
  const inner = await fs.createBackend('InMemory', {});
  fs.mount('/mnt/webrtc/proj', inner);
  fs.writeFileSync('/mnt/webrtc/proj/note.txt', 'hello world');
  // read-only wrapper test
  const DENY = ['writeFileSync','mkdirSync','unlinkSync','rmdirSync','renameSync'];
  const roInner = await fs.createBackend('InMemory', {});
  const view = Object.create(roInner);
  for (const m of DENY) view[m] = () => { throw Object.assign(new Error('EROFS'), { code: 'EROFS' }); };
  fs.mount('/mnt/webrtc/ro', view);
  let roWriteErr = null;
  try { fs.writeFileSync('/mnt/webrtc/ro/x.txt', 'nope'); } catch (e) { roWriteErr = e.code || e.message; }
  let roReadOk = null;
  try { fs.readdirSync('/mnt/webrtc/ro'); roReadOk = true; } catch (e) { roReadOk = 'ERR:' + e.message; }
  return { roWriteErr, roReadOk };
});
console.log('RO test:', JSON.stringify(r));

await p.evaluate(() => window.platform.host.execCommand("service('001-core.layout','open-window') (command('explorer'), '/mnt/webrtc')", window.platform));
await p.waitForTimeout(2000);
let f = null;
for (let i = 0; i < 10 && !f; i++) { for (const fr of p.frames()) { try { if (await fr.locator('text=proj').count()) f = fr; } catch (_) {} } if (!f) await p.waitForTimeout(500); }
console.log('explorer shows mount:', !!f);
if (f) {
  await f.locator('text=proj').first().dblclick({ force: true });
  await p.waitForTimeout(800);
  console.log('note.txt visible:', await f.locator('text=note.txt').count());
  await p.screenshot({ path: 'testing/screenshots/webrtc-mount-in-explorer.png' });
}
await b.close();
