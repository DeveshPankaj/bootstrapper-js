// TODO 1F.7 / audit APP-14 (+ the WIN-7 dock leg) — file names, folder names, window titles
// and file-supplied labels are rendered as text by every viewer/tool that used templated
// innerHTML: audio-player playlist, fs-inspector tree + breadcrumb, all six docks, vector-store
// VFS/upload lists, ts-ide + cpp-ide sidebars (were inline onclick="f('<name>')"), colleps tile
// sets, model-builder dataset modal, ai-dom-lens VFS browser, snake-cnn3d checkpoints and the
// sqlite-charts desktop widget legend. Each section plants a hostile name, opens the app the
// normal way, checks the name shows up as literal text, that a `__pwned*` sentinel stays unset,
// and that the app's main action still works.
//
// Run: node testing/scripts/security/verify-viewers-names.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import fsNode from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { launch, bootReady, check, finish, sleep, pollFor, openApp, installApp, closeAllWindows, findFrame, pwnedKeys, writeFiles } from './verify-viewers-lib.mjs';

const H = (tag) => `<img src=x onerror=top.__pwned_${tag}=1>`;        // element payload
const Q = (tag) => `x');top.__pwned_${tag}=1;('`;                       // inline-handler payload
const A = (tag) => `x"><img src=x onerror=top.__pwned_${tag}=1><b a="`;  // attribute breakout

const browser = await launch();
const context = await browser.newContext();
let page;
const section = async (name, fn) => {
  try { await fn(); } catch (e) { check(`${name}: section ran`, false, String(e && e.stack || e).slice(0, 300)); }
  await closeAllWindows(page).catch(() => {});
};
const noPwn = async (label) => {
  const keys = await pwnedKeys(page);
  check(`${label}: nothing ran`, keys.length === 0, JSON.stringify(keys));
};

