// Markup from file names, titles, documents and shared logs must render as text.
//
//   WIN-5  a command title / icon with HTML; header style {cssText}; setBoundingClientRect({cssText});
//          appendActionButton({icon: html}) — no script, no full-screen overlay
//   WIN-8 / APP-4  crafted .md (attribute breakout, javascript: link, raw HTML) in the default viewer
//   APP-5  .ipynb markdown cell with an onerror image
//   APP-7  .mmd with `click A "javascript:…"`, node clicked
//   APP-10 TrainBoard log row with an HTML run name / metric
//   APP-13 Dashboard file picker: a folder named a');…;(' clicked
//   APP-14 Media Player playlist with an HTML file name; gnome/macos docks showing an HTML window title
// Pass = the sentinel stays unset (top window, or the dock frame itself for docks).
import {
  newSession, boot, openWindow, ensureApp, findFrame, windowFrame, step, report, done, sleep, pollFor, sentinels, sentinelsAnywhere,
  vfsWrite, vfsRead, closeAllWindows,
} from './lib/harness.mjs';

const IMG = (name) => `<img src=x onerror="top.__sec_${name}=1">`;
const S = await newSession();
let page;
const fired = async (prefix) => {
  const s = await sentinelsAnywhere(page, prefix);
  await page.evaluate((p) => { for (const k of Object.keys(window)) if (k.startsWith(p)) delete window[k]; }, prefix).catch(() => {});
  return s;
};

