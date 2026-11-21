// WIN-3 (+ BOOT-3, APP-2, NET-8) — opening a file views it; it never runs it (decisions.md D10).
// .js / .run / .svg / .html files in the user's home and in /mnt (peer/SSH-provided content) are
// opened the way every explorer does (Host.exec) and by double-click in Files; confirmation
// dialogs, if any, are declined. Pass = none of the payloads ran (no top-window sentinel, no vfs
// marker file, no localStorage key) — whatever viewer the fix chose to show them in.
import { newSession, boot, openWindow, windowFrame, step, report, done, sleep, pollFor, vfsWrite, closeAllWindows } from './lib/harness.mjs';

const DIRS = { home: '/home/user1/sec-open', mnt: '/mnt/sec-open' };
const files = (d, tag) => ({
  [`${d}/evil.js`]: `try { top.__sec_op_js_${tag} = 1 } catch (e) {} try { platform.host.getFS().writeFileSync('/tmp/sec-op-js-${tag}', '1') } catch (e) {}`,
  [`${d}/evil.run`]: `platform.window.top.__sec_op_run_${tag} = 1; platform.host.getFS().writeFileSync('/tmp/sec-op-run-${tag}', '1')`,
  [`${d}/evil.svg`]: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" onload="try{top.__sec_op_svgload_${tag}=1}catch(e){}"><script>try { top.__sec_op_svg_${tag} = 1 } catch (e) {} try { localStorage.setItem('__sec_op_svg_${tag}', '1') } catch (e) {}</script><rect width="20" height="20" fill="red"/></svg>`,
  [`${d}/evil.html`]: `<!doctype html><title>evil</title><script>try { top.__sec_op_html_${tag} = 1 } catch (e) {} try { if (parent.platform) top.__sec_op_htmlplat_${tag} = 1 } catch (e) {} try { localStorage.setItem('__sec_op_html_${tag}', '1') } catch (e) {} try { parent.fs.writeFileSync('/tmp/sec-op-html-${tag}', '1') } catch (e) {}</script>evil html`,
});

const S = await newSession();
let page;
const evidence = async (kind, tag) => page.evaluate(({ kind, tag }) => {
  const g = Object.keys(window).filter((k) => k.startsWith(`__sec_op_${kind}`) && k.endsWith('_' + tag));
  let ls = [];
  try { ls = Object.keys(localStorage).filter((k) => k.startsWith(`__sec_op_${kind}`)); } catch (_) {}
  const f = ['js', 'run', 'html'].includes(kind) && window.fs.existsSync(`/tmp/sec-op-${kind}-${tag}`) ? [`/tmp/sec-op-${kind}-${tag}`] : [];
  return [...g, ...ls.map((k) => 'localStorage:' + k), ...f];
}, { kind, tag });
const clear = () => page.evaluate(() => {
  for (const k of Object.keys(window)) if (k.startsWith('__sec_op_')) delete window[k];
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('__sec_op_')) localStorage.removeItem(k); } catch (_) {}
  for (const p of window.fs.readdirSync('/tmp')) if (p.startsWith('sec-op-')) window.fs.unlinkSync('/tmp/' + p);
});

try {
  page = await boot(S.context, { dialogPolicy: 'dismiss' });
  await vfsWrite(page, { ...files(DIRS.home, 'home'), ...files(DIRS.mnt, 'mnt') });

  for (const [tag, dir] of Object.entries(DIRS)) {
    for (const kind of ['js', 'run', 'svg', 'html']) {
      const ID = (kind === 'js' || kind === 'run') && tag === 'home' ? 'BOOT-3' : tag === 'mnt' ? 'NET-8' : 'WIN-3';
      await step(ID, `open-${kind}-in-${tag}`, async () => {
        await clear();
        await closeAllWindows(page);
        const d0 = page.__dialogs.length;
        await page.evaluate((p) => { try { window.platform.host.exec(window.platform, p); } catch (e) { window.__secOpenErr = String(e); } }, `${dir}/evil.${kind}`);
        await sleep(3000);
        const ev = await evidence(kind, tag);
        const w = await page.evaluate(() => [...document.querySelectorAll('.window[data-name]')].map((x) => x.getAttribute('data-name')));
        const dl = page.__dialogs.slice(d0).map((x) => x.message.slice(0, 60));
        return { pass: ev.length === 0, detail: `ran=${JSON.stringify(ev)} windows=${JSON.stringify(w)} dialogs(declined)=${JSON.stringify(dl)}` };
      });
    }
  }

  // Double-click in Files (vfs main.js) — the path a user takes, which may differ from Host.exec.
  for (const [tag, dir] of Object.entries(DIRS)) {
    await step(tag === 'mnt' ? 'NET-8' : 'WIN-3', `files-double-click-in-${tag}`, async () => {
      await clear();
      const ran = [], seen = [];
      for (const kind of ['js', 'run', 'svg', 'html']) {
        await closeAllWindows(page);
        await openWindow(page, 'explorer', dir);
        const f = await windowFrame(page, 'explorer');
        if (!f || !(await pollFor(() => f.locator('.file-item', { hasText: `evil.${kind}` }).count(), 10000))) { seen.push(kind + ':not-listed'); continue; }
        await f.locator('.file-item', { hasText: `evil.${kind}` }).first().dblclick({ force: true });
        await sleep(3000);
        const ev = await evidence(kind, tag);
        if (ev.length) ran.push(...ev);
        seen.push(kind + ':' + (await page.evaluate(() => [...document.querySelectorAll('.window[data-name]')].map((x) => x.getAttribute('data-name')).join('+'))));
      }
      await closeAllWindows(page);
      if (seen.every((s) => s.endsWith(':not-listed'))) return { pass: null, detail: 'Files did not list the folder' };
      return { pass: ran.length === 0, detail: `ran=${JSON.stringify(ran)} opened=${JSON.stringify(seen)}` };
    });
  }
} catch (e) {
  report('WIN-3', null, 'script error: ' + (e && e.stack || e), { check: 'harness' });
} finally {
  await S.close();
}
done('test-open-policy');
