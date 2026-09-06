import { chromium } from 'playwright';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 30 });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Test with canvas WM
  await page.evaluate(() => {
    const fs = window.platform?.host?.getFS?.();
    if (fs) fs.writeFileSync('/etc/managers.json', JSON.stringify({ windowManager: 'canvas', dock: 'default' }));
  });
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Dump full DOM structure in content-area
  const domInfo = await page.evaluate(() => {
    const ca = document.querySelector('.content-area');
    if (!ca) return 'no .content-area';

    const summarize = (el, depth = 0) => {
      if (depth > 4) return '...';
      const indent = '  '.repeat(depth);
      const cls = el.className ? `.${Array.from(el.classList).join('.')}` : '';
      const id = el.id ? `#${el.id}` : '';
      const bb = el.getBoundingClientRect();
      const style = el.style.cssText ? ` [style: ${el.style.cssText.slice(0,50)}]` : '';
      const computed = {
        pointerEvents: getComputedStyle(el).pointerEvents,
        position: getComputedStyle(el).position,
        zIndex: getComputedStyle(el).zIndex,
        display: getComputedStyle(el).display,
      };
      let result = `${indent}${el.tagName}${id}${cls} bb=(${Math.round(bb.x)},${Math.round(bb.y)},${Math.round(bb.width)}x${Math.round(bb.height)})${style} computed=${JSON.stringify(computed)}\n`;
      for (const child of el.children) {
        result += summarize(child, depth + 1);
      }
      return result;
    };

    return summarize(ca);
  });
  console.log('\n=== content-area DOM ===');
  console.log(domInfo);

  // Check what's at the desktop icon location
  const pointInfo = await page.evaluate(() => {
    // Try to find any desktop-related elements
    const desktopContainer = document.querySelector('.desktop');
    const desktopFiles = document.querySelector('.desktop-files');
    const desktopIcons = document.querySelector('.desktop-icons');
    const allItems = document.querySelectorAll('[class*="desktop"]');

    return {
      hasDesktopClass: !!desktopContainer,
      desktopBB: desktopContainer?.getBoundingClientRect(),
      hasDesktopFiles: !!desktopFiles,
      desktopFilesBB: desktopFiles?.getBoundingClientRect(),
      hasDesktopIcons: !!desktopIcons,
      allDesktopClasses: Array.from(allItems).map(el => el.className + ' bb=' + JSON.stringify(el.getBoundingClientRect())).slice(0, 10),
      topLeft: (() => {
        const el = document.elementFromPoint(100, 100);
        return el ? { tag: el.tagName, class: el.className, id: el.id } : null;
      })(),
    };
  });
  console.log('\n=== Desktop element info ===');
  console.log(JSON.stringify(pointInfo, null, 2));

  console.log('\n=== DONE ===');
  await sleep(5000);
  await browser.close();
})();
