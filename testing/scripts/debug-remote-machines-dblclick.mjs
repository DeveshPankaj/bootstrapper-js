// Debug: double-clicking a text file in Remote Machines → Files should open the editor.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
page.on('console', (m) => { if (/remote-machines|Error|error/i.test(m.text())) console.log('console', m.type(), m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)));
await page.goto('http://localhost:8080/'); await sleep(3000); await page.reload(); await sleep(3000); await page.reload(); await sleep(9000);
await page.evaluate(() => window.platform.host.execCommand("service('001-core.layout','open-window') (command('ui.remote-machines'))", window.platform));
let f; for (let i = 0; i < 40 && !f; i++) { for (const fr of page.frames()) { try { if (await fr.locator('#bridge').count()) f = fr; } catch (_) {} } await sleep(250); }
await f.evaluate(() => { localStorage.clear(); });
await f.locator('#bridge').click({ force: true }); await f.locator('.modal input[type=url]').fill('http://localhost:7091'); await f.locator('.modal button:has-text("Save")').click({ force: true }); await sleep(1200);
await f.locator('#add-btn').click({ force: true });
await f.locator('.modal input[placeholder^="user@host"]').fill('root@192.168.1.203');
await f.locator('.modal select').selectOption('key');
await f.locator('.modal textarea').fill(readFileSync(`${homedir()}/.ssh/id_ed25519`, 'utf8'));
await f.locator('.modal button:has-text("Add and connect")').click({ force: true });
for (let i = 0; i < 40; i++) { if (await f.locator('.modal button:has-text("Trust and connect")').count()) break; await sleep(250); }
await f.locator('.modal button:has-text("Trust and connect")').click({ force: true });
for (let i = 0; i < 80; i++) { if (await f.locator('table.grid tbody tr').count()) break; await sleep(250); }
await f.evaluate(() => window.__remoteMachines.loadDir(window.__remoteMachines.conns[0], '/etc'));
await sleep(1500);
const probe = await f.evaluate(async () => {
  const rows = [...document.querySelectorAll('table.grid tbody tr')];
  const row = rows.find((r) => r.querySelector('td.nm span:not(.ic)')?.textContent === 'hostname');
  if (!row) return { found: false, names: rows.slice(0, 5).map((r) => r.innerText) };
  const errs = [];
  const onErr = (e) => errs.push(String(e.error || e.message));
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', (e) => errs.push('rejection: ' + String(e.reason)));
  row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 2500));
  const afterDbl = document.querySelectorAll('.modal textarea.editor').length;
  const btn = row.querySelector('button[title="Open (text files)"]');
  btn?.click();
  await new Promise((r) => setTimeout(r, 2500));
  return { found: true, afterDbl, hasOpenBtn: !!btn, afterBtn: document.querySelectorAll('.modal textarea.editor').length, toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent), modals: [...document.querySelectorAll('.modal-head')].map((m) => m.textContent), errs };
});
console.log('probe', JSON.stringify(probe));
await b.close();
