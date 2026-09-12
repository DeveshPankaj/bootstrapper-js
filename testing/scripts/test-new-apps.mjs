// Smoke test: vector-store and ai-dom-lens open correctly.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

await page.goto(BASE, { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(4000);

// ── 1. Commands registered ────────────────────────────────────────────────────
const cmds = await page.evaluate(() => ({
  vectorStore: typeof window.platform?.host?.getCommand?.('ui.vector-store') !== 'undefined',
  aiDomLens:   typeof window.platform?.host?.getCommand?.('ui.ai-dom-lens')  !== 'undefined',
}));
console.log('1. Commands registered:', JSON.stringify(cmds));

// ── 2. Open Vector Store ──────────────────────────────────────────────────────
await page.evaluate(() => window.platform.host.callCommand('ui.vector-store'));
await page.waitForTimeout(3000);

const vsFrame = page.frames().find(f => f.url().includes('vector-store'));
console.log('2. Vector Store frame found:', !!vsFrame);

if (vsFrame) {
  const vsHead = await vsFrame.evaluate(() => ({
    title: document.title,
    hasNewProjBtn: !!document.getElementById('newProjBtn'),
    hasTabs: document.querySelectorAll('.tab').length,
    hasCanvas: !!document.getElementById('c3d'),
    status: document.getElementById('stTxt')?.textContent,
  }));
  console.log('3. Vector Store UI:', JSON.stringify(vsHead));

  // Create a project and add a row
  await vsFrame.evaluate(() => {
    // Monkey-patch prompt to return 'Test Project'
    window._origPrompt = window.prompt;
    window.prompt = () => 'Test Project';
  });
  await vsFrame.evaluate(() => document.getElementById('newProjBtn').click());
  await vsFrame.waitForTimeout(500);
  await vsFrame.evaluate(() => window.prompt = window._origPrompt);

  // Check project was created
  const projCreated = await vsFrame.evaluate(() => ({
    projItems: document.querySelectorAll('.proj-item').length,
    projTitle: document.getElementById('projTitle')?.value,
  }));
  console.log('4. Project created:', JSON.stringify(projCreated));
}

// ── 5. Open AI DOM Lens ───────────────────────────────────────────────────────
await page.evaluate(() => window.platform.host.callCommand('ui.ai-dom-lens'));
await page.waitForTimeout(3000);

const lensFrame = page.frames().find(f => f.url().includes('ai-dom-lens'));
console.log('5. AI DOM Lens frame found:', !!lensFrame);

if (lensFrame) {
  const lensHead = await lensFrame.evaluate(() => ({
    title: document.title,
    hasQuery: !!document.getElementById('qInput'),
    hasVsSel: !!document.getElementById('vsSel'),
    prodRows: document.querySelectorAll('#prodBody tr').length,
    cards: document.querySelectorAll('.card').length,
    articles: document.querySelectorAll('.art').length,
    status: document.getElementById('stTxt')?.textContent,
  }));
  console.log('6. AI DOM Lens UI:', JSON.stringify(lensHead));

  // Check sandbox + bootstrap
  const sandbox = await page.evaluate(() => {
    const collect = doc => { try { return [...doc.querySelectorAll('iframe'), ...[...doc.querySelectorAll('iframe')].flatMap(f=>{ try{return collect(f.contentDocument)}catch(_){return[]} })]; } catch(_){return []} };
    for (const f of collect(document)) {
      if ((f.src||'').includes('ai-dom-lens')) return { hasSandbox: f.hasAttribute('sandbox'), sandboxVal: f.getAttribute('sandbox') };
    }
    return null;
  });
  console.log('7. Sandbox attribute:', JSON.stringify(sandbox));

  const bootstrap = await lensFrame.evaluate(() => ({
    hasBootstrap: document.head?.innerHTML?.includes('wos-appsdk-bootstrap'),
    hasAppSDK: typeof window.AppSDK !== 'undefined',
  }));
  console.log('8. Bootstrap:', JSON.stringify(bootstrap));
}

await browser.close();
console.log('\nDone.');
