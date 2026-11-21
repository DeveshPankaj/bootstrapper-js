// Diagnostic for verify-viewers-names.mjs (cpp-ide section): opens cpp-ide and dumps frame URLs,
// console errors and the sidebar state. Not a pass/fail test.
import { launch, bootOS, sleep, openApp, installApp } from './verify-viewers-lib.mjs';
const browser = await launch();
const context = await browser.newContext();
const page = await bootOS(context);
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 200)); });
page.on('pageerror', (e) => logs.push('pageerror: ' + String(e).slice(0, 200)));
await installApp(page, 'cpp-ide');
await openApp(page, 'ui.cpp-ide');
await sleep(8000);
for (const f of page.frames()) {
  if (!f.url().includes('cpp-ide/main.html')) continue;
  await f.evaluate(() => { loadExample(0); runCode(); });
  await sleep(8000);
  console.log('JSCPP:', await f.evaluate(() => typeof JSCPP), 'console:', JSON.stringify(await f.evaluate(() => document.getElementById('console-pane').textContent.slice(0, 400))));
}
for (const f of page.frames()) {
  const info = await f.evaluate(() => ({ sb: document.getElementById('sb-content')?.innerHTML?.slice(0, 300), items: document.querySelectorAll('.sb-item').length })).catch((e) => 'ERR ' + e.message.slice(0, 80));
  console.log(f.url().slice(0, 90), JSON.stringify(info));
}
console.log(logs.join('\n'));
await browser.close();
