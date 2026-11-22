// WIN-6 / BOOT-5 / BOOT-11 — code the layout runs during routine UI actions must come from the
// shipped build, never from writable vfs copies or vfs-chosen ids (decisions.md D1, TODO 1C.2).
//
//   WIN-6   tampered /opt/window-manager.js, then a window opens         → payload doesn't run
//   WIN-6   tampered /opt/wm/classic.js selected in /etc/managers.json   → payload doesn't run
//   BOOT-5  /etc/managers.json windowManager "../../home/user1/x"         → payload doesn't run
//   WIN-6   desktop module: unknown id / ../ id / tampered manager.js     → payload doesn't run
//   BOOT-11 tampered /usr/lib/ui/menuItem.js, then a context menu opens  → payload doesn't run
//   BOOT-5  /etc/pkg/installed.json mainFile outside /opt/apps/<id>/ → not run at boot
//   BOOT-5 (phase2) a planted /etc/widgets/*.js still runs in the top realm at boot (user hooks run
//           sandboxed only once the phase-2 runtime lands)
import { newSession, boot, waitBooted, openWindow, step, report, done, sleep, sentinels, vfsWrite, vfsRead, closeAllWindows } from './lib/harness.mjs';

const PAY = (name) => `\n;try { window.top.__sec_ar_${name} = 1 } catch (e) {}\n`;
const S = await newSession();
try {
  const page = await boot(S.context, { dialogPolicy: 'dismiss' });
  const fired = async () => { const s = await sentinels(page, '__sec_ar'); await page.evaluate(() => { for (const k of Object.keys(window)) if (k.startsWith('__sec_ar')) delete window[k]; }); return s; };
  const openOne = async () => { await closeAllWindows(page); await openWindow(page, 'ui.notepad'); await sleep(1500); await closeAllWindows(page); };
  const origWm = await vfsRead(page, '/opt/window-manager.js');
  const origManagers = await vfsRead(page, '/etc/managers.json');
  const managers = (() => { try { return JSON.parse(origManagers || '{}'); } catch (_) { return {}; } })();

  await step('WIN-6', 'tampered-window-manager-js', async () => {
    if (origWm === null) return { pass: null, detail: '/opt/window-manager.js missing' };
    await vfsWrite(page, { '/opt/window-manager.js': origWm + PAY('wm_base') });
    await openOne();
    const s = await fired();
    await vfsWrite(page, { '/opt/window-manager.js': origWm });
    return { pass: s.length === 0, detail: `sentinels=${JSON.stringify(s)}` };
  });

  await step('WIN-6', 'tampered-wm-style-module', async () => {
    const orig = await vfsRead(page, '/opt/wm/classic.js');
    if (orig === null) return { pass: null, detail: '/opt/wm/classic.js missing' };
    await vfsWrite(page, { '/opt/wm/classic.js': orig + PAY('wm_style'), '/etc/managers.json': JSON.stringify({ ...managers, windowManager: 'classic' }) });
    await openOne();
    const s = await fired();
    await vfsWrite(page, { '/opt/wm/classic.js': orig, '/etc/managers.json': origManagers || '{}' });
    return { pass: s.length === 0, detail: `sentinels=${JSON.stringify(s)}` };
  });

  await step('BOOT-5', 'managers-json-wm-id-traversal', async () => {
    await vfsWrite(page, { '/home/user1/sec-wm.js': PAY('wm_id') + 'exports.createHeader = () => null;', '/etc/managers.json': JSON.stringify({ ...managers, windowManager: '../../home/user1/sec-wm' }) });
    await openOne();
    const s = await fired();
    await vfsWrite(page, { '/etc/managers.json': origManagers || '{}' });
    return { pass: s.length === 0, detail: `sentinels=${JSON.stringify(s)}` };
  });

  const desktop = (id) => page.evaluate((id) => { try { window.platform.host.callCommand('open-vfs-desktop', id); return true; } catch (e) { return String(e); } }, id);
  await step('WIN-6', 'desktop-module-unknown-or-traversal-id', async () => {
    await vfsWrite(page, {
      '/opt/desktop/sec-desk.js': PAY('desk_id') + 'exports.render = () => {};',
      '/home/user1/sec-desk2.js': PAY('desk_trav') + 'exports.render = () => {};',
    });
    await desktop('sec-desk'); await sleep(1500);
    await desktop('../../home/user1/sec-desk2'); await sleep(1500);
    await desktop('default'); await sleep(1000);
    const s = await fired();
    return { pass: s.length === 0, detail: `sentinels=${JSON.stringify(s)}` };
  });
  await step('WIN-6', 'tampered-desktop-manager-js', async () => {
    const orig = await vfsRead(page, '/opt/desktop/manager.js');
    if (orig === null) return { pass: null, detail: '/opt/desktop/manager.js missing' };
    await vfsWrite(page, { '/opt/desktop/manager.js': orig + PAY('desk_mgr') });
    await desktop('none'); await sleep(800);
    await desktop('default'); await sleep(1500);
    const s = await fired();
    await vfsWrite(page, { '/opt/desktop/manager.js': orig });
    return { pass: s.length === 0, detail: `sentinels=${JSON.stringify(s)}` };
  });

  await step('BOOT-11', 'tampered-menu-item-js', async () => {
    const orig = await vfsRead(page, '/usr/lib/ui/menuItem.js');
    if (orig === null) return { pass: null, detail: 'menuItem.js missing' };
    await vfsWrite(page, { '/usr/lib/ui/menuItem.js': orig + PAY('menu') });
    await closeAllWindows(page);
    // An empty spot of the desktop itself: not an icon, not a window, and not the dock
    // iframe along the bottom edge (a right-click there never reaches the desktop).
    const box = await page.evaluate(() => {
      const el = document.querySelector('.content-area') || document.body;
      const r = el.getBoundingClientRect();
      for (let fy = 0.5; fy > 0.1; fy -= 0.1) {
        for (let fx = 0.9; fx > 0.3; fx -= 0.1) {
          const x = r.left + r.width * fx, y = r.top + r.height * fy;
          const hit = document.elementFromPoint(x, y);
          if (hit && el.contains(hit) && !hit.closest('iframe, .window, .vfs-desktop-icon')) return { x, y };
        }
      }
      return { x: r.left + r.width * 0.7, y: r.top + r.height * 0.4 };
    });
    await page.mouse.click(box.x, box.y, { button: 'right' });
    await sleep(1500);
    const menuShown = await page.evaluate(() => [...document.querySelectorAll('.contextmenu')].some((m) => m.offsetParent !== null && m.style.display !== 'none'));
    const s = await fired();
    await page.keyboard.press('Escape').catch(() => {});
    await page.evaluate(() => document.querySelectorAll('.contextmenu').forEach((m) => { m.style.display = 'none'; }));
    await vfsWrite(page, { '/usr/lib/ui/menuItem.js': orig });
    if (!menuShown && !s.length) return { pass: null, detail: 'context menu did not open' };
    return { pass: s.length === 0, detail: `menuShown=${menuShown}; sentinels=${JSON.stringify(s)}` };
  });

  // ── boot-time hooks: reload once with both planted ────────────────────────
  const inst = JSON.parse((await vfsRead(page, '/etc/pkg/installed.json')) || '[]');
  inst.push({ id: 'sec-autorun', name: 'Sec Autorun', version: '1.0.0', appDir: '/opt/apps/sec-autorun', mainFile: '/home/user1/sec-autorun-main.js', installedAt: Date.now() });
  await vfsWrite(page, {
    '/etc/pkg/installed.json': JSON.stringify(inst, null, 2),
    '/home/user1/sec-autorun-main.js': PAY('installed_main'),
    '/etc/widgets/sec-evil.js': PAY('widget'),
  });
  await sleep(1500);
  await page.reload({ waitUntil: 'load' });
  await waitBooted(page, 90000);
  await sleep(4000);
  const bootFired = await sentinels(page, '__sec_ar');
  await step('BOOT-5', 'installed-json-mainfile-outside-app-dir', async () => {
    const hit = bootFired.includes('__sec_ar_installed_main');
    return { pass: !hit, detail: `ran at boot=${hit} (all boot sentinels ${JSON.stringify(bootFired)})` };
  });
  await step('BOOT-5', 'planted-widget-runs-sandboxed', async () => {
    const hit = bootFired.includes('__sec_ar_widget');
    return { pass: !hit, detail: `/etc/widgets/sec-evil.js ran in the top realm=${hit}` };
  }, { phase: 'phase2' });
} catch (e) {
  report('WIN-6', null, 'script error: ' + (e && e.stack || e), { check: 'harness' });
} finally {
  await S.close();
}
done('test-autorun');
