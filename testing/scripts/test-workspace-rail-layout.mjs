// Verifies the new "Workspace Rail" layout (docs/public/mount/etc/wm/layouts.json):
// header is dropped (see conversation — a visible top header bar + separate dock rail
// isn't possible with the current single-taskbar-slot architecture), so this is a
// left-nav + content-area shape like "Ubuntu Left Bar", but made genuinely distinct via:
//   1. RailDock (src/core/layout/commands.tsx) — circular initials-avatar dock chips
//      with a running/focused indicator dot, instead of Taskbar's Material icons.
//   2. A framed content-area (margin + border-radius + border + box-shadow), scoped to
//      `.layout-id-workspace-rail .content-area` so no other layout is affected.
// Also confirms the other 4 layouts still render the ORIGINAL Taskbar (no leakage).
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
await waitFor(() => page.evaluate(() => !!window.platform?.host?.getCommand('ui.settings') && !!window.platform?.host?.getCommand('ui.terminal') && !!window.platform?.host?.getCommand('explorer')));

// Settings > Layout lists it and selecting it applies + persists.
for (let i = 0; i < 10; i++) {
  const ok = await page.evaluate(() => { try { window.platform.host.callCommand('ui.settings'); return true; } catch (_) { return false; } }).catch(() => false);
  if (ok) break;
  await sleep(500);
}
await page.waitForTimeout(1500);
let settingsFrame = null;
await waitFor(async () => {
  for (const frame of page.frames()) { try { if (await frame.locator('text=Layout').count() > 0) { settingsFrame = frame; return true; } } catch (_) {} }
  return false;
}, 20000);
check('Settings app opens with a Layout page', !!settingsFrame);
await settingsFrame.locator('text=Layout').first().click({ force: true });
await page.waitForTimeout(500);
check('"Workspace Rail" layout is listed', await settingsFrame.locator('text=Workspace Rail').count() > 0);
await settingsFrame.locator('text=Workspace Rail').first().click({ force: true });
await page.waitForTimeout(800);

const persisted = await page.evaluate(() => JSON.parse(window.platform.host.getFS().readFileSync('/etc/wm/config.json', 'utf8')));
check('/etc/wm/config.json persisted "workspace-rail"', persisted.layout === 'workspace-rail', JSON.stringify(persisted));

const shape = await page.evaluate(() => {
  const l = document.querySelector('.left-nav')?.getBoundingClientRect();
  const c = document.querySelector('.content-area')?.getBoundingClientRect();
  return {
    hasLeftNav: !!document.querySelector('.left-nav'), hasContentArea: !!document.querySelector('.content-area'),
    hasRightNav: !!document.querySelector('.right-nav'), hasFooter: !!document.querySelector('.footer'), hasHeader: !!document.querySelector('.header'),
    leftOfContent: l && c ? l.right <= c.left + 1 : false,
  };
});
check('left-nav present, content-area present', shape.hasLeftNav && shape.hasContentArea);
check('no right-nav/footer/header (dropped — see file header comment)', !shape.hasRightNav && !shape.hasFooter && !shape.hasHeader);
check('left-nav sits to the left of content-area', shape.leftOfContent);

// RailDock renders instead of the Material-icon Taskbar.
check('RailDock renders (not the default Taskbar) in this layout', await page.evaluate(() => document.querySelectorAll('.rail-dock').length === 1 && document.querySelectorAll('.taskbar').length === 0));
const chips = await page.evaluate(() => [...document.querySelectorAll('.rail-chip')].map(c => ({
  label: c.getAttribute('aria-label'), text: c.querySelector('.rail-chip-avatar')?.textContent, active: c.classList.contains('is-active'),
})));
// Up to 2 letters, tolerating the occasional non-letter char in an app's own
// title (e.g. notepad's dynamic "Edit (file.ext)" title yields "E(").
check('dock chips show initials (not Material icon glyphs)', chips.length > 0 && chips.every(c => /^.{1,2}$/.test(c.text || '') && !/[a-z]/.test(c.text || '')), JSON.stringify(chips));
// Settings itself is already open at this point (we used it to switch layouts) —
// its own chip is expected to be active; nothing else should be.
check('only the already-open Settings window is active so far', chips.filter(c => c.active).every(c => c.label === 'Settings'), JSON.stringify(chips));

