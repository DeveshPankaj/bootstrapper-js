import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'

const browser = await chromium.launch()
const page = await browser.newPage()

page.on('console', msg => {
  if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text())
})
page.on('pageerror', err => console.log('PAGE ERROR:', err.message))

await page.goto('http://localhost:8080')
await page.reload({ waitUntil: 'networkidle' })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

// Open Settings via desktop icon / start menu - try double clicking desktop icon
async function findFrameWithText(text) {
  for (const frame of page.frames()) {
    try {
      const count = await frame.locator(`text=${text}`).count()
      if (count > 0) return frame
    } catch (e) {}
  }
  return null
}

// Try to find a Settings desktop icon
let settingsIcon = await findFrameWithText('Settings')
if (settingsIcon) {
  const el = settingsIcon.locator('text=Settings').first()
  await el.dblclick({ force: true })
} else {
  console.log('Settings icon not found on desktop')
}

await page.waitForTimeout(2000)

// Find the storage page nav link and click it
let storageFrame = null
for (let i = 0; i < 10; i++) {
  storageFrame = await findFrameWithText('Storage')
  if (storageFrame) break
  await page.waitForTimeout(500)
}

if (!storageFrame) {
  console.log('Could not find Storage nav item')
  await page.screenshot({ path: 'testing/screenshots/force-reload-fail.png' })
  await browser.close()
  process.exit(1)
}

await storageFrame.locator('text=Storage').first().click({ force: true })
await page.waitForTimeout(1000)

// Re-find frame after click since react tree may re-render
storageFrame = await findFrameWithText('Force Reload')
if (!storageFrame) {
  console.log('Could not find Force Reload button')
  await page.screenshot({ path: 'testing/screenshots/force-reload-fail.png' })
  await browser.close()
  process.exit(1)
}

console.log('Found Force Reload button')
await page.screenshot({ path: 'testing/screenshots/force-reload-before.png' })

// Modify a file in the vfs first to verify it gets overwritten
// Write to localStorage via page context isn't directly accessible to vfs; skip pre-mod check, just test the click flow.

// Auto-accept confirm dialog
page.on('dialog', async dialog => {
  console.log('DIALOG:', dialog.message())
  await dialog.accept()
})

await storageFrame.locator('text=Force Reload').first().click({ force: true })

// Wait for reload to happen (page navigation)
await page.waitForTimeout(1000)
let reloaded = false
try {
  await page.waitForNavigation({ timeout: 15000 })
  reloaded = true
} catch (e) {
  console.log('No navigation event detected within timeout:', e.message)
}
console.log('Reloaded:', reloaded)

await page.waitForTimeout(2000)
await page.screenshot({ path: 'testing/screenshots/force-reload-after.png' })

await browser.close()
