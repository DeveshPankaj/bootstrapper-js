import { chromium } from 'playwright';
const PORT = process.env.PORT || 8090;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') console.log('PAGE-CONSOLE:', msg.type(), msg.text()); });
  await page.goto(`http://localhost:${PORT}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);

  console.log('=== Load the app main.js directly (as App Drawer/Spotlight would after install) and open its window ===');
  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/todo-python/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.py-todo'))", window.platform);
  });

  let f = null;
  for (let attempt = 0; attempt < 6 && !f; attempt++) {
    await page.waitForTimeout(1000);
    for (const fr of page.frames()) { if (fr.url().includes('todo-python/todo.html')) { f = fr; break; } }
  }
  if (!f) { console.log('Frame not found. Frames:', page.frames().map(fr => fr.url())); await browser.close(); return; }

  console.log('=== Wait for Pyodide to boot and the todo UI to render ===');
  await f.waitForSelector('.todo-app', { timeout: 20000 }).catch(() => {});
  const initialState = await f.evaluate(() => {
    const app = document.querySelector('.todo-app');
    const empty = document.querySelector('.todo-empty');
    return { hasApp: !!app, hasEmptyMsg: !!empty, emptyText: empty ? empty.textContent : null };
  });
  console.log(JSON.stringify(initialState));

  console.log('=== Add two todos via the input + Add button ===');
  await f.fill('.todo-input', 'Write a blog post');
  await f.click('.todo-add-btn', { force: true });
  await f.fill('.todo-input', 'Water the plants');
  await f.click('.todo-add-btn', { force: true });
  await page.waitForTimeout(300);
  const afterAdd = await f.evaluate(() => ({
    items: [...document.querySelectorAll('.todo-text')].map(t => t.textContent),
    countLabel: document.querySelector('.todo-footer span').textContent,
  }));
  console.log(JSON.stringify(afterAdd));

  console.log('=== Add a third via Enter key ===');
  await f.fill('.todo-input', 'Read a book');
  await f.press('.todo-input', 'Enter');
  await page.waitForTimeout(300);
  const afterEnter = await f.evaluate(() => [...document.querySelectorAll('.todo-text')].map(t => t.textContent));
  console.log(JSON.stringify(afterEnter));

  console.log('=== Toggle the first item done, confirm strikethrough + count update ===');
  await f.click('.todo-item:first-child .todo-check', { force: true });
  await page.waitForTimeout(200);
  const afterToggle = await f.evaluate(() => ({
    firstDone: document.querySelector('.todo-item').classList.contains('done'),
    countLabel: document.querySelector('.todo-footer span').textContent,
    clearBtnVisible: getComputedStyle(document.querySelector('.todo-clear')).display !== 'none',
  }));
  console.log(JSON.stringify(afterToggle));

  console.log('=== Clear completed ===');
  await f.click('.todo-clear', { force: true });
  await page.waitForTimeout(200);
  const afterClear = await f.evaluate(() => [...document.querySelectorAll('.todo-text')].map(t => t.textContent));
  console.log('Remaining after clear completed:', JSON.stringify(afterClear));

  console.log('=== Delete one item via the x button ===');
  await f.click('.todo-item:first-child .todo-del', { force: true });
  await page.waitForTimeout(200);
  const afterDelete = await f.evaluate(() => [...document.querySelectorAll('.todo-text')].map(t => t.textContent));
  console.log('Remaining after delete:', JSON.stringify(afterDelete));

  console.log('=== Persistence: real vfs file has the saved items ===');
  const vfsRaw = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    try { return fs.readFileSync('/home/user1/.local/share/todo-python/todos.json', 'utf8'); }
    catch (e) { return 'ERROR: ' + e.message; }
  });
  console.log('vfs file contents:', vfsRaw);

  console.log('=== Reload the window fresh — items should persist from localStorage ===');
  await f.evaluate(() => location.reload());
  await page.waitForTimeout(4000);
  let f2 = null;
  for (const fr of page.frames()) { if (fr.url().includes('todo-python/todo.html')) { f2 = fr; break; } }
  const persisted = f2 ? await f2.evaluate(() => [...document.querySelectorAll('.todo-text')].map(t => t.textContent)) : 'frame not found after reload';
  console.log('Persisted after reload:', JSON.stringify(persisted));

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
