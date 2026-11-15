// Verifies the enhanced /home/user1/projects/temp.html + temp.js React demo:
// renders with the new card UI, the counter still works, and — the actual bug
// fix in this enhancement — the Footer's color pickers now visibly change the
// header's background/text color live (previously a no-op: Footer called
// props.setHeaderStyles(...) but nothing consumed it since App never held
// headerStyles state of its own).
import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103, URL = `http://localhost:${PORT}`, SHOT = 'testing/screenshots';
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (_) {} await sleep(300); } return false; }
async function appFrame(page, urlPart, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { for (const fr of page.frames()) { try { if (fr.url().includes(urlPart) && await fr.evaluate(() => true).catch(() => false)) return fr; } catch (_) {} } await sleep(400); }
  throw new Error('frame not found: ' + urlPart);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));

await page.goto(URL); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(6000);
await waitFor(() => page.evaluate(() => !!window.platform?.host?.getCommand('ui.notepad')));

// Open temp.html the same way the file explorer would (extension -> app via host.exec).
await page.evaluate(() => {
  window.platform.host.execCommand(`service('001-core.layout', 'open-window') (command('ui.iframe'), '/home/user1/projects/temp.html')`, window.platform);
});
await page.waitForTimeout(2000);
const frame = await appFrame(page, 'projects/temp.html');

check('card UI renders with the eyebrow label', await frame.locator('text=Live React Playground').count() > 0);
check('header greeting renders', await frame.locator('h3:has-text("Babel and React")').count() > 0);

const counterBtn = frame.locator('button.counter-btn');
check('counter button has the enhanced styling class', await counterBtn.count() === 1);
check('counter starts at 0', (await counterBtn.textContent()).includes('Clicked 0 times'));
await counterBtn.click();
await page.waitForTimeout(200);
check('counter increments on click', (await counterBtn.textContent()).includes('Clicked 1 time') && !(await counterBtn.textContent()).includes('1 times'));
await counterBtn.click();
await page.waitForTimeout(200);
check('counter pluralizes again at 2', (await counterBtn.textContent()).includes('Clicked 2 times'));

// The actual UX fix: changing the color pickers must visibly recolor the header NOW.
// React patches HTMLInputElement's `value` setter to track programmatic vs.
// real changes — setting `.value` directly (even with a dispatched 'change')
// doesn't register as a change to a controlled input. Go through the native
// setter so React's onChange actually fires, matching how a real color-picker
// interaction would.
const setColorInput = (el, hex) => {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeSetter.call(el, hex);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

const initialHeaderBg = await frame.locator('h3').evaluate(el => getComputedStyle(el).backgroundColor);
const bgInput = frame.locator('.swatch-input').first();
await bgInput.evaluate(setColorInput, '#ff00aa');
await page.waitForTimeout(300);
const afterHeaderBg = await frame.locator('h3').evaluate(el => getComputedStyle(el).backgroundColor);
check('changing the background color picker actually recolors the header (was a no-op before)', afterHeaderBg !== initialHeaderBg && afterHeaderBg === 'rgb(255, 0, 170)', `${initialHeaderBg} -> ${afterHeaderBg}`);

const textInput = frame.locator('.swatch-input').nth(1);
await textInput.evaluate(setColorInput, '#00ff88');
await page.waitForTimeout(300);
const afterHeaderColor = await frame.locator('h3').evaluate(el => getComputedStyle(el).color);
check('changing the text color picker actually recolors the header text', afterHeaderColor === 'rgb(0, 255, 136)', afterHeaderColor);

// The "edit this file" link still opens temp.js in Notepad.
await frame.locator('.edit-link').click();
await page.waitForTimeout(1500);
const notepadOpened = await waitFor(() => page.evaluate(() => [...document.querySelectorAll('.window')].some(w => w.textContent.includes('temp.js'))), 8000);
check('clicking the edit link opens temp.js in Notepad', notepadOpened);

await page.screenshot({ path: `${SHOT}/temp-html-demo-enhanced.png` });

check('no page errors', errs.length === 0, errs.slice(0, 5).join(' || '));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
await browser.close(); process.exit(failed ? 1 : 0);
