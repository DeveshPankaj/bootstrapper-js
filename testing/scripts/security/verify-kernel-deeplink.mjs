// Verifies TODO 1A.8 (audit KRN-12, BOOT-9): deep links (#open=<command>&app=<id>&arg=…) —
//  - command names can't start with '.' or contain '..'; app ids must match the kernel's app-id
//    rule (path-policy isValidAppId), so `app=..` can't load /opt/apps/../main.js;
//  - a link only reaches an installed app: installed apps are the /opt/apps/<id> folders
//    (loaded at boot by pkg-manager/loader.js); an app the user uninstalled
//    (/etc/pkg/uninstalled.json) is never loaded, and a link to an app with no folder
//    loads nothing (App Manager is offered instead);
//  - the pre-boot handoff (src/kernel/deeplink.ts) never broadcasts an invalid name.
// Run: node testing/scripts/security/verify-kernel-deeplink.mjs   (OS dev server on :8080)
import { launch, bootOS, check, finish, sleep, pollFor, OS_URL } from './verify-kernel-lib.mjs';

const APP_MAIN = (id, cmd) => `
  const platform = window.platform;
  window.top.__dl = (window.top.__dl || []).concat([${JSON.stringify(id)}]);
  platform.host.registerCommand(${JSON.stringify(cmd)}, function (body, props, arg) {
    window.top.__dlOpened = (window.top.__dlOpened || []).concat([${JSON.stringify(cmd)} + ':' + arg]);
    if (body) body.textContent = 'deeplink test ' + arg;
  }, { title: ${JSON.stringify(cmd)}, deepLink: true });
`;

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootOS(context);
  await page.evaluate(({ apps }) => {
    const fs = window.fs;
    const mk = (d) => { let cur = ''; for (const p of d.split('/').slice(1)) { cur += '/' + p; if (!fs.existsSync(cur)) fs.mkdirSync(cur); } };
    for (const [dir, src] of apps) { mk(dir); fs.writeFileSync(dir + '/main.js', src); }
    fs.writeFileSync('/opt/main.js', "window.top.__dl = (window.top.__dl || []).concat(['DOTDOT-/opt/main.js'])");
    mk('/etc/pkg');
    const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) || []; } catch (_) { return []; } };
    // kdl-good: an installed app (its folder). kdl-gone: its files are there, but the user
    // uninstalled it. kdl-missing: no folder at all.
    const un = read('/etc/pkg/uninstalled.json').filter((id) => id !== 'kdl-gone');
    un.push('kdl-gone');
    fs.writeFileSync('/etc/pkg/uninstalled.json', JSON.stringify(un));
  }, { apps: [
    ['/opt/apps/kdl-good', APP_MAIN('kdl-good', 'kdl.good')],
    ['/opt/apps/kdl-gone', APP_MAIN('kdl-gone', 'kdl.gone')],
  ] });

  // The vfs mirrors writes to IndexedDB asynchronously: give it time, then prove the
  // fixtures survive a reload, so the negative cases below can't pass for lack of files.
  const FIXTURES = () => {
    const fs = window.fs;
    const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) || []; } catch (_) { return []; } };
    return {
      good: fs.existsSync('/opt/apps/kdl-good/main.js'), gone: fs.existsSync('/opt/apps/kdl-gone/main.js'),
      noMissing: !fs.existsSync('/opt/apps/kdl-missing'), dotdot: fs.existsSync('/opt/main.js'),
      uninstalledGone: read('/etc/pkg/uninstalled.json').includes('kdl-gone'),
    };
  };
  const allFixtures = (f) => !!f && f.good && f.gone && f.noMissing && f.dotdot && f.uninstalledGone;
  await sleep(3000);
  await page.reload({ waitUntil: 'load' });
  const persisted = await pollFor(async () => { const f = await page.evaluate(FIXTURES).catch(() => null); return allFixtures(f) ? f : null; }, 30000, 500);
  check('test fixtures persisted across a reload', !!persisted, persisted);

  // A same-origin listener on the handoff channel (any OS tab hears these).
  const listener = await context.newPage();
  await listener.goto(OS_URL + '/public/manifest.json');
  await listener.evaluate(() => { window.__heard = []; const c = new BroadcastChannel('wos-deeplink'); c.onmessage = (e) => window.__heard.push(e.data && e.data.command); });

  const logs = [];
  page.on('console', (m) => { const t = m.text(); if (/deeplink|pkg-loader/i.test(t)) logs.push(t.slice(0, 200)); });
  const openLink = async (hash) => {
    logs.length = 0;
    await page.goto('about:blank');
    await page.goto(OS_URL + '/' + hash, { waitUntil: 'load' });
    await pollFor(async () => page.evaluate(() => !!(window.platform && window.platform.host && document.querySelector('.content-area'))), 60000, 500);
    await sleep(4000); // initd → pkg loader → deeplink.js, then its open-window retries
    const r = await page.evaluate(() => ({ loaded: window.__dl || [], opened: window.__dlOpened || [], hash: location.hash }));
    r.fixtures = allFixtures(await page.evaluate(FIXTURES));
    if (logs.length) r.console = logs.slice(0, 6);
    return r;
  };

  // The installed app (kdl-good) is loaded at boot by the loader, link or not; what a
  // link must never do is load anything else.
  const onlyBootLoads = (r) => !r.loaded.includes('DOTDOT-/opt/main.js') && r.loaded.every((id) => id === 'kdl-good');
  const cases = [
    ['#open=kdl.good&app=..&arg=x', 'app=.. rejected (no /opt/apps/../main.js)', (r) => onlyBootLoads(r)],
    ['#open=..&app=kdl-good&arg=x', 'command ".." rejected', (r) => onlyBootLoads(r) && r.opened.length === 0],
    ['#open=.kdl.good&app=kdl-good&arg=x', 'command with a leading dot rejected', (r) => onlyBootLoads(r) && r.opened.length === 0],
    ['#open=kdl..good&app=kdl-good&arg=x', 'command containing ".." rejected', (r) => onlyBootLoads(r) && r.opened.length === 0],
    ['#open=kdl.gone&app=KDL-Gone&arg=x', 'app id not matching the app-id rule (uppercase) rejected', (r) => onlyBootLoads(r) && r.opened.length === 0],
    ['#open=kdl.gone&app=kdl-gone&arg=x', 'uninstalled app not loaded', (r) => onlyBootLoads(r) && r.opened.length === 0],
    ['#open=kdl.missing&app=kdl-missing&arg=x', 'app with no folder: nothing loaded or opened', (r) => onlyBootLoads(r) && r.opened.length === 0],
    ['#open=kdl.good&app=kdl-good&arg=hello', 'installed app opened with the arg (loaded once)', (r) => r.loaded.filter((id) => id === 'kdl-good').length === 1 && r.opened.includes('kdl.good:hello')],
  ];
  for (const [hash, label, ok] of cases) {
    const r = await openLink(hash);
    check(`${label}  [${hash}]`, r.fixtures && ok(r), r);
  }
  const heard = await listener.evaluate(() => window.__heard);
  check('pre-boot handoff broadcast only the valid command names', heard.every((c) => ['kdl.good', 'kdl.gone', 'kdl.missing'].includes(c)) && heard.includes('kdl.good'), heard);
} finally {
  await browser.close();
}
finish('verify-kernel-deeplink (1A.8)');
