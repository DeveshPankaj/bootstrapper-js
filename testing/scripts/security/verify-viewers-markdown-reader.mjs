// TODO 1F.9 smoke — markdown-reader (installed via App Manager; replaces the compiled ui.markdown)
// renders a .md file with the exact esm.sh pins react-markdown@10.1.0 + remark-gfm@4.0.1 (were
// @latest / unversioned). react-markdown escapes raw HTML, so a payload in the file stays inert.
//
// Run: node testing/scripts/security/verify-viewers-markdown-reader.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootReady, check, finish, sleep, pollFor, openApp, installApp, findFrame, pwnedKeys, writeFiles } from './verify-viewers-lib.mjs';

const browser = await launch();
try {
  const page = await bootReady(await browser.newContext());
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await writeFiles(page, { '/home/user1/mdr/readme.md': '# Pinned reader\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] gfm task\n\n<img src=x onerror="top.__pwned_mdr=1">\n' });
  await installApp(page, 'markdown-reader');
  check('markdown-reader owns ui.markdown once installed', await page.evaluate(() => !!window.platform.host.getCommand('ui.markdown')));
  await openApp(page, 'ui.markdown', '/home/user1/mdr/readme.md');
  const f = await findFrame(page, { selector: 'h1', text: 'Pinned reader', timeout: 45000 });
  check('renders the .md with react-markdown 10.1.0', !!f, errors);
  if (f) {
    const v = await f.evaluate(() => ({ td: document.querySelectorAll('td').length, task: document.querySelectorAll('input[type=checkbox]').length }));
    check('remark-gfm 4.0.1 active (table + task list)', v.td === 2 && v.task === 1, v);
  }
  await sleep(500);
  check('raw HTML in the file stays inert', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));
} catch (e) {
  check('script error', false, String(e && e.stack || e));
} finally {
  await browser.close();
}
finish('verify-viewers-markdown-reader');
