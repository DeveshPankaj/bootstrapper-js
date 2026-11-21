// TODO 1F.9 / audit APP-11 — CDN code in the viewer/tool apps (+ /home/user1/projects and
// /etc/settings) is pinned to exact versions, and every CDN <script src>/stylesheet tag and every
// dynamic script loader carries a matching sha384 SRI + crossorigin="anonymous".
//
// Static part (Node): scans the owned files, rejects @latest / floating majors / unversioned
// packages on jsdelivr, unpkg, esm.sh, cdnjs and the Pyodide CDN, downloads each SRI'd file and
// compares its hash with the integrity attribute (also for the vendored DOMPurify).
// Browser part: loads each page from its static copy and checks the libraries actually load with
// SRI enforced (no "integrity" console errors), then exercises the dynamic loaders in the OS:
// dashboard Chart.js, dev-utils jsPDF + pdf-lib, sqlite-charts/sqlite-browser sql.js, nn-ide TF.js,
// and runs the C++ IDE's Hello World (JSCPP was pinned to a version that never existed).
//
// Not SRI-able (reported, pinned only): ES-module imports (three, @xenova/transformers, esm.sh
// CodeMirror/react-markdown), sql.js's .wasm, Pyodide's own runtime/packages, tesseract's
// worker/core/language data, Google Fonts CSS, models fetched by transformers.js.
//
// Run: node testing/scripts/security/verify-viewers-cdn.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import fsNode from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import { launch, bootReady, OS_URL, check, finish, sleep, pollFor, openApp, installApp, findFrame, pwnedKeys, writeFiles, closeAllWindows } from './verify-viewers-lib.mjs';

const ROOT = path.resolve(new URL('../../../docs/public/mount/', import.meta.url).pathname);
const VENDOR = path.resolve(new URL('../../../docs/public/vendor/', import.meta.url).pathname);
const NOT_MINE = new Set(['file-explorer', 'explorer-sifi', 'pkg-manager', 'app-drawer', 'app-launcher', 'spotlight', 'bookmarks', 'terminal', 'task-manager',
  'webrtc', 'remote-machines', 'distributed-compute', 'distributed-kv', 'wamp-client', 'youtube-player', 'speed-test', 'vscode-online']);

const walk = (dir) => fsNode.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return (e.name === 'lib' || e.name === 'images') ? [] : walk(p);
  return /\.(html|js|py|css)$/.test(e.name) ? [p] : [];
});
const files = [
  ...fsNode.readdirSync(path.join(ROOT, 'opt/apps')).filter((d) => !NOT_MINE.has(d)).flatMap((d) => walk(path.join(ROOT, 'opt/apps', d))),
  ...walk(path.join(ROOT, 'home/user1/projects')),
  ...walk(path.join(ROOT, 'etc/settings')),
];
const rel = (p) => path.relative(ROOT, p);

