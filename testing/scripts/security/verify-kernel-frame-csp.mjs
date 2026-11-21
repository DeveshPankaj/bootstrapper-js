// Verifies TODO 1A.7 (audit KRN-11, decisions.md D12):
//  - the OS refuses to boot inside a cross-origin frame (shows a notice), still boots inside a
//    same-origin one; drops window.opener; the top window's window.open forces
//    noopener,noreferrer for cross-origin URLs;
//  - the transitional meta CSP (object-src 'none'; base-uri 'self'; script-src self + CDNs +
//    'unsafe-inline' 'unsafe-eval' blob:) is present and enforced, also in inheriting
//    about:blank / srcdoc frames;
//  - smoke test: desktop, dock, Files, Terminal, Settings, Notepad, WebRTC, Remote Machines, Task
//    manager, Image viewer, SQLite (sql.js + wasm from cdnjs into an inheriting about:blank frame),
//    snake-game open with no CSP violation.
// Run: node testing/scripts/security/verify-kernel-frame-csp.mjs   (OS dev server on :8080)
import { launch, bootOS, addFrame, check, finish, sleep, pollFor, startServer, OS_URL } from './verify-kernel-lib.mjs';

const XO_PORT = 8095;
const XO = `http://127.0.0.1:${XO_PORT}`;
const server = await startServer(XO_PORT, {
  '/framer.html': { body: `<!doctype html><title>framer</title><iframe name="os" src="${OS_URL}/" style="width:900px;height:600px"></iframe>` },
  '/opener.html': { body: `<!doctype html><title>opener</title><button id="go" onclick="window.victim = window.open('${OS_URL}/', 'victim')">go</button>` },
  '/opened.html': { body: `<!doctype html><title>opened</title><script>window.__opener = window.opener === null ? 'null' : 'present';</script>` },
  '/x.js': { headers: { 'Content-Type': 'text/javascript', 'Access-Control-Allow-Origin': '*' }, body: 'window.__xoScript = 1' },
});

