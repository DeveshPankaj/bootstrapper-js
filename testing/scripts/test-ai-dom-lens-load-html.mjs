// Test: AI DOM Lens — load /home/user1/index.html via VFS
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:8080';
const SCREENSHOT_DIR = 'testing/screenshots';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

console.log('1. Loading app…');
await page.goto(BASE, { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(4000);

console.log('2. Opening AI DOM Lens…');
await page.evaluate(() => window.platform.host.callCommand('ui.ai-dom-lens'));
await page.waitForTimeout(3000);

const lensFrame = page.frames().find(f => f.url().includes('ai-dom-lens'));
console.log('   Frame found:', !!lensFrame, lensFrame?.url());
if (!lensFrame) { await browser.close(); process.exit(1); }

// Check SDK is available
const sdkCheck = await lensFrame.evaluate(() => ({
  hasAppSDK: typeof window.AppSDK !== 'undefined',
  sdkType: typeof window.AppSDK,
  hasReadText: typeof window.AppSDK?.readText === 'function',
}));
console.log('3. SDK check:', JSON.stringify(sdkCheck));

// Step 1: Check if /home/user1/index.html exists in VFS via SDK
const fileCheck = await lensFrame.evaluate(async () => {
  try {
    const sdk = window.AppSDK;
    if (!sdk) return { error: 'no SDK' };
    // First list /home/user1 to see what's there
    const files = await sdk.list('/home/user1');
    return { files, hasIndex: files.includes('index.html') };
  } catch(e) {
    return { error: e.message };
  }
});
console.log('4. /home/user1 listing:', JSON.stringify(fileCheck));

// Create a simple test HTML file if it doesn't exist
if (!fileCheck.hasIndex) {
  console.log('5. Creating /home/user1/index.html for test…');
  const created = await lensFrame.evaluate(async () => {
    try {
      const sdk = window.AppSDK;
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Test Page</title></head><body>
<h1>Test Page</h1>
<p>This is a test HTML page for AI DOM Lens loading test.</p>
<ul>
  <li>First item — about browsers</li>
  <li>Second item — about JavaScript</li>
  <li>Third item — about machine learning</li>
</ul>
<div class="product">MacBook Pro — powerful laptop for developers</div>
<div class="product">iPhone 15 — best camera smartphone</div>
</body></html>`;
      await sdk.writeText('/home/user1/index.html', html);
      return { ok: true };
    } catch(e) {
      return { error: e.message };
    }
  });
  console.log('   Create result:', JSON.stringify(created));
} else {
  console.log('5. /home/user1/index.html already exists');
}

// Step 2: Click "Load HTML…" source button to switch to VFS mode + open modal
console.log('6. Switching to VFS source mode…');
await lensFrame.evaluate(() => document.getElementById('srcVfsBtn').click());
await lensFrame.waitForTimeout(500);

// Check modal opened
const modalState = await lensFrame.evaluate(() => ({
  modalOpen: document.getElementById('vfsModal')?.classList.contains('open'),
  breadcrumb: document.getElementById('vfsBreadcrumb')?.textContent?.trim(),
  navListText: document.getElementById('vfsNavList')?.textContent?.trim().slice(0,100),
}));
console.log('7. VFS modal state:', JSON.stringify(modalState));

await page.screenshot({ path: `${SCREENSHOT_DIR}/ai-dom-lens-vfs-modal.png`, fullPage: false });
console.log('   Screenshot: testing/screenshots/ai-dom-lens-vfs-modal.png');

// Wait for listing to load
await lensFrame.waitForTimeout(1500);

const navList = await lensFrame.evaluate(() => ({
  items: [...document.querySelectorAll('#vfsNavList .vfs-item')].map(el => el.querySelector('.vfs-item-name')?.textContent),
  status: document.getElementById('vfsModalStatus')?.textContent,
}));
console.log('8. Nav list items:', JSON.stringify(navList));

// Step 3: Click index.html if visible, else navigate
const indexVisible = await lensFrame.evaluate(() => {
  const items = [...document.querySelectorAll('#vfsNavList .vfs-item')];
  const idx = items.find(el => el.querySelector('.vfs-item-name')?.textContent === 'index.html');
  if (idx) { idx.click(); return true; }
  return false;
});
console.log('9. index.html item clicked:', indexVisible);
await lensFrame.waitForTimeout(300);

const selectedState = await lensFrame.evaluate(() => ({
  openBtnDisabled: document.getElementById('vfsModalOpen')?.disabled,
  status: document.getElementById('vfsModalStatus')?.textContent,
}));
console.log('10. After select:', JSON.stringify(selectedState));

// Step 4: Click Open
console.log('11. Clicking Open button…');
await lensFrame.evaluate(() => document.getElementById('vfsModalOpen').click());
await lensFrame.waitForTimeout(3000);

// Check status + iframe loaded
const loadResult = await lensFrame.evaluate(() => ({
  modalClosed: !document.getElementById('vfsModal')?.classList.contains('open'),
  srcLabel: document.getElementById('srcLabel')?.textContent,
  statusTxt: document.getElementById('stTxt')?.textContent,
  pathInput: document.getElementById('srcPathInput')?.value,
  frameVisible: document.getElementById('pageFrame')?.style.display !== 'none',
  demoHidden: document.getElementById('demoContent')?.style.display === 'none',
}));
console.log('12. After Open:', JSON.stringify(loadResult));

// Check iframe contentDocument is accessible and has nodes
await lensFrame.waitForTimeout(1000);
const iframeNodes = await lensFrame.evaluate(() => {
  try {
    const frame = document.getElementById('pageFrame');
    const doc = frame?.contentDocument || frame?.contentWindow?.document;
    if (!doc) return { error: 'no contentDocument' };
    return {
      title: doc.title,
      bodyText: doc.body?.innerText?.slice(0,200),
      nodeCount: doc.querySelectorAll('h1,h2,h3,p,li,td').length,
      hasHlStyle: !!doc.getElementById('ai-lens-styles'),
    };
  } catch(e) { return { error: e.message }; }
});
console.log('13. Iframe content:', JSON.stringify(iframeNodes));

await page.screenshot({ path: `${SCREENSHOT_DIR}/ai-dom-lens-html-loaded.png`, fullPage: false });
console.log('    Screenshot: testing/screenshots/ai-dom-lens-html-loaded.png');

// Step 5: Run an analysis query on the loaded page
if (iframeNodes.nodeCount > 0) {
  console.log('14. Running semantic query "laptop" on loaded page…');
  await lensFrame.evaluate(() => {
    document.getElementById('qInput').value = 'laptop';
  });
  await lensFrame.evaluate(() => document.getElementById('analyzeBtn').click());

  // Wait for embedder to load (can take a while first time)
  let waited = 0;
  while (waited < 60000) {
    const status = await lensFrame.evaluate(() => document.getElementById('stTxt')?.textContent || '');
    if (status.includes('match') || status.includes('Error') || status.includes('Ready')) break;
    await lensFrame.waitForTimeout(2000);
    waited += 2000;
    if (waited % 10000 === 0) console.log('    Still loading model…', status);
  }

  const analyzeResult = await lensFrame.evaluate(() => ({
    status: document.getElementById('stTxt')?.textContent,
    matchCount: document.getElementById('matchCount')?.textContent,
    resultItems: document.querySelectorAll('.res-item').length,
    topRank: document.querySelector('.res-rank')?.textContent,
    topSnip: document.querySelector('.res-snip')?.textContent?.slice(0, 80),
  }));
  console.log('15. Analyze result:', JSON.stringify(analyzeResult));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/ai-dom-lens-query-result.png`, fullPage: false });
  console.log('    Screenshot: testing/screenshots/ai-dom-lens-query-result.png');
}

await browser.close();
console.log('\nDone.');
