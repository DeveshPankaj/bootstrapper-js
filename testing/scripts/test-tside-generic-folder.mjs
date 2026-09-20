import { chromium } from 'playwright';
const PORT = process.env.PORT || 8085;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(`http://localhost:${PORT}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/ts-ide/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.ts-ide'))", window.platform);
  });
  await page.waitForTimeout(3000);
  let f = null;
  for (const fr of page.frames()) { if (fr.url().includes('ts-ide/main.html')) { f = fr; break; } }
  if (!f) { console.log('Frame not found. All frames:', page.frames().map(fr => fr.url())); await browser.close(); return; }
  await page.waitForTimeout(3500);

  console.log('=== Fake an external JS project (package.json main=src/entry.js, tsconfig.json, node_modules dir) via a monkeypatched sdk() ===');
  const result = await f.evaluate(async () => {
    const fakeDir = '/mnt/external/my-real-pkg';
    const fakeFS = {
      'package.json': JSON.stringify({ name: '@acme/widgets', main: 'entry.js' }),
      'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'es2020', strict: true } }),
      'entry.js': 'console.log("hello from entry.js");',
      'node_modules': null, // simulate: list() reports it, but readText() on a dir rejects
    };
    sdk = function(){
      return {
        list: function(dir){ return Promise.resolve(Object.keys(fakeFS)); },
        readText: function(path){
          var name = path.split('/').pop();
          if (fakeFS[name] == null) return Promise.reject(new Error('EISDIR'));
          return Promise.resolve(fakeFS[name]);
        },
      };
    };
    await loadProjectFromDir(fakeDir);
    return {
      projectDir,
      activeFile,
      projectNameResult: projectName(),
      filesKeys: Object.keys(files),
      badge: document.getElementById('file-badge').textContent,
    };
  });
  console.log(JSON.stringify(result, null, 2));

  console.log('=== Console log should mention node_modules was skipped ===');
  const consoleLines = await f.evaluate(() => [...document.querySelectorAll('#console-lines .log')].map(l => l.textContent));
  console.log(JSON.stringify(consoleLines.filter(l => /node_modules|Opened|Skipped/i.test(l)), null, 2));

  console.log('=== Sidebar shows package.json-derived project name in header ===');
  const sidebarHead = await f.evaluate(() => {
    const el = document.querySelector('.sb-project-head');
    return el ? el.textContent.trim() : null;
  });
  console.log('Sidebar header:', sidebarHead);

  console.log('=== tsconfig.json from this opened project actually affects compilation (strict read) ===');
  const tsConfigRead = await f.evaluate(() => {
    const opts = readTsConfigCompilerOptions();
    return { target: opts.target, strict: opts.strict };
  });
  console.log(JSON.stringify(tsConfigRead));

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
