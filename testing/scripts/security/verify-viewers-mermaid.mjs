// TODO 1F.3 / audit APP-7 — the Diagram app (mermaid-viewer) renders with securityLevel 'strict'
// from an exact, SRI-checked mermaid build. A .mmd file with an HTML label payload, a
// javascript: click link and a click callback (and a hostile file name, which also lands in the
// top-document "Pin" overlay) is opened; nothing may run, no javascript: link or event handler
// may reach the inserted SVG. Control: the same source rendered with the old 'loose' setting
// does contain the live payload. Smoke: edit + Save writes the file, Pin overlay works.
//
// Run: node testing/scripts/security/verify-viewers-mermaid.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootReady, check, finish, sleep, pollFor, openApp, installApp, findFrame, pwnedKeys, writeFiles } from './verify-viewers-lib.mjs';

const NAME = '<img src=x onerror=top.__pwned_mm_name=1>';
const FILE = `/home/user1/mmtest/${NAME}.mmd`;
const SRC = [
  'graph TD',
  '  A[Start] --> B["<img src=x onerror=top.__pwned_mm_label=1> label"]',
  '  B --> C[End]',
  '  click A href "javascript:top.__pwned_mm_href=1"',
  '  click C call mmCb()',
].join('\n');

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootReady(context);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await writeFiles(page, { [FILE]: SRC });
  await installApp(page, 'mermaid-viewer');
  await openApp(page, 'ui.mermaid', FILE);

  const f = await findFrame(page, { selector: '.mv-svg-wrap svg', timeout: 60000 });
  check('diagram renders (mermaid 11.17.2 loaded with SRI)', !!f);
  if (!f) throw new Error('mermaid frame not found');
  await f.evaluate(() => { window.mmCb = () => { top.__pwned_mm_call = 1; }; });
  await sleep(1000);

  const svg = await f.evaluate(() => {
    const el = document.querySelector('.mv-svg-wrap svg');
    return {
      html: el.outerHTML,
      handlers: [...el.querySelectorAll('*')].filter((n) => [...n.attributes].some((a) => /^on/i.test(a.name))).length,
      jsLinks: [...el.querySelectorAll('a')].filter((a) => /javascript:/i.test(a.getAttribute('href') || a.getAttribute('xlink:href') || '')).length,
      imgs: el.querySelectorAll('img').length,
      texts: el.textContent,
      level: window.mermaid && window.mermaid.mermaidAPI.getConfig().securityLevel,
      version: window.mermaid && window.mermaid.version && window.mermaid.version(),
    };
  });
  check('mermaid initialised with securityLevel strict', svg.level === 'strict', svg.level);
  check('pinned build is the one running', !svg.version || svg.version === '11.17.2', svg.version);
  check('labels still render', svg.texts.includes('Start') && svg.texts.includes('End'), svg.texts.slice(0, 120));
  // strict mode keeps harmless markup (e.g. <img src="x">) but strips every handler
  check('no event-handler attributes in the inserted SVG', svg.handlers === 0 && !/onerror=/i.test(svg.html), { handlers: svg.handlers, imgs: svg.imgs });
  check('no javascript: links in the inserted SVG', svg.jsLinks === 0 && !/javascript:/i.test(svg.html));

  // Click the nodes the diagram tries to wire (href + call).
  await f.evaluate(() => document.querySelectorAll('.mv-svg-wrap svg .node').forEach((n) => { n.dispatchEvent(new MouseEvent('click', { bubbles: true })); n.querySelector('a')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); }));
  await sleep(800);
  check('nothing ran (render + node clicks)', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));

  // Window title / toolbar show the hostile name as text.
  const title = await f.evaluate(() => document.querySelector('.mv-title')?.textContent);
  check('file name shown as text in the toolbar', title === `${NAME}.mmd`, title);

  // Pin overlay (top document) shows the name as text.
  await f.locator('button', { hasText: 'Pin' }).first().click({ force: true });
  const pin = await pollFor(() => page.evaluate((n) => {
    const s = [...document.querySelectorAll('div > span')].find((e) => e.textContent === `📌 ${n}`);
    return s ? { text: s.textContent, imgs: s.parentElement.querySelectorAll('img').length } : null;
  }, NAME), 5000);
  check('Pin overlay header is text (top document)', !!pin && pin.imgs === 0, pin);

  // Control: the same source under the old 'loose' setting carries the live payload.
  const live = await f.evaluate(async (src) => {
    const m = window.mermaid;
    m.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
    let out = '';
    try { out = (await m.render('ctl-loose', src)).svg; } finally { m.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' }); }
    return /javascript:|onerror=/i.test(out);
  }, SRC);
  check("control: 'loose' rendering of the same file contains the payload", live);

  // Smoke: edit + Save writes the file.
  await f.locator('textarea.mv-textarea').fill('graph LR\n  X[Edited] --> Y[Saved]', { force: true });
  await f.locator('button[title="Save to VFS"]').click({ force: true });
  const saved = await pollFor(() => page.evaluate((p) => window.fs.readFileSync(p, 'utf8').includes('Edited') || null, FILE), 5000);
  check('smoke: edit + Save writes the diagram', !!saved);
  const rerender = await pollFor(() => f.evaluate(() => (document.querySelector('.mv-svg-wrap svg')?.textContent || '').includes('Edited') || null), 10000);
  check('smoke: edited diagram re-renders', !!rerender);
  check('no payload ran (overall)', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));
} catch (e) {
  check('script error', false, String(e && e.stack || e));
} finally {
  await browser.close();
}
finish('verify-viewers-mermaid');
