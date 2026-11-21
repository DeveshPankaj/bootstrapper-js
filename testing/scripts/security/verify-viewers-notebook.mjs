// TODO 1F.1 / audit APP-5 — Notebook markdown cells are sanitised with the vendored DOMPurify.
// A crafted .ipynb (markdown cells with event-handler / javascript: / svg / iframe / form
// payloads) is opened with ui.notebook; nothing may run, normal markdown must still render,
// links open in a new tab without an opener, and a markdown cell edited + run is sanitised
// too. A control proves the payload is live when marked output is not sanitised. Smoke: a
// Python code cell runs in Pyodide.
//
// Run: node testing/scripts/security/verify-viewers-notebook.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootReady, check, finish, sleep, pollFor, openApp, installApp, findFrame, pwnedKeys, writeFiles } from './verify-viewers-lib.mjs';

const NB = '/home/user1/nbtest/evil.ipynb';
const md = [
  '# Hello notebook\n',
  '**bold** and a [link](https://example.com/) and [anchor](#x)\n\n',
  '<img src=x onerror="top.__pwned_nb_img=1">\n\n',
  '<a href="javascript:top.__pwned_nb_js=1" id="jslink">js</a>\n\n',
  '<svg><animate onbegin="top.__pwned_nb_svg=1" attributeName="x" dur="1s"/></svg>\n\n',
  '<iframe srcdoc="<script>top.__pwned_nb_iframe=1</script>"></iframe>\n\n',
  '<details open ontoggle="top.__pwned_nb_toggle=1"><summary>s</summary>x</details>\n\n',
  '<form action="https://example.com/"><input name=q></form>\n\n',
  '- [ ] task item\n\n',
  '| a | b |\n|---|---|\n| 1 | 2 |\n',
];
const notebook = {
  nbformat: 4, nbformat_minor: 5, metadata: {},
  cells: [
    { cell_type: 'markdown', metadata: {}, source: md },
    { cell_type: 'code', metadata: {}, source: ['print(6*7)'], outputs: [], execution_count: null },
  ],
};

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootReady(context);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await writeFiles(page, { [NB]: JSON.stringify(notebook) });
  await installApp(page, 'notebook');
  await openApp(page, 'ui.notebook', NB);

  const frame = await findFrame(page, { urlPart: 'notebook.html', selector: '.md-view h1', timeout: 30000 });
  check('notebook opens the .ipynb and renders its markdown cell', !!frame);
  if (!frame) throw new Error('notebook frame not found');
  await sleep(1500);

  check('DOMPurify 3.4.18 loaded from /public/vendor (SRI ok)',
    await frame.evaluate(() => window.DOMPurify && DOMPurify.version) === '3.4.18');
  check('no payload ran on load', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));

  const view = await frame.evaluate(() => {
    const el = document.querySelector('.md-view');
    const a = [...el.querySelectorAll('a')].map((x) => ({ href: x.getAttribute('href'), target: x.getAttribute('target'), rel: x.getAttribute('rel') }));
    return {
      html: el.innerHTML,
      h1: el.querySelector('h1')?.textContent,
      bold: el.querySelector('strong')?.textContent,
      table: el.querySelectorAll('table td').length,
      checkbox: el.querySelectorAll('input[type=checkbox]').length,
      links: a,
    };
  });
  check('normal markdown still renders (h1, bold, table, task list)',
    view.h1 === 'Hello notebook' && view.bold === 'bold' && view.table === 2 && view.checkbox === 1, view);
  check('no event handlers / javascript: / iframe / form survive',
    !/onerror|onbegin|ontoggle|javascript:|<iframe|<form/i.test(view.html), view.html.slice(0, 300));
  const ext = view.links.find((l) => l.href === 'https://example.com/');
  check('external link opens in a new tab without opener', ext && ext.target === '_blank' && /noopener/.test(ext.rel || ''), ext);
  const anchor = view.links.find((l) => l.href === '#x');
  check('in-page anchor link left alone', anchor && !anchor.target, anchor);

  // Editing a markdown cell and running it goes through the same sanitiser.
  await frame.evaluate(() => {
    const c = cells.find((x) => x.type === 'markdown');
    c.cm.setValue('**edited** <img src=x onerror="top.__pwned_nb_run=1">');
    c.el.querySelector('.act-btn.run').click();
  });
  await sleep(1500);
  const edited = await frame.evaluate(() => document.querySelector('.md-view').innerHTML);
  check('edited markdown cell renders sanitised', /<strong>edited<\/strong>/.test(edited) && !/onerror/.test(edited), edited);
  check('no payload ran after running the cell', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));

  // Control: the same payload through marked without the sanitiser does run.
  await frame.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'ctl';
    d.innerHTML = marked.parse('<img src=x onerror="top.__ctl_nb=1">');
    document.body.appendChild(d);
  });
  const ctl = await pollFor(() => page.evaluate(() => window.__ctl_nb === 1), 5000);
  check('control: unsanitised marked output runs the payload', !!ctl);
  await frame.evaluate(() => document.getElementById('ctl')?.remove());

  // Smoke: run the Python code cell (Pyodide from the CDN).
  await frame.evaluate(() => { const c = cells.find((x) => x.type === 'code'); c.el.querySelector('.act-btn.run').click(); });
  const out = await pollFor(() => frame.evaluate(() => {
    const c = cells.find((x) => x.type === 'code');
    return c && /42/.test(c.outputEl.textContent) ? c.outputEl.textContent : null;
  }), 150000, 1000);
  check('smoke: Python code cell runs (print(6*7) → 42)', !!out, out || 'no output');
} catch (e) {
  check('script error', false, String(e && e.stack || e));
} finally {
  await browser.close();
}
finish('verify-viewers-notebook');
