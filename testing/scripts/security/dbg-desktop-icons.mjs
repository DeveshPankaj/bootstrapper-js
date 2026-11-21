// Debug helper (not part of run-all): prints what the desktop shows for files in /home/user1.
import { newSession, boot, vfsWrite, waitBooted, sleep } from './lib/harness.mjs';
const S = await newSession();
try {
  const page = await boot(S.context);
  await vfsWrite(page, { '/home/user1/dbgdesk-a.txt': 'x', "/home/user1/dbg'),(x),('.txt": 'y' });
  await page.reload({ waitUntil: 'load' });
  await waitBooted(page);
  await sleep(3000);
  const info = await page.evaluate(() => ({
    items: [...document.querySelectorAll('.vfs-desktop-icon')].slice(0, 40).map((e) => e.textContent.trim().slice(0, 50)),
    count: document.querySelectorAll('.vfs-desktop-icon').length, html: (document.querySelector('.vfs-desktop-icon') || {}).outerHTML?.slice(0, 400),
    classes: [...new Set([...document.querySelectorAll('[class*="desktop"]')].map((e) => e.className).slice(0, 20))],
  }));
  console.log(JSON.stringify(info, null, 1));
} finally { await S.close(); }
