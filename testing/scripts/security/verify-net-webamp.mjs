// NET-12 (TODO 1E.10): Webamp (wamp-client) loads a pinned, vendored copy checked with
// Subresource Integrity — never an unpinned CDN script; tampered bytes don't run.
// Run: node testing/scripts/security/verify-net-webamp.mjs   (dev server on :8080)
import { launchBrowser, bootPage, waitFor, check, finish, sleep } from './verify-net-lib.mjs';

const VENDORED = '/public/vendor/webamp/2.2.0/webamp.bundle.min.js';
const browser = await launchBrowser();
const page = await bootPage(browser);
const requests = [];
page.on('request', (r) => requests.push(r.url()));

// Install the package the way pkg-manager does (files from /public/mount → /opt/apps/<id>, run main.js).
await page.evaluate(async () => {
  const fs = window.fs, dir = '/opt/apps/wamp-client';
  let cur = ''; for (const p of dir.split('/').filter(Boolean)) { cur += '/' + p; if (!fs.existsSync(cur)) fs.mkdirSync(cur); }
  for (const f of ['main.js', 'WAMP.html']) fs.writeFileSync(`${dir}/${f}`, await (await fetch(`/public/mount/opt/apps/wamp-client/${f}`)).text());
  window.platform._appDir = dir;
  try { window.platform.host.execString(fs.readFileSync(`${dir}/main.js`, 'utf8'), `${dir}/main.js`); } finally { delete window.platform._appDir; }
});
check('the webamp command is registered', await page.evaluate(() => !!window.platform.host.getCommand('webamp')));

// 1) Tampered bytes are refused by the integrity check.
await page.route('**' + VENDORED, async (route) => {
  const res = await route.fetch(); const body = (await res.text()).replace('"use strict";', '"use strict";window.top.__tampered=1;');
  await route.fulfill({ response: res, body });
});
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
await page.evaluate(() => window.platform.host.getCommand('webamp').exec());
await sleep(3000);
const tampered = await page.evaluate(() => ({ ran: window.__tampered === 1, Webamp: typeof window.Webamp, el: !!document.getElementById('webamp') }));
check('NET-12: modified library bytes are refused (SRI) and never run', !tampered.ran && tampered.Webamp !== 'function' && !tampered.el, JSON.stringify(tampered));
check('NET-12: the failure is reported', consoleErrors.some((e) => /webamp|integrity|digest/i.test(e)), consoleErrors.slice(-3).join(' | '));
await page.unroute('**' + VENDORED);

// 2) The genuine vendored copy loads and renders.
requests.length = 0;
await page.evaluate(() => window.platform.host.getCommand('webamp').exec());
check('NET-12: Webamp loads from the vendored copy and renders', await waitFor(() => page.evaluate(() => typeof window.Webamp === 'function' && !!document.getElementById('webamp')), 30000));
check('NET-12: the library came from /public/vendor (same origin), not a CDN', requests.some((u) => u.endsWith(VENDORED)) && !requests.some((u) => /unpkg\.com|jsdelivr\.net\/npm\/webamp/.test(u)), requests.filter((u) => /webamp/.test(u)).join(' , '));
const unpkgTags = await page.evaluate(() => [...document.querySelectorAll('script[src]')].filter((s) => /unpkg\.com/.test(s.src)).map((s) => s.src));
check('NET-12: no unpkg script tags in the top document', unpkgTags.length === 0, JSON.stringify(unpkgTags));

// 3) WAMP.html (the package's page) goes through the same command, not its own CDN script.
requests.length = 0;
await page.evaluate(() => window.platform.host.openWindow('ui.iframe', '/opt/apps/wamp-client/WAMP.html'));
await sleep(3000);
const tags2 = await page.evaluate(() => [...document.querySelectorAll('script[src]')].filter((s) => /unpkg\.com/.test(s.src)).length);
check('NET-12: opening WAMP.html adds no CDN script', tags2 === 0 && !requests.some((u) => /unpkg\.com/.test(u)), requests.filter((u) => /unpkg|webamp/.test(u)).join(' , '));

check('no page errors', !page.__errors.length, page.__errors.join(' | '));
await finish(browser);
