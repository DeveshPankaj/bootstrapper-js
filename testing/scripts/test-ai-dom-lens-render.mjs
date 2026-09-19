// Test: AI DOM Lens — verify /home/user1/index.html renders in content area
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:8080';
const SS = 'testing/screenshots';
fs.mkdirSync(SS, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

// Boot
await page.goto(BASE, { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(4000);

// Open AI DOM Lens — retry until platform.host is ready
for (let attempt = 0; attempt < 5; attempt++) {
  try {
    await page.evaluate(() => window.platform.host.callCommand('ui.ai-dom-lens'));
    break;
  } catch(e) {
    console.log(`  attempt ${attempt+1} failed: ${e.message} — retrying…`);
    await page.waitForTimeout(2000);
  }
}
await page.waitForTimeout(4000);

// Find the lens frame — retry several times
let lensFrame = null;
for (let i = 0; i < 10; i++) {
  lensFrame = page.frames().find(f => f.url().includes('ai-dom-lens'));
  if (lensFrame) break;
  await page.waitForTimeout(1000);
}
if (!lensFrame) { console.error('Frame not found'); await browser.close(); process.exit(1); }

// Switch to VFS mode and type path directly, then load
await lensFrame.evaluate(() => {
  document.getElementById('srcVfsBtn').click();
});
await lensFrame.waitForTimeout(300);

// Close the modal that auto-opened, type path manually
await lensFrame.evaluate(() => {
  document.getElementById('vfsModalCancel').click();
  document.getElementById('srcPathInput').value = '/home/user1/index.html';
});
await lensFrame.waitForTimeout(200);

// Click Load
await lensFrame.evaluate(() => document.getElementById('srcLoadBtn').click());
await lensFrame.waitForTimeout(3000);

// ── Check 1: layout + visibility ──────────────────────────────────────────────
const layout = await lensFrame.evaluate(() => {
  const frame = document.getElementById('pageFrame');
  const demo  = document.getElementById('demoContent');
  const rect  = frame?.getBoundingClientRect();
  return {
    frameDisplay:   frame?.style.display,
    demoDisplay:    demo?.style.display,
    frameW:         Math.round(rect?.width  ?? 0),
    frameH:         Math.round(rect?.height ?? 0),
    frameVisible:   rect?.width > 10 && rect?.height > 10,
    status:         document.getElementById('stTxt')?.textContent,
    srcLabel:       document.getElementById('srcLabel')?.textContent,
  };
});
console.log('Layout / visibility:', JSON.stringify(layout, null, 2));

// ── Check 2: iframe contentDocument ──────────────────────────────────────────
const iframeDoc = await lensFrame.evaluate(() => {
  const frame = document.getElementById('pageFrame');
  const doc   = frame?.contentDocument || frame?.contentWindow?.document;
  if (!doc || !doc.body) return { error: 'no contentDocument' };
  const allText = (doc.body.innerText || '').replace(/\s+/g, ' ').trim();
  return {
    title:      doc.title,
    bodyLen:    allText.length,
    bodySnip:   allText.slice(0, 200),
    nodeCount:  doc.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,a,button,td').length,
    hasStyle:   !!doc.getElementById('ai-lens-styles'),
    bgColor:    doc.body?.style?.backgroundColor || getComputedStyle(doc.body).backgroundColor,
  };
});
console.log('iframe document:', JSON.stringify(iframeDoc, null, 2));

// ── Screenshot 1: whole window ────────────────────────────────────────────────
await page.screenshot({ path: `${SS}/render-full.png` });
console.log('Screenshot 1 (full):', `${SS}/render-full.png`);

// ── Screenshot 2: clip to the iframe's bounding rect ─────────────────────────
const frameRect = await lensFrame.evaluate(() => {
  const r = document.getElementById('pageFrame')?.getBoundingClientRect();
  // iframe is inside lensFrame which is inside the app iframe
  // getBoundingClientRect is relative to the lensFrame viewport
  return { x: r?.x ?? 0, y: r?.y ?? 0, w: r?.width ?? 0, h: r?.height ?? 0 };
});

// The lensFrame itself sits inside a window chrome on the main page.
// Get the lensFrame's position on the top-level page.
const appIframeRect = await page.evaluate(() => {
  for (const f of document.querySelectorAll('iframe')) {
    if ((f.src || '').includes('ai-dom-lens')) {
      const r = f.getBoundingClientRect();
      return { x: r.x, y: r.y };
    }
  }
  return { x: 0, y: 0 };
});

const clip = {
  x: Math.max(0, appIframeRect.x + frameRect.x),
  y: Math.max(0, appIframeRect.y + frameRect.y),
  width:  Math.max(10, frameRect.w),
  height: Math.max(10, frameRect.h),
};
console.log('Clip rect for iframe content area:', clip);

if (clip.width > 10 && clip.height > 10) {
  await page.screenshot({ path: `${SS}/render-content-area.png`, clip });
  console.log('Screenshot 2 (content area):', `${SS}/render-content-area.png`);
}

// ── Check 3: pixel-level non-blank ───────────────────────────────────────────
// Take a screenshot of just the inner page via the nested frame reference
const innerFrame = lensFrame.childFrames().find(f => f.url() === 'about:blank' || f.url() === '')
  ?? lensFrame.childFrames()[0];

if (innerFrame) {
  console.log('Inner frame URL:', innerFrame.url());
  try {
    await innerFrame.screenshot({ path: `${SS}/render-inner-frame.png` });
    console.log('Screenshot 3 (inner frame direct):', `${SS}/render-inner-frame.png`);
  } catch(e) {
    console.log('Inner frame screenshot error:', e.message);
  }
}

// ── Check 4: inject a visible marker and verify it renders ────────────────────
const markerCheck = await lensFrame.evaluate(() => {
  const frame = document.getElementById('pageFrame');
  const doc   = frame?.contentDocument;
  if (!doc) return { error: 'no doc' };
  // Add a bright test div
  const div = doc.createElement('div');
  div.id = 'playwright-marker';
  div.style.cssText = 'position:fixed;top:0;left:0;width:200px;height:40px;background:#ff0000;color:#fff;font-size:16px;z-index:99999;display:flex;align-items:center;justify-content:center';
  div.textContent = 'RENDER OK';
  doc.body.prepend(div);
  return { injected: true, title: doc.title };
});
console.log('Marker injection:', JSON.stringify(markerCheck));
await page.waitForTimeout(300);

await page.screenshot({ path: `${SS}/render-marker.png`, clip });
console.log('Screenshot 4 (with red marker):', `${SS}/render-marker.png`);

await browser.close();
console.log('\nAll checks done.');
