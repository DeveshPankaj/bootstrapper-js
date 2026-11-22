// 1D.6 (audit APP-9) — Bookmarks: a click opens the URL in a Browser window
// (openWindow('ui.iframe', url) — the old code passed the URL as ui.iframe's `body`, threw, and
// fell back to window.top.open(url, '_blank') with a live window.opener). If the Browser window
// can't open, the fallback tab is opened with noopener,noreferrer: the site sees
// window.opener === null and no referrer. javascript:/data: bookmarks (bookmarks.json is
// writable by any app) are refused.
//
// Run: node testing/scripts/security/verify-files-bookmarks.mjs   (dev server on :8080)
import {
  launch, installApp, bootReady, writeVfs, makeReporter, sleep, pollFor, installSpies, resetSpies, getSpies,
  findFrame, closeAllWindows,
} from './verify-files-lib.mjs';

const { check, done } = makeReporter();
const SITE = 'http://evil.test/page.html';
const browser = await launch();
const context = await browser.newContext();
await context.route('http://evil.test/**', (route) => route.fulfill({
  status: 200, headers: { 'content-type': 'text/html' },
  body: `<!doctype html><title>evil</title><body>bookmarked site<script>
    window.__probe = { opener: window.opener === null ? 'null' : typeof window.opener, referrer: document.referrer };
    try { window.opener && window.opener.postMessage({ type: 'wos-ipc', id: 1, event: 'fs.readText', data: { path: '/home/user1/bookmarks.json' } }, '*'); } catch (_) {}
  </script></body>`,
}));
const page = await bootReady(context);
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message).split('\n').slice(0, 3).join(' ⟵ ')));

try {
  await installSpies(page);
  await writeVfs(page, {
    '/home/user1/bookmarks.json': JSON.stringify([
      { id: 1, title: 'Second origin', url: SITE },
      { id: 2, title: 'JS link', url: 'javascript:top.__pwnedBm=1' },
      { id: 3, title: 'Data link', url: 'data:text/html,<script>top.__pwnedBm=2</script>' },
    ]),
  });
  await installApp(page, 'bookmarks');
  const openBookmarks = async () => {
    await closeAllWindows(page);
    await page.evaluate(() => window.platform.host.openWindow('ui.bookmarks'));
    return findFrame(page, 'h2:text-is("Bookmarks")');
  };

  // Normal click → Browser window with the URL.
  let f = await openBookmarks();
  check('bookmarks: window opens with the saved links', !!f && (await f.getByText('Second origin', { exact: true }).count()) === 1);
  await resetSpies(page);
  const popups = [];
  context.on('page', (p) => popups.push(p));
  await f.getByText('Second origin', { exact: true }).click({ force: true });
  await sleep(800);
  const opens = (await getSpies(page)).openWindow;
  check("click: openWindow('ui.iframe', url) — the URL is the argument, not the window body", opens.some((c) => c[0] === 'ui.iframe' && c[1] === SITE), JSON.stringify(opens));
  const site = await findFrame(page, 'body:has-text("bookmarked site")', { timeout: 8000 });
  check('click: the site loads inside a Browser window (no new tab)', !!site && popups.length === 0, `popups=${popups.length}`);

  // Browser window unavailable → fallback tab with noopener,noreferrer.
  await page.evaluate(() => {
    let proto = Object.getPrototypeOf(window.platform.host);
    while (!Object.prototype.hasOwnProperty.call(proto, 'openWindow')) proto = Object.getPrototypeOf(proto);
    window.__realOpenWindow = proto.openWindow;
    proto.openWindow = function (name, ...a) { if (name === 'ui.iframe') throw new Error('test: no browser window'); return window.__realOpenWindow.call(this, name, ...a); };
  });
  f = await openBookmarks();
  const popupPromise = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);
  await f.getByText('Second origin', { exact: true }).click({ force: true });
  const popup = await popupPromise;
  let probe = null;
  if (popup) {
    await popup.waitForLoadState('load').catch(() => {});
    probe = await pollFor(() => popup.evaluate(() => window.__probe), { timeout: 5000 });
  }
  check('fallback: opens the site in a new tab', !!popup && popup.url() === SITE, popup && popup.url());
  check('fallback: the site gets window.opener === null (noopener)', probe && probe.opener === 'null', JSON.stringify(probe));
  check('fallback: no referrer is sent (noreferrer)', probe && probe.referrer === '', JSON.stringify(probe));
  if (popup) await popup.close();
  await page.evaluate(() => {
    let proto = Object.getPrototypeOf(window.platform.host);
    while (!Object.prototype.hasOwnProperty.call(proto, 'openWindow')) proto = Object.getPrototypeOf(proto);
    proto.openWindow = window.__realOpenWindow;
  });

  // javascript: / data: bookmarks are refused.
  f = await openBookmarks();
  await resetSpies(page);
  const before = context.pages().length;
  await f.getByText('JS link', { exact: true }).click({ force: true });
  await f.getByText('Data link', { exact: true }).click({ force: true });
  await sleep(800);
  const toastText = await page.evaluate(() => document.body.innerText);
  check('javascript:/data: bookmarks: not opened (no window, no tab)', !(await getSpies(page)).openWindow.some((c) => c[0] === 'ui.iframe') && context.pages().length === before);
  check('javascript:/data: bookmarks: user is told why', toastText.includes('Only http(s) links can be opened'));
  check('javascript:/data: bookmarks: no code ran', (await page.evaluate(() => window.top.__pwnedBm)) === undefined);

  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
} catch (e) {
  check('test run completed', false, e.stack || e.message);
  await page.screenshot({ path: new URL('../../screenshots/verify-files-bookmarks-fail.png', import.meta.url).pathname }).catch(() => {});
} finally {
  await page.evaluate(() => { try { window.fs.unlinkSync('/home/user1/bookmarks.json'); } catch (_) {} }).catch(() => {});
  await browser.close();
}
process.exit(done() ? 1 : 0);
