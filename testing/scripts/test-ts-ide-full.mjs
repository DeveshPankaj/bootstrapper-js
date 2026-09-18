import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
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

  console.log('=== Test 1: Boot — default example loaded correctly ===');
  const bootCheck = await f.evaluate(() => ({
    activeFile: activeFile,
    filesKeys: Object.keys(files),
    editorHasContent: editor.getValue().length > 0,
    examplesCount: EXAMPLES.length,
    templatesCount: TEMPLATES.length,
  }));
  console.log(JSON.stringify(bootCheck));

  console.log('=== Test 2: Run default TS example — console should show output ===');
  await f.click('#run-btn', { force: true });
  await page.waitForTimeout(1500);
  const run1 = await f.evaluate(() => ({
    status: document.getElementById('status-msg').textContent,
    logs: [...document.querySelectorAll('#console-lines .log')].map(l => l.textContent),
  }));
  console.log(JSON.stringify(run1));

  console.log('=== Test 3: Load GLSL example by name, confirm lang tag + run ===');
  const glslIdx = await f.evaluate(() => EXAMPLES.findIndex(e => e.lang === 'glsl'));
  await f.evaluate((i) => loadExample(i), glslIdx);
  await page.waitForTimeout(300);
  const glslCheck = await f.evaluate(() => document.getElementById('lang-tag').textContent);
  console.log('Lang tag for GLSL file:', glslCheck);
  await f.click('#run-btn', { force: true });
  await page.waitForTimeout(800);
  const glslStatus = await f.evaluate(() => document.getElementById('status-msg').textContent);
  console.log('GLSL run status:', glslStatus);

  console.log('=== Test 4: Load Webapp Starter template (multi-file) ===');
  await f.evaluate(() => loadTemplate(0));
  await page.waitForTimeout(1500);
  const tplCheck = await f.evaluate(() => ({
    filesKeys: Object.keys(files),
    activeFile: activeFile,
  }));
  console.log(JSON.stringify(tplCheck));

  // Check the iframe actually rendered real HTML content (not canvas hack)
  const iframeContent = await f.evaluate(() => {
    var ifr = document.getElementById('iframe-preview');
    try {
      var doc = ifr.contentDocument;
      return { h1: doc.querySelector('h1') ? doc.querySelector('h1').textContent : null, hasButton: !!doc.getElementById('inc') };
    } catch (e) { return { error: e.message }; }
  });
  console.log('Webapp iframe rendered content:', JSON.stringify(iframeContent));

  console.log('=== Test 5: Switch between files in the template, confirm mode + editor content ===');
  await f.evaluate(() => switchFile('style.css'));
  await page.waitForTimeout(200);
  const cssCheck = await f.evaluate(() => ({
    activeFile: activeFile,
    langTag: document.getElementById('lang-tag').textContent,
    editorMode: editor.getOption('mode'),
    contentStartsRight: editor.getValue().trim().startsWith('body'),
  }));
  console.log(JSON.stringify(cssCheck));

  console.log('=== Test 6: Add a new file to the project ===');
  page.once('dialog', d => d.accept('helper.ts'));
  await f.evaluate(() => addFileToProject());
  await page.waitForTimeout(300);
  const addCheck = await f.evaluate(() => ({ filesKeys: Object.keys(files), activeFile: activeFile }));
  console.log(JSON.stringify(addCheck));

  console.log('=== Test 7: Delete a file ===');
  page.once('dialog', d => d.accept());
  await f.evaluate(() => deleteFile('helper.ts'));
  await page.waitForTimeout(300);
  const delCheck = await f.evaluate(() => Object.keys(files));
  console.log('Files after delete:', JSON.stringify(delCheck));

  console.log('=== Test 8: Save multi-file project, then verify via top-level fs ===');
  page.once('dialog', d => d.accept('webapp-test'));
  await f.evaluate(() => saveProject());
  await page.waitForTimeout(500);
  const saveCheck = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    const dir = '/home/user1/.local/share/ui.ts-ide/projects/webapp-test';
    try {
      const files = fs.readdirSync(dir);
      return { exists: true, files: files };
    } catch (e) { return { exists: false, error: e.message }; }
  });
  console.log(JSON.stringify(saveCheck));

  console.log('=== Test 9: Open Folder with an arbitrary path (this same saved project) ===');
  await f.evaluate(() => { files = {}; activeFile = null; projectDir = null; isDirty = false; });
  page.once('dialog', d => d.accept('/home/user1/.local/share/ui.ts-ide/projects/webapp-test'));
  await f.evaluate(() => openFolder());
  await page.waitForTimeout(500);
  const openFolderCheck = await f.evaluate(() => ({ filesKeys: Object.keys(files), activeFile: activeFile, projectDir: projectDir }));
  console.log(JSON.stringify(openFolderCheck));

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