try {
  page = await boot(S.context, { dialogPolicy: 'dismiss' });

  // ── WIN-5: window chrome ────────────────────────────────────────────────
  await page.evaluate((IMGS) => {
    window.platform.host.registerCommand('sec.win5', (body, props) => { window.__secWin5Props = props; props.setWindowView(true); }, {
      title: IMGS.title, icon: IMGS.icon, header: { style: { cssText: 'position:fixed;inset:0;z-index:2147483647', position: 'fixed', zIndex: '2147483647' } },
    });
  }, { title: IMG('win5_title'), icon: IMG('win5_icon') });
  await openWindow(page, 'sec.win5');
  await sleep(1500);
  await step('WIN-5', 'html-title-and-icon-render-as-text', async () => {
    const s = await fired('__sec_win5');
    const imgs = await page.evaluate(() => document.querySelectorAll('.window[data-name="sec.win5"] .window-header img, .window[data-name="sec.win5"] img').length);
    if (!(await page.$('.window[data-name="sec.win5"]'))) return { pass: null, detail: 'window did not open' };
    return { pass: s.length === 0 && imgs === 0, detail: `sentinels=${JSON.stringify(s)}; <img> in chrome=${imgs}` };
  });
  await step('WIN-5', 'header-style-allowlist', async () => {
    const r = await page.evaluate(() => {
      const w = document.querySelector('.window[data-name="sec.win5"]');
      const h = w && (w.querySelector('.window-header') || w.firstElementChild);
      if (!h) return null;
      const cs = getComputedStyle(h);
      return { position: cs.position, zIndex: cs.zIndex, inline: h.style.cssText.slice(0, 120) };
    });
    if (!r) return { pass: null, detail: 'no header' };
    return { pass: r.position !== 'fixed' && r.zIndex !== '2147483647', detail: JSON.stringify(r) };
  });
  await step('WIN-5', 'geometry-ignores-cssText', async () => {
    const r = await page.evaluate(() => {
      const props = window.__secWin5Props;
      if (!props) return null;
      try { props.setBoundingClientRect({ cssText: 'position:fixed;inset:0;z-index:2147483647', zIndex: 2147483647, position: 'fixed' }); } catch (e) { /* refusing is fine */ }
      const w = document.querySelector('.window[data-name="sec.win5"]');
      const cs = getComputedStyle(w);
      return { position: cs.position, zIndex: cs.zIndex, inline: w.style.cssText.slice(0, 160) };
    });
    if (!r) return { pass: null, detail: 'props not captured' };
    return { pass: r.position !== 'fixed' && r.zIndex !== '2147483647', detail: JSON.stringify(r) };
  });
  await step('WIN-5', 'action-button-icon-is-text', async () => {
    await page.evaluate((icon) => { try { window.__secWin5Props.appendActionButton({ icon, title: 'x', onClick() {} }); } catch (_) {} }, IMG('win5_btn'));
    await sleep(800);
    const s = await fired('__sec_win5');
    return { pass: s.length === 0, detail: `sentinels=${JSON.stringify(s)}` };
  });
  await closeAllWindows(page);

  // ── WIN-8 / APP-4: the default .md viewer ─────────────────────────────────
  await step('WIN-8', 'markdown-viewer-no-script', async () => {
    const md = [
      '# hello', '', '![x](x" onerror="top.__sec_md_attr=1)', '', '[click me](javascript:top.__sec_md_js=1)', '',
      '<img src=x onerror="top.__sec_md_raw=1">', '', '[ok](https://example.com)',
    ].join('\n');
    await vfsWrite(page, { '/home/user1/sec-xss/evil.md': md });
    await page.evaluate(() => window.platform.host.exec(window.platform, '/home/user1/sec-xss/evil.md'));
    await sleep(2500);
    let s = await fired('__sec_md');
    const name = await page.evaluate(() => (document.querySelector('.window[data-name]') || {}).getAttribute?.('data-name'));
    const f = name ? await windowFrame(page, name) : null;
    let detail = `viewer=${name}`;
    if (f) {
      const sub = await findFrame(page, { predicate: () => !!document.body && /click me/.test(document.body.innerText || ''), timeout: 5000 });
      const doc = sub || f;
      const dom = await doc.evaluate(() => ({
        onerrorAttrs: document.querySelectorAll('[onerror]').length,
        jsLinks: [...document.querySelectorAll('a')].filter((a) => /^\s*javascript:/i.test(a.getAttribute('href') || '')).length,
      })).catch(() => ({}));
      detail += ` dom=${JSON.stringify(dom)}`;
      await doc.locator('text=click me').first().click({ force: true }).catch(() => {});
      await sleep(800);
      s = s.concat(await fired('__sec_md'));
      if (dom.onerrorAttrs || dom.jsLinks) s.push('dom:' + JSON.stringify(dom));
    }
    await closeAllWindows(page);
    return { pass: s.length === 0, detail: `${detail}; fired=${JSON.stringify(s)}` };
  });

  // ── APP-5: notebook markdown cell ─────────────────────────────────────────
  await step('APP-5', 'notebook-markdown-cell-no-script', async () => {
    const nb = { cells: [{ cell_type: 'markdown', metadata: {}, source: ['# Title\n', IMG('nb') + '\n'] }, { cell_type: 'code', metadata: {}, source: ['1 + 1'], outputs: [], execution_count: null }], metadata: {}, nbformat: 4, nbformat_minor: 5 };
    await vfsWrite(page, { '/home/user1/sec-xss/evil.ipynb': JSON.stringify(nb) });
    if (!(await ensureApp(page, 'notebook', 'ui.notebook'))) return { pass: null, detail: 'ui.notebook not available' };
    await openWindow(page, 'ui.notebook', '/home/user1/sec-xss/evil.ipynb');
    const f = await findFrame(page, { predicate: () => /Title/.test(document.body && document.body.innerText || ''), timeout: 25000 });
    await sleep(2000);
    const s = await fired('__sec_nb');
    await closeAllWindows(page);
    if (!f) return { pass: s.length ? false : null, detail: `notebook did not render the cell; fired=${JSON.stringify(s)}` };
    return { pass: s.length === 0, detail: `fired=${JSON.stringify(s)}` };
  });

  // ── APP-7: mermaid click → javascript: ────────────────────────────────────
  await step('APP-7', 'mermaid-click-javascript', async () => {
    await vfsWrite(page, { '/home/user1/sec-xss/evil.mmd': 'graph TD\n  A[ClickSecNode] --> B[Other]\n  click A "javascript:top.__sec_mm=1"\n  click B href "javascript:top.__sec_mm2=1"\n' });
    if (!(await ensureApp(page, 'mermaid-viewer', 'ui.mermaid'))) return { pass: null, detail: 'ui.mermaid not available' };
    await openWindow(page, 'ui.mermaid', '/home/user1/sec-xss/evil.mmd');
    const f = await findFrame(page, { predicate: () => !!document.querySelector('svg .node, svg g.node'), timeout: 25000 });
    if (!f) { const s = await fired('__sec_mm'); await closeAllWindows(page); return { pass: s.length ? false : null, detail: 'diagram did not render (CDN?)' }; }
    for (const label of ['ClickSecNode', 'Other']) await f.locator('svg .node', { hasText: label }).first().click({ force: true }).catch(() => {});
    await sleep(1200);
    const links = await f.evaluate(() => [...document.querySelectorAll('svg a')].map((a) => a.getAttribute('href') || a.getAttribute('xlink:href')).filter((h) => /javascript:/i.test(h || '')).length);
    const s = await fired('__sec_mm');
    await closeAllWindows(page);
    return { pass: s.length === 0 && links === 0, detail: `fired=${JSON.stringify(s)}; javascript: links in svg=${links}` };
  });

  // ── APP-10: TrainBoard log row ────────────────────────────────────────────
  await step('APP-10', 'trainboard-log-values-are-text', async () => {
    const log = '/home/user1/.local/share/trainboard/log.jsonl';
    const prev = (await vfsRead(page, log)) || '';
    const rows = [
      { run: IMG('tb_run'), metric: 'loss', step: 0, value: 1 },
      { run: IMG('tb_run'), metric: 'loss', step: 1, value: 0.5 },
      { run: 'ok-run', metric: IMG('tb_metric'), step: 0, value: 1 },
    ].map((r) => JSON.stringify(r)).join('\n');
    await vfsWrite(page, { [log]: prev + (prev && !prev.endsWith('\n') ? '\n' : '') + rows + '\n' });
    await openWindow(page, 'ui.trainboard');
    await findFrame(page, { urlPart: 'trainboard/', timeout: 20000 });
    await sleep(5000);
    const s = await fired('__sec_tb');
    await closeAllWindows(page);
    return { pass: s.length === 0, detail: `fired=${JSON.stringify(s)}` };
  });

  // ── APP-13: dashboard file picker ─────────────────────────────────────────
  await step('APP-13', 'dashboard-picker-folder-name', async () => {
    const name = "a');top.__sec_db=1;('";
    await vfsWrite(page, { [`/home/user1/sec-db/${name}/x.txt`]: 'x' });
    if (!(await ensureApp(page, 'dashboard', 'ui.dashboard'))) return { pass: null, detail: 'ui.dashboard not available' };
    await openWindow(page, 'ui.dashboard');
    const f = await findFrame(page, { urlPart: 'dashboard/', predicate: () => typeof openFilePicker === 'function' || !!document.getElementById('fp-list'), timeout: 20000 });
    if (!f) return { pass: null, detail: 'dashboard frame not found' };
    const opened = await f.evaluate(() => {
      try { if (typeof openFilePicker === 'function') { openFilePicker('sec-target'); if (typeof fpNavigate === 'function') fpNavigate('/home/user1/sec-db'); return true; } } catch (e) { return 'threw ' + e.message; }
      return false;
    });
    await sleep(800);
    const row = f.locator('#fp-list .fp-row, #fp-list > *', { hasText: 'top.__sec_db' }).first();
    if (!(await row.count())) { await closeAllWindows(page); return { pass: null, detail: `picker row not found (opened=${opened})` }; }
    await row.click({ force: true });
    await sleep(800);
    const s = await fired('__sec_db');
    await closeAllWindows(page);
    return { pass: s.length === 0, detail: `fired=${JSON.stringify(s)}` };
  });

  // ── APP-14: Media Player playlist ─────────────────────────────────────────
  await step('APP-14', 'media-player-file-name-is-text', async () => {
    const file = `/home/user1/sec-xss/${IMG('ap').replace(/"/g, '')}.mp3`;
    await vfsWrite(page, { [file]: '' });
    await openWindow(page, 'ui.audioplayer', file);
    await findFrame(page, { urlPart: 'audio-player/', timeout: 15000 });
    await sleep(3000);
    const s = await fired('__sec_ap');
    await closeAllWindows(page);
    return { pass: s.length === 0, detail: `fired=${JSON.stringify(s)}` };
  });

  // ── APP-14 / WIN-7 chain: docks render window titles ──────────────────────
  for (const dockId of ['gnome', 'macos']) {
    await step('APP-14', `dock-${dockId}-title-is-text`, async () => {
      await page.evaluate((id) => { try { window.platform.host.callCommand('open-vfs-dock', id); } catch (_) {} }, dockId);
      const h = await pollFor(() => page.$('#vfs-dock-iframe'), 8000);
      if (!h) return { pass: null, detail: 'dock not opened' };
      await page.evaluate((t) => {
        try { window.platform.host.registerCommand('sec.docktitle', (body, props) => { props.setWindowView(true); props.setTitle(t); }, { title: t, icon: 'apps' }); } catch (_) {}
      }, '<img src=x onerror="self.__sec_dock_xss=1">');
      await openWindow(page, 'sec.docktitle');
      await sleep(2500);
      const df = await (await page.$('#vfs-dock-iframe')).contentFrame();
      const r = await df.evaluate(() => ({ xss: self.__sec_dock_xss === 1, imgs: document.querySelectorAll('img[onerror]').length, text: /onerror/.test(document.body.textContent || '') }));
      await closeAllWindows(page);
      return { pass: !r.xss && r.imgs === 0, detail: JSON.stringify(r) };
    });
  }
} catch (e) {
  report('WIN-5', null, 'script error: ' + (e && e.stack || e), { check: 'harness' });
} finally {
  await S.close();
}
done('test-xss');
