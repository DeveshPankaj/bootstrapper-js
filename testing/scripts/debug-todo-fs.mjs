import { chromium } from 'playwright';
const PORT = process.env.PORT || 8090;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);

  const result = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    const DATA_DIR = '/home/user1/.local/share/todo-python';
    const DATA_FILE = DATA_DIR + '/todos.json';
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, '[{"text":"hi","done":false}]');
      return { ok: true, readBack: fs.readFileSync(DATA_FILE, 'utf8') };
    } catch (e) {
      return { ok: false, message: e.message, code: e.code, stack: e.stack };
    }
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
