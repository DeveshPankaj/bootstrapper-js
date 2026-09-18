import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.mouse.click(600, 400, { button: 'right' });
  await page.waitForTimeout(500);

  const html = await page.evaluate(() => {
    const el = document.querySelector('[id^="context-menu-"]');
    return el ? el.innerHTML.slice(0, 3000) : 'not found';
  });
  console.log(html);

  await browser.close();
})();
