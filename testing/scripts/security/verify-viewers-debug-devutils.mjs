// Diagnostic for verify-viewers-cdn.mjs (dev-utils Join PDFs). Not a pass/fail test.
import { launch, bootReady, sleep, openApp, installApp, findFrame } from './verify-viewers-lib.mjs';
const browser = await launch();
const page = await bootReady(await browser.newContext({ acceptDownloads: true }));
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 200)); });
await installApp(page, 'dev-utils');
await openApp(page, 'ui.dev-utils');
const du = await findFrame(page, { selector: '.du-nav', timeout: 30000 });
await du.locator('.du-nav', { hasText: 'Join PDFs' }).first().evaluate((el) => el.click());
await sleep(800);
console.log('tab text:', (await du.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\n/g, ' | '));
// minimal valid single-page PDF
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
console.log('inputs:', await du.locator('.du-dropzone input[type=file]').count());
await du.setInputFiles('.du-dropzone input[type=file]', [{ name: 'a.pdf', mimeType: 'application/pdf', buffer: pdf }, { name: 'b.pdf', mimeType: 'application/pdf', buffer: pdf }]);
await sleep(800);
console.log('buttons:', JSON.stringify(await du.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent))));
await du.locator('button', { hasText: 'Merge PDFs' }).first().evaluate((el) => el.click()).catch((e) => console.log('click err', e.message));
await sleep(6000);
console.log('after:', (await du.evaluate(() => document.body.innerText)).slice(0, 500).replace(/\n/g, ' | '));
console.log('PDFLib top:', await page.evaluate(() => typeof window.PDFLib), 'frame:', await du.evaluate(() => typeof window.PDFLib));
console.log(logs.join('\n'));
await browser.close();
