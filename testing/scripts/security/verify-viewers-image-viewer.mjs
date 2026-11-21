// Image viewer follow-ups (TODO 1F.7/1F.10 notes from 1B and 1D):
//  - registers .ico (the open policy routes .svg/.ico to it) and opens one;
//  - opened without a file (App Manager → Open) it shows an empty state instead of throwing;
//  - a normal PNG and an SVG still open as <img> (SVG script never runs).
//
// Run: node testing/scripts/security/verify-viewers-image-viewer.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootReady, check, finish, sleep, pollFor, findFrame, pwnedKeys, writeFiles } from './verify-viewers-lib.mjs';

// 1x1 red PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootReady(context);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.evaluate((b64) => {
    const fs = window.fs;
    if (!fs.existsSync('/home/user1/ivt')) fs.mkdirSync('/home/user1/ivt');
    fs.writeFileSync('/home/user1/ivt/red.png', window.Buffer.from(b64, 'base64'));
    fs.writeFileSync('/home/user1/ivt/icon.ico', window.Buffer.from(b64, 'base64'));
    fs.writeFileSync('/home/user1/ivt/pic.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" onload="top.__pwned_iv=1"><rect width="8" height="8" fill="red"/></svg>');
  }, PNG);

  check('registers .ico', await page.evaluate(() => (window.platform.host.getCommand('ui.imageviewer')?.meta?.fileExtensions || []).includes('.ico')));

  // No file: empty state, no exception.
  await page.evaluate(() => window.platform.host.openWindow('ui.imageviewer'));
  const empty = await findFrame(page, { selector: 'div', text: 'No image open', timeout: 8000 });
  check('opened without a file: empty state shown', !!empty);
  await sleep(500);
  check('opened without a file: no exception', !errors.some((e) => /split|imageviewer/i.test(e)), errors);

  for (const [file, label] of [['red.png', 'PNG'], ['icon.ico', '.ico'], ['pic.svg', 'SVG']]) {
    await page.evaluate((p) => window.platform.host.exec(window.platform, p), `/home/user1/ivt/${file}`);
    const f = await findFrame(page, { selector: 'img[alt="' + file + '"]', timeout: 8000 });
    const ok = f && await pollFor(() => f.evaluate((n) => { const i = document.querySelector(`img[alt="${n}"]`); return i && i.complete && i.naturalWidth > 0 ? i.naturalWidth : null; }, file), 5000);
    check(`${label} opens in the image viewer as <img>`, !!ok, ok);
  }
  await sleep(500);
  check('SVG script did not run', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));
} catch (e) {
  check('script error', false, String(e && e.stack || e));
} finally {
  await browser.close();
}
finish('verify-viewers-image-viewer');
