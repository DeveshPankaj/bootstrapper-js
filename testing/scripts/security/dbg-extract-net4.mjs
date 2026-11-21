// Debug helper (not part of run-all): Files double-click on a .zip, and RemoteMount with a fake session.
import { newSession, boot, openWindow, windowFrame, findFrame, vfsWrite, vfsList, makeZip, sleep, pollFor, closeAllWindows } from './lib/harness.mjs';
const S = await newSession();
try {
  const page = await boot(S.context, { dialogPolicy: 'accept' });
  await vfsWrite(page, { '/home/user1/dbg-zs/evil.zip': { base64: makeZip([['ok/a.txt', 'DBGX'], ['../dbg-up.txt', 'DBGX']]).toString('base64') } });
  await openWindow(page, 'explorer', '/home/user1/dbg-zs');
  const f = await windowFrame(page, 'explorer');
  await pollFor(() => f.locator('.file-item', { hasText: 'evil.zip' }).count(), 10000);
  console.log('items', await f.locator('.file-item').allTextContents());
  await f.locator('.file-item', { hasText: 'evil.zip' }).first().dblclick({ force: true });
  await sleep(2500);
  console.log('dialogs', JSON.stringify(page.__dialogs), 'listing', JSON.stringify(await vfsList(page, '/home/user1/dbg-zs')), 'up', JSON.stringify(await vfsList(page, '/home/user1')));
  console.log('console', JSON.stringify(page.__console.filter((c) => /zip|fflate|extract|error/i.test(c)).slice(-8)));
  await closeAllWindows(page);
  await openWindow(page, 'ui.remote-machines');
  const rf = await findFrame(page, { urlPart: 'remote-machines/main.html', predicate: () => !!window.__remoteMachines, timeout: 30000 });
  const r = await rf.evaluate(async () => {
    const fake = { status: 'online', fg: 0, info: { root: '/' }, rpc: (m, p) => Promise.resolve(m === 'fs.list' ? [] : {}), on() { return () => {}; }, emit() {} };
    try { const m = new window.__remoteMachines.RemoteMount({ id: 'd', name: 'd-box', host: 'h', port: 22, username: 'x' }, fake); await m.mount(); return 'ok ' + m.path; } catch (e) { return 'ERR ' + e.message + ' | ' + String(e.stack).split('\n').slice(0, 4).join(' / '); }
  });
  console.log('remote mount:', r);
} finally { await S.close(); }
