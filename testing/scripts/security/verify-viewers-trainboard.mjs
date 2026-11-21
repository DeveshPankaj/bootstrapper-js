// TODO 1F.5 / audit APP-10 — TrainBoard renders the shared log as text and only shows rows whose
// run/metric match ^[\w.-]{1,64}$ (with numeric step/value). The audit's exploit row, a hostile
// metric, a "__proto__" metric (prototype pollution) and junk values are appended to the shared
// log; TrainBoard must show only the valid runs, run nothing, keep Object.prototype clean, and
// deleting a run must keep the rows it doesn't display. The legacy board.html (not launched by
// the app, still served statically) is checked with a stub bridge.
//
// Run: node testing/scripts/security/verify-viewers-trainboard.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootReady, addFrame, check, finish, sleep, pollFor, openApp, findFrame, pwnedKeys, writeFiles } from './verify-viewers-lib.mjs';

const LOG = '/home/user1/.local/share/trainboard/log.jsonl';
const rows = [
  { run: 'good-run', metric: 'loss', step: 0, value: 1 },
  { run: 'good-run', metric: 'loss', step: 1, value: 0.5 },
  { run: '<img src=x onerror=top.__pwned_tb1=1>', metric: 'm', step: 0, value: 0 },   // audit exploit
  { run: 'r2', metric: '<img src=x onerror=top.__pwned_tb2=1>', step: 0, value: 0 },
  { run: 'constructor', metric: '__proto__', step: 0, value: 1 },
  { run: 'r3', metric: 'm3', step: 'x', value: '<b>junk</b>' },
];

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootReady(context);
  let acceptDialogs = false;
  page.on('dialog', (d) => (acceptDialogs ? d.accept() : d.dismiss()).catch(() => {}));
  await writeFiles(page, { [LOG]: rows.map((r) => JSON.stringify(r)).join('\n') + '\n' });
  await openApp(page, 'ui.trainboard');

  const f = await findFrame(page, { urlPart: 'trainboard/main.html', selector: '.run-pill', timeout: 30000 });
  check('TrainBoard opens and lists runs', !!f);
  if (!f) throw new Error('trainboard frame not found');
  await sleep(1000);
  const view = await f.evaluate(() => ({
    runs: [...document.querySelectorAll('.run-pill')].map((p) => p.firstChild.nextSibling?.textContent ?? p.textContent),
    charts: [...document.querySelectorAll('.chart-card h3')].map((h) => h.textContent),
    legend: [...document.querySelectorAll('.legend > span')].map((s) => s.textContent),
    imgs: document.querySelectorAll('img').length,
    protoKeys: Object.keys(Object.prototype),
    polluted: ({}).good_run !== undefined || ({}).constructor !== Object,
  }));
  check('only valid run names are shown', JSON.stringify(view.runs.sort()) === JSON.stringify(['constructor', 'good-run']), view.runs);
  check('only valid metrics are charted (incl. "__proto__" as a plain name)', JSON.stringify(view.charts.sort()) === JSON.stringify(['__proto__', 'loss']), view.charts);
  check('legend entries are text', view.legend.includes('good-run') && view.legend.includes('constructor'), view.legend);
  check('no markup from the log in the page', view.imgs === 0, view.imgs);
  check('Object.prototype not polluted', view.protoKeys.length === 0 && !view.polluted, view.protoKeys);
  check('no payload ran', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));

  // Control: the exploit row's run name runs when used as markup.
  await f.evaluate((h) => document.body.insertAdjacentHTML('beforeend', `<div id="ctl">${h}</div>`), rows[2].run.replace('__pwned_tb1', '__ctl_tb'));
  check('control: the run name is a live payload as markup', !!(await pollFor(() => page.evaluate(() => window.__ctl_tb === 1), 4000)));
  await f.evaluate(() => document.getElementById('ctl')?.remove());

  // Smoke: delete "good-run" — its rows go, rows TrainBoard doesn't display stay in the file.
  acceptDialogs = true;
  await f.evaluate(() => [...document.querySelectorAll('.run-pill')].find((p) => p.textContent.includes('good-run')).querySelector('button').click());
  const after = await pollFor(() => page.evaluate((LOG) => {
    const lines = window.fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    return lines.some((r) => r.run === 'good-run') ? null : lines;
  }, LOG), 8000);
  acceptDialogs = false;
  check('delete run removes its rows', !!after);
  check('delete run keeps rows it does not display', !!after && after.length === 4 && after.some((r) => r.run === rows[2].run), after && after.length);
  const runsAfter = await pollFor(() => f.evaluate(() => {
    const r = [...document.querySelectorAll('.run-pill')].map((p) => p.textContent);
    return r.some((x) => x.includes('good-run')) ? null : r;
  }), 8000);
  check('UI refreshes after delete', !!runsAfter && runsAfter.length === 1, runsAfter);

  // Legacy board.html with a stub bridge (static copy; it isn't installed into the vfs).
  const bf = await addFrame(page, { name: 'tb-board', src: '/public/mount/opt/apps/trainboard/board.html' });
  await sleep(500);
  await bf.evaluate(() => {
    const files = {
      'good.jsonl': '{"step":0,"loss":1}\n{"step":1,"loss":0.5,"<img src=x onerror=top.__pwned_tbb2=1>":3}\n',
      '<img src=x onerror=top.__pwned_tbb1=1>.jsonl': '{"step":0,"loss":1}\n',
      "x',top.__pwned_tbb3=1,'.jsonl": '{"step":0,"acc":1}\n',
    };
    window.__bdInit({ existsDir: () => true, mkDir: () => {}, listDir: () => Object.keys(files), readFile: (p) => files[p.split('/').pop()] });
  });
  const board = await pollFor(() => bf.evaluate(() => {
    const names = [...document.querySelectorAll('.run-name')].map((e) => e.textContent);
    return names.length ? { names, titles: [...document.querySelectorAll('.chart-title')].map((e) => e.textContent), imgs: document.querySelectorAll('img').length, inline: document.querySelectorAll('[onchange]').length } : null;
  }), 10000);
  check('board.html: only valid run files listed, as text, no inline handlers', !!board && JSON.stringify(board.names) === '["good"]' && board.imgs === 0 && board.inline === 0, board);
  check('board.html: only valid metric keys charted', !!board && JSON.stringify(board.titles) === '["loss"]', board && board.titles);
  await sleep(500);
  check('no payload ran (overall)', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));
} catch (e) {
  check('script error', false, String(e && e.stack || e));
} finally {
  await browser.close();
}
finish('verify-viewers-trainboard');
