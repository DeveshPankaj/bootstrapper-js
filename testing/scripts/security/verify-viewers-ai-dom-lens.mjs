// TODO 1F.2 / audit APP-6 — AI DOM Lens shows the analysed page in a frame with
// sandbox="allow-same-origin" and no allow-scripts: vfs HTML, vfs Markdown (also sanitised with
// the vendored DOMPurify) and fetched web pages (URL mode) never run script, while the lens can
// still read and highlight their DOM. Control: the same srcdoc in an unsandboxed frame runs.
// Smoke: DOM node extraction and the "AI View" rendering work on the loaded page.
//
// Run: node testing/scripts/security/verify-viewers-ai-dom-lens.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootReady, startServer, check, finish, sleep, pollFor, openApp, installApp, findFrame, pwnedKeys, writeFiles } from './verify-viewers-lib.mjs';

const PORT = 18793;
const HTML = '<h1>Shop</h1><p class="desc">Cheap laptops for students and travellers</p>'
  + '<script>top.__pwned_adl_html=1</script><img src=x onerror="top.__pwned_adl_img=1">'
  + '<a href="javascript:top.__pwned_adl_js=1" id="jl">a javascript link</a>';
const MD = '# Notes\n\nSome **markdown** text about green tea and oolong.\n\n<img src=x onerror="top.__pwned_adl_md=1">\n\n<script>top.__pwned_adl_mds=1</script>\n';

const server = await startServer(PORT, {
  '/page': { headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' },
    body: '<html><head><title>remote</title></head><body><h2>Remote page heading</h2><p>Remote paragraph with enough text</p><script>top.__pwned_adl_url=1</script></body></html>' },
});
const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootReady(context);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await writeFiles(page, { '/home/user1/adl/page.html': HTML, '/home/user1/adl/notes.md': MD });
  await installApp(page, 'ai-dom-lens');
  await openApp(page, 'ui.ai-dom-lens');
  const f = await findFrame(page, { urlPart: 'ai-dom-lens/main.html', selector: '#pageFrame', timeout: 30000 });
  check('AI DOM Lens opens', !!f);
  if (!f) throw new Error('lens frame not found');
  check('page frame is sandboxed without allow-scripts', await f.evaluate(() => document.getElementById('pageFrame').getAttribute('sandbox') === 'allow-same-origin'));

  const loadVfs = async (p) => {
    await f.evaluate((p) => { setSrcMode('vfs'); return loadVfsPage(p); }, p);
    return pollFor(() => f.evaluate(() => /Loaded/.test(document.getElementById('stTxt').textContent) || null), 15000);
  };

  // ── vfs HTML ──
  check('vfs HTML loads', !!(await loadVfs('/home/user1/adl/page.html')));
  await sleep(1200);
  const dom = await f.evaluate(() => ({
    h1: pageDoc.querySelector('h1')?.textContent,
    nodes: getNodes().map((n) => n.text),
    scripts: pageDoc.querySelectorAll('script').length,
  }));
  check('DOM still inspectable (h1 + extracted nodes)', dom.h1 === 'Shop' && dom.nodes.some((t) => t.includes('Cheap laptops')), dom);
  await f.evaluate(() => { pageDoc.getElementById('jl').click(); document.getElementById('pageFrame').contentWindow.scrollTo(0, 0); });
  await sleep(600);
  check('vfs HTML: scripts, handlers and javascript: links do not run', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));
  // highlight path used by Analyze
  check('highlight styling can be applied to the page DOM', await f.evaluate(() => { const el = pageDoc.querySelector('p'); el.classList.add('ai-match'); return getComputedStyle(el).outlineStyle !== 'none'; }));

  // ── vfs Markdown ──
  check('vfs Markdown loads', !!(await loadVfs('/home/user1/adl/notes.md')));
  await sleep(1000);
  const md = await f.evaluate(() => ({
    h1: pageDoc.querySelector('h1')?.textContent,
    strong: pageDoc.querySelector('strong')?.textContent,
    bodyHtml: pageDoc.body.innerHTML,
    purify: !!window.DOMPurify && window.DOMPurify.version,
  }));
  check('Markdown rendered (h1, bold)', md.h1 === 'Notes' && md.strong === 'markdown', md);
  check('Markdown sanitised with DOMPurify 3.4.18 (no handlers / scripts)', md.purify === '3.4.18' && !/onerror|<script/i.test(md.bodyHtml), md.bodyHtml.slice(0, 200));
  check('vfs Markdown: nothing ran', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));

  // ── URL mode ──
  await f.evaluate((u) => { setSrcMode('url'); return loadUrlPage(u); }, `http://localhost:${PORT}/page`);
  const urlOk = await pollFor(() => f.evaluate(() => (/Loaded/.test(document.getElementById('stTxt').textContent) ? pageDoc.querySelector('h2')?.textContent : null)), 15000);
  check('URL mode: fetched page loads and is inspectable', urlOk === 'Remote page heading', urlOk);
  await sleep(800);
  check('URL mode: the page\'s script does not run', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));

  // ── smoke: AI View extraction ──
  // 'split' keeps the page laid out ('ai'-only hides it first, so it extracts nothing — pre-existing)
  await f.evaluate(() => setViewMode('split'));
  const ai = await pollFor(() => f.evaluate(() => document.querySelectorAll('#aiViewCanvas .av-item').length || null), 5000);
  check('smoke: AI View renders extracted items', !!ai, ai);

  // Control: the same kind of srcdoc in a frame without the sandbox does run.
  await f.evaluate(() => { const c = document.createElement('iframe'); c.id = 'ctl'; c.srcdoc = '<script>top.__ctl_adl=1</script>'; document.body.appendChild(c); });
  check('control: unsandboxed srcdoc runs its script', !!(await pollFor(() => page.evaluate(() => window.__ctl_adl === 1), 4000)));
  await f.evaluate(() => document.getElementById('ctl')?.remove());
  check('no payload ran (overall)', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));
} catch (e) {
  check('script error', false, String(e && e.stack || e));
} finally {
  await browser.close();
  server.close();
}
finish('verify-viewers-ai-dom-lens');
