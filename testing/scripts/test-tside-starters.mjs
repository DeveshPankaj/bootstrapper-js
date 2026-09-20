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
  await page.waitForTimeout(2000);

  let f = null;
  for (const fr of page.frames()) { if (fr.url().includes('ts-ide/main.html')) { f = fr; break; } }
  if (!f) { console.log('Frame not found'); await browser.close(); return; }
  await page.waitForTimeout(500);

  console.log('=== Boot: starter 0 loaded as a real project ===');
  const bootCheck = await f.evaluate(() => ({
    filesKeys: Object.keys(files),
    activeFile: activeFile,
    startersCount: STARTERS.length,
    starterNames: STARTERS.map(s => s.name),
  }));
  console.log(JSON.stringify(bootCheck, null, 2));

  console.log('=== Sidebar shows unified Starters + Files, no separate Examples/Templates ===');
  await page.waitForTimeout(3500); // refreshSidebar() awaits listProjects(), bounded to 3s by withTimeout()
  const sidebarCheck = await f.evaluate(() => {
    var groups = [...document.querySelectorAll('.sb-group')].map(g => g.textContent.trim());
    var items = [...document.querySelectorAll('.sb-item .nm')].map(n => n.textContent);
    return { groups: groups, itemCount: items.length };
  });
  console.log(JSON.stringify(sidebarCheck, null, 2));

  console.log('=== Run default starter (Hello Canvas), confirm renders via webapp/iframe path ===');
  await f.click('#run-btn', { force: true });
  await page.waitForTimeout(1000);
  const runCheck = await f.evaluate(() => {
    var ifr = document.getElementById('iframe-preview');
    var cv = document.getElementById('canvas-preview');
    return {
      iframeVisible: ifr.style.display !== 'none',
      canvasHidden: cv.style.display === 'none',
      consoleLines: [...document.querySelectorAll('#console-lines .log')].map(l => l.textContent),
    };
  });
  console.log(JSON.stringify(runCheck, null, 2));
  // Check inside the real iframe that the canvas actually got sized/drawn.
  const ifrHandle = await f.$('#iframe-preview');
  const innerFrame = await ifrHandle.contentFrame();
  const innerCanvasCheck = await innerFrame.evaluate(() => {
    var cv = document.getElementById('preview');
    var ctx = cv.getContext('2d');
    var data = ctx.getImageData(0,0,cv.width,cv.height).data;
    var nonBlack = 0;
    for (var i=0;i<data.length;i+=4){ if (data[i]>0||data[i+1]>0||data[i+2]>0) nonBlack++; }
    return { w: cv.width, h: cv.height, nonBlackPixels: nonBlack };
  });
  console.log('Inner canvas:', JSON.stringify(innerCanvasCheck));

  console.log('=== GLSL Shader starter: shader.frag inlined + rendered ===');
  const glslIdx = await f.evaluate(() => STARTERS.findIndex(s => s.name === 'GLSL Shader'));
  await f.evaluate((i) => loadStarter(i), glslIdx);
  await page.waitForTimeout(1000);
  const glslFilesCheck = await f.evaluate(() => Object.keys(files));
  console.log('GLSL project files:', JSON.stringify(glslFilesCheck));
  const glslFrame = await (await f.$('#iframe-preview')).contentFrame();
  const glslCheck = await glslFrame.evaluate(() => {
    var script = document.getElementById('fragShader');
    var cv = document.getElementById('preview');
    return { hasShaderScript: !!script, shaderTextLen: script ? script.textContent.length : 0, canvasW: cv.width, canvasH: cv.height };
  });
  console.log('GLSL check:', JSON.stringify(glslCheck));

  console.log('=== Cross-File Imports starter: app.ts imports from utils.ts ===');
  const xImportIdx = await f.evaluate(() => STARTERS.findIndex(s => s.name === 'Cross-File Imports'));
  await f.evaluate((i) => loadStarter(i), xImportIdx);
  await page.waitForTimeout(1000);
  const xImportFiles = await f.evaluate(() => Object.keys(files));
  console.log('Cross-file project files:', JSON.stringify(xImportFiles));
  const xImportConsole = await f.evaluate(() => [...document.querySelectorAll('#console-lines .log, #console-lines .err')].map(l => l.textContent));
  console.log('Console output:', JSON.stringify(xImportConsole));

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
