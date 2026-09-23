import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(`http://localhost:${PORT}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(10000);

  const cmdExists = await page.evaluate(() => !!window.platform.host.getCommand('ui.pkg-manager'));
  console.log('ui.pkg-manager command registered:', cmdExists);

  await page.evaluate(() => {
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.pkg-manager'))", window.platform);
  });

  // pkg-manager mounts React directly into the window's own generic content
  // iframe body (every window body is an iframe, not just sandboxed apps'
  // separate main.html files) — find the frame with the actual UI, same
  // pattern as any other app window (see CLAUDE.md's testing conventions).
  let f = null;
  for (let attempt = 0; attempt < 12 && !f; attempt++) {
    await page.waitForTimeout(1000);
    for (const fr of page.frames()) {
      try { if (await fr.locator('text=Discover').count() > 0) { f = fr; break; } } catch (_) {}
    }
  }
  console.log('Frame with pkg-manager UI found:', !!f);
  if (!f) {
    console.log('Page errors:', errors);
    await browser.close();
    return;
  }
  const frameErrors = [];
  f.on('pageerror', e => frameErrors.push(e.message));

  await f.click('text=Discover', { force: true });
  await page.waitForTimeout(3000); // registry fetch

  const cardsInfo = await f.evaluate(() => {
    const cards = [...document.querySelectorAll('.pkg-card')];
    return cards.slice(0, 60).map(c => ({
      name: c.querySelector('.pkg-card-name')?.textContent,
      buttons: [...c.querySelectorAll('button')].map(b => b.textContent.trim()),
    }));
  });
  const installedCard = cardsInfo.find(c => c.buttons.some(b => b.includes('Open')));
  console.log('Sample of Discover cards (first 8):', JSON.stringify(cardsInfo.slice(0, 8), null, 2));
  console.log('\nFound an installed-looking card with Open/Update/Uninstall buttons:', JSON.stringify(installedCard));

  const hasOpenAnywhere = cardsInfo.some(c => c.buttons.some(b => b.includes('Open')));
  const hasUpdateOrReinstallAnywhere = cardsInfo.some(c => c.buttons.some(b => b.includes('Update') || b.includes('Reinstall')));
  console.log('\nAny card shows "Open":', hasOpenAnywhere);
  console.log('Any card shows "Update"/"Reinstall":', hasUpdateOrReinstallAnywhere);

  if (installedCard) {
    console.log(`\n=== Clicking "Open" on "${installedCard.name}" from Discover tab ===`);
    const cardEl = f.locator('.pkg-card', { hasText: installedCard.name }).first();
    await cardEl.locator('button', { hasText: 'Open' }).click({ force: true });
    await page.waitForTimeout(2000);
    const windowCount = await page.evaluate(() => document.querySelectorAll('.window').length);
    console.log('Open window count after Open click (should be 2: App Manager + the opened app):', windowCount);

    console.log(`\n=== Clicking "Update"/"Reinstall" on "${installedCard.name}" from Discover tab ===`);
    const updateBtn = cardEl.locator('button', { hasText: /Update|Reinstall/ });
    await updateBtn.click({ force: true });
    await page.waitForTimeout(2000);
    const afterUpdateText = await cardEl.locator('button', { hasText: /Update|Reinstall|Removing|Updating|Reinstalling/ }).first().textContent().catch(() => null);
    console.log('Button text after update/reinstall click settles:', afterUpdateText);
  }

  console.log('\nFrame errors:', frameErrors.length ? frameErrors : 'none');
  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
