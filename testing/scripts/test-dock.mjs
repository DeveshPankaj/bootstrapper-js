import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

// Capture console errors
page.on('console', msg => {
  if (msg.type() === 'error') console.log('[CONSOLE ERR]', msg.text());
  if (msg.text().includes('dock') || msg.text().includes('ipc') || msg.text().includes('wos-'))
    console.log('[CONSOLE]', msg.type(), msg.text());
});

await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

// Check if vfs-dock-iframe exists
const dockIframe = await page.$('#vfs-dock-iframe');
console.log('dock iframe exists:', !!dockIframe);
if (dockIframe) {
  const style = await dockIframe.getAttribute('style');
  const sandbox = await dockIframe.getAttribute('sandbox');
  console.log('dock style:', style);
  console.log('dock sandbox:', sandbox);
  
  // Check iframe's srcdoc content length
  const srcdoc = await dockIframe.getAttribute('srcdoc');
  console.log('srcdoc length:', srcdoc?.length, 'chars');
  if (srcdoc) {
    const hasScript = srcdoc.includes('<script>');
    const hasClosingScript = srcdoc.includes('</script>');
    console.log('has <script>:', hasScript, ', has </script>:', hasClosingScript);
    // Check if rendered as text (body tag visible as text)
    const renderedAsText = srcdoc.includes('</body>') && !hasClosingScript;
    console.log('potential text-render issue:', renderedAsText);
  }
}

// Check body class
const bodyClass = await page.evaluate(() => document.body.className);
console.log('body class:', bodyClass);

// Check if old footer/taskbar is visible
const footer = await page.$('.footer');
const footerVisible = footer ? await footer.isVisible() : false;
console.log('footer element visible:', footerVisible);

// Check what's in the dock iframe
if (dockIframe) {
  const frame = await dockIframe.contentFrame();
  if (frame) {
    await new Promise(r => setTimeout(r, 2000));
    const bodyText = await frame.evaluate(() => document.body.innerText).catch(() => 'could not access');
    const bodyHTML = await frame.evaluate(() => document.body.innerHTML).catch(() => 'could not access');
    console.log('dock body text:', bodyText?.substring(0, 200));
    console.log('dock body HTML snippet:', bodyHTML?.substring(0, 300));
    const dockEl = await frame.$('#dock');
    console.log('dock #dock element:', !!dockEl);
    if (dockEl) {
      const dockHTML = await frame.evaluate(el => el.innerHTML, dockEl).catch(() => null);
      console.log('dock innerHTML:', dockHTML?.substring(0, 200) || '(empty)');
    }
  } else {
    console.log('cannot access dock iframe frame (cross-origin or sandboxed)');
  }
}

// Open a window so dock has something to show
await new Promise(r => setTimeout(r, 1000));
await page.evaluate(() => {
  try { window.platform?.host?.callCommand('ui.notepad', {}); } catch(e) { console.error('open window err:', e); }
});
await new Promise(r => setTimeout(r, 2000));

// Check dock again
if (dockIframe) {
  const frame = await dockIframe.contentFrame();
  if (frame) {
    const dockEl = await frame.$('#dock');
    if (dockEl) {
      const dockHTML = await frame.evaluate(el => el.innerHTML, dockEl).catch(() => null);
      console.log('dock innerHTML after window open:', dockHTML?.substring(0, 400) || '(empty)');
    }
  }
}

await new Promise(r => setTimeout(r, 3000));
await browser.close();