try {
  page = await bootReady(context);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));

  // ── audio-player: playlist of the opened file's folder ──────────────────────────────
  await section('audio-player', async () => {
    const D = '/home/user1/aptest';
    await writeFiles(page, { [`${D}/ok.mp3`]: 'x', [`${D}/${H('ap')}.mp3`]: 'x' });
    await openApp(page, 'ui.audioplayer', `${D}/ok.mp3`);
    const f = await findFrame(page, { urlPart: 'audio-player/player.html', selector: '.pl-item-name' });
    const names = f ? await f.evaluate(() => [...document.querySelectorAll('.pl-item-name')].map((e) => ({ t: e.textContent, title: e.title }))) : [];
    check('audio-player: hostile file name listed as text', names.some((n) => n.t === `${H('ap')}.mp3` && n.title === n.t), names);
    check('audio-player: playlist has both tracks (main action intact)', names.length === 2, names.length);
    check('audio-player: no markup in the playlist', f && await f.evaluate(() => !document.querySelector('#playlist img, .pl-item img')));
    await sleep(500);
    await noPwn('audio-player');
  });

  // ── fs-inspector: a real-disk folder (File System Access handle, stubbed) ───────────
  await section('fs-inspector', async () => {
    await page.evaluate(() => window.platform.host.exec(window.platform, '/opt/apps/fs-inspector/main.html'));
    const f = await findFrame(page, { urlPart: 'fs-inspector/main.html', selector: '#selectFolder', timeout: 30000 });
    if (!f) throw new Error('fs-inspector frame not found');
    await f.evaluate(([fileName, dirName, rootName]) => {
      const file = { kind: 'file', name: fileName, getFile: async () => new File(['hello'], fileName) };
      const sub = { kind: 'directory', name: dirName, entries: async function* () { yield [fileName, file]; } };
      const root = { kind: 'directory', name: rootName, entries: async function* () { yield [fileName, file]; yield [dirName, sub]; } };
      window.showDirectoryPicker = async () => root;
    }, [`${H('fsi1')}.txt`, H('fsi2'), H('fsi3')]);
    // the module (CodeMirror from esm.sh) wires the button once it has loaded — retry the click
    const listed = await pollFor(async () => {
      await f.click('#selectFolder', { force: true }).catch(() => {});
      await sleep(700);
      return f.evaluate(() => (document.querySelectorAll('#fileList .file-name').length ? [...document.querySelectorAll('#fileList .file-name')].map((e) => e.textContent) : null));
    }, 60000, 300);
    check('fs-inspector: hostile file + folder names listed as text', !!listed && listed.includes(`${H('fsi1')}.txt`) && listed.includes(H('fsi2')), listed);
    await f.locator('#fileList li.is-folder').first().click({ force: true });
    const crumbs = await pollFor(() => f.evaluate(() => (document.querySelector('#breadcrumb .crumb') ? document.getElementById('breadcrumb').textContent : null)), 5000);
    check('fs-inspector: breadcrumb shows folder names as text (navigation works)', !!crumbs && crumbs.includes(H('fsi3')) && crumbs.includes(H('fsi2')), crumbs);
    check('fs-inspector: no markup in tree/breadcrumb', await f.evaluate(() => !document.querySelector('#fileList img, #breadcrumb img')));
    await f.locator('#fileList li.is-file').first().click({ force: true });
    const tab = await pollFor(() => f.evaluate(() => document.getElementById('tab-name')?.textContent || null), 5000);
    check('fs-inspector: opening the file works', tab === `${H('fsi1')}.txt`, tab);
    await noPwn('fs-inspector');
  });

  // ── docks: a window whose title is markup ───────────────────────────────────────────
  await section('docks', async () => {
    const T = '<img src=x onerror="window.__pwned_dock=1">';
    await page.evaluate((T) => {
      window.platform.host.registerCommand('test.hostile-title', (body, props) => { body.textContent = 'hostile title'; props.setTitle(T); }, { title: 'Hostile', icon: 'apps' });
      window.platform.host.openWindow('test.hostile-title');
    }, T);
    let lastFrame = null;
    for (const id of ['macos', 'gnome', 'sidebar', 'default', 'windows', 'minimal']) {
      await page.evaluate((id) => window.platform.host.callCommand('open-vfs-dock', id), id);
      const df = await pollFor(async () => { const h = await page.$('#vfs-dock-iframe'); return h && h.contentFrame(); }, 10000);
      if (!df) { check(`dock ${id}: opened`, false); continue; }
      const info = await pollFor(() => df.evaluate((T) => {
        const hit = [...document.querySelectorAll('#dock .item')].find((el) => el.title === T || el.querySelector('.tip')?.textContent === T);
        if (!hit) return null;
        const label = hit.querySelector('.label, .tip');
        return { label: label ? label.textContent : '(icon-only dock)', icon: hit.querySelector('.icon')?.textContent, imgs: document.querySelectorAll('#dock img').length, pwned: !!window.__pwned_dock };
      }, T), 15000);
      check(`dock ${id}: hostile title rendered as text`, !!info && info.imgs === 0 && !info.pwned && (info.label === T || info.label === '(icon-only dock)') && info.icon === 'apps', info);
      lastFrame = df;
    }
    // smoke: a dock click still toggles the window over IPC (wm.toggleWindow)
    await page.evaluate(() => window.platform.host.callCommand('open-vfs-dock', 'macos'));
    const df = await pollFor(async () => { const h = await page.$('#vfs-dock-iframe'); return h && h.contentFrame(); }, 10000);
    await pollFor(() => df.evaluate((T) => !![...document.querySelectorAll('#dock .item')].find((el) => el.title === T), T), 10000);
    await df.evaluate((T) => [...document.querySelectorAll('#dock .item')].find((el) => el.title === T).click(), T);
    const minimized = await pollFor(() => page.evaluate(() => !!document.querySelector('.window[data-name="test.hostile-title"].minimized')), 5000);
    check('dock macos: clicking the item toggles the window (IPC intact)', !!minimized);
    // control: the same title as markup does run inside the dock sandbox
    if (lastFrame || df) {
      const f = df || lastFrame;
      await f.evaluate((T) => { const d = document.createElement('div'); d.innerHTML = T; document.body.appendChild(d); }, T);
      check('dock control: the title payload runs when used as markup', !!(await pollFor(() => f.evaluate(() => window.__pwned_dock === 1), 3000)));
    }
    await page.evaluate(() => window.platform.host.callCommand('open-vfs-dock', 'default'));
  });

  // ── vector-store: VFS file list + project list ──────────────────────────────────────
  await section('vector-store', async () => {
    const D = '/home/user1/vstest';
    await writeFiles(page, { [`${D}/${H('vs1')}.txt`]: 'alpha', [`${D}/${A('vs2')}.md`]: '# beta' });
    await installApp(page, 'vector-store');
    await openApp(page, 'ui.vector-store');
    const f = await findFrame(page, { urlPart: 'vector-store/main.html', selector: '#vfsPathInput', timeout: 30000 });
    const names = await pollFor(() => f.evaluate(async (D) => {
      document.getElementById('vfsPathInput').value = D;
      await browseVfs();
      const n = [...document.querySelectorAll('#vfsFileList .fi-name')].map((e) => e.textContent);
      return n.length ? { n, values: [...document.querySelectorAll('#vfsFileList .vfs-cb')].map((c) => c.value) } : null;
    }, D), 20000, 500);
    check('vector-store: hostile VFS names listed as text', !!names && names.n.includes(`${H('vs1')}.txt`) && names.n.includes(`${A('vs2')}.md`), names);
    check('vector-store: checkbox values are the real names', !!names && names.values.includes(`${A('vs2')}.md`));
    check('vector-store: escHtml escapes quotes', await f.evaluate(() => escHtml('"\'<>&') === '&quot;&#39;&lt;&gt;&amp;'));
    await f.evaluate(() => { projects.push({ slug: 's', name: '<img src=x onerror=top.__pwned_vs3=1>', rows: [{ id: 'r1"><img src=x onerror=top.__pwned_vs4=1>', text: 't', source: 'paste' }] }); renderProjList(); openProject(projects.length - 1); });
    check('vector-store: project name / row id escaped', await f.evaluate(() => !document.querySelector('#projList img, #rowsBody img') && [...document.querySelectorAll('.proj-name')].some((e) => e.textContent.includes('<img'))));
    await sleep(500);
    await noPwn('vector-store');
  });

  // ── ts-ide: project folder with hostile file names ──────────────────────────────────
  await section('ts-ide', async () => {
    const D = '/home/user1/tstest';
    await writeFiles(page, { [`${D}/${Q('ts1')}.ts`]: 'console.log(1)', [`${D}/${H('ts2')}.js`]: '// js' });
    await installApp(page, 'ts-ide');
    await openApp(page, 'ui.ts-ide');
    const f = await findFrame(page, { urlPart: 'ts-ide/main.html', selector: '#sb-content .sb-item', timeout: 30000 });
    await f.evaluate((D) => loadProjectFromDir(D), D);
    const items = await pollFor(() => f.evaluate(() => {
      const n = [...document.querySelectorAll('#sb-content .sb-item .nm')].map((e) => e.textContent);
      return n.some((x) => x.includes('__pwned_ts1')) ? n : null;
    }), 15000);
    check('ts-ide: hostile file names listed as text', !!items && items.includes(`${Q('ts1')}.ts`) && items.includes(`${H('ts2')}.js`), items);
    check('ts-ide: no inline handlers in the sidebar', await f.evaluate(() => !document.querySelector('#sb-content [onclick], #sb-content img')));
    await f.evaluate((n) => [...document.querySelectorAll('#sb-content .sb-item')].find((el) => el.dataset.file === n).click(), `${H('ts2')}.js`);
    check('ts-ide: clicking a file switches to it', await pollFor(() => f.evaluate((n) => activeFile === n, `${H('ts2')}.js`), 5000));
    await sleep(500);
    await noPwn('ts-ide');
  });

  // ── cpp-ide: project with a hostile folder name ─────────────────────────────────────
  await section('cpp-ide', async () => {
    const name = Q('cpp');
    await writeFiles(page, { [`/home/user1/projects/cpp/${name}/main.cpp`]: 'int main(){ return 0; }\n' });
    await installApp(page, 'cpp-ide');
    await openApp(page, 'ui.cpp-ide');
    const f = await findFrame(page, { urlPart: 'cpp-ide/main.html', selector: '#sb-content .sb-item', timeout: 30000 });
    const ok = await pollFor(() => f.evaluate(async (name) => {
      await refreshSidebar();
      const it = [...document.querySelectorAll('#sb-content .sb-item')].find((el) => el.textContent.includes(name));
      return it ? true : null;
    }, name), 15000, 500);
    check('cpp-ide: hostile project name listed as text', !!ok);
    check('cpp-ide: no inline handlers in the sidebar', await f.evaluate(() => !document.querySelector('#sb-content [onclick]')));
    await f.evaluate((name) => [...document.querySelectorAll('#sb-content .sb-item')].find((el) => el.textContent.includes(name)).click(), name);
    check('cpp-ide: clicking the project loads it', await pollFor(() => f.evaluate((name) => currentProject === name, name), 5000));
    // smoke: an example loads into the editor (running it is checked in verify-viewers-cdn.mjs)
    await f.evaluate(() => loadExample(0));
    check('cpp-ide: smoke — example loads into the editor', await f.evaluate(() => /Hello, World!/.test(editor.getValue())));
    await noPwn('cpp-ide');
  });

  // ── colleps: hostile tile set (default.json) ────────────────────────────────────────
  await section('colleps', async () => {
    const tile = { id: A('col1'), name: H('col2'), color: '#f00" onmouseover="top.__pwned_col3=1', weight: 1, rotate: false, solid: true,
      sockets: { N: A('col4'), E: 'a', S: 'a', W: 'a', U: '*', D: '*' } };
    await writeFiles(page, { '/home/user1/colleps/tilesets/default.json': JSON.stringify({ tiles: [tile] }) });
    await openApp(page, 'ui.colleps');
    const f = await findFrame(page, { urlPart: 'colleps.html', selector: '.tile-chip', timeout: 30000 });
    const chip = await f.evaluate(() => document.querySelector('.tile-chip-name')?.textContent);
    check('colleps: hostile tile name rendered as text', chip === tile.name, chip);
    await f.locator('.tile-chip').first().click({ force: true });
    const ed = await pollFor(() => f.evaluate(() => document.getElementById('ed-N') && { n: document.getElementById('ed-N').value, name: document.getElementById('ed-name').value }), 5000);
    check('colleps: editor fields hold the literal values (select works)', !!ed && ed.n === tile.sockets.N && ed.name === tile.name, ed);
    check('colleps: no markup / handlers injected', await f.evaluate(() => !document.querySelector('#tile-list img, #editor-slot img, [onmouseover]')));
    await noPwn('colleps');
  });

  // ── model-builder: uploaded dataset with hostile file + column names ────────────────
  await section('model-builder', async () => {
    await openApp(page, 'ui.model-builder');
    const f = await findFrame(page, { urlPart: 'model-builder/main.html', selector: '#datasetFileInput', timeout: 30000 });
    const col = A('mb1');
    const csv = `a,"${col.replace(/"/g, '""')}"\n1,2\n3,4\n5,6\n`;
    await f.setInputFiles('#datasetFileInput', { name: `${H('mb2')}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) });
    const m = await pollFor(() => f.evaluate(() => document.querySelector('.dsColRow') && {
      cols: [...document.querySelectorAll('.dsColName')].map((e) => e.textContent),
      dataCols: [...document.querySelectorAll('.dsColRow')].map((e) => e.dataset.col),
      hint: document.querySelector('.dsHint')?.textContent,
    }), 10000);
    check('model-builder: hostile column + file names rendered as text', !!m && m.cols.includes(col) && m.dataCols.includes(col) && m.hint.includes(`${H('mb2')}.csv`), m);
    check('model-builder: no markup injected into the dataset modal', await f.evaluate(() => !document.querySelector('#dsModalBody img')));
    await noPwn('model-builder');
  });

  // ── ai-dom-lens: VFS browser (extension was rendered unescaped, upper-cased) ────────
  await section('ai-dom-lens', async () => {
    const D = '/home/user1/adltest';
    const evil = 'a.<img src=x onerror=&#x74;&#x6f;&#x70;&#x2e;__PWNED_ADL=1>';
    await writeFiles(page, { [`${D}/${evil}`]: 'x', [`${D}/page.html`]: '<h1>hi</h1>' });
    await installApp(page, 'ai-dom-lens');
    await openApp(page, 'ui.ai-dom-lens');
    const f = await findFrame(page, { urlPart: 'ai-dom-lens/main.html', selector: '#vfsNavList', timeout: 30000 });
    const types = await pollFor(() => f.evaluate(async (D) => {
      await vfsNavOpen(D);
      const t = [...document.querySelectorAll('#vfsNavList .vfs-item-type')].map((e) => e.textContent);
      return t.length > 1 ? t : null;
    }, D), 15000, 500);
    check('ai-dom-lens: hostile extension listed as text', !!types && types.some((t) => t.startsWith('<IMG')), types);
    await sleep(500);
    check('ai-dom-lens: nothing ran', await page.evaluate(() => window.__PWNED_ADL === undefined));
  });

  // ── snake-cnn3d: checkpoint with non-numeric layer sizes ────────────────────────────
  await section('snake-cnn3d', async () => {
    const cp = { layers: [{ type: 'conv3d', filters: A('cnn1'), kernel: 3, activation: 'relu' }, { type: 'dense', units: A('cnn2'), activation: 'relu' }], genome: [], settings: {} };
    await writeFiles(page, { '/home/user1/.local/share/snake-cnn3d/checkpoint.json': JSON.stringify(cp) });
    await openApp(page, 'ui.snake-cnn3d');
    const f = await findFrame(page, { urlPart: 'snake-cnn3d/main.html', selector: '#filters-0', timeout: 30000 });
    const vals = f ? await f.evaluate(() => ({ filters: document.getElementById('filters-0').value, units: document.getElementById('units-1')?.value })) : null;
    check('snake-cnn3d: checkpoint layer sizes coerced to numbers', !!vals && /^\d+$/.test(vals.filters) && /^\d+$/.test(vals.units), vals);
    await sleep(500);
    await noPwn('snake-cnn3d');
  });

  // ── sqlite-charts: desktop widget legend from database values ───────────────────────
  await section('sqlite-charts', async () => {
    const dir = fsNode.mkdtempSync(path.join(os.tmpdir(), 'wos-sc-'));
    const dbFile = path.join(dir, 'evil.db');
    const db = new DatabaseSync(dbFile);
    db.exec('CREATE TABLE t(label TEXT, v INTEGER)');
    db.prepare('INSERT INTO t VALUES (?, ?)').run(H('sc'), 3);
    db.prepare('INSERT INTO t VALUES (?, ?)').run('ok-label', 2);
    db.close();
    const bytes = [...fsNode.readFileSync(dbFile)];
    fsNode.rmSync(dir, { recursive: true, force: true });
    await page.evaluate((bytes) => {
      const fs = window.fs;
      if (!fs.existsSync('/home/user1/sctest')) fs.mkdirSync('/home/user1/sctest');
      fs.writeFileSync('/home/user1/sctest/evil.db', window.Buffer.from(bytes));
      window.platform.host.callCommand('add-persistent-widget', 'sqlite-chart',
        { dbPath: '/home/user1/sctest/evil.db', query: 'SELECT label, v FROM t', labelCol: 0, valueCol: 1, chartType: 'pie', autoRefresh: 0, title: 'evil' }, { title: 'evil' });
    }, bytes);
    const legend = await pollFor(() => page.evaluate((needle) => {
      const s = [...document.querySelectorAll('span')].find((e) => e.textContent === needle);
      return s ? s.textContent : null;
    }, H('sc')), 30000, 500);
    check('sqlite-charts widget: database label rendered as text', legend === H('sc'), legend);
    check('sqlite-charts widget: second label renders too (widget works)', await page.evaluate(() => [...document.querySelectorAll('span')].some((e) => e.textContent === 'ok-label')));
    await noPwn('sqlite-charts');
  });

  // ── image-viewer: registers .ico (the open policy routes .svg/.ico to it) ──────────
  await section('image-viewer', async () => {
    await writeFiles(page, { '/home/user1/ivtest/icon.ico': 'x' });
    check('image-viewer: registers .ico', await page.evaluate(() => (window.platform.host.getCommand('ui.imageviewer')?.meta?.fileExtensions || []).includes('.ico')));
    await page.evaluate(() => window.platform.host.exec(window.platform, '/home/user1/ivtest/icon.ico'));
    check('image-viewer: opening an .ico shows the image viewer',
      await pollFor(() => page.evaluate(() => !!document.querySelector('.window[data-name="ui.imageviewer"]')), 8000));
  });

  // ── static: nn-ide.html (not shipped into the vfs) renders dataset meta as text ────
  const nnHtml = fsNode.readFileSync(new URL('../../../docs/public/mount/opt/apps/nn-ide/nn-ide.html', import.meta.url), 'utf8');
  check('static: nn-ide.html dataset info no longer built with innerHTML', !/\$\('df-info'\)\.innerHTML/.test(nnHtml));
  await noPwn('overall');
} catch (e) {
  check('script error', false, String(e && e.stack || e));
} finally {
  await browser.close();
}
finish('verify-viewers-names');
