// verify-layout-static-code.mjs — TODO 1C.2 (audit WIN-6, BOOT-5, BOOT-11):
// /opt/window-manager.js, /opt/wm/<id>.js, /opt/desktop/<id>.js and
// /usr/lib/ui/menuItem.js run from the immutable static copy (/public/mount),
// never from the writable vfs; ids are validated against the shipped lists;
// without the static copy the compiled defaults apply.
//
//   node testing/scripts/security/verify-layout-static-code.mjs
import { launch, bootOS, writeVfs } from './spike-lib.mjs';

const results = [];
const check = (id, ok, detail = '') => {
  results.push({ id, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? '  — ' + detail : ''}`);
};

const PAYLOADS = {
  '/opt/window-manager.js': 'window.top.__pwnWm = 1; export const setupWindow = () => {}; export const createHeader = () => { window.top.__pwnWm = 2; return null };',
  '/opt/wm/classic.js': 'window.top.__pwnClassic = 1; export const createHeader = () => null;',
  '/opt/desktop/manager.js': 'window.top.__pwnDesk = 1; export const render = () => {};',
  '/usr/lib/ui/menuItem.js': 'window.top.__pwnMenu = 1; exports.default = () => null; exports.getStyles = () => "";',
  '/home/user1/evilwm.js': 'window.top.__pwnTrav = 1; export const createHeader = () => null;',
  '/home/user1/evildesk.js': 'window.top.__pwnDeskTrav = 1; export const render = () => {};',
};
const pwnFlags = (page) => page.evaluate(() => ['__pwnWm', '__pwnClassic', '__pwnDesk', '__pwnMenu', '__pwnTrav', '__pwnDeskTrav']
  .filter((k) => window.top[k] !== undefined).map((k) => `${k}=${window.top[k]}`));

const setWmStyle = (page, id) => page.evaluate((id) => {
  const cfg = JSON.parse(window.fs.readFileSync('/etc/managers.json', 'utf8'));
  cfg.windowManager = id;
  window.fs.writeFileSync('/etc/managers.json', JSON.stringify(cfg));
}, id);
const closeAll = (page) => page.evaluate(() => window.platform.host.callCommand('process.list').forEach((p) => window.platform.host.callCommand('process.kill', p.pid)));
// Opens a window and describes its chrome.
const openWindow = async (page, name = 'explorer') => {
  await page.evaluate((n) => window.platform.host.openWindow(n), name);
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const wins = [...document.querySelectorAll('.window')];
    const w = wins.sort((a, b) => Number(b.dataset.pid) - Number(a.dataset.pid))[0];
    if (!w) return null;
    const head = w.querySelector('.window-header');
    return {
      pid: Number(w.dataset.pid),
      // The compiled header is the only one with a .window-controls box (canvas reuses .wm-close).
      defaultHeader: !!w.querySelector('.window-header > .window-controls'),
      customButtons: [...(head?.querySelectorAll('button') ?? [])].map((b) => b.title || b.textContent).filter(Boolean),
      fullscreen: w.getAttribute('data-fullscreen'),
    };
  });
};
const dblclickHeader = async (page, pid) => {
  const header = page.locator(`.window[data-pid="${pid}"] .window-header`).first();
  await header.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  const box = await header.boundingBox();
  if (!box) return 'header not visible';
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  return page.evaluate((pid) => document.querySelector(`.window[data-pid="${pid}"]`)?.getAttribute('data-fullscreen'), pid);
};
const remountDesktop = async (page, id) => {
  await page.evaluate(() => window.platform.host.callCommand('open-vfs-desktop', 'none'));
  await page.waitForTimeout(300);
  await page.evaluate((id) => window.platform.host.callCommand('open-vfs-desktop', id), id);
  await page.waitForTimeout(1200);
};

const browser = await launch();
try {
  // ── 1. Tampered vfs copies never run; the static copies do
  {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const staticLog = [];
    context.on('requestfinished', async (req) => {
      if (/\/public\/mount\/(opt\/(wm|window-manager|desktop)|usr\/lib\/ui)/.test(req.url())) {
        const res = await req.response().catch(() => null);
        staticLog.push(`${res?.status()} ${new URL(req.url()).pathname} from ${req.frame()?.url() === 'about:blank' ? 'module-frame' : 'main'}`);
      }
    });
    context.on('requestfailed', (req) => { if (req.url().includes('/public/mount/')) staticLog.push(`FAILED ${req.url()} ${req.failure()?.errorText}`); });
    const page = await bootOS(context);
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (/\[(layout|wm|desktop-manager)\]/.test(m.text())) console.log('console:', m.type(), m.text().slice(0, 200)); });
    // The layout fetches the static copies at start; the shared dev server can
    // hold requests while it rebuilds, so let them finish first.
    await page.waitForLoadState('networkidle').catch(() => {});
    if (process.env.DEBUG_STATIC) console.log(staticLog.join('\n'));

    await writeVfs(page, PAYLOADS);
    await setWmStyle(page, 'classic');
    let win = await openWindow(page);
    check('classic style from the static copy (tampered vfs ignored)', !!win && !win.defaultHeader && ['Close', 'Minimize', 'Fullscreen'].every((t) => win.customButtons.includes(t)), JSON.stringify(win));
    check('double-click header → fullscreen (static setupWindow)', (await dblclickHeader(page, win.pid)) === 'true');
    const snap = await page.evaluate(() => [...document.body.children].some((el) => el.style && el.style.background.includes('rgba(10, 132, 255, 0.25)')));
    check('snap overlay from static /opt/window-manager.js', snap);
    await closeAll(page);

    await setWmStyle(page, '../../home/user1/evilwm');
    win = await openWindow(page);
    check('traversal windowManager id → default chrome', !!win && win.defaultHeader, JSON.stringify(win));
    await closeAll(page);
    await setWmStyle(page, 'default');
    win = await openWindow(page);
    check('default style: compiled header + static behavior', !!win && win.defaultHeader && (await dblclickHeader(page, win.pid)) === 'true', JSON.stringify(win));
    await closeAll(page);

    await remountDesktop(page, 'default');
    const icons = await page.locator('.vfs-desktop-icon').count();
    check('default desktop from static manager.js (tampered vfs ignored)', icons > 0, `${icons} icons`);
    await remountDesktop(page, '../../home/user1/evildesk');
    const fallbackIcons = await page.locator('.desktop-icons').count();
    check('traversal desktop id → compiled icons', fallbackIcons > 0);
    for (const [id, marker] of [['scifi', '.sf-grid'], ['windows-tiles', '.wt-grid'], ['interactive', '.ix-grid']]) {
      await remountDesktop(page, id);
      check(`desktop variant ${id} renders`, (await page.locator(marker).count()) > 0);
    }
    await remountDesktop(page, 'default');

    await page.mouse.click(1100, 450, { button: 'right' });
    await page.waitForTimeout(500);
    const menu = await page.evaluate(() => {
      const m = document.querySelector('.contextmenu');
      return { buttons: m ? m.querySelectorAll('button').length : 0, templateStyles: !!m && m.innerHTML.includes('ctx-child-btn') && m.innerHTML.includes('border-radius: 8px') };
    });
    check('context menu uses the static menuItem.js', menu.buttons > 0 && menu.templateStyles, JSON.stringify(menu));
    await page.keyboard.press('Escape');
    await page.mouse.click(1100, 300);

    const pwned = await pwnFlags(page);
    check('no tampered vfs module executed', pwned.length === 0, pwned.join(', ') || 'none');

    // Every shipped WM style still loads (canvas last: it rewires the content area).
    for (const id of ['glass', 'minimal', 'ubuntu', 'tiling', 'canvas']) {
      await setWmStyle(page, id);
      const w = await openWindow(page);
      const extra = id === 'canvas' ? await page.evaluate(() => !!document.querySelector('.content-area.canvas-wm-active')) : true;
      check(`wm style ${id} loads`, !!w && !w.defaultHeader && extra, JSON.stringify(w));
      await closeAll(page);
    }
    await setWmStyle(page, 'default');

    // Window-manager themes (Settings → Window Manager) still apply.
    const bg = async () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--wm-header-bg').trim());
    await page.evaluate(() => window.platform.host.callCommand('set-window-manager-theme', 'light'));
    const light = await bg();
    await page.evaluate(() => window.platform.host.callCommand('set-window-manager-theme', 'dark'));
    const dark = await bg();
    check('window-manager themes apply', light !== dark && !!light && !!dark, `light=${light} dark=${dark}`);

    check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await page.screenshot({ path: 'testing/screenshots/verify-layout-static-code.png' });
    await context.close();
  }

  // ── 2. Static copies unavailable → compiled defaults
  {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    // Fail only the layout's own fetches (from its module frame); the boot's
    // meta.json bootstrap (main frame) fetches the same files and must work.
    await context.route(/\/public\/mount\/(opt\/window-manager\.js|opt\/wm\/|opt\/desktop\/|usr\/lib\/ui\/menuItem\.js)/, (route) => {
      const frame = route.request().frame();
      if (frame && frame !== frame.page().mainFrame()) return route.abort();
      return route.continue();
    });
    await page.close();
    const booted = await bootOS(context);
    const errors = [];
    booted.on('pageerror', (e) => errors.push(String(e)));
    booted.on('dialog', (d) => d.dismiss().catch(() => {}));
    const win = await openWindow(booted);
    check('fallback: window opens with the compiled header', !!win && win.defaultHeader, JSON.stringify(win));
    check('fallback: double-click header → fullscreen', (await dblclickHeader(booted, win.pid)) === 'true');
    await closeAll(booted);
    const compiledIcons = await booted.locator('.desktop-icons').count();
    check('fallback: compiled desktop icons', compiledIcons > 0);
    await booted.mouse.click(1100, 450, { button: 'right' });
    await booted.waitForTimeout(500);
    const defaultButtons = await booted.locator('.contextmenu button.action-default-btn').count();
    check('fallback: context menu with the compiled template', defaultButtons > 0, `${defaultButtons} buttons`);
    check('fallback: no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} pass, ${failed.length} fail`);
process.exit(failed.length ? 1 : 0);
