import { chromium } from 'playwright';
import path from 'path';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 980, height: 100 } });

const filePath = path.resolve('testing/scripts/architecture-diagram.html');
await page.goto(`file://${filePath}`);
await page.waitForTimeout(300);

await page.screenshot({ path: 'testing/screenshots/architecture-diagram.png', fullPage: true });

await browser.close();
