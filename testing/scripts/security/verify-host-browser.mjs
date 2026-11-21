// Verifies 1B.4 (audit WIN-4, NET-2; decisions.md D10/D13): the Browser (`ui.iframe`).
//   - cross-origin http(s) pages: sandbox="allow-scripts allow-same-origin allow-forms",
//     referrerpolicy=no-referrer, no window.platform, can't open popups or navigate the OS
//   - javascript:, data:, blob: URLs are refused
//   - same-origin vfs content outside /opt/apps goes through the open policy (opaque
//     ui.sandboxed-app for .html, image viewer for .svg, editor for .js) — never a same-origin page
//   - first-party /opt/apps pages still get window.platform (terminal)
//
// Run: node testing/scripts/security/verify-host-browser.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootOS, startServer, OS_URL } from './spike-lib.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const PORT = 8097;
const EXT = `http://127.0.0.1:${PORT}`;
const server = await startServer(PORT, {
  '/page.html': { body: `<!doctype html><title>external-fixture</title><body>external<script>
    window.__probe = {
      referrer: document.referrer,
      platform: typeof window.platform,
      popup: (() => { try { return window.open('${EXT}/page.html?popup', '_blank') ? 'opened' : 'blocked'; } catch (e) { return 'blocked: ' + e.name; } })(),
    };
    try { top.location.href = '${EXT}/page.html?navigated'; window.__probe.topNav = 'no exception'; } catch (e) { window.__probe.topNav = 'blocked: ' + e.name; }
  </script></body>` },
});