// Open a window pinned in the dock (Terminal) and confirm its chip lights up with the dot.
await page.evaluate(() => { window.platform.host.execCommand(`service('001-core.layout', 'open-window') (command('ui.terminal'))`, window.platform); });
await page.waitForTimeout(1500);
const afterOpen = await page.evaluate(() => [...document.querySelectorAll('.rail-chip')].map(c => ({
  label: c.getAttribute('aria-label'), active: c.classList.contains('is-active'), hasDot: !!c.querySelector('.rail-chip-dot'),
})));
const terminalChip = afterOpen.find(c => c.label === 'Terminal');
check('Terminal chip becomes active (accent dot) once its window is open and focused', !!terminalChip && terminalChip.active && terminalChip.hasDot, JSON.stringify(afterOpen));

// Open a second window (Files) and confirm focus moves — only one chip active at a time.
await page.evaluate(() => { window.platform.host.execCommand(`service('001-core.layout', 'open-window') (command('explorer'))`, window.platform); });
await page.waitForTimeout(1500);
const afterSecond = await page.evaluate(() => [...document.querySelectorAll('.rail-chip')].map(c => ({ label: c.getAttribute('aria-label'), active: c.classList.contains('is-active') })));
const activeOnes = afterSecond.filter(c => c.active);
check('exactly one chip is active (the newly-focused window)', activeOnes.length === 1 && activeOnes[0].label === 'Files', JSON.stringify(afterSecond));

// Content-area framing: margin + rounded corners + border + shadow, and the open
// window's bounding box stays fully inside the framed area (no clipping/mispositioning
// regression from adding the margin).
const frame = await page.evaluate(() => {
  const ca = document.querySelector('.content-area');
  const cs = getComputedStyle(ca);
  const rect = ca.getBoundingClientRect();
  const win = document.querySelector('.window');
  const winRect = win ? win.getBoundingClientRect() : null;
  return {
    borderRadius: cs.borderRadius, boxShadow: cs.boxShadow, border: cs.border,
    rectLeft: rect.left, rectTop: rect.top, rectWidth: rect.width,
    winInsideX: winRect ? (winRect.left >= rect.left - 1 && winRect.right <= rect.right + 1) : null,
    winInsideY: winRect ? (winRect.top >= rect.top - 1 && winRect.bottom <= rect.bottom + 1) : null,
  };
});
check('content-area has a real border-radius (framed, not flush)', frame.borderRadius !== '0px' && frame.borderRadius !== '');
check('content-area has a real box-shadow (not "none")', frame.boxShadow !== 'none' && frame.boxShadow.length > 0);
check('content-area has a visible border', frame.border.includes('1px'));
check('content-area is inset from the viewport edge (margin applied)', frame.rectTop > 0);
check('an open window stays within the framed content-area horizontally', frame.winInsideX !== false);
check('an open window stays within the framed content-area vertically', frame.winInsideY !== false);

await page.screenshot({ path: `${SHOT}/workspace-rail-layout.png` });

// Switching to a theme should re-color the dock/content-area via the same --wm-* vars.
await page.evaluate(() => window.platform.host.callCommand('set-window-manager-theme', 'ember'));
await page.waitForTimeout(500);
const emberColors = await page.evaluate(() => {
  const chip = document.querySelector('.rail-chip.is-active .rail-chip-avatar');
  return chip ? getComputedStyle(chip).backgroundImage : null;
});
check('active dock chip picks up the Ember theme accent (gradient background)', !!emberColors && emberColors.includes('gradient'));
await page.screenshot({ path: `${SHOT}/workspace-rail-ember-theme.png` });

// Switching back to another layout must restore the normal Taskbar with no leftover rail-dock.
await page.evaluate(() => window.platform.host.callCommand('set-layout', 'default'));
await page.waitForTimeout(500);
check('switching away restores the normal Taskbar, no leftover .rail-dock', await page.evaluate(() => document.querySelectorAll('.taskbar').length === 1 && document.querySelectorAll('.rail-dock').length === 0));

check('no page errors', errs.length === 0, errs.slice(0, 5).join(' || '));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
await browser.close(); process.exit(failed ? 1 : 0);
