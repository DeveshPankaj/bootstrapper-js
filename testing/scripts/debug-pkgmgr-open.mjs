import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => console.log('PAGE:', m.type(), m.text()));
  page.on('pageerror', e => console.log('PAGEERROR:', e.message, e.stack ? e.stack.slice(0,300) : ''));
  await page.goto(`http://localhost:${PORT}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(10000);
  await page.evaluate(() => {
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.pkg-manager'))", window.platform);
  });
  await page.waitForTimeout(6000);
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  console.log('Body text snippet:', bodyText);
  const winHtml = await page.evaluate(() => {
    const win = document.querySelector('.window.top');
    return win ? win.innerHTML.length : -1;
  });
  console.log('Window .top innerHTML length:', winHtml);
  const pkgEls = await page.evaluate(() => document.querySelectorAll('[class*="pkg-"]').length);
  console.log('Elements with pkg- class:', pkgEls);
  const winInner = await page.evaluate(() => {
    const win = document.querySelector('.window.top');
    return win ? win.innerHTML : null;
  });
  console.log('Window .top innerHTML:', winInner);
  await browser.close();
})();
