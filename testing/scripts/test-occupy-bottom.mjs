import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
const SHOT = './testing/screenshots';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

await page.screenshot({ path: `${SHOT}/occupy-bottom-fresh.png` });

const state = await page.evaluate(() => {
  const body = document.body;
  const hasOccupy = body.classList.contains('vfs-dock-occupy');
  const contentArea = document.querySelector('.content-area') || document.querySelector('[class*="content"]');
  const bodyRect = body.getBoundingClientRect();
  const dockHeight = getComputedStyle(document.documentElement).getPropertyValue('--vfs-dock-height');
  return {
    hasVfsDockOccupy: hasOccupy,
    bodyClasses: [...body.classList],
    dockHeight: dockHeight.trim(),
    windowHeight: window.innerHeight,
    contentAreaRect: contentArea ? contentArea.getBoundingClientRect() : null,
  };
});

console.log('vfs-dock-occupy class present:', state.hasVfsDockOccupy);
console.log('body classes:', state.bodyClasses.join(', '));
console.log('--vfs-dock-height:', state.dockHeight);
console.log('window height:', state.windowHeight);
if (state.contentAreaRect) {
  const r = state.contentAreaRect;
  console.log(`content-area: top=${r.top.toFixed(0)} bottom=${r.bottom.toFixed(0)} height=${r.height.toFixed(0)}`);
  const usesFullHeight = r.bottom >= state.windowHeight - 5;
  console.log('content reaches bottom of viewport:', usesFullHeight);
}

await browser.close();
