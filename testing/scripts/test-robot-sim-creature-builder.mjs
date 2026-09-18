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
    window.platform.host.exec(window.platform, '/opt/apps/robot-sim/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.robot-sim'))", window.platform);
  });
  await page.waitForTimeout(2000);

  let f = null;
  for (const fr of page.frames()) {
    if (fr.url().includes('robot-sim/main.html')) { f = fr; break; }
  }
  if (!f) { console.log('Frame not found'); await browser.close(); return; }
  await page.waitForTimeout(3000); // TF.js load

  // --- Test 1: preset creature (biped) ---
  await f.click('[data-robot="custom"]', { force: true });
  await page.waitForTimeout(300);
  await f.selectOption('#preset-sel', 'biped');
  await page.waitForTimeout(500);

  const bipedCounts = await f.evaluate(() => ({
    bones: document.getElementById('design-bones').textContent,
    joints: document.getElementById('design-joints').textContent,
    muscles: document.getElementById('design-muscles').textContent,
  }));
  console.log('Biped preset design counts:', JSON.stringify(bipedCounts));

  await f.click('#btn-train', { force: true });
  console.log('Training biped preset...');
  await page.waitForTimeout(15000);
  const bipedStats = await f.evaluate(() => ({
    episode: document.getElementById('s-ep').textContent,
    dist: document.getElementById('s-dist').textContent,
    rew: document.getElementById('s-rew').textContent,
    avg: document.getElementById('s-avg').textContent,
    mem: document.getElementById('cfg-mem').textContent,
  }));
  console.log('Biped stats after 15s:', JSON.stringify(bipedStats));
  await f.click('#btn-train', { force: true }); // stop

  // --- Test 2: manual bone/joint/muscle drawing, dispatched inside the frame ---
  await f.click('#btn-builder', { force: true });
  await page.waitForTimeout(300);
  await f.click('button:has-text("Clear")', { force: true });
  await page.waitForTimeout(300);

  const drawResult = await f.evaluate(() => {
    var rect = buildCanvas.getBoundingClientRect();
    function fireMouse(type, x, y) {
      var ev = new MouseEvent(type, { clientX: rect.left + x, clientY: rect.top + y, bubbles: true });
      buildCanvas.dispatchEvent(ev);
    }
    // Bone 1: horizontal stick
    fireMouse('mousedown', 100, 200);
    fireMouse('mousemove', 200, 200);
    fireMouse('mouseup', 200, 200);
    // Bone 2: vertical stick starting at bone 1's end
    fireMouse('mousedown', 200, 200);
    fireMouse('mousemove', 200, 300);
    fireMouse('mouseup', 200, 300);
    return { bones: design.bones.length, boneData: JSON.parse(JSON.stringify(design.bones)) };
  });
  console.log('After drawing 2 bones (dispatched):', JSON.stringify(drawResult));

  // Add a joint connecting the two bones at their shared point (~200,200 in canvas px -> some world point)
  await f.click('[data-tool="joint"]', { force: true });
  const jointResult = await f.evaluate(() => {
    var rect = buildCanvas.getBoundingClientRect();
    function fireMouse(type, x, y) {
      var ev = new MouseEvent(type, { clientX: rect.left + x, clientY: rect.top + y, bubbles: true });
      buildCanvas.dispatchEvent(ev);
    }
    fireMouse('mousedown', 199, 199);
    fireMouse('mouseup', 199, 199);
    fireMouse('mousedown', 201, 201);
    fireMouse('mouseup', 201, 201);
    return { joints: design.joints.length };
  });
  console.log('After joint attempt:', JSON.stringify(jointResult));

  await f.click('[data-tool="muscle"]', { force: true });
  const muscleResult = await f.evaluate(() => {
    var rect = buildCanvas.getBoundingClientRect();
    function fireMouse(type, x, y) {
      var ev = new MouseEvent(type, { clientX: rect.left + x, clientY: rect.top + y, bubbles: true });
      buildCanvas.dispatchEvent(ev);
    }
    fireMouse('mousedown', 120, 200);
    fireMouse('mouseup', 120, 200);
    fireMouse('mousedown', 200, 260);
    fireMouse('mouseup', 200, 260);
    return { muscles: design.muscles.length };
  });
  console.log('After muscle attempt:', JSON.stringify(muscleResult));

  const finalCounts = await f.evaluate(() => ({
    bones: document.getElementById('design-bones').textContent,
    joints: document.getElementById('design-joints').textContent,
    muscles: document.getElementById('design-muscles').textContent,
  }));
  console.log('Final design counts:', JSON.stringify(finalCounts));

  await f.click('button:has-text("Done")', { force: true });
  await page.waitForTimeout(500);
  await f.click('#btn-train', { force: true });
  console.log('Training hand-drawn creature...');
  await page.waitForTimeout(12000);
  const customStats = await f.evaluate(() => ({
    episode: document.getElementById('s-ep').textContent,
    dist: document.getElementById('s-dist').textContent,
    rew: document.getElementById('s-rew').textContent,
    avg: document.getElementById('s-avg').textContent,
  }));
  console.log('Hand-drawn creature stats after 12s:', JSON.stringify(customStats));

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
