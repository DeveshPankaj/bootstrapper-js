// verify-layout-smoke.mjs — smoke test of the layout after TODO 1C: every dock,
// desktop environments, layouts, and the Settings UI paths that drive the
// layout (Window Manager themes, Managers → dock / window-manager style).
//
//   node testing/scripts/security/verify-layout-smoke.mjs
import { launch, bootOS } from './spike-lib.mjs';

const results = [];
const check = (id, ok, detail = '') => {
  results.push({ id, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? '  — ' + detail : ''}`);
};

const dockItems = async (page) => {
  const el = await page.$('#vfs-dock-iframe');
  const frame = el && (await el.contentFrame());
  return frame ? frame.evaluate(() => document.querySelectorAll('#dock .item').length).catch(() => 0) : 0;
};
const closeAll = (page) => page.evaluate(() => window.platform.host.callCommand('process.list').forEach((p) => window.platform.host.callCommand('process.kill', p.pid)));
const findFrame = async (page, pred, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    for (const f of page.frames()) { if (await pred(f).catch(() => false)) return f; }
    await page.waitForTimeout(300);
  }
  return null;
};

const browser = await launch();
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await bootOS(context);
  await page.waitForLoadState('networkidle').catch(() => {});
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // ── Every dock renders its launch items
  for (const id of ['default', 'macos', 'windows', 'gnome', 'sidebar', 'minimal']) {
    await page.evaluate((id) => window.platform.host.callCommand('open-vfs-dock', id), id);
    await page.waitForTimeout(1200);
    const n = await dockItems(page);
    check(`dock ${id} renders`, n > 0, `${n} items`);
  }
  await page.evaluate(() => window.platform.host.callCommand('open-vfs-dock', 'default'));
  await page.waitForTimeout(800);

  // ── Layouts and desktop environments
  const layouts = await page.evaluate(() => JSON.parse(window.fs.readFileSync('/etc/wm/layouts.json', 'utf8')).layouts.map((l) => l.id));
  for (const id of layouts) {
    await page.evaluate((id) => window.platform.host.callCommand('set-layout', id), id);
    await page.waitForTimeout(600);
    const ok = await page.evaluate(() => !!document.querySelector('.content-area') && document.querySelector('.content-area').getBoundingClientRect().height > 100);
    check(`layout ${id}`, ok);
  }
  for (const env of ['windows', 'linux', 'macos']) {
    await page.evaluate((env) => window.platform.host.callCommand('set-desktop-env', env), env);
    await page.waitForTimeout(800);
    await page.evaluate(() => window.platform.host.openWindow('explorer'));
    await page.waitForTimeout(1200);
    const state = await page.evaluate((env) => ({
      cls: document.documentElement.classList.contains(`de-${env}`),
      windows: document.querySelectorAll('.window:not(.hidden)').length,
    }), env);
    check(`desktop env ${env}`, state.cls && state.windows === 1, JSON.stringify(state));
    await closeAll(page);
    await page.waitForTimeout(300);
  }

  // ── Settings → Window Manager: theme cards apply a theme
  await page.evaluate(() => window.platform.host.openWindow('ui.settings'));
  let settings = await findFrame(page, async (f) => f.url().includes('/opt/apps/settings/main.html') && (await f.locator('text=Window Manager').count()) > 0);
  check('Settings opens', !!settings);
  if (settings) {
    await settings.locator('text=Window Manager').first().click({ force: true });
    await page.waitForTimeout(800);
    settings = await findFrame(page, async (f) => f.url().includes('/opt/apps/settings/main.html') && (await f.locator('text=Themes').count()) > 0);
    const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--wm-header-bg').trim());
    const card = settings && settings.locator('strong', { hasText: /^(Dark|Light|Sunset)$/ }).first();
    if (card) await card.click({ force: true });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--wm-header-bg').trim());
    check('Settings → Window Manager theme card applies', !!card && before !== after, `${before} → ${after}`);

    // ── Settings → Managers: dock + window-manager style
    settings = await findFrame(page, async (f) => f.url().includes('/opt/apps/settings/main.html') && (await f.locator('text=Managers').count()) > 0);
    await settings.locator('text=Managers').first().click({ force: true });
    await page.waitForTimeout(1000);
    settings = await findFrame(page, async (f) => f.url().includes('/opt/apps/settings/main.html') && (await f.locator('text=WINDOW CHROME').count()) > 0);
    if (settings) {
      await settings.getByText('GNOME', { exact: true }).first().click({ force: true }); // the dock option's label, not "Ubuntu (GNOME)"
      await page.waitForTimeout(1500);
      const gnome = await page.evaluate(() => (document.getElementById('vfs-dock-iframe')?.srcdoc || '').includes("DOCK_ID = 'gnome'"));
      check('Settings → Managers switches the dock', gnome && (await dockItems(page)) > 0);
      await settings.getByText('Classic (macOS)', { exact: true }).first().click({ force: true });
      await page.waitForTimeout(500);
    } else {
      check('Settings → Managers page renders', false);
    }
    await closeAll(page);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.platform.host.openWindow('explorer'));
    await page.waitForTimeout(1200);
    const classic = await page.evaluate(() => {
      const w = document.querySelector('.window');
      return !!w && !w.querySelector('.window-header > .window-controls') && w.querySelectorAll('.window-header button[title="Close"]').length === 1;
    });
    check('window-manager style chosen in Settings applies to the next window', classic);
  }

  check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: 'testing/screenshots/verify-layout-smoke.png' });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} pass, ${failed.length} fail`);
process.exit(failed.length ? 1 : 0);
