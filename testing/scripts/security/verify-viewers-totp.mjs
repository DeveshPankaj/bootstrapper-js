// TODO 1F.4 / audit APP-8 — TOTP Auth keeps its accounts only in its own data dir
// (/home/user1/.local/share/totp-auth/accounts.json) via the platform fs it gets as a
// first-party ui.iframe page. Legacy data (localStorage `totp_entries` and
// /home/user1/.totp-accounts.json) is merged in once, then the localStorage copy is deleted;
// nothing is written to localStorage afterwards (also not when the page has no platform);
// startup doesn't wait on the (unregistered) IPC bus; account names render as text.
//
// Run: node testing/scripts/security/verify-viewers-totp.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootReady, addFrame, check, finish, sleep, pollFor, closeAllWindows, findFrame, pwnedKeys, writeFiles } from './verify-viewers-lib.mjs';

const STORE = '/home/user1/.local/share/totp-auth/accounts.json';
const LEGACY = '/home/user1/.totp-accounts.json';
const S1 = 'JBSWY3DPEHPK3PXP', S2 = 'GEZDGNBVGY3TQOJQ', S3 = 'MFRGGZDFMZTWQ2LK';
const lsEntries = [{ name: 'LS acct <img src=x onerror=top.__pwned_totp1=1>', secret: S1 }, { name: 'VFS acct', secret: S2 }];
const vfsEntries = [{ name: 'VFS acct', secret: S2 }, { name: '<img src=x onerror=top.__pwned_totp2=1>', secret: S1 }];

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootReady(context);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.evaluate((v) => localStorage.setItem('totp_entries', v), JSON.stringify(lsEntries));
  await writeFiles(page, { [LEGACY]: JSON.stringify(vfsEntries) });

  const open = async () => {
    const t0 = Date.now();
    await page.evaluate(() => window.platform.host.exec(window.platform, '/opt/apps/totp-auth/main.html'));
    const f = await findFrame(page, { urlPart: 'totp-auth/main.html', selector: '.card .card-code', timeout: 20000 });
    return { f, ms: Date.now() - t0 };
  };
  const cards = (f) => f.evaluate(() => [...document.querySelectorAll('.card')].map((c) => ({ name: c.querySelector('.card-name').textContent, code: c.querySelector('.card-code').textContent })));
  const store = () => page.evaluate((p) => (window.fs.existsSync(p) ? JSON.parse(window.fs.readFileSync(p, 'utf8')) : null), STORE);
  const lsDump = () => page.evaluate(() => Object.keys(localStorage).map((k) => k + '=' + localStorage.getItem(k)).join('\n'));

  let { f, ms } = await open();
  check('opens without waiting on the IPC bus', !!f && ms < 15000, `${ms} ms`);
  if (!f) throw new Error('totp frame not found');
  await sleep(1200);
  let c = await cards(f);
  check('legacy accounts merged once and de-duplicated (3 accounts)', c.length === 3, c.map((x) => x.name));
  check('account names rendered as text', c.some((x) => x.name === vfsEntries[1].name) && c.some((x) => x.name === lsEntries[0].name), c.map((x) => x.name));
  check('codes generated (6 digits)', c.every((x) => /^\d{6}$/.test(x.code)), c.map((x) => x.code));
  check('no markup from names in the page', await f.evaluate(() => !document.querySelector('.card img')));
  const st = await store();
  check('store written in the app data dir', Array.isArray(st) && st.length === 3, st && st.length);
  check('localStorage copy deleted', await page.evaluate(() => localStorage.getItem('totp_entries') === null));
  check('legacy vfs file left untouched (not deleted)', await page.evaluate((p) => window.fs.existsSync(p), LEGACY));

  // Add + delete through the UI; nothing reaches localStorage.
  await f.fill('#nameInput', 'Added acct', { force: true });
  await f.fill('#secretInput', S3, { force: true });
  await f.click('#addBtn', { force: true });
  check('adding an account persists it to the store', !!(await pollFor(async () => ((await store()) || []).length === 4 || null, 5000)));
  check('no secret written to localStorage', !(await lsDump()).includes(S3) && !(await lsDump()).includes(S1), (await lsDump()).slice(0, 200));
  await f.evaluate(() => [...document.querySelectorAll('.card')].find((x) => x.querySelector('.card-name').textContent === 'VFS acct').querySelector('.del').click());
  check('deleting an account persists', !!(await pollFor(async () => ((await store()) || []).length === 3 || null, 5000)));

  // Reopen: persistence, and the legacy file is not merged again ("once").
  await closeAllWindows(page);
  ({ f } = await open());
  await sleep(1200);
  c = await cards(f);
  check('reopened: accounts persisted, deleted one not re-imported from the legacy file', c.length === 3 && !c.some((x) => x.name === 'VFS acct') && c.some((x) => x.name === 'Added acct'), c.map((x) => x.name));

  // Control: an account name is a live payload as markup.
  await f.evaluate((h) => document.body.insertAdjacentHTML('beforeend', `<div id="ctl">${h}</div>`), vfsEntries[1].name.replace('__pwned_totp2', '__ctl_totp'));
  check('control: the account name runs when used as markup', !!(await pollFor(() => page.evaluate(() => window.__ctl_totp === 1), 4000)));
  await f.evaluate(() => document.getElementById('ctl')?.remove());

  // Without a platform (static copy in a bare frame): warning shown, no localStorage writes.
  const bare = await addFrame(page, { name: 'totp-bare', src: '/public/mount/opt/apps/totp-auth/main.html' });
  await sleep(800);
  await bare.fill('#nameInput', 'Bare acct', { force: true });
  await bare.fill('#secretInput', S3, { force: true });
  await bare.click('#addBtn', { force: true });
  await sleep(500);
  check('no platform: storage warning shown', await bare.evaluate(() => document.getElementById('storageWarn').style.display !== 'none'));
  check('no platform: nothing written to localStorage', !(await lsDump()).includes('Bare acct') && !(await lsDump()).includes(S3), (await lsDump()).slice(0, 200));
  check('static check: no localStorage write outside try/catch', await page.evaluate(async () => {
    const src = await (await fetch('/public/mount/opt/apps/totp-auth/main.html')).text();
    return !/localStorage\.setItem/.test(src) && src.split('\n').filter((l) => /localStorage\./.test(l) && !/^\s*\/\//.test(l)).every((l) => /try\s*\{/.test(l));
  }));
  await sleep(300);
  check('no payload ran', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));
} catch (e) {
  check('script error', false, String(e && e.stack || e));
} finally {
  await browser.close();
}
finish('verify-viewers-totp');
