// TODO 1F.6 / audit APP-13 — Dashboard: the VFS file picker has no inline handlers (the audit's
// folder name `a');top.pwned=1;('` is clicked), names are text, config values are escaped in the
// modals, and bookmark cards / desktop Web View widgets accept only absolute http(s) URLs (a
// javascript: URL from the config runs nothing; Web Views get the D13 embed sandbox). Custom
// widget code / mapFn stay (config-only) and are not exercised here. Control: the old inline
// handler pattern with that folder name does run.
//
// Run: node testing/scripts/security/verify-viewers-dashboard.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootReady, check, finish, sleep, pollFor, openApp, installApp, findFrame, pwnedKeys, writeFiles } from './verify-viewers-lib.mjs';

const DIRNAME = "a');top.__pwned_db1=1;('";
const FILENAME = '<img src=x onerror=top.__pwned_db2=1>.json';
const CFG = '/home/user1/.local/share/dashboard/dashboard.json';
const config = {
  groups: [{ id: 'g1', name: 'G<img src=x onerror=top.__pwned_db7=1>', color: '#fff"><img src=x onerror=top.__pwned_db3=1>', items: [
    { id: 'i1', title: 'JS link', url: 'javascript:top.__pwned_db4=1', icon: '🔗' },
    { id: 'i2', title: 'Good link', url: 'https://example.com/', icon: '🔗' },
  ] }],
  widgets: [
    { id: 'w1', title: 'bad web', type: 'iframe', url: 'javascript:top.__pwned_db5=1' },
    { id: 'w2', title: 'good web', type: 'iframe', url: 'https://example.com/' },
  ],
  charts: [{ id: 'c1', title: 'c', color: '#000', type: 'line', source: '/tmp/none.json', mapFn: '', intervalMs: '"><img src=x onerror=top.__pwned_db6=1>' }],
};

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootReady(context);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await writeFiles(page, { [`/home/user1/dbtest/${DIRNAME}/${FILENAME}`]: '{}', [CFG]: JSON.stringify(config) });
  await installApp(page, 'dashboard');
  await openApp(page, 'ui.dashboard');
  const f = await findFrame(page, { urlPart: 'dashboard/dashboard.html', selector: '#edit-btn', timeout: 30000 });
  check('dashboard opens', !!f);
  if (!f) throw new Error('dashboard frame not found');
  await sleep(800);
  check('config with hostile values rendered without running anything', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));

  // ── file picker ──
  await f.evaluate(() => { const i = document.createElement('input'); i.id = 'fp-target-test'; document.body.appendChild(i); openFilePicker('fp-target-test'); fpNavigate('/home/user1/dbtest'); });
  const row = f.locator('#fp-list .fp-row', { hasText: DIRNAME });
  check('picker lists the hostile folder name as text', (await row.count()) === 1);
  check('picker has no inline handlers', await f.evaluate(() => !document.querySelector('#fp-bg [onclick]:not(#fp-bg):not(#fp-header button)')));
  await row.first().click({ force: true });
  const inside = await pollFor(() => f.evaluate(() => (fpDir.endsWith("('") ? [...document.querySelectorAll('#fp-list .fp-name')].map((e) => e.textContent) : null)), 4000);
  check('clicking the folder navigates into it (nothing runs)', !!inside && inside.includes(FILENAME), inside);
  check('breadcrumb shows the folder name as text', await f.evaluate((n) => [...document.querySelectorAll('#fp-breadcrumb span')].some((s) => s.textContent === n), DIRNAME));
  await f.locator('#fp-list .fp-row', { hasText: 'onerror' }).first().click({ force: true });
  const picked = await f.evaluate(() => document.getElementById('fp-target-test').value);
  check('selecting the file fills the target with its real path', picked === `/home/user1/dbtest/${DIRNAME}/${FILENAME}`, picked);
  check('no payload ran in the picker', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));

  // Control: the old inline-handler markup with this folder name runs the payload.
  await f.evaluate((n) => {
    const d = document.createElement('div');
    d.innerHTML = `<span id="ctl" onclick="fpNavigate('${n.replace('__pwned_db1', '__ctl_db').replace(/&/g, '&amp;').replace(/"/g, '&quot;')}')">x</span>`;
    document.body.appendChild(d);
    document.getElementById('ctl').click();
    d.remove();
  }, DIRNAME);
  check('control: old onclick="fpNavigate(\'…\')" pattern runs the folder-name payload', await page.evaluate(() => window.__ctl_db === 1));

  // ── modals: config values escaped ──
  await f.evaluate(() => showGroupModal('g1'));
  check('group modal: color value kept literally, nothing injected', await f.evaluate((c) => document.getElementById('color-val')?.value === c && !document.querySelector('#modal-body img'), config.groups[0].color));
  check('group modal: swatches have no inline handlers', await f.evaluate(() => !document.querySelector('#modal-body .csw[onclick]')));
  await f.locator('#modal-body .csw[data-color]').nth(2).evaluate((el) => el.click());
  check('group modal: clicking a swatch selects its colour (delegated listener)', await f.evaluate(() => {
    const sw = document.querySelectorAll('#modal-body .csw[data-color]')[2];
    return document.getElementById('color-val').value === sw.dataset.color && sw.classList.contains('sel');
  }));
  await f.evaluate(() => closeModal());
  await f.evaluate(() => showChartModal('c1'));
  check('chart modal: interval value escaped', await f.evaluate(() => !document.querySelector('#modal-body img')));
  await f.evaluate(() => closeModal());

  // ── bookmark cards: javascript: does nothing, http(s) opens without opener ──
  const popups = [];
  context.on('page', (p) => popups.push(p));
  await f.evaluate(() => { if (editMode) toggleEdit(); switchTab('bookmarks'); });
  await f.locator('.card', { hasText: 'JS link' }).first().click({ force: true });
  await sleep(800);
  check('javascript: bookmark opens nothing and runs nothing', popups.length === 0 && (await pwnedKeys(page)).length === 0, { popups: popups.length, pwned: await pwnedKeys(page) });
  await f.locator('.card', { hasText: 'Good link' }).first().click({ force: true });
  const pop = await pollFor(async () => popups[0] || null, 8000);
  check('http(s) bookmark opens in a new tab', !!pop);
  if (pop) {
    await pop.waitForLoadState('domcontentloaded').catch(() => {});
    check('…without window.opener', await pop.evaluate(() => window.opener === null).catch(() => false));
    await pop.close().catch(() => {});
  }

  // ── desktop Web View widgets ──
  await f.evaluate(() => { launchWidget(state.widgets[0]); launchWidget(state.widgets[1]); });
  await sleep(1500);
  const w = await page.evaluate(() => ({
    bad: [...document.querySelectorAll('div')].some((d) => d.textContent === 'Web View: only http(s) URLs can be shown.'),
    frames: [...document.querySelectorAll('iframe')].filter((i) => /example\.com|javascript:/.test(i.getAttribute('src') || '')).map((i) => ({ src: i.getAttribute('src'), sandbox: i.getAttribute('sandbox'), ref: i.referrerPolicy })),
  }));
  check('javascript: Web View widget refused with a message', w.bad, w);
  check('http(s) Web View rendered with the embed sandbox + no-referrer', w.frames.length === 1 && w.frames[0].src === 'https://example.com/' && w.frames[0].sandbox === 'allow-scripts allow-same-origin allow-forms' && w.frames[0].ref === 'no-referrer', w.frames);

  // ── saving a javascript: bookmark is refused ──
  await f.evaluate(() => { if (!editMode) toggleEdit(); showCardModal('g1', null); });
  await f.fill('#c-title', 'evil', { force: true });
  await f.fill('#c-url', 'javascript:top.__pwned_db8=1', { force: true });
  await f.evaluate(() => saveModal());
  await sleep(300);
  check('saving a javascript: bookmark is refused', await page.evaluate((p) => !window.fs.readFileSync(p, 'utf8').includes('__pwned_db8'), CFG));
  await f.evaluate(() => closeModal());
  // smoke: an http(s) bookmark saves
  await f.evaluate(() => showCardModal('g1', null));
  await f.fill('#c-title', 'Saved link', { force: true });
  await f.fill('#c-url', 'https://example.org/', { force: true });
  await f.evaluate(() => saveModal());
  check('smoke: an http(s) bookmark saves to the config', !!(await pollFor(() => page.evaluate((p) => window.fs.readFileSync(p, 'utf8').includes('example.org') || null, CFG), 3000)));
  await sleep(300);
  check('no payload ran (overall)', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));
} catch (e) {
  check('script error', false, String(e && e.stack || e));
} finally {
  await browser.close();
}
finish('verify-viewers-dashboard');
