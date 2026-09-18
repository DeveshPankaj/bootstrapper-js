import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', err => console.log('PAGEERROR:', err.message));
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  const res = await page.evaluate(() => {
    try {
      window.platform.host.exec(window.platform, '/opt/apps/robot-sim/main.js');
      window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.robot-sim'))", window.platform);
      return 'ok';
    } catch(e) { return 'ERR: ' + e.message; }
  });
  console.log('exec result:', res);
  await page.waitForTimeout(6000);

  let f = null;
  for (const fr of page.frames()) {
    if (fr.url().includes('robot-sim/main.html')) { f = fr; break; }
  }
  if (!f) { console.log('Frame not found. frames:', page.frames().map(fr=>fr.url())); await browser.close(); return; }

  await f.click('#btn-terrain', { force: true });
  await page.waitForTimeout(500);

  await f.evaluate(() => {
    terrain.push({ type: 'platform', x: 20, z: 0, w: 4, h: 1.5, d: 10 });
    instantiateTerrain();
  });

  const debug = await f.evaluate(() => {
    var mesh = terrainMeshes[0];
    var v = mesh.position.clone().project(camera);
    var mouseNDC2 = new THREE.Vector2(v.x, v.y);
    raycaster.setFromCamera(mouseNDC2, camera);
    var hits = raycaster.intersectObjects(terrainMeshes);
    return {
      meshPos: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
      projected: { x: v.x, y: v.y, z: v.z },
      hitsCount: hits.length,
      terrainToolValue: typeof terrainTool !== 'undefined' ? terrainTool : 'undefined',
      terrainMeshesLen: terrainMeshes.length,
      cameraPos: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    };
  });
  console.log('Debug:', JSON.stringify(debug, null, 2));

  await browser.close();
})();
