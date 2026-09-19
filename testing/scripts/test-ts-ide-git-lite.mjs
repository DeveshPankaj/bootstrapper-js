import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://localhost:8092');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.platform && window.platform.host, { timeout: 30000 });
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/ts-ide/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.ts-ide'))", window.platform);
  });
  await page.waitForTimeout(2000);

  let f = null;
  for (const fr of page.frames()) {
    if (fr.url().includes('ts-ide/main.html')) { f = fr; break; }
  }
  if (!f) { console.log('Frame not found'); await browser.close(); return; }
  await page.waitForTimeout(2000);

  console.log('=== Test 1: Boot — default example loaded, no modified indicator initially ===');
  const bootCheck = await f.evaluate(() => ({
    activeFile: activeFile,
    filesKeys: Object.keys(files),
    isFileModified: isFileModified(activeFile),
    dotShows: document.querySelector('.sb-item[data-file="' + activeFile + '"] .sb-mod-dot').classList.contains('show'),
  }));
  console.log(JSON.stringify(bootCheck));
  if (bootCheck.isFileModified || bootCheck.dotShows) {
    console.log('FAIL: expected no modified indicator on fresh load');
  } else {
    console.log('PASS: fresh load shows unmodified');
  }

  console.log('=== Test 2: Diff view on unmodified file shows "no differences" (has baseline, no changes) ===');
  await f.evaluate(() => showDiff());
  await page.waitForTimeout(200);
  const diffEmptyText = await f.evaluate(() => document.getElementById('diff-body').textContent);
  console.log('Diff body (unmodified):', diffEmptyText);
  await f.evaluate(() => closeDiff());

  console.log('=== Test 3: Type new content into the editor, confirm modified indicator appears ===');
  await f.evaluate(() => {
    editor.setValue(editor.getValue() + '\nconsole.log("git-lite test edit");\n');
  });
  await page.waitForTimeout(300);
  const afterEdit = await f.evaluate(() => ({
    isFileModified: isFileModified(activeFile),
    dotShows: document.querySelector('.sb-item[data-file="' + activeFile + '"] .sb-mod-dot').classList.contains('show'),
  }));
  console.log(JSON.stringify(afterEdit));
  if (afterEdit.isFileModified && afterEdit.dotShows) {
    console.log('PASS: modified indicator appears after edit');
  } else {
    console.log('FAIL: modified indicator did not appear after edit');
  }

  console.log('=== Test 4: Open Diff view, confirm it shows the actual added line ===');
  await f.evaluate(() => showDiff());
  await page.waitForTimeout(200);
  const diffCheck = await f.evaluate(() => ({
    overlayShown: document.getElementById('diff-overlay').classList.contains('show'),
    hasAddLine: !!document.querySelector('.diff-line.add'),
    addLineText: document.querySelector('.diff-line.add') ? document.querySelector('.diff-line.add').textContent : null,
  }));
  console.log(JSON.stringify(diffCheck));
  if (diffCheck.overlayShown && diffCheck.hasAddLine && diffCheck.addLineText.includes('git-lite test edit')) {
    console.log('PASS: diff view shows the added line');
  } else {
    console.log('FAIL: diff view did not show expected added line');
  }
  await f.evaluate(() => closeDiff());

  console.log('=== Test 5: Save the project (multi-step: needs a project dir) ===');
  page.once('dialog', d => d.accept('git-lite-test'));
  await f.evaluate(() => saveProject());
  await page.waitForTimeout(800);
  const projectDirAfterSave = await f.evaluate(() => projectDir);
  console.log('projectDir after save:', projectDirAfterSave);

  console.log('=== Test 6: After Save, modified indicator clears ===');
  const afterSave = await f.evaluate(() => ({
    isFileModified: isFileModified(activeFile),
    dotShows: document.querySelector('.sb-item[data-file="' + activeFile + '"] .sb-mod-dot').classList.contains('show'),
  }));
  console.log(JSON.stringify(afterSave));
  if (!afterSave.isFileModified && !afterSave.dotShows) {
    console.log('PASS: modified indicator cleared after save');
  } else {
    console.log('FAIL: modified indicator still shows after save');
  }

  console.log('=== Test 7: Diff view reopened after save shows no differences ===');
  await f.evaluate(() => showDiff());
  await page.waitForTimeout(200);
  const diffAfterSave = await f.evaluate(() => document.getElementById('diff-body').textContent);
  console.log('Diff body (after save):', diffAfterSave);
  if (/no differences/i.test(diffAfterSave)) {
    console.log('PASS: diff view shows no differences after save');
  } else {
    console.log('FAIL: diff view unexpectedly shows differences after save');
  }
  await f.evaluate(() => closeDiff());

  console.log('=== Test 8: Verify .git-lite snapshot actually exists in the vfs with expected content ===');
  const activeFileName = await f.evaluate(() => activeFile);
  const expectedContent = await f.evaluate(() => files[activeFile]);
  const vfsCheck = await page.evaluate(({ dir, name }) => {
    const fs = window.platform.host.getFS();
    try {
      const listing = fs.readdirSync(dir + '/.git-lite');
      const content = fs.readFileSync(dir + '/.git-lite/' + name, 'utf8');
      return { exists: true, listing, content };
    } catch (e) {
      return { exists: false, error: e.message };
    }
  }, { dir: projectDirAfterSave, name: activeFileName });
  console.log(JSON.stringify({ exists: vfsCheck.exists, listing: vfsCheck.listing, matches: vfsCheck.content === expectedContent }));
  if (vfsCheck.exists && vfsCheck.content === expectedContent) {
    console.log('PASS: .git-lite snapshot exists and matches saved content');
  } else {
    console.log('FAIL: .git-lite snapshot missing or mismatched:', JSON.stringify(vfsCheck).slice(0, 300));
  }

  console.log('=== Test 9: Editing again after save re-flags modified, new file (never saved) also flags modified ===');
  await f.evaluate(() => { editor.setValue(editor.getValue() + '\n// one more edit\n'); });
  await page.waitForTimeout(300);
  const editAgain = await f.evaluate(() => isFileModified(activeFile));
  console.log('Modified after second edit:', editAgain);

  page.once('dialog', d => d.accept('fresh-new-file.ts'));
  await f.evaluate(() => addFileToProject());
  await page.waitForTimeout(300);
  const newFileModified = await f.evaluate(() => isFileModified('fresh-new-file.ts'));
  console.log('New unsaved file modified (expect true):', newFileModified);
  if (editAgain && newFileModified) {
    console.log('PASS: post-save edit and brand-new file both flag modified');
  } else {
    console.log('FAIL: expected both to be modified');
  }

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