// ── static: exact versions ───────────────────────────────────────────────────────────
const EXACT = /^\d+\.\d+\.\d+([-+][\w.]+)?$/;
const PATTERNS = [
  [/https:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/(@[^/@\s'"`]+\/[^/@?#\s'"`]+|[^/@?#\s'"`]+)(?:@([^/?#\s'"`]*))?/g, (v) => EXACT.test(v || '')],
  [/https:\/\/esm\.sh\/(?:stable\/|v\d+\/)?(@[^/@\s'"`]+\/[^/@?#\s'"`]+|[^/@?#\s'"`]+)(?:@([^/?#\s'"`]*))?/g, (v) => EXACT.test(v || '')],
  [/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/([^/\s'"`]+)\/([^/\s'"`]+)\//g, (v) => /^r?\d+(\.\d+)*$/.test(v || '')],
  [/https:\/\/cdn\.jsdelivr\.net\/pyodide\/([^/\s'"`]+)\//g, (v, m) => /^v\d+\.\d+\.\d+$/.test(m[1])],
];
const floating = [];
let urlCount = 0;
for (const f of files) {
  fsNode.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    for (const [re, ok] of PATTERNS) {
      for (const m of line.matchAll(re)) {
        urlCount++;
        if (!ok(m[2], m)) floating.push(`${rel(f)}:${i + 1} ${m[0]}`);
      }
    }
  });
}
check(`static: every CDN URL has an exact version (${urlCount} URLs in ${files.length} files)`, floating.length === 0, floating);

// ── static: SRI on CDN script/stylesheet tags and dynamic loaders ───────────────────
const cache = new Map();
const sha384 = async (url) => {
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      const buf = url.startsWith('/public/vendor/')
        ? fsNode.readFileSync(path.join(VENDOR, url.slice('/public/vendor/'.length)))
        : Buffer.from(await (await fetch(url)).arrayBuffer());
      return 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
    })());
  }
  return cache.get(url);
};
const CDN_HOST = /^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|esm\.sh)\//;
const tagIssues = [];
let tagCount = 0;
for (const f of files.filter((x) => x.endsWith('.html'))) {
  const src = fsNode.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/<(script|link)\b([^>]*)>/g)) {
    const attrs = m[2];
    const url = (attrs.match(/\b(?:src|href)="([^"]+)"/) || [])[1];
    if (!url || !(CDN_HOST.test(url) || url.startsWith('/public/vendor/'))) continue;
    if (m[1] === 'link' && !/rel="stylesheet"/.test(attrs)) continue;
    tagCount++;
    const integrity = (attrs.match(/\bintegrity="([^"]+)"/) || [])[1];
    if (!integrity) { tagIssues.push(`${rel(f)}: no integrity on ${url}`); continue; }
    if (!/\bcrossorigin="anonymous"/.test(attrs)) tagIssues.push(`${rel(f)}: no crossorigin on ${url}`);
    const want = await sha384(url);
    if (integrity !== want) tagIssues.push(`${rel(f)}: integrity mismatch for ${url}`);
  }
}
check(`static: CDN/vendor <script>/<link rel=stylesheet> tags carry a matching SRI (${tagCount} tags)`, tagIssues.length === 0, tagIssues);

