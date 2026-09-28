// Tests the file explorer's "Download" action and the right-side "Details"
// panel, in BOTH parallel implementations (per CLAUDE.md's "File explorer"
// section): the active runtime explorer (main.js, command "explorer") and
// the compiled TS/TSX counterpart (index.tsx, command "ui.file-explorer").
// Run against the dev server on port 8104 (see CLAUDE.md testing
// conventions).
//
//   npx webpack serve --port 8104 &
//   node testing/scripts/test-explorer-download-details.mjs
//
import { chromium } from 'playwright';

const PORT = 8104;
const BASE_URL = `http://localhost:${PORT}/`;

let failed = false;
const assert = (cond, msg) => {
  if (cond) {
    console.log(`PASS: ${msg}`);
  } else {
    console.log(`FAIL: ${msg}`);
    failed = true;
  }
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('pageerror', err => errors.push('PAGE: ' + err.message.slice(0, 200)));
page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('404')) errors.push('CON: ' + msg.text().slice(0, 200)); });

console.log('Loading app...');
await page.goto(BASE_URL, { waitUntil: 'load' });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.waitForFunction(() => window.platform && window.platform.host && window.platform.host.getFS, { timeout: 30000 });
// Wait for the window-manager's 'open-window' service to be registered
// (part of boot sequence run by initd.run) before trying to open windows.
await page.waitForFunction(() => {
  try { return !!window.platform.host.getService('001-core.layout', 'open-window'); } catch (_) { return false; }
}, { timeout: 30000 });
await page.waitForTimeout(500);

// Seed deterministic test fixtures directly in the vfs: a 2048-byte text
// file (so fmtBytes renders a predictable "2.0 KB") and a folder with 3
// files in it (for the folder-details item count check).
await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  fs.mkdirSync('/tmp/dl-folder', { recursive: true });
  fs.writeFileSync('/tmp/dl-test.txt', 'A'.repeat(2048));
  fs.writeFileSync('/tmp/dl-folder/a.txt', 'a');
  fs.writeFileSync('/tmp/dl-folder/b.txt', 'b');
  fs.writeFileSync('/tmp/dl-folder/c.txt', 'c');
});

// Open the file explorer rooted at /tmp.
console.log('Opening file explorer at /tmp...');
await page.evaluate(() => {
  window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('explorer'), '/tmp')", window.platform);
});
await page.waitForTimeout(1500);

const findFrame = async (selector) => {
  for (const frame of page.frames()) {
    try { if (await frame.locator(selector).count() > 0) return frame; } catch (_) {}
  }
  return null;
};

let expFrame = await findFrame('.file-explorer');
assert(!!expFrame, 'file explorer window opened');
if (!expFrame) {
  await page.screenshot({ path: 'testing/screenshots/explorer-download-details-noframe.png' });
  await browser.close();
  process.exit(1);
}

await page.screenshot({ path: 'testing/screenshots/explorer-download-details-initial.png' });

// --- Details panel: empty state before anything is selected ---
await expFrame.locator('[aria-label="details"]').click({ force: true });
await page.waitForTimeout(300);
expFrame = await findFrame('.file-explorer'); // re-find after re-render, per CLAUDE.md conventions
let detailsText = await expFrame.locator('.file-explorer-details').innerText();
assert(detailsText.includes('Select a file or folder'), 'details panel shows empty state before selection');

// --- Select the file and check details ---
await expFrame.locator('.file-item', { hasText: 'dl-test.txt' }).first().click({ force: true });
await page.waitForTimeout(300);
expFrame = await findFrame('.file-explorer');
detailsText = await expFrame.locator('.file-explorer-details').innerText();
console.log('Details panel (file):', detailsText.replace(/\n/g, ' | '));
assert(detailsText.includes('dl-test.txt'), 'details panel shows selected file name');
assert(detailsText.includes('/tmp/dl-test.txt'), 'details panel shows selected file full path');
assert(detailsText.includes('2.0 KB'), 'details panel shows human-readable size (2.0 KB)');
assert(/TXT file/i.test(detailsText), 'details panel shows file type/extension');

// --- Download via context menu ---
await expFrame.locator('.file-item', { hasText: 'dl-test.txt' }).first().click({ button: 'right', force: true });
await page.waitForTimeout(500);
await page.screenshot({ path: 'testing/screenshots/explorer-download-details-ctxmenu.png' });

const downloadBtn = page.locator('.contextmenu button', { hasText: 'Download' }).first();
assert(await downloadBtn.count() > 0, 'context menu has a "Download" action for a file');

const [download1] = await Promise.all([
  page.waitForEvent('download'),
  downloadBtn.click({ force: true }),
]);
assert(download1.suggestedFilename() === 'dl-test.txt', `download event filename is "dl-test.txt" (got "${download1.suggestedFilename()}")`);

