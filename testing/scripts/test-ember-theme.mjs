// Verifies the new "Ember" window-manager theme (docs/public/mount/etc/wm/themes/ember.json):
// it shows up in Settings > Window Manager's theme list, selecting it applies the CSS vars
// to the desktop live, and the vars match the file's values exactly.
import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103, URL = `http://localhost:${PORT}`, SHOT = 'testing/screenshots';
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (_) {} await sleep(300); } return false; }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));

await page.goto(URL); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(6000);
await waitFor(() => page.evaluate(() => !!window.platform?.host?.getCommand('ui.settings')));

for (let i = 0; i < 10; i++) {
  const ok = await page.evaluate(() => { try { window.platform.host.callCommand('ui.settings'); return true; } catch (_) { return false; } }).catch(() => false);
  if (ok) break;
  await sleep(500);
}
await page.waitForTimeout(1500);

let settingsFrame = null;
await waitFor(async () => {
  for (const frame of page.frames()) {
    try { if (await frame.locator('text=Window Manager').count() > 0) { settingsFrame = frame; return true; } } catch (_) {}
  }
  return false;
}, 20000);
check('Settings app opens with a Window Manager page', !!settingsFrame);

await settingsFrame.locator('text=Window Manager').first().click({ force: true });
await page.waitForTimeout(500);

check('"Ember" theme card is listed', await settingsFrame.locator('text=Ember').count() > 0);

await settingsFrame.locator('text=Ember').first().click({ force: true });
await page.waitForTimeout(500);

const vars = await page.evaluate(() => {
  const s = getComputedStyle(document.documentElement);
  return {
    headerBg: s.getPropertyValue('--wm-header-bg').trim(),
    headerColor: s.getPropertyValue('--wm-header-color').trim(),
    windowBg: s.getPropertyValue('--wm-window-bg').trim(),
    taskbarBg: s.getPropertyValue('--wm-taskbar-bg').trim(),
    accent: s.getPropertyValue('--wm-accent').trim(),
    radius: s.getPropertyValue('--wm-radius').trim(),
    blur: s.getPropertyValue('--wm-blur').trim(),
    shadow: s.getPropertyValue('--wm-shadow').trim(),
  };
});
check('--wm-header-bg matches ember.json', vars.headerBg === '#1d140d', vars.headerBg);
check('--wm-header-color matches ember.json', vars.headerColor === '#fdf1e7', vars.headerColor);
check('--wm-window-bg matches ember.json', vars.windowBg === 'rgba(38, 32, 28, 0.55)', vars.windowBg);
check('--wm-taskbar-bg matches ember.json', vars.taskbarBg === 'rgba(29, 20, 13, 0.6)', vars.taskbarBg);
check('--wm-accent matches ember.json', vars.accent === '#ff7a1a', vars.accent);
check('--wm-radius matches ember.json', vars.radius === '20px', vars.radius);
check('--wm-blur matches ember.json', vars.blur === '26px', vars.blur);
check('--wm-shadow is a real shadow (not "none")', vars.shadow !== 'none' && vars.shadow.length > 0, vars.shadow);

const persisted = await page.evaluate(() => JSON.parse(window.platform.host.getFS().readFileSync('/etc/wm/current.json', 'utf8')));
check('/etc/wm/current.json persisted the Ember theme', persisted.name === 'Ember' && persisted.appearance?.accentColor === '#ff7a1a', JSON.stringify(persisted));

// Open a real window and screenshot the desktop to visually confirm header/taskbar/accent read correctly.
await page.evaluate(() => { window.platform.host.execCommand(`service('001-core.layout', 'open-window') (command('ui.terminal'))`, window.platform); });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${SHOT}/ember-theme.png` });

check('no page errors', errs.length === 0, errs.slice(0, 5).join(' || '));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
await browser.close(); process.exit(failed ? 1 : 0);