const browser = await launch();
const context = await browser.newContext();
const cspConsole = [];
const watchConsole = (p) => p.on('console', (m) => { const t = m.text(); if (/Content Security Policy/i.test(t)) cspConsole.push(t.slice(0, 300)); });
try {
  // ── framing ──
  const framer = await context.newPage();
  await framer.goto(`${XO}/framer.html`, { waitUntil: 'load' });
  const framed = await pollFor(async () => {
    const f = framer.frame({ name: 'os' });
    if (!f) return null;
    const s = await f.evaluate(() => ({ text: document.body ? document.body.textContent : '', fs: !!window.fs, bootLog: !!window.__bootLog })).catch(() => null);
    return s && s.text.includes('inside another site') ? s : null;
  }, 20000);
  check('cross-origin frame: boot refused with a notice, no vfs', !!framed && !framed.fs && !framed.bootLog, framed);
  await framer.close();

  const page = await bootOS(context);
  watchConsole(page);

  const sameOrigin = await addFrame(page, { name: 'inner-os', src: '/' });
  const inner = await pollFor(async () => {
    const s = await sameOrigin.evaluate(() => ({ boot: (window.__bootLog || []).map((e) => e.label), text: document.body ? document.body.textContent.slice(0, 60) : '' })).catch(() => null);
    return s && s.boot.some((l) => l.startsWith('VFS init')) ? s : null;
  }, 30000);
  check('same-origin frame: the OS still boots', !!inner, inner);
  await page.evaluate(() => document.querySelector('iframe[name="inner-os"]').remove());

  // ── opener + window.open hardening ──
  const opener = await context.newPage();
  await opener.goto(`${XO}/opener.html`, { waitUntil: 'load' });
  const [popup] = await Promise.all([context.waitForEvent('page'), opener.click('#go')]);
  await popup.waitForLoadState('load');
  const popupOpener = await pollFor(async () => {
    const s = await popup.evaluate(() => ({ booted: !!window.__bootLog, opener: window.opener === null ? 'null' : 'present' })).catch(() => null);
    return s && s.booted ? s : null;
  }, 30000);
  check('OS opened by another site drops window.opener', popupOpener && popupOpener.opener === 'null', popupOpener);
  await popup.close(); await opener.close();

  const desc = await page.evaluate(() => { const d = Object.getOwnPropertyDescriptor(window, 'open'); return { configurable: d.configurable, writable: d.writable }; });
  check('top window.open is the kernel wrapper (non-configurable, non-writable)', desc.configurable === false && desc.writable === false, desc);
  const [opened] = await Promise.all([
    context.waitForEvent('page'),
    page.evaluate((url) => { window.__openRet = window.open(url, '_blank') === null ? 'null' : 'window'; }, `${XO}/opened.html`),
  ]);
  await opened.waitForLoadState('load');
  const openedState = { returned: await page.evaluate(() => window.__openRet), opener: await opened.evaluate(() => window.__opener) };
  check('cross-origin window.open from the OS → noopener (null handle, no opener in the page)', openedState.returned === 'null' && openedState.opener === 'null', openedState);
  await opened.close();
  const sameOpen = await page.evaluate(() => { const w = window.open('/public/manifest.json', '_blank'); const ok = !!w; try { w && w.close(); } catch (_) {} return ok; });
  check('same-origin window.open still returns a handle', sameOpen === true);

  // ── CSP present + enforced ──
  const meta = await page.evaluate(() => (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '');
  check('meta CSP present in the top document', /object-src 'none'/.test(meta) && /base-uri 'self'/.test(meta) && /script-src 'self'/.test(meta), meta);
  const enforced = await page.evaluate(async (xo) => {
    const v = [];
    const onV = (e) => v.push(e.violatedDirective + ' ' + (e.blockedURI || ''));
    document.addEventListener('securitypolicyviolation', onV);
    // (rendered off screen: Chromium never loads a display:none <object>)
    const obj = document.createElement('object'); obj.data = '/public/manifest.json'; obj.type = 'application/json';
    obj.style.cssText = 'position:fixed;left:-500px;top:0;width:50px;height:50px'; document.body.appendChild(obj);
    const base = document.createElement('base'); base.href = 'https://evil.example/'; document.head.appendChild(base);
    const baseApplied = document.baseURI.startsWith('https://evil.example');
    base.remove();
    await new Promise((res) => { const s = document.createElement('script'); s.src = xo + '/x.js'; s.onload = s.onerror = res; document.head.appendChild(s); });
    let evalOk = false; try { evalOk = (0, eval)('1 + 1') === 2; } catch (_) {}
    const inline = document.createElement('script'); inline.textContent = 'window.__inlineOk = 1'; document.head.appendChild(inline);
    await new Promise((r) => setTimeout(r, 800));
    document.removeEventListener('securitypolicyviolation', onV);
    obj.remove();
    return { v, baseApplied, xoScript: window.__xoScript === 1, evalOk, inlineOk: window.__inlineOk === 1 };
  }, XO);
  check('object-src: <object> blocked', enforced.v.some((x) => x.startsWith('object-src')), enforced.v);
  check('base-uri: cross-origin <base> ignored', !enforced.baseApplied && enforced.v.some((x) => x.startsWith('base-uri')), enforced);
  check('script-src: script from a non-listed origin blocked', !enforced.xoScript && enforced.v.some((x) => x.startsWith('script-src')), enforced.v);
  check('inline scripts and eval still allowed (transitional)', enforced.evalOk && enforced.inlineOk, enforced);

  // inherited by an about:blank frame (like a window) and by a srcdoc frame (like the canvas wallpaper)
  const blank = await addFrame(page, { name: 'csp-blank', srcdoc: undefined, src: 'about:blank' });
  const blankRes = await blank.evaluate(async (xo) => {
    await new Promise((res) => { const s = document.createElement('script'); s.src = xo + '/x.js'; s.onload = s.onerror = res; document.head.appendChild(s); });
    return window.__xoScript === 1;
  }, XO);
  check('about:blank frame inherits the policy (non-listed script blocked)', blankRes === false);
  const sd = await addFrame(page, { name: 'csp-srcdoc', sandbox: 'allow-scripts', srcdoc: `<!doctype html><script type="module">
      const url = URL.createObjectURL(new Blob(['export const v = 42'], { type: 'text/javascript' }));
      import(url).then((m) => { window.__blobModule = m.v; }, (e) => { window.__blobModule = 'blocked: ' + e.message; });
    <\/script>` });
  await sleep(800);
  const blobModule = await sd.evaluate(() => window.__blobModule);
  check('srcdoc frame (canvas wallpaper shape) can still import a blob: module', blobModule === 42, blobModule);

  // ── smoke test ──
  cspConsole.length = 0;
  const dockOk = await pollFor(async () => {
    const h = await page.$('#vfs-dock-iframe');
    const f = h && await h.contentFrame();
    return f ? await f.evaluate(() => document.body && document.body.children.length > 0).catch(() => false) : null;
  }, 8000);
  check('dock (srcdoc, inherits the CSP) renders', dockOk === true, dockOk);
  const opens = [
    ['Files', 'explorer', []], ['Terminal', 'ui.terminal', []], ['Settings', 'ui.settings', []], ['Notepad', 'ui.notepad', []],
    ['WebRTC', 'ui.webrtc', []], ['Remote Machines', 'ui.remote-machines', []], ['Task manager', 'ui.task-manager', []],
    ['Image viewer', 'ui.imageviewer', ['/usr/share/icons/folder-icon.png']], ['SQLite', 'ui.sqlite', []],
  ];
  for (const [label, cmd, args] of opens) {
    const before = await page.evaluate(() => document.querySelectorAll('.window').length);
    const err = await page.evaluate(({ cmd, args }) => { try { window.platform.host.openWindow(cmd, ...args); return null; } catch (e) { return String(e); } }, { cmd, args });
    const after = await pollFor(async () => { const n = await page.evaluate(() => document.querySelectorAll('.window').length); return n > before ? n : null; }, 15000);
    check(`smoke: ${label} opens a window`, !err && !!after, err || { before, after });
  }
  await page.evaluate(() => window.platform.host.callCommand('ui.snake-game'));
  const snake = await pollFor(async () => {
    for (const f of page.frames()) if (f.url().includes('/opt/apps/snake-game/main.html') && await f.evaluate(() => !!window.AppSDK).catch(() => false)) return true;
    return null;
  }, 15000);
  check('smoke: snake-game (sandboxAppIframe) loads', !!snake);
  const terminalOk = await pollFor(async () => {
    for (const f of page.frames()) if (f.url().includes('/opt/apps/terminal/main.html') && await f.evaluate(() => !!(window.__terminalApp && window.Terminal)).catch(() => false)) return true;
    return null;
  }, 20000);
  check('smoke: Terminal has xterm (CDN) and its app object', !!terminalOk);
  const sqlOk = await pollFor(async () => {
    for (const f of page.frames()) if (await f.evaluate(() => typeof window.initSqlJs === 'function').catch(() => false)) return true;
    return null;
  }, 20000);
  const sqlError = await page.evaluate(() => [...document.querySelectorAll('.window iframe')].some((f) => { try { return /Failed to load sql\.js/.test(f.contentDocument.body.textContent); } catch (_) { return false; } }));
  check('smoke: SQLite loaded sql.js (cdnjs) + wasm in its inheriting frame', !!sqlOk && !sqlError, { sqlOk, sqlError });
  await sleep(2000);
  check('smoke: no CSP violations in the console while opening apps', cspConsole.length === 0, cspConsole);
} finally {
  await browser.close();
  server.close();
}
finish('verify-kernel-frame-csp (1A.7)');
