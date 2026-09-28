// Tests standard file-manager multi-select behavior in BOTH parallel file
// explorer implementations (per CLAUDE.md's "File explorer" section): the
// active runtime explorer (main.js, command "explorer") and the compiled
// TS/TSX counterpart (index.tsx, command "ui.file-explorer").
//
// Covers: Ctrl/Cmd-click toggle, Shift-click range select, click-empty-space
// clear, Escape clear, multi-selection Details panel summary, batch download,
// batch delete (single confirm), and multi-item drag (dragging a selected
// item carries the whole selection; dragging a non-selected item does not).
//
// Run against the dev server on port 8111 (see CLAUDE.md testing conventions):
//
//   npx webpack serve --port 8111 &
//   node testing/scripts/test-explorer-multiselect.mjs
//
import { chromium } from 'playwright';

const PORT = 8111;
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
// Auto-accept confirm() dialogs (batch delete asks for one confirmation) -
// also counted, so the test can verify exactly one confirm fires per batch
// delete (not one per deleted item).
let dialogCount = 0;
page.on('dialog', dialog => { dialogCount++; dialog.accept(); });

console.log('Loading app...');
await page.goto(BASE_URL, { waitUntil: 'load' });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Per CLAUDE.md: system may be under heavy load from parallel dev servers -
// poll for boot readiness instead of relying on fixed sleeps, and retry
// opening windows a few times rather than giving up after one attempt.
await page.waitForFunction(() => window.platform && window.platform.host && window.platform.host.getFS, { timeout: 60000 });
await page.waitForFunction(() => {
  try { return !!window.platform.host.getService('001-core.layout', 'open-window'); } catch (_) { return false; }
}, { timeout: 60000 });
await page.waitForTimeout(500);

const openWindowRetrying = async (cmd, retries = 10, delayMs = 1500) => {
  for (let i = 0; i < retries; i++) {
    try {
      await page.evaluate((c) => window.platform.host.execCommand(c, window.platform), cmd);
      return true;
    } catch (e) {
      console.log(`open-window attempt ${i + 1} failed, retrying:`, String(e).slice(0, 150));
      await page.waitForTimeout(delayMs);
    }
  }
  return false;
};

const findFrame = async (selector) => {
  for (const frame of page.frames()) {
    try { if (await frame.locator(selector).count() > 0) return frame; } catch (_) {}
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────────────
// Fixture setup: a test dir with 5 files of varying sizes plus two empty
// destination subfolders for the drag tests, for each explorer copy under
// test (kept in separate dirs so the two explorer windows' frames can be
// told apart unambiguously, mirroring test-explorer-download-details.mjs).
// ─────────────────────────────────────────────────────────────────────────
console.log('pre-fixture errors so far:', errors);
const fixtureResult = await page.evaluate(() => {
  try {
    const fs = window.platform.host.getFS();
    const mkFixture = (dir) => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
      if (!fs.existsSync(`${dir}/dest`)) fs.mkdirSync(`${dir}/dest`);
      if (!fs.existsSync(`${dir}/dest2`)) fs.mkdirSync(`${dir}/dest2`);
      fs.writeFileSync(`${dir}/a-alpha.txt`, 'A'.repeat(100));
      fs.writeFileSync(`${dir}/b-bravo.txt`, 'B'.repeat(200));
      fs.writeFileSync(`${dir}/c-charlie.txt`, 'C'.repeat(300));
      fs.writeFileSync(`${dir}/d-delta.txt`, 'D'.repeat(400));
      fs.writeFileSync(`${dir}/e-echo.txt`, 'E'.repeat(500));
    };
    mkFixture('/tmp/ms-test');
    mkFixture('/tmp/ms-test-tsx');
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e && e.message, stack: e && e.stack, str: String(e) };
  }
});
console.log('fixtureResult:', JSON.stringify(fixtureResult));
if (!fixtureResult.ok) {
  console.log('errors collected:', errors);
  await page.screenshot({ path: 'testing/screenshots/multiselect-fixture-error.png' }).catch(() => {});
  await browser.close();
  process.exit(1);
}

