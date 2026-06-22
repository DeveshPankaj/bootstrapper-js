import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

const errors = []
page.on('pageerror', err => errors.push(err.message))
page.on('console', msg => {
  if (msg.type() === 'error' && !msg.text().includes('404')) errors.push(msg.text())
  if (msg.type() === 'warning') errors.push('[warn] ' + msg.text())
})

console.log('Loading app...')
await page.goto('http://localhost:8080/', { waitUntil: 'load' })
await page.reload({ waitUntil: 'load' })
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(8000)

// Install SQLite Browser via App Manager first
console.log('Opening App Manager...')
const pkgBtn = page.locator('[aria-label="open-pkg-manager"]')
await pkgBtn.click({ force: true })
await page.waitForTimeout(3000)

// Find pkg-manager frame
const findFrame = async (selector) => {
  for (const frame of page.frames()) {
    try { if (await frame.locator(selector).count() > 0) return frame } catch (_) {}
  }
  return null
}

let pkgFrame = await findFrame('.pkg-root')
if (!pkgFrame) {
  console.log('ERROR: App Manager frame not found')
  await page.screenshot({ path: 'testing/screenshots/sqlite-error.png' })
  await browser.close()
  process.exit(1)
}

// Search for SQLite in discover
const searchInput = pkgFrame.locator('input[placeholder*="Search"]')
await searchInput.fill('SQLite')
await page.waitForTimeout(500)
await page.screenshot({ path: 'testing/screenshots/sqlite-01-search.png' })

// Click Install
const installBtn = pkgFrame.locator('button', { hasText: 'Install' }).first()
const installCount = await installBtn.count()
console.log(`Install button found: ${installCount > 0}`)
if (installCount > 0) {
  await installBtn.click({ force: true })
  console.log('Installing SQLite Browser...')
  await page.waitForTimeout(5000)
  await page.screenshot({ path: 'testing/screenshots/sqlite-02-installed.png' })
}

// Close the App Manager window (click X)
const closeBtn = page.locator('.window-header .close-btn, .window-header button').first()
try { await closeBtn.click({ force: true }) } catch (_) {}
await page.waitForTimeout(500)

// Now open SQLite Browser from the app drawer
console.log('Opening SQLite from drawer...')
const drawerBtn = page.locator('[aria-label="open-app-drawer"]')
await drawerBtn.click({ force: true })
await page.waitForTimeout(1000)

const drawerSearch = page.locator('#__app-drawer-root__ input').first()
await drawerSearch.fill('SQLite')
await page.waitForTimeout(500)

const sqliteCard = page.locator('#__app-drawer-root__ .ad-card', { hasText: 'SQLite' })
const cardCount = await sqliteCard.count()
console.log(`SQLite in drawer: ${cardCount > 0}`)

if (cardCount > 0) {
  await sqliteCard.first().click({ force: true })
} else {
  // Fallback: try direct command
  console.log('Trying direct command...')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    try { window.platform?.host?.callCommand('ui.sqlite') } catch (_) {}
  })
}
await page.waitForTimeout(4000)

await page.screenshot({ path: 'testing/screenshots/sqlite-03-opened.png' })

// Find SQLite frame
let sqFrame = await findFrame('.sq-root')
if (!sqFrame) {
  console.log('ERROR: SQLite frame not found after launch')
  for (const f of page.frames()) {
    try {
      const html = await f.evaluate(() => document.body?.innerHTML?.slice(0, 80) || '')
      if (html) console.log(`  frame: ${html}`)
    } catch (_) {}
  }
  await browser.close()
  process.exit(1)
}
console.log('SQLite Browser frame found!')

// Wait for sql.js engine to load
for (let i = 0; i < 20; i++) {
  sqFrame = await findFrame('.sq-root')
  const loadingCount = await sqFrame.locator('.sq-loading').count()
  const errCount = await sqFrame.locator('.sq-error').count()
  if (loadingCount === 0) { console.log(`sql.js loaded after ${i+1}s`); break }
  if (errCount > 0) {
    const errText = await sqFrame.locator('.sq-error').textContent()
    console.log(`Load error: ${errText}`)
    break
  }
  await page.waitForTimeout(1000)
}

await page.screenshot({ path: 'testing/screenshots/sqlite-04-ready.png' })

// Check New button state
sqFrame = await findFrame('.sq-root')
const newBtn = sqFrame.locator('.sq-btn', { hasText: 'Create New' }).first()
const btnCount = await newBtn.count()
console.log(`Create New button found: ${btnCount > 0}`)

if (btnCount > 0) {
  // Click Create New
  console.log('Clicking Create New...')
  await newBtn.click({ force: true })
  await page.waitForTimeout(1000)
  sqFrame = await findFrame('.sq-root')
  await page.screenshot({ path: 'testing/screenshots/sqlite-05-new-db.png' })

  // Run CREATE TABLE
  const textarea = sqFrame.locator('.sq-editor textarea')
  if (await textarea.count() > 0) {
    await textarea.fill("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT);")
    const runBtn = sqFrame.locator('.sq-btn', { hasText: 'Run' })
    await runBtn.click({ force: true })
    await page.waitForTimeout(500)
    sqFrame = await findFrame('.sq-root')

    // Insert + query
    await textarea.fill("INSERT INTO users VALUES (1, 'Alice', 'alice@test.com'), (2, 'Bob', 'bob@test.com');")
    await runBtn.click({ force: true })
    await page.waitForTimeout(300)
    await textarea.fill("SELECT * FROM users;")
    await runBtn.click({ force: true })
    await page.waitForTimeout(500)
    sqFrame = await findFrame('.sq-root')

    await page.screenshot({ path: 'testing/screenshots/sqlite-06-query.png' })
    const rows = await sqFrame.locator('.sq-results tbody tr').count()
    console.log(`Query result rows: ${rows}`)
    const status = await sqFrame.locator('.sq-status').textContent()
    console.log(`Status: ${status}`)
  }
}

console.log('\nErrors:', errors.length ? errors : 'none')
console.log('Done!')
await browser.close()
