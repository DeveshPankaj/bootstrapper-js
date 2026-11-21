// Debug helper (not part of run-all): what explorer-sifi shows when opened on a folder.
import { newSession, boot, ensureApp, openWindow, windowFrame, vfsWrite, sleep } from './lib/harness.mjs';
const S = await newSession();
try {
  const page = await boot(S.context);
  await vfsWrite(page, { "/home/user1/sec-k3/k3txt'),(x),('.txt": 'x', '/home/user1/sec-k3/plain.txt': 'y' });
  console.log('ensure', await ensureApp(page, 'explorer-sifi', 'explorer-sifi'));
  await openWindow(page, 'explorer-sifi', '/home/user1/sec-k3');
  await sleep(3000);
  const f = await windowFrame(page, 'explorer-sifi');
  console.log('frame', !!f, f && (await f.evaluate(() => document.body.innerText.slice(0, 600))).replace(/\n+/g, ' | '));
  console.log('windows', await page.evaluate(() => [...document.querySelectorAll('.window[data-name]')].map((w) => w.getAttribute('data-name'))));
} finally { await S.close(); }
