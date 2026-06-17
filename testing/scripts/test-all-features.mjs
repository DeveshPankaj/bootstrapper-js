import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'

const browser = await chromium.launch()
const page = await browser.newPage()
page.on('pageerror', err => console.log('PAGEERROR:', err.message))
page.on('dialog', async dialog => {
  console.log('DIALOG:', dialog.message().slice(0, 60))
  await dialog.dismiss()
})

await page.goto('http://localhost:8080')
await page.reload({ waitUntil: 'networkidle' })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(3000)

async function findFrameWithText(text) {
  for (const frame of page.frames()) {
    try {
      const count = await frame.locator(`text=${text}`).count()
      if (count > 0) return frame
    } catch (e) {}
  }
  return null
}

// --- 1. Toast notification ---
console.log('\n=== 1. TOAST NOTIFICATION ===')
await page.evaluate(() => {
  window.platform.host.callCommand('notify', { title: 'Test', body: 'Hello from notify!', duration: 3000 })
})
await page.waitForTimeout(500)
const toastVisible = await page.locator('text=Hello from notify!').count()
console.log('Toast visible:', toastVisible > 0)
await page.screenshot({ path: 'testing/screenshots/toast-notify.png' })

// --- 2. Settings - open and check new sections ---
console.log('\n=== 2. SETTINGS SECTIONS ===')
let settingsFrame = await findFrameWithText('Settings')
await settingsFrame.locator('text=Settings').first().dblclick({ force: true })
await page.waitForTimeout(2000)

// Re-find frame after settings window opens
for (let i = 0; i < 10; i++) {
  for (const f of page.frames()) {
    const c = await f.locator('.settings-nav-item').count().catch(() => 0)
    if (c > 0) { settingsFrame = f; break }
  }
  if (settingsFrame) break
  await page.waitForTimeout(500)
}

const navItems = await settingsFrame.locator('.settings-nav-item').allInnerTexts()
console.log('Nav items:', navItems.map(t => t.replace(/\s+/g, ' ').trim()))

// Check each new section
for (const label of ['Keyboard Shortcuts', 'Boot Log', 'VFS Snapshot', 'Workspaces']) {
  const nav = settingsFrame.locator('.settings-nav-item').filter({ hasText: label })
  await nav.click({ force: true })
  await page.waitForTimeout(600)
  const title = await settingsFrame.locator('.settings-page-title').first().innerText().catch(() => '?')
  console.log(`${label}: title="${title}"`)
}

await page.screenshot({ path: 'testing/screenshots/settings-new-sections.png' })

// --- 3. File explorer search ---
console.log('\n=== 3. FILE SEARCH ===')
const explorerFrame = await findFrameWithText('Files')
if (explorerFrame) {
  await explorerFrame.locator('text=Files').first().dblclick({ force: true })
} else {
  await page.locator('text=Files').first().dblclick({ force: true })
}
await page.waitForTimeout(2000)
let explorerWin = null
for (const f of page.frames()) {
  const c = await f.locator('.file-explorer').count().catch(() => 0)
  if (c > 0) { explorerWin = f; break }
}
console.log('Explorer window found:', !!explorerWin)
if (explorerWin) {
  const searchBtn = explorerWin.locator('.material-symbols-outlined[aria-label="search"], .material-symbols-outlined').filter({ hasText: 'search' }).first()
  await searchBtn.click({ force: true })
  await page.waitForTimeout(500)
  const searchInput = explorerWin.locator('input[placeholder*="Search"]')
  console.log('Search input visible:', await searchInput.count() > 0)
  if (await searchInput.count() > 0) {
    await searchInput.fill('settings')
    await page.waitForTimeout(800)
    const results = await explorerWin.locator('text=settings').count()
    console.log('Search results count:', results)
  }
  await page.screenshot({ path: 'testing/screenshots/explorer-search.png' })
}

// --- 4. Spotlight ---
console.log('\n=== 4. SPOTLIGHT ===')
await page.keyboard.press('Meta+Space')
await page.waitForTimeout(800)
const spotlightInput = await page.locator('input[placeholder*="Search commands"]').count()
console.log('Spotlight opened:', spotlightInput > 0)
await page.screenshot({ path: 'testing/screenshots/spotlight.png' })
if (spotlightInput > 0) {
  await page.keyboard.press('Escape')
}

// --- 5. Boot log in settings ---
console.log('\n=== 5. BOOT LOG ===')
for (const f of page.frames()) {
  const c = await f.locator('.settings-nav-item').count().catch(() => 0)
  if (c > 0) { settingsFrame = f; break }
}
if (settingsFrame) {
  await settingsFrame.locator('.settings-nav-item').filter({ hasText: 'Boot Log' }).click({ force: true })
  await page.waitForTimeout(500)
  const logContent = await settingsFrame.locator('.settings-page').first().innerText().catch(() => '')
  console.log('Boot Log content snippet:', logContent.slice(0, 200).replace(/\s+/g, ' '))
}

await page.screenshot({ path: 'testing/screenshots/all-features-final.png' })

console.log('\nAll tests done.')
await browser.close()
