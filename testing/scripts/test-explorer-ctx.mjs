import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

const errors = []
page.on('pageerror', err => errors.push('PAGE: ' + err.message.slice(0, 150)))
page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('404')) errors.push('CON: ' + msg.text().slice(0, 150)) })

console.log('Loading app...')
await page.goto('http://localhost:8080/', { waitUntil: 'load' })
await page.reload({ waitUntil: 'load' })
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(8000)

// Open explorer via keyboard
console.log('Opening file explorer...')
await page.evaluate(() => { try { window.platform.host.callCommand('explorer') } catch(_) {} })
await page.waitForTimeout(2000)

// Find explorer iframe
const findFrame = async (selector) => {
  for (const frame of page.frames()) {
    try { if (await frame.locator(selector).count() > 0) return frame } catch(_) {}
  }
  return null
}

const expFrame = await findFrame('.file-explorer')
if (!expFrame) {
  console.log('Explorer frame not found')
  await page.screenshot({ path: 'testing/screenshots/explorer-ctx-noframe.png' })
  await browser.close()
  process.exit(1)
}
console.log('Explorer frame found')

// Navigate to /usr/share/icons (has .png files)
const sidebar = expFrame.locator('.nav-item', { hasText: 'Root' })
if (await sidebar.count() > 0) {
  await sidebar.click({ force: true })
  await page.waitForTimeout(500)
}

// Type in breadcrumb or navigate
// Try double-clicking folders: usr -> share -> icons
const navToPath = async (name) => {
  const item = expFrame.locator('.file-item', { hasText: name }).first()
  if (await item.count() > 0) {
    await item.dblclick({ force: true })
    await page.waitForTimeout(500)
    return true
  }
  return false
}

await navToPath('usr')
await navToPath('share')
await navToPath('icons')

await page.waitForTimeout(500)
await page.screenshot({ path: 'testing/screenshots/explorer-ctx-icons.png' })

// Right-click on a .png file
const pngFile = expFrame.locator('.file-item', { hasText: '.png' }).first()
const pngCount = await pngFile.count()
console.log(`PNG file found: ${pngCount > 0}`)

if (pngCount > 0) {
  await pngFile.click({ button: 'right', force: true })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'testing/screenshots/explorer-ctx-menu.png' })

  // Check for "Open with" in context menu
  const ctxMenu = page.locator('.contextmenu')
  const ctxHtml = await page.evaluate(() => {
    const cm = document.querySelector('.contextmenu')
    return cm ? cm.innerText : 'no context menu'
  })
  console.log('Context menu text:', ctxHtml.replace(/\n/g, ' | ').slice(0, 200))
}

console.log('\nErrors:', errors.length ? errors : 'none')
await browser.close()
