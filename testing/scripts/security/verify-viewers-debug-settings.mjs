// Diagnostic for verify-viewers-settings.mjs: dumps the Settings nav and the Managers page. Not a test.
import { launch, bootReady, sleep, openApp, findFrame } from './verify-viewers-lib.mjs';
const browser = await launch();
const page = await bootReady(await browser.newContext());
await openApp(page, 'ui.settings');
const f = await findFrame(page, { selector: '.settings-nav-item', text: 'Projects', timeout: 30000 });
console.log('nav:', JSON.stringify(await f.evaluate(() => [...document.querySelectorAll('.settings-nav-item')].map((e) => e.textContent))));
await f.locator('.settings-nav-item', { hasText: 'Managers' }).first().click({ force: true });
await sleep(1500);
console.log('content:', (await f.evaluate(() => document.querySelector('.settings-content')?.innerText || '')).slice(-900));
console.log('titles:', JSON.stringify(await f.evaluate(() => [...document.querySelectorAll('[title]')].map((e) => e.getAttribute('title')).slice(-20))));
await browser.close();