// --- Download via toolbar button (selection still active) ---
expFrame = await findFrame('.file-explorer');
await expFrame.locator('.file-item', { hasText: 'dl-test.txt' }).first().click({ force: true });
await page.waitForTimeout(300);
const [download2] = await Promise.all([
  page.waitForEvent('download'),
  expFrame.locator('[aria-label="download"]').click({ force: true }),
]);
assert(download2.suggestedFilename() === 'dl-test.txt', `toolbar download button downloads "dl-test.txt" (got "${download2.suggestedFilename()}")`);

// --- Select a folder and check details ---
expFrame = await findFrame('.file-explorer');
await expFrame.locator('.file-item', { hasText: 'dl-folder' }).first().click({ force: true });
await page.waitForTimeout(300);
expFrame = await findFrame('.file-explorer');
detailsText = await expFrame.locator('.file-explorer-details').innerText();
console.log('Details panel (folder):', detailsText.replace(/\n/g, ' | '));
assert(detailsText.includes('dl-folder'), 'details panel shows selected folder name');
assert(detailsText.includes('/tmp/dl-folder'), 'details panel shows selected folder full path');
assert(detailsText.includes('Folder'), 'details panel shows type "Folder"');
assert(detailsText.includes('3 items'), 'details panel shows folder item count (3 items)');

// The toolbar download button should be disabled for a folder selection.
const downloadBtnClass = await expFrame.locator('[aria-label="download"]').getAttribute('class');
assert(downloadBtnClass.includes('disabled'), 'toolbar download button is disabled when a folder is selected');

await page.screenshot({ path: 'testing/screenshots/explorer-download-details-folder.png' });

// ─── Same checks against the compiled TS/TSX counterpart (ui.file-explorer) ───
console.log('\nOpening ui.file-explorer (compiled TSX) at /tmp...');
await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  fs.writeFileSync('/tmp/dl-test-tsx.txt', 'B'.repeat(4096));
});
await page.evaluate(() => {
  window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.file-explorer'), '/tmp')", window.platform);
});
await page.waitForTimeout(1500);

// There are now TWO explorer windows open (the earlier main.js one plus this
// new ui.file-explorer one), and both share the ".file-explorer" class - so
// find the frame by a marker unique to the new one: "dl-test-tsx.txt" was
// only just written, and the first (already-rendered) window has no reason
// to have re-read the directory since, so it won't show that file.
const findTsxFrame = () => findFrame('.file-item:has-text("dl-test-tsx.txt")');

expFrame = await findTsxFrame();
assert(!!expFrame, 'ui.file-explorer (tsx) window opened');

if (expFrame) {
  await expFrame.locator('[aria-label="details"]').click({ force: true });
  await page.waitForTimeout(300);
  expFrame = await findTsxFrame();
  await expFrame.locator('.file-item', { hasText: 'dl-test-tsx.txt' }).first().click({ force: true });
  await page.waitForTimeout(300);
  expFrame = await findTsxFrame();
  const tsxDetailsText = await expFrame.locator('.file-explorer-details').innerText();
  console.log('Details panel (tsx, file):', tsxDetailsText.replace(/\n/g, ' | '));
  assert(tsxDetailsText.includes('dl-test-tsx.txt'), 'tsx: details panel shows selected file name');
  assert(tsxDetailsText.includes('4.0 KB'), 'tsx: details panel shows human-readable size (4.0 KB)');

  await expFrame.locator('.file-item', { hasText: 'dl-test-tsx.txt' }).first().click({ button: 'right', force: true });
  await page.waitForTimeout(500);
  const tsxDownloadBtn = page.locator('.contextmenu button', { hasText: 'Download' }).first();
  assert(await tsxDownloadBtn.count() > 0, 'tsx: context menu has a "Download" action for a file');
  const [tsxDownload] = await Promise.all([
    page.waitForEvent('download'),
    tsxDownloadBtn.click({ force: true }),
  ]);
  assert(tsxDownload.suggestedFilename() === 'dl-test-tsx.txt', `tsx: download event filename is "dl-test-tsx.txt" (got "${tsxDownload.suggestedFilename()}")`);

  expFrame = await findTsxFrame();
  await expFrame.locator('.file-item', { hasText: 'dl-folder' }).first().click({ force: true });
  await page.waitForTimeout(300);
  expFrame = await findTsxFrame();
  const tsxFolderDetails = await expFrame.locator('.file-explorer-details').innerText();
  console.log('Details panel (tsx, folder):', tsxFolderDetails.replace(/\n/g, ' | '));
  assert(tsxFolderDetails.includes('dl-folder'), 'tsx: details panel shows selected folder name');
  assert(tsxFolderDetails.includes('3 items'), 'tsx: details panel shows folder item count (3 items)');
}

console.log('\nConsole/page errors:', errors.length ? errors : 'none');
await browser.close();

if (failed) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nRESULT: PASS');
}