// Runs the full multi-select test suite against one explorer instance.
// `openCmd` opens the window; `frameFindText` is unique text used to locate
// the correct iframe among potentially multiple open explorer windows.
async function runSuite(label, openCmd, dir, frameFindSelector) {
  console.log(`\n=== ${label} ===`);
  const opened = await openWindowRetrying(openCmd);
  assert(opened, `${label}: open-window command succeeded`);
  await page.waitForTimeout(1500);

  let frame = await findFrame(frameFindSelector);
  assert(!!frame, `${label}: explorer window opened and frame found`);
  if (!frame) return;

  await page.screenshot({ path: `testing/screenshots/multiselect-${label}-initial.png` });

  const fileItem = (name) => frame.locator('.file-item', { hasText: name });

  // --- Plain click still replaces the whole selection (unchanged behavior) ---
  await fileItem('a-alpha.txt').click({ force: true });
  await page.waitForTimeout(200);
  frame = await findFrame(frameFindSelector);
  let selectedCount = await frame.locator('.file-item.selected').count();
  assert(selectedCount === 1, `${label}: plain click selects exactly one item (got ${selectedCount})`);

  // --- Ctrl/Cmd-click toggles membership: select 3 non-contiguous items ---
  await fileItem('a-alpha.txt').click({ force: true }); // fresh baseline single-select
  await page.waitForTimeout(150);
  frame = await findFrame(frameFindSelector);
  await frame.locator('.file-item', { hasText: 'c-charlie.txt' }).click({ modifiers: ['Meta'], force: true });
  await page.waitForTimeout(150);
  frame = await findFrame(frameFindSelector);
  await frame.locator('.file-item', { hasText: 'e-echo.txt' }).click({ modifiers: ['Meta'], force: true });
  await page.waitForTimeout(200);
  frame = await findFrame(frameFindSelector);
  selectedCount = await frame.locator('.file-item.selected').count();
  assert(selectedCount === 3, `${label}: ctrl-click builds a 3-item selection (got ${selectedCount})`);
  const selectedNames = await frame.locator('.file-item.selected .file-name').allInnerTexts();
  assert(
    ['a-alpha.txt', 'c-charlie.txt', 'e-echo.txt'].every(n => selectedNames.includes(n)),
    `${label}: the 3 ctrl-clicked items (a, c, e) are all highlighted (got ${JSON.stringify(selectedNames)})`
  );

  // Toggle one back off via ctrl-click.
  await frame.locator('.file-item', { hasText: 'c-charlie.txt' }).click({ modifiers: ['Meta'], force: true });
  await page.waitForTimeout(200);
  frame = await findFrame(frameFindSelector);
  selectedCount = await frame.locator('.file-item.selected').count();
  assert(selectedCount === 2, `${label}: ctrl-click toggles an item back off (got ${selectedCount}, expected 2)`);

  // --- Details panel: multi-selection summary (count + combined size) ---
  await frame.locator('[aria-label="details"]').click({ force: true });
  await page.waitForTimeout(300);
  frame = await findFrame(frameFindSelector);
  let detailsText = await frame.locator('.file-explorer-details').innerText();
  console.log(`${label}: details (2 selected) =`, detailsText.replace(/\n/g, ' | '));
  assert(detailsText.includes('2 items'), `${label}: details panel shows "2 items" for a 2-item selection`);
  assert(detailsText.includes('600 B') || detailsText.toLowerCase().includes('600 b'), `${label}: details panel shows combined size 600 B (100+500) (got: ${detailsText})`);

  // --- Shift-click range select ---
  await frame.locator('.file-item', { hasText: 'a-alpha.txt' }).click({ force: true }); // anchor
  await page.waitForTimeout(150);
  frame = await findFrame(frameFindSelector);
  await frame.locator('.file-item', { hasText: 'd-delta.txt' }).click({ modifiers: ['Shift'], force: true });
  await page.waitForTimeout(200);
  frame = await findFrame(frameFindSelector);
  selectedCount = await frame.locator('.file-item.selected').count();
  const rangeNames = await frame.locator('.file-item.selected .file-name').allInnerTexts();
  console.log(`${label}: shift-click range selected =`, rangeNames);
  assert(selectedCount === 4, `${label}: shift-click selects a contiguous range of 4 items (a..d) (got ${selectedCount})`);
  assert(
    ['a-alpha.txt', 'b-bravo.txt', 'c-charlie.txt', 'd-delta.txt'].every(n => rangeNames.includes(n)),
    `${label}: shift-click range includes a,b,c,d (got ${JSON.stringify(rangeNames)})`
  );

  // --- Multi-selection details: total size for the 4-item range ---
  frame = await findFrame(frameFindSelector);
  detailsText = await frame.locator('.file-explorer-details').innerText();
  assert(detailsText.includes('4 items'), `${label}: details panel shows "4 items" for the range selection`);
  assert(detailsText.includes('1000 B') || detailsText.includes('1.0 KB'), `${label}: details panel shows combined size for range (100+200+300+400=1000 B) (got: ${detailsText})`);

  // --- Click on empty space clears selection ---
  const mainBox = await frame.locator('main').first().boundingBox();
  await page.mouse.click(mainBox.x + mainBox.width - 10, mainBox.y + mainBox.height - 10);
  await page.waitForTimeout(200);
  frame = await findFrame(frameFindSelector);
  selectedCount = await frame.locator('.file-item.selected').count();
  assert(selectedCount === 0, `${label}: clicking empty space clears the selection (got ${selectedCount} still selected)`);
  detailsText = await frame.locator('.file-explorer-details').innerText();
  assert(detailsText.includes('Select a file or folder'), `${label}: details panel shows empty state after clearing`);

  // --- Escape clears selection ---
  await frame.locator('.file-item', { hasText: 'a-alpha.txt' }).click({ force: true });
  await page.waitForTimeout(150);
  frame = await findFrame(frameFindSelector);
  await frame.locator('.file-item', { hasText: 'c-charlie.txt' }).click({ modifiers: ['Meta'], force: true });
  await page.waitForTimeout(200);
  frame = await findFrame(frameFindSelector);
  selectedCount = await frame.locator('.file-item.selected').count();
  assert(selectedCount === 2, `${label}: pre-Escape selection has 2 items (got ${selectedCount})`);
  await frame.locator('.file-item', { hasText: 'a-alpha.txt' }).press('Escape');
  await page.waitForTimeout(200);
  frame = await findFrame(frameFindSelector);
  selectedCount = await frame.locator('.file-item.selected').count();
  assert(selectedCount === 0, `${label}: Escape clears the selection (got ${selectedCount} still selected)`);

  // --- Batch download: one download event per selected file ---
  await frame.locator('.file-item', { hasText: 'a-alpha.txt' }).click({ force: true });
  await page.waitForTimeout(150);
  frame = await findFrame(frameFindSelector);
  await frame.locator('.file-item', { hasText: 'b-bravo.txt' }).click({ modifiers: ['Meta'], force: true });
  await page.waitForTimeout(150);
  frame = await findFrame(frameFindSelector);
  await frame.locator('.file-item', { hasText: 'c-charlie.txt' }).click({ modifiers: ['Meta'], force: true });
  await page.waitForTimeout(200);
  frame = await findFrame(frameFindSelector);
  selectedCount = await frame.locator('.file-item.selected').count();
  assert(selectedCount === 3, `${label}: batch-download selection has 3 items (got ${selectedCount})`);

  const downloads = [];
  const onDownload = (d) => downloads.push(d.suggestedFilename());
  page.on('download', onDownload);
  await frame.locator('.file-item', { hasText: 'a-alpha.txt' }).click({ button: 'right', force: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `testing/screenshots/multiselect-${label}-batch-ctxmenu.png` });
  const batchDownloadBtn = page.locator('.contextmenu button', { hasText: 'Download' }).first();
  assert(await batchDownloadBtn.count() > 0, `${label}: batch context menu has a Download action`);
  await batchDownloadBtn.click({ force: true });
  await page.waitForTimeout(1200);
  page.off('download', onDownload);
  console.log(`${label}: batch download filenames =`, downloads);
  assert(downloads.length === 3, `${label}: batch download fired exactly 3 download events (got ${downloads.length})`);
  assert(
    ['a-alpha.txt', 'b-bravo.txt', 'c-charlie.txt'].every(n => downloads.includes(n)),
    `${label}: batch download included a,b,c (got ${JSON.stringify(downloads)})`
  );

  // --- Batch delete: single confirm, removes exactly the selected items ---
  frame = await findFrame(frameFindSelector);
  await frame.locator('.file-item', { hasText: 'd-delta.txt' }).click({ force: true });
  await page.waitForTimeout(150);
  frame = await findFrame(frameFindSelector);
  await frame.locator('.file-item', { hasText: 'e-echo.txt' }).click({ modifiers: ['Meta'], force: true });
  await page.waitForTimeout(200);
  frame = await findFrame(frameFindSelector);
  await frame.locator('.file-item', { hasText: 'd-delta.txt' }).click({ button: 'right', force: true });
  await page.waitForTimeout(400);
  const deleteBtn = page.locator('.contextmenu button', { hasText: 'Delete 2 items' });
  assert(await deleteBtn.count() > 0, `${label}: batch context menu shows "Delete 2 items"`);
  const dialogCountBeforeDelete = dialogCount;
  await deleteBtn.click({ force: true });
  await page.waitForTimeout(600);
  assert(dialogCount - dialogCountBeforeDelete === 1, `${label}: batch delete showed exactly ONE confirm dialog (got ${dialogCount - dialogCountBeforeDelete})`);

  const afterDelete = await page.evaluate((d) => {
    const fs = window.platform.host.getFS();
    return {
      dExists: fs.existsSync(`${d}/d-delta.txt`),
      eExists: fs.existsSync(`${d}/e-echo.txt`),
      aExists: fs.existsSync(`${d}/a-alpha.txt`),
      bExists: fs.existsSync(`${d}/b-bravo.txt`),
      cExists: fs.existsSync(`${d}/c-charlie.txt`),
    };
  }, dir);
  console.log(`${label}: after batch delete =`, afterDelete);
  assert(!afterDelete.dExists && !afterDelete.eExists, `${label}: batch delete removed exactly d and e`);
  assert(afterDelete.aExists && afterDelete.bExists && afterDelete.cExists, `${label}: batch delete left a, b, c untouched`);

  // ─── Multi-item drag: dragging a SELECTED item carries the whole selection ───
  frame = await findFrame(frameFindSelector);
  await frame.locator('.file-item', { hasText: 'a-alpha.txt' }).click({ force: true });
  await page.waitForTimeout(150);
  frame = await findFrame(frameFindSelector);
  await frame.locator('.file-item', { hasText: 'b-bravo.txt' }).click({ modifiers: ['Meta'], force: true });
  await page.waitForTimeout(200);
  frame = await findFrame(frameFindSelector);
  selectedCount = await frame.locator('.file-item.selected').count();
  assert(selectedCount === 2, `${label}: pre-drag selection has a,b selected (got ${selectedCount})`);

  const multiDragResult = await frame.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.file-item'));
    const source = items.find(el => el.querySelector('.file-name')?.textContent === 'a-alpha.txt'); // part of selection
    const target = items.find(el => el.querySelector('.file-name')?.textContent === 'dest');
    if (!source || !target) return { ok: false, found: items.map(el => el.querySelector('.file-name')?.textContent) };
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    return { ok: true, types: dataTransfer.types };
  });
  console.log(`${label}: multi-drag dispatch result =`, multiDragResult);
  await page.waitForTimeout(500);

  const afterMultiDrag = await page.evaluate((d) => {
    const fs = window.platform.host.getFS();
    return {
      aInDest: fs.existsSync(`${d}/dest/a-alpha.txt`),
      bInDest: fs.existsSync(`${d}/dest/b-bravo.txt`),
      cStillTop: fs.existsSync(`${d}/c-charlie.txt`),
      aStillTop: fs.existsSync(`${d}/a-alpha.txt`),
      bStillTop: fs.existsSync(`${d}/b-bravo.txt`),
    };
  }, dir);
  console.log(`${label}: after multi-drag =`, afterMultiDrag);
  assert(afterMultiDrag.aInDest && afterMultiDrag.bInDest, `${label}: dragging a selected item carried the WHOLE selection (a and b) into dest/`);
  assert(!afterMultiDrag.aStillTop && !afterMultiDrag.bStillTop, `${label}: a and b no longer at top level after multi-drag`);
  assert(afterMultiDrag.cStillTop, `${label}: c (not part of the drag) is untouched`);

  // ─── Dragging a NON-selected item only moves that one item ───
  frame = await findFrame(frameFindSelector);
  // Current selection is still {a, b} (now inside dest/), neither of which is
  // "c" - so c is not part of the selection. Drag c (not selected) onto dest2.
  const soloDragResult = await frame.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.file-item'));
    const source = items.find(el => el.querySelector('.file-name')?.textContent === 'c-charlie.txt');
    const target = items.find(el => el.querySelector('.file-name')?.textContent === 'dest2');
    if (!source || !target) return { ok: false, found: items.map(el => el.querySelector('.file-name')?.textContent) };
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    return { ok: true };
  });
  console.log(`${label}: solo-drag dispatch result =`, soloDragResult);
  await page.waitForTimeout(500);

  const afterSoloDrag = await page.evaluate((d) => {
    const fs = window.platform.host.getFS();
    return {
      cInDest2: fs.existsSync(`${d}/dest2/c-charlie.txt`),
      aStillInDest: fs.existsSync(`${d}/dest/a-alpha.txt`),
      bStillInDest: fs.existsSync(`${d}/dest/b-bravo.txt`),
    };
  }, dir);
  console.log(`${label}: after solo-drag =`, afterSoloDrag);
  assert(afterSoloDrag.cInDest2, `${label}: dragging non-selected c moved c into dest2/`);
  assert(afterSoloDrag.aStillInDest && afterSoloDrag.bStillInDest, `${label}: a and b (selected but not dragged) were NOT moved by dragging c`);

  await page.screenshot({ path: `testing/screenshots/multiselect-${label}-final.png` });
}

// Frame selector is anchored to the breadcrumb's "current" crumb (title=full
// path of the directory the window is browsing), not to a specific file name
// - file names inside the dir get moved/deleted over the course of the suite
// (drag tests relocate a-alpha.txt out of the top level, batch-delete removes
// d/e), but the directory being browsed never changes, so this stays stable
// and unique to each suite's window for the whole run.
await runSuite(
  'main-js-explorer',
  "service('001-core.layout', 'open-window') (command('explorer'), '/tmp/ms-test')",
  '/tmp/ms-test',
  '.breadcrumbs .crumb.current[title="/tmp/ms-test"]'
);

await runSuite(
  'tsx-ui-file-explorer',
  "service('001-core.layout', 'open-window') (command('ui.file-explorer'), '/tmp/ms-test-tsx')",
  '/tmp/ms-test-tsx',
  '.breadcrumbs .crumb.current[title="/tmp/ms-test-tsx"]'
);

console.log('\nConsole/page errors:', errors.length ? errors : 'none');
await browser.close();

if (failed) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nRESULT: PASS');
}