const D = '/home/user1/browser-verify';
const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootOS(context);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.evaluate((D) => {
    const fs = window.fs;
    if (!fs.existsSync(D)) fs.mkdirSync(D, { recursive: true });
    fs.writeFileSync(`${D}/page.html`, '<title>vfs-page</title><script>try { top.__pwned_vfs = 1 } catch (e) {} try { if (parent.platform) top.__pwned_vfs_platform = 1 } catch (e) {}</script>vfs page');
    fs.writeFileSync(`${D}/evil.svg`, '<svg xmlns="http://www.w3.org/2000/svg" onload="top.__pwned_svg=1" width="10" height="10"><script>top.__pwned_svg2=1</script></svg>');
    fs.writeFileSync(`${D}/x.js`, 'window.top.__pwned_js = 1');
  }, D);

  const reset = () => page.evaluate(() => document.querySelectorAll('.window').forEach((w) => w.remove()));
  const pwned = () => page.evaluate(() => Object.keys(window).filter((k) => k.startsWith('__pwned')));
  const openBrowser = async (url) => {
    await reset();
    await page.evaluate((u) => platform.host.openWindow('ui.iframe', u), url).catch((e) => e.message);
    await page.waitForTimeout(1500);
  };
  const browserInfo = () => page.evaluate(() => {
    const win = document.querySelector('.window[data-name="ui.iframe"]');
    const outer = win?.querySelector('iframe');
    const doc = outer?.contentDocument;
    const inner = doc?.querySelector('iframe');
    return {
      open: !!win,
      title: win?.querySelector('.window-header')?.textContent || '',
      text: doc?.body?.innerText?.slice(0, 120) || '',
      inner: inner ? { src: inner.getAttribute('src'), srcdoc: inner.hasAttribute('srcdoc'), sandbox: inner.getAttribute('sandbox'), referrerpolicy: inner.getAttribute('referrerpolicy'), hasPlatform: (() => { try { return !!inner.contentWindow.platform; } catch (_) { return 'cross-origin'; } })() } : null,
      img: !!doc?.querySelector('img'),
      editor: !!doc?.querySelector('.cm-editor'),
    };
  });

  // 1. cross-origin page
  await openBrowser(`${EXT}/page.html`);
  let info = await browserInfo();
  check('external page: restrictive sandbox + no-referrer', info.inner?.sandbox === 'allow-scripts allow-same-origin allow-forms' && info.inner?.referrerpolicy === 'no-referrer', JSON.stringify(info.inner));
  const ext = page.frames().find((f) => f.url().startsWith(`${EXT}/page.html`));
  const probe = ext ? await ext.evaluate(() => window.__probe).catch((e) => ({ err: e.message })) : null;
  check('external page: no window.platform', probe?.platform === 'undefined', JSON.stringify(probe));
  check('external page: no referrer sent', probe?.referrer === '', JSON.stringify(probe?.referrer));
  check('external page: popups blocked', String(probe?.popup).startsWith('blocked'), String(probe?.popup));
  check('external page: cannot navigate the OS', page.url().startsWith(OS_URL) && !page.url().includes('navigated'), `${probe?.topNav} top=${page.url()}`);
  check('external page: window title is the host', info.title.includes(`127.0.0.1:${PORT}`), info.title);

  // 2. refused schemes
  for (const [tag, url] of [['javascript', 'javascript:top.__pwned_jsurl=1'], ['data', 'data:text/html,<script>top.__pwned_data=1</script>'], ['blob', 'blob:http://localhost:8080/00000000-0000-0000-0000-000000000000']]) {
    await openBrowser(url);
    info = await browserInfo();
    check(`${tag}: URL refused (no frame, nothing runs)`, info.open && !info.inner && /can't be opened/.test(info.text) && (await pwned()).length === 0, `${info.text} ${JSON.stringify(await pwned())}`);
  }

  // 3. vfs content outside /opt/apps → the open policy's viewer, never same-origin
  for (const [tag, url] of [['vfs path', `${D}/page.html`], ['absolute /(sw) URL', `${OS_URL}/(sw)${D}/page.html`], ['/opt/apps/.. traversal', `/opt/apps/../..${D}/page.html`]]) {
    await openBrowser(url);
    await page.waitForTimeout(500);
    info = await browserInfo();
    check(`${tag} .html → opaque sandbox (srcdoc, no platform)`, info.inner?.srcdoc === true && info.inner?.sandbox === 'allow-scripts allow-forms allow-modals' && (await pwned()).length === 0, `${JSON.stringify(info.inner)} ${JSON.stringify(await pwned())}`);
  }
  await openBrowser(`${D}/evil.svg`);
  await page.waitForTimeout(500);
  info = await browserInfo();
  check('vfs .svg → shown as an image, script inert', info.img && !info.inner && (await pwned()).length === 0, `${JSON.stringify(info)} ${JSON.stringify(await pwned())}`);
  await openBrowser(`${D}/x.js`);
  info = await browserInfo();
  check('vfs .js → editor, not run', info.editor && (await pwned()).length === 0, `${JSON.stringify({ editor: info.editor })} ${JSON.stringify(await pwned())}`);

  // 4. same-origin static file → opaque sandbox
  await openBrowser(`${OS_URL}/public/mount/home/user1/Notes.md`);
  info = await browserInfo();
  check('same-origin static URL → opaque sandbox, no platform', info.inner?.sandbox === 'allow-scripts allow-forms allow-modals' && info.inner?.hasPlatform !== true, JSON.stringify(info.inner));

  // 5. first-party page keeps working with window.platform
  await openBrowser('/opt/apps/terminal/main.html');
  await page.waitForTimeout(1500);
  info = await browserInfo();
  const xterm = await page.evaluate(() => !!document.querySelector('.window[data-name="ui.iframe"] iframe')?.contentDocument?.querySelector('iframe')?.contentDocument?.querySelector('.xterm'));
  check('first-party /opt/apps page: same-origin, window.platform, renders', info.inner?.src === '/(sw)/opt/apps/terminal/main.html' && !info.inner?.sandbox && info.inner?.hasPlatform === true && xterm, JSON.stringify({ inner: info.inner, xterm }));
} finally {
  await context.close();
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
