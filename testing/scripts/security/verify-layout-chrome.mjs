// verify-layout-chrome.mjs — TODO 1C.1 (audit WIN-5): window chrome takes
// titles as text, icons only as ligature names, header styles only from an
// allowlist, and geometry only as clamped numeric left/top/width/height.
// Also smoke-tests the chrome: drag, resize, fullscreen, minimize, close.
//
//   node testing/scripts/security/verify-layout-chrome.mjs
import { launch, bootOS } from './spike-lib.mjs';

const results = [];
const check = (id, ok, detail = '') => {
  results.push({ id, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? '  — ' + detail : ''}`);
};

const HTML_TITLE = '<img src=x onerror="top.__pwnTitle=1">Title';
const HTML_ICON = '<img src=x onerror="top.__pwnIcon=1">';

const browser = await launch();
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await bootOS(context);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  if (process.env.DEBUG_CHROME) page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.type(), m.text().slice(0, 300)); });

  // A test command with hostile metadata; its props are kept for the checks below.
  await page.evaluate(({ HTML_TITLE, HTML_ICON }) => {
    window.platform.host.registerCommand('verify.chrome', (body, props) => {
      window.top.__props = props;
      body.textContent = 'chrome probe';
      props.setWindowView(true);
    }, {
      title: HTML_TITLE,
      icon: HTML_ICON,
      header: { style: { cssText: 'position:fixed;inset:0;z-index:2147483647', background: 'url(https://example.invalid/x.png)', color: 'red', backgroundColor: '#123456' } },
    });
    window.platform.host.openWindow('verify.chrome');
  }, { HTML_TITLE, HTML_ICON });
  let pid;
  for (let i = 0; i < 40 && !pid; i++) {
    await page.waitForTimeout(250);
    pid = await page.evaluate(() => window.top.__props?.pid && document.querySelector(`.window[data-pid="${window.top.__props.pid}"] .window-header`) ? window.top.__props.pid : undefined);
  }
  if (!pid) throw new Error('probe window did not open: ' + JSON.stringify(await page.evaluate(() => window.platform.host.callCommand('process.list'))));
  const win = `.window[data-pid="${pid}"]`;

  const head = await page.evaluate((win) => {
    const h = document.querySelector(`${win} .window-header`);
    const spans = h.querySelectorAll('.title > span');
    return {
      title: spans[1]?.textContent, icon: spans[0]?.textContent, imgs: h.querySelectorAll('img').length,
      position: h.style.position, zIndex: h.style.zIndex, color: h.style.color, bg: h.style.backgroundColor, bgImage: h.style.backgroundImage,
    };
  }, win);
  check('meta.title rendered as text', head.title === HTML_TITLE && head.imgs === 0, JSON.stringify(head.title));
  check('meta.icon not a ligature name → no icon', head.icon === '', JSON.stringify(head.icon));
  check('meta.header.style: cssText/url() dropped, colours applied',
    head.position === '' && head.zIndex === '' && !head.bgImage.includes('url') && head.color === 'red' && head.bg === 'rgb(18, 52, 86)', JSON.stringify(head));

  // setTitle with markup
  const HTML_SET_TITLE = '<b>b</b><img src=x onerror="top.__pwnSetTitle=1">';
  await page.evaluate((t) => window.top.__props.setTitle(t), HTML_SET_TITLE);
  await page.waitForTimeout(200);
  const afterSetTitle = await page.evaluate((win) => {
    const h = document.querySelector(`${win} .window-header`);
    return { title: h.querySelectorAll('.title > span')[1]?.textContent, imgs: h.querySelectorAll('img, b').length };
  }, win);
  check('setTitle renders text', afterSetTitle.title === HTML_SET_TITLE && afterSetTitle.imgs === 0, JSON.stringify(afterSetTitle));
  const listed = await page.evaluate((pid) => window.platform.host.callCommand('process.list').find((p) => p.pid === pid), pid);
  check('process.list carries the title as data and a checked icon', listed?.title === HTML_SET_TITLE && listed?.icon === '', JSON.stringify({ title: listed?.title, icon: listed?.icon }));
  const taskbarImgs = await page.evaluate(() => document.querySelectorAll('.taskbar img, .taskbar-preview b').length);
  check('taskbar shows the title as text', taskbarImgs === 0);

  // appendActionButton
  const buttons = await page.evaluate((win) => {
    const p = window.top.__props;
    window.top.__btnClicks = 0;
    p.appendActionButton({ icon: '<img src=x onerror="top.__pwnBtn=1">', title: '<i>t</i>', onClick: () => {} });
    p.appendActionButton({ icon: 'refresh', title: 'Reload', onClick: () => { window.top.__btnClicks += 1; } });
    const h = document.querySelector(`${win} .window-header`);
    return { texts: [...h.querySelectorAll('.window-action')].map((b) => b.textContent), imgs: h.querySelectorAll('img, i').length };
  }, win);
  check('appendActionButton: markup icon → fallback ligature, no markup', buttons.texts.includes('more_horiz') && buttons.texts.includes('refresh') && buttons.imgs === 0, JSON.stringify(buttons));
  await page.locator(`${win} .window-header .window-action`, { hasText: 'refresh' }).click({ force: true });
  check('action button click handler runs', (await page.evaluate(() => window.top.__btnClicks)) === 1);

  // setHeaderStyles allowlist
  const styled = await page.evaluate((win) => {
    window.top.__props.setHeaderStyles({
      cssText: 'position:fixed;inset:0', position: 'fixed', zIndex: '99999', background: 'url(x)',
      color: 'expression(alert(1))', boxShadow: 'none', borderBottom: '1px solid #f0ede9', backgroundColor: 'u\\72l(x)',
    });
    const h = document.querySelector(`${win} .window-header`);
    return { position: h.style.position, zIndex: h.style.zIndex, bgImage: h.style.backgroundImage, color: h.style.color, boxShadow: h.style.boxShadow, borderBottom: h.style.borderBottom, bg: h.style.backgroundColor };
  }, win);
  check('setHeaderStyles: only allowlisted values applied',
    styled.position === '' && styled.zIndex === '' && !styled.bgImage.includes('url') && styled.color === 'red' && styled.boxShadow === 'none'
    && styled.borderBottom.includes('1px solid') && styled.bg === 'rgb(18, 52, 86)', JSON.stringify(styled));

  // setBoundingClientRect
  const geo = await page.evaluate((win) => {
    const p = window.top.__props;
    const c = document.querySelector(win);
    const snap = () => ({ left: c.style.left, top: c.style.top, width: c.style.width, height: c.style.height, position: c.style.position, zIndex: c.style.zIndex, inset: c.style.inset });
    p.setBoundingClientRect({ left: 100, top: 50, width: 600, height: 400 });
    const exact = snap();
    p.setBoundingClientRect({ cssText: 'position:fixed;inset:0;z-index:2147483647', position: 'fixed', zIndex: 2147483647, right: 0, bottom: 0 });
    const injected = snap();
    p.setBoundingClientRect({ left: '10px', top: NaN, width: Infinity });
    const nonNumeric = snap();
    p.setBoundingClientRect({ left: -5000, top: 1e9, width: 1e6, height: 5 });
    const clamped = snap();
    return { exact, injected, nonNumeric, clamped, vw: innerWidth, vh: innerHeight };
  }, win);
  check('setBoundingClientRect applies numeric left/top/width/height', JSON.stringify(geo.exact).includes('"left":"100px","top":"50px","width":"600px","height":"400px"'), JSON.stringify(geo.exact));
  check('setBoundingClientRect ignores cssText/position/zIndex/right/bottom', JSON.stringify(geo.injected) === JSON.stringify(geo.exact), JSON.stringify(geo.injected));
  check('setBoundingClientRect ignores non-numeric values', JSON.stringify(geo.nonNumeric) === JSON.stringify(geo.exact), JSON.stringify(geo.nonNumeric));
  const c = geo.clamped;
  check('setBoundingClientRect clamps to the viewport', c.left === '0px' && c.width === `${geo.vw}px` && c.height === '80px' && parseFloat(c.top) <= geo.vh, JSON.stringify(c));

  const pwn = await page.evaluate(() => ['__pwnTitle', '__pwnIcon', '__pwnSetTitle', '__pwnBtn'].filter((k) => window.top[k] !== undefined));
  check('no markup from chrome inputs executed', pwn.length === 0, pwn.join(',') || 'none');
  await page.evaluate(() => window.top.__props.close());
  await page.waitForTimeout(300);

  // ── Real apps: header styles + geometry they set still apply
  // (App Manager now uses the glass window material instead of its own header colours;
  // SQLite Browser still sets them.)
  await page.evaluate(() => window.platform.host.openWindow('ui.sqlite'));
  await page.waitForTimeout(2500);
  const pkgHead = await page.evaluate(() => {
    const w = [...document.querySelectorAll('.window')].find((x) => x.dataset.name === 'ui.sqlite');
    const h = w?.querySelector('.window-header');
    return h ? { bg: h.style.background || h.style.backgroundColor, color: h.style.color, border: h.style.borderBottom } : null;
  });
  check('app header styles (setHeaderStyles) still apply', !!pkgHead && pkgHead.bg.includes('255, 255, 255') && pkgHead.color === 'rgb(85, 85, 85)' && pkgHead.border.includes('1px solid'), JSON.stringify(pkgHead));
  await page.evaluate(() => window.platform.host.openWindow('ui.pkg-manager'));
  await page.waitForTimeout(2000);
  const pkgGlass = await page.evaluate(() => !!document.querySelector('.window[data-name="ui.pkg-manager"].material-glass'));
  check('App Manager uses the glass window material (setWindowMaterial)', pkgGlass);
  await page.evaluate(() => window.platform.host.callCommand('process.list').forEach((p) => window.platform.host.callCommand('process.kill', p.pid)));
  await page.waitForTimeout(300);

  await page.evaluate(() => window.platform.host.openWindow('ui.remote-machines'));
  await page.waitForTimeout(2500);
  const rmGeo = await page.evaluate(() => {
    const w = [...document.querySelectorAll('.window')].find((x) => x.dataset.name === 'ui.remote-machines');
    return w ? { width: w.style.width, height: w.style.height } : null;
  });
  check('remote-machines window geometry still applies', !!rmGeo && rmGeo.width === '980px' && rmGeo.height === '640px', JSON.stringify(rmGeo));
  await page.evaluate(() => window.platform.host.callCommand('process.list').forEach((p) => window.platform.host.callCommand('process.kill', p.pid)));
  await page.waitForTimeout(300);

  // ── Chrome smoke: drag, resize, fullscreen, minimize, close (compiled default header)
  await page.evaluate(() => window.platform.host.openWindow('explorer'));
  await page.waitForTimeout(1500);
  const sel = await page.evaluate(() => `.window[data-pid="${Math.max(...[...document.querySelectorAll('.window')].map((w) => Number(w.dataset.pid)))}"]`);
  const box0 = await page.locator(sel).boundingBox();
  const hb = await page.locator(`${sel} .window-header .title`).boundingBox();
  await page.mouse.move(hb.x + 5, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 125, hb.y + hb.height / 2 + 60, { steps: 8 });
  await page.mouse.up();
  const box1 = await page.locator(sel).boundingBox();
  check('drag the header moves the window', Math.round(box1.x - box0.x) === 120 && Math.round(box1.y - box0.y) === 60, `Δ ${Math.round(box1.x - box0.x)},${Math.round(box1.y - box0.y)}`);
  const se = await page.locator(`${sel} .window-resize-handle.se`).boundingBox();
  await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
  await page.mouse.down();
  await page.mouse.move(se.x + se.width / 2 + 80, se.y + se.height / 2 + 50, { steps: 8 });
  await page.mouse.up();
  const box2 = await page.locator(sel).boundingBox();
  check('resize handle resizes the window', Math.round(box2.width - box1.width) === 80 && Math.round(box2.height - box1.height) === 50, `Δ ${Math.round(box2.width - box1.width)}×${Math.round(box2.height - box1.height)}`);
  await page.locator(`${sel} .wm-fullscreen`).click({ force: true });
  await page.waitForTimeout(200);
  const full = await page.evaluate((s) => document.querySelector(s).getAttribute('data-fullscreen'), sel);
  await page.locator(`${sel} .wm-fullscreen`).click({ force: true });
  await page.waitForTimeout(200);
  const restored = await page.locator(sel).boundingBox();
  check('fullscreen button maximizes and restores', full === 'true' && Math.round(restored.width) === Math.round(box2.width), `fullscreen=${full}, restored width ${Math.round(restored.width)}`);
  await page.locator(`${sel} .wm-minimize`).click({ force: true });
  await page.waitForTimeout(200);
  const minimized = await page.evaluate((s) => document.querySelector(s).classList.contains('minimized'), sel);
  // Restore the way the dock does (the compiled taskbar is hidden while a dock is active).
  await page.evaluate((s) => window.__wosWmBridge.toggleWindow(Number(document.querySelector(s).dataset.pid)), sel);
  await page.waitForTimeout(200);
  const unminimized = await page.evaluate((s) => !document.querySelector(s).classList.contains('minimized'), sel);
  check('minimize and restore', minimized && unminimized, `minimized=${minimized} restored=${unminimized}`);
  await page.locator(`${sel} .wm-close`).click({ force: true });
  await page.waitForTimeout(300);
  check('close button closes the window', (await page.locator(sel).count()) === 0);

  check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: 'testing/screenshots/verify-layout-chrome.png' });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} pass, ${failed.length} fail`);
process.exit(failed.length ? 1 : 0);
