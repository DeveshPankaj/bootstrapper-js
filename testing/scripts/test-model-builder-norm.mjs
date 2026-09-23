import { chromium } from 'playwright';
const PORT = process.env.PORT || 8098;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') console.log('PAGE-ERR:', msg.text()); });
  await page.goto(`http://localhost:${PORT}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(10000);

  await page.evaluate(() => {
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.model-builder'))", window.platform);
  });

  let f = null;
  for (let attempt = 0; attempt < 10 && !f; attempt++) {
    await page.waitForTimeout(1000);
    for (const fr of page.frames()) { if (fr.url().includes('model-builder/main.html')) { f = fr; break; } }
  }
  console.log('Frame found:', !!f);
  if (!f) { console.log('Frames:', page.frames().map(fr => fr.url())); await browser.close(); return; }
  const frameErrors = [];
  f.on('pageerror', e => frameErrors.push(e.message));

  console.log('=== Add a Normalization node via UI, connect it into the chain ===');
  await f.selectOption('#nodeTypeSel', 'norm');
  await f.click('#addLayer', { force: true });
  await page.waitForTimeout(300);

  const nodeCheck = await f.evaluate(() => {
    const normNode = nodes.find(n => n.type === 'norm');
    return { found: !!normNode, id: normNode && normNode.id, label: normNode && labelFor(normNode) };
  });
  console.log(JSON.stringify(nodeCheck));

  console.log('=== Rewire: Input -> Dense -> Norm -> Output (was Input -> Dense -> Output) ===');
  const rewireResult = await f.evaluate(() => {
    const input = nodes.find(n => n.type === 'input');
    const dense = nodes.find(n => n.type === 'dense');
    const normNode = nodes.find(n => n.type === 'norm');
    const output = nodes.find(n => n.type === 'output');
    connect(input.id, dense.id);
    connect(dense.id, normNode.id);
    connect(normNode.id, output.id);
    render();
    try {
      const chain = extractChain();
      return { ok: true, middleTypes: chain.middle.map(n => n.type) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  console.log(JSON.stringify(rewireResult));

  console.log('=== Build & Train with the Norm layer in the chain, confirm loss decreases and no NaN ===');
  await f.selectOption('#task', 'xor');
  await page.waitForTimeout(200);
  await f.fill('#epochInput', '300');
  await f.click('#build', { force: true });
  await page.waitForTimeout(6000);

  const trainResult = await f.evaluate(() => ({
    badge: document.getElementById('statBadge').textContent,
    loss: document.getElementById('statLoss').textContent,
    status: document.getElementById('status').textContent,
    lossHistory: lossHistory.slice(),
  }));
  console.log(JSON.stringify({ badge: trainResult.badge, loss: trainResult.loss, status: trainResult.status }, null, 2));
  console.log('Loss history (first 3, last 3):', trainResult.lossHistory.slice(0, 3), trainResult.lossHistory.slice(-3));
  const anyNaN = trainResult.lossHistory.some(l => Number.isNaN(l) || !Number.isFinite(l));
  console.log('Any NaN/Infinite loss:', anyNaN);
  const decreased = trainResult.lossHistory.length >= 2 && trainResult.lossHistory[trainResult.lossHistory.length - 1] < trainResult.lossHistory[0];
  console.log('Loss decreased overall:', decreased);

  console.log('=== Confirm gamma/beta actually moved from their init values (learning happened) ===');
  const paramCheck = await f.evaluate(() => {
    const normLayer = net.middle.find(l => l.kind === 'norm');
    if (!normLayer) return { found: false };
    const gammaAllOne = normLayer.weights.every(v => v === 1);
    const betaAllZero = normLayer.biases.every(v => v === 0);
    return { found: true, gammaAllOne, betaAllZero, gammaSample: Array.from(normLayer.weights).slice(0, 3), betaSample: Array.from(normLayer.biases).slice(0, 3) };
  });
  console.log(JSON.stringify(paramCheck));

  console.log('=== Predict still works with a Norm layer in the chain ===');
  await f.evaluate(() => { document.querySelectorAll('#testInputs input')[0].value = '1'; document.querySelectorAll('#testInputs input')[1].value = '0'; });
  await f.click('#predictBtn', { force: true });
  await page.waitForTimeout(300);
  const predictText = await f.evaluate(() => document.getElementById('testResult').textContent);
  console.log('Predict result text:', predictText);

  console.log('Frame errors:', frameErrors.length ? frameErrors : 'none');
  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
