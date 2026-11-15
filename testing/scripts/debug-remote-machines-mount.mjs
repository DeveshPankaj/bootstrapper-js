// Debug: the /mnt/ssh mirror with the default explorer, page errors with stacks, and the Containers tab.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e.stack || e).split('\n').slice(0, 6).join(' | ')));
await page.goto('http://localhost:8080/'); await sleep(3000); await page.reload(); await sleep(3000); await page.reload(); await sleep(9000);
await page.evaluate(() => window.platform.host.execCommand("service('001-core.layout','open-window') (command('ui.remote-machines'))", window.platform));
let f; for (let i = 0; i < 40 && !f; i++) { for (const fr of page.frames()) { try { if (await fr.locator('#bridge').count()) f = fr; } catch (_) {} } await sleep(250); }
await f.locator('#bridge').click({ force: true }); await f.locator('.modal input[type=url]').fill('http://localhost:7091'); await f.locator('.modal button:has-text("Save")').click({ force: true }); await sleep(1200);
await f.locator('#add-btn').click({ force: true });
await f.locator('.modal input[placeholder^="user@host"]').fill('root@192.168.1.203');
await f.locator('.modal input[placeholder^="Empty: the host"]').fill('test-machine');
await f.locator('.modal select').selectOption('key');
await f.locator('.modal textarea').fill(readFileSync(`${homedir()}/.ssh/id_ed25519`, 'utf8'));
await f.locator('.modal button:has-text("Add and connect")').click({ force: true });
for (let i = 0; i < 40; i++) { if (await f.locator('.modal button:has-text("Trust and connect")').count()) break; await sleep(250); }
await f.locator('.modal button:has-text("Trust and connect")').click({ force: true });
for (let i = 0; i < 60; i++) { if (await page.evaluate(() => { try { return window.platform.host.getFS().readdirSync('/mnt/ssh/test-machine').length > 3; } catch (_) { return false; } })) break; await sleep(300); }
const state = () => f.evaluate(() => { const st = window.__remoteMachines.stateOf(window.__remoteMachines.conns[0]); const m = st.mount; return { fg: st.session.fg, listing: m ? [...m.listing.keys()] : null, fetching: m ? m.fetching.size : null, pending: m?.pending, meta: m?.meta.size, cts: { cli: st.cts.cli, loading: st.cts.loading, error: st.cts.error, n: st.cts.list?.length } }; });
console.log('after mount', JSON.stringify(await state()));
// Explorer straight at a folder that isn't listed yet.
const deep = '/mnt/ssh/test-machine/usr/share/doc';
await page.evaluate((p) => window.platform.host.execCommand("service('001-core.layout','open-window')(command('explorer'), $args[0])", window.platform, p), deep);
for (let i = 0; i < 8; i++) {
  await sleep(1000);
  const shown = [];
  for (const fr of page.frames()) { try { const n = await fr.locator('.file-item').count(); if (n) shown.push({ n, crumbs: (await fr.locator('.file-explorer-breadcrumb, [class*=breadcrumb]').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 80) }); } catch (_) {} }
  console.log(`t+${i + 1}s explorer windows`, JSON.stringify(shown), '| vfs doc entries', await page.evaluate((p) => { try { return window.platform.host.getFS().readdirSync(p).length; } catch (e) { return 'ERR ' + e.code + ' ' + e.message; } }, deep));
}
console.log('state', JSON.stringify(await state()));
// Containers
await f.locator('.tabs button', { hasText: 'Containers' }).click({ force: true });
for (let i = 0; i < 12; i++) { await sleep(2500); const s = await state(); console.log(`containers t+${(i + 1) * 2.5}s`, JSON.stringify(s.cts), 'fg', s.fg, 'listing', s.listing?.length, 'fetching', s.fetching); if (s.cts.n !== undefined && !s.cts.loading) break; }
await b.close();
