// Smoke test: AI DOM Lens chat tab renders correctly.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

await page.goto(BASE, { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(4000);

await page.evaluate(() => window.platform.host.callCommand('ui.ai-dom-lens'));
await page.waitForTimeout(3000);

const lensFrame = page.frames().find(f => f.url().includes('ai-dom-lens'));
console.log('1. Frame found:', !!lensFrame);

if (!lensFrame) { await browser.close(); process.exit(1); }

// Check Analyze tab (default)
const analyzeUI = await lensFrame.evaluate(() => ({
  modeTabs: document.querySelectorAll('.mode-tab').length,
  analyzeActive: document.querySelector('.mode-tab.active')?.dataset.mode,
  analyzePanelVisible: document.getElementById('analyzePanel')?.style.display !== 'none',
  chatPanelVisible: document.getElementById('chatPanel')?.style.display === 'flex',
  prodRows: document.querySelectorAll('#prodBody tr').length,
}));
console.log('2. Analyze tab (default):', JSON.stringify(analyzeUI));

// Switch to Chat tab
await lensFrame.evaluate(() => document.querySelector('.mode-tab[data-mode="chat"]').click());
await lensFrame.waitForTimeout(300);

const chatUI = await lensFrame.evaluate(() => ({
  chatPanelVisible: document.getElementById('chatPanel')?.style.display === 'flex',
  analyzePanelHidden: document.getElementById('analyzePanel')?.style.display === 'none',
  ctxCount: document.getElementById('ctxCount')?.textContent,
  hasChatInput: !!document.getElementById('chatInput'),
  hasSendBtn: !!document.getElementById('sendBtn'),
  hasWelcomeCard: !!document.getElementById('welcomeCard'),
  hasChips: document.querySelectorAll('.chip').length,
  chatModelOptions: document.querySelectorAll('#chatModelSel option').length,
  chatControlsVisible: document.getElementById('chatControls')?.style.display !== 'none',
}));
console.log('3. Chat tab:', JSON.stringify(chatUI));

// Check bootstrap + sandbox
const bootstrap = await lensFrame.evaluate(() => ({
  hasBootstrap: document.head?.innerHTML?.includes('wos-appsdk-bootstrap'),
  hasAppSDK: typeof window.AppSDK !== 'undefined',
}));
console.log('4. Bootstrap/AppSDK:', JSON.stringify(bootstrap));

const sandbox = await page.evaluate(() => {
  const collect = doc => { try { return [...doc.querySelectorAll('iframe'), ...[...doc.querySelectorAll('iframe')].flatMap(f=>{ try{return collect(f.contentDocument)}catch(_){return[]} })]; }catch(_){return[]} };
  for (const f of collect(document)) {
    if ((f.src||'').includes('ai-dom-lens')) return { hasSandbox: f.hasAttribute('sandbox') };
  }
  return null;
});
console.log('5. Sandboxed:', JSON.stringify(sandbox));

await browser.close();
console.log('\nAll checks done.');