const DYNAMIC = [
  ['opt/apps/notebook/notebook.html', 'https://cdn.jsdelivr.net/npm/pyodide@0.26.4/pyodide.js'],
  ['opt/apps/dashboard/dashboard.html', 'https://cdn.jsdelivr.net/npm/chart.js@4.6.1/dist/chart.umd.min.js'],
  ['opt/apps/nn-ide/nn-ide.html', 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js'],
  ['opt/apps/robot-sim/main.html', 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.15.0/dist/tf.min.js'],
  ['opt/apps/sqlite-browser/main.js', 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js'],
  ['opt/apps/sqlite-charts/main.js', 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js'],
  ['opt/apps/model-builder/main.html', 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js'],
  ['opt/apps/dev-utils/main.js', 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js'],
  ['opt/apps/dev-utils/main.js', 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'],
  ['opt/apps/mermaid-viewer/main.js', 'https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js'],
  ['opt/apps/ai-dom-lens/main.html', 'https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js'],
  ['opt/apps/ai-dom-lens/main.html', '/public/vendor/dompurify/3.4.18/purify.min.js'],
];
const dynIssues = [];
for (const [file, url] of DYNAMIC) {
  const src = fsNode.readFileSync(path.join(ROOT, file), 'utf8');
  if (!src.includes(url)) { dynIssues.push(`${file}: URL missing ${url}`); continue; }
  if (!src.includes(await sha384(url))) dynIssues.push(`${file}: no matching integrity for ${url}`);
}
check(`static: dynamic script loaders carry a matching SRI (${DYNAMIC.length} loaders)`, dynIssues.length === 0, dynIssues);

// ── browser: static pages load their libraries with SRI enforced ────────────────────
const PAGES = [
  ['opt/apps/notebook/notebook.html', ['CodeMirror', 'marked', 'DOMPurify']],
  ['opt/apps/analyze/main.html', ['math']],
  ['opt/apps/anova/main.html', ['math', 'jspdf']],
  ['opt/apps/cpp-ide/main.html', ['CodeMirror', 'JSCPP']],
  ['opt/apps/alpine-wasm/main.html', ['Terminal', 'FitAddon']],
  ['opt/apps/nn-ide/nn-ide.html', ['LiteGraph']],
  ['opt/apps/python-demo/demo.html', ['CodeMirror', 'loadPyodide']],
  ['opt/apps/python-repl/python.html', ['loadPyodide']],
  ['opt/apps/todo-python/todo.html', ['loadPyodide']],
  ['opt/apps/robot-sim/main.html', ['THREE', 'CANNON', 'tf']],
  ['opt/apps/screen-reader/main.html', ['Tesseract']],
  ['opt/apps/trainboard/board.html', ['Chart']],
  ['opt/apps/ts-ide/main.html', ['CodeMirror', 'ts']],
  ['opt/apps/webgl-demo/main.html', ['Stats']],
  ['home/user1/projects/Snake-LSTM.html', ['tf', 'Chart']],
  ['home/user1/projects/Snake-QLearning.html', ['tf', 'Chart']],
  ['home/user1/projects/WebGL.html', ['Stats']],
  ['home/user1/projects/screen-reader.html', ['Tesseract']],
  ['home/user1/projects/Analyze.html', ['math']],
  ['home/user1/projects/Anova.html', ['math', 'jspdf']],
];
const browser = await launch();
try {
  const ctx0 = await browser.newContext();
  for (const [file, globals] of PAGES) {
    const p = await ctx0.newPage();
    const sriErrors = [];
    p.on('console', (m) => { if (m.type() === 'error' && /integrity|digest/i.test(m.text())) sriErrors.push(m.text().slice(0, 160)); });
    p.on('dialog', (d) => d.dismiss().catch(() => {}));
    await p.goto(`${OS_URL}/public/mount/${file}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    const loaded = await pollFor(() => p.evaluate((g) => (g.every((n) => typeof window[n] !== 'undefined') ? g : null), globals).catch(() => null), 60000, 500);
    check(`page ${file}: ${globals.join(', ')} loaded with SRI`, !!loaded && sriErrors.length === 0, sriErrors.length ? sriErrors : (loaded || 'missing: ' + globals.join(',')));
    if (file.endsWith('cpp-ide/main.html')) {
      const out = await p.evaluate(() => { let o = ''; JSCPP.run('#include <iostream>\nusing namespace std;\nint main(){ cout << "Hello, World!" << endl; return 0; }', '', { stdio: { write: (s) => { o += s; } } }); return o; }).catch((e) => 'ERR ' + e.message);
      check('cpp-ide: JSCPP 2.0.6 runs Hello World (2.2.1 never existed)', /Hello, World!/.test(out), out);
    }
    if (file.endsWith('nn-ide/nn-ide.html')) {
      const tf = await p.evaluate(async () => { await ensureTf(); return window.tf && tf.version.tfjs; }).catch((e) => 'ERR ' + e.message);
      check('nn-ide.html: dynamic TF.js 4.22.0 loads with SRI', tf === '4.22.0', tf);
    }
    await p.close();
  }
  await ctx0.close();

  // fs-inspector: exact esm.sh CodeMirror versions still build an editor (one @codemirror/state)
  const ctx1 = await browser.newContext();
  const fp = await ctx1.newPage();
  const fpErrors = [];
  fp.on('pageerror', (e) => fpErrors.push(String(e).slice(0, 160)));
  await fp.goto(`${OS_URL}/public/mount/opt/apps/fs-inspector/main.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  const cm = await pollFor(() => fp.evaluate(() => !!document.querySelector('.cm-editor')).then((x) => x || null), 60000, 500);
  check('fs-inspector: pinned esm.sh CodeMirror builds the editor', !!cm && !fpErrors.some((e) => /multiple instances|@codemirror\/state/i.test(e)), fpErrors);
  await ctx1.close();

  // ── browser: dynamic loaders inside the OS ─────────────────────────────────────────
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await bootReady(context);
  const osSri = [];
  page.on('console', (m) => { if (m.type() === 'error' && /integrity|digest/i.test(m.text())) osSri.push(m.text().slice(0, 160)); });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));

  // dashboard: a chart from a vfs JSON source → Chart.js 4.6.1
  await writeFiles(page, {
    '/home/user1/cdntest/data.json': JSON.stringify([1, 3, 2, 5]),
    '/home/user1/.local/share/dashboard/dashboard.json': JSON.stringify({ groups: [], widgets: [], charts: [{ id: 'c1', title: 'cdn chart', color: '#4dabf7', type: 'line', source: '/home/user1/cdntest/data.json', mapFn: '', intervalMs: 0 }] }),
  });
  await installApp(page, 'dashboard');
  await openApp(page, 'ui.dashboard');
  const df = await findFrame(page, { urlPart: 'dashboard/dashboard.html', selector: '#tab-charts', timeout: 30000 });
  await df.evaluate(() => switchTab('charts'));
  const chartVer = await pollFor(() => df.evaluate(() => (window.Chart && document.querySelector('canvas') ? window.Chart.version : null)), 30000, 500);
  check('dashboard: Chart.js 4.6.1 loads with SRI and draws the chart', chartVer === '4.6.1', chartVer);
  await closeAllWindows(page);

  // dev-utils: Image → PDF (jsPDF 2.5.2), Join PDFs (pdf-lib 1.17.1)
  await installApp(page, 'dev-utils');
  await openApp(page, 'ui.dev-utils');
  const du = await findFrame(page, { selector: '.du-nav', timeout: 30000 });
  await du.locator('.du-nav', { hasText: 'Image → PDF' }).first().evaluate((el) => el.click());
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
  await du.setInputFiles('.du-dropzone input[type=file]', { name: 'red.png', mimeType: 'image/png', buffer: png });
  await du.locator('button', { hasText: 'Convert to PDF' }).first().evaluate((el) => el.click());
  const pdfDone = await pollFor(() => du.evaluate(() => (/Done — 1 image/.test(document.body.textContent) ? true : null)), 30000, 500);
  check('dev-utils: Image → PDF works (jsPDF 2.5.2 with SRI)', !!pdfDone);
  const mkPdf = () => { const J = ((window.jspdf || window.top.jspdf) || {}).jsPDF; const d = new J(); d.text('x', 10, 10); return [...new Uint8Array(d.output('arraybuffer'))]; };
  const pdfBytes = await page.evaluate(mkPdf).catch(() => du.evaluate(mkPdf).catch(() => null));
  await du.locator('.du-nav', { hasText: 'Join PDFs' }).first().evaluate((el) => el.click());
  await pollFor(() => du.evaluate(() => /Drop PDFs/.test(document.body.textContent) || null), 5000);
  if (pdfBytes) {
    const b = Buffer.from(pdfBytes);
    await du.setInputFiles('.du-dropzone input[type=file]', [{ name: 'a.pdf', mimeType: 'application/pdf', buffer: b }, { name: 'b.pdf', mimeType: 'application/pdf', buffer: b }]);
    await pollFor(() => du.evaluate(() => [...document.querySelectorAll('button')].some((x) => x.textContent === 'Merge PDFs') || null), 5000);
    await du.locator('button', { hasText: 'Merge PDFs' }).first().evaluate((el) => el.click());
  }
  const merged = await pollFor(() => du.evaluate(() => (/Done — 2 pages/.test(document.body.textContent) ? true : null)), 30000, 500);
  check('dev-utils: Join PDFs works (pdf-lib 1.17.1 with SRI)', !!merged);
  await closeAllWindows(page);

  // sqlite-charts desktop widget + sqlite-browser: sql.js 1.10.3 with SRI
  const dir = fsNode.mkdtempSync(path.join(os.tmpdir(), 'wos-cdn-'));
  const dbFile = path.join(dir, 't.db');
  const db = new DatabaseSync(dbFile);
  db.exec("CREATE TABLE fruit(name TEXT, n INTEGER); INSERT INTO fruit VALUES ('apple', 3), ('pear', 5);");
  db.close();
  const dbBytes = [...fsNode.readFileSync(dbFile)];
  fsNode.rmSync(dir, { recursive: true, force: true });
  await page.evaluate((bytes) => {
    window.fs.writeFileSync('/home/user1/cdntest/t.db', window.Buffer.from(bytes));
    window.platform.host.callCommand('add-persistent-widget', 'sqlite-chart', { dbPath: '/home/user1/cdntest/t.db', query: 'SELECT name, n FROM fruit', labelCol: 0, valueCol: 1, chartType: 'bar', autoRefresh: 0, title: 'cdn' }, { title: 'cdn' });
  }, dbBytes);
  const widget = await pollFor(() => page.evaluate(() => [...document.querySelectorAll('div')].some((d) => d.textContent === 'pear') || null), 30000, 500);
  check('sqlite-charts widget: sql.js 1.10.3 loads with SRI and queries the db', !!widget);
  await openApp(page, 'ui.sqlite', '/home/user1/cdntest/t.db');
  const sb = await findFrame(page, { selector: '*', text: 'fruit', timeout: 30000 });
  check('sqlite-browser: opens the db (sql.js with SRI)', !!sb);
  check('OS: no SRI errors from the dynamic loaders', osSri.length === 0, osSri);
  check('OS: nothing ran', (await pwnedKeys(page)).length === 0);
} catch (e) {
  check('script error', false, String(e && e.stack || e));
} finally {
  await browser.close();
}
finish('verify-viewers-cdn');
