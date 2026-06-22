import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

page.on('pageerror', err => console.log('PAGE ERROR:', err.message.slice(0, 200)))

console.log('Loading app...')
await page.goto('http://localhost:8080/', { waitUntil: 'load' })
await page.reload({ waitUntil: 'load' })
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(8000)

await page.screenshot({ path: 'testing/screenshots/install-test/00-taskbar.png' })

// Check the pkg-manager button exists in taskbar
const pkgBtn = page.locator('[aria-label="open-pkg-manager"]')
const btnCount = await pkgBtn.count()
console.log(`Pkg manager taskbar button found: ${btnCount > 0}`)

if (btnCount === 0) {
  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[aria-label]')).map(el => el.getAttribute('aria-label'))
  )
  console.log('All aria-labels:', labels)
  await browser.close()
  process.exit(1)
}

// Click it
console.log('Clicking App Manager button...')
await pkgBtn.first().click({ force: true })
await page.waitForTimeout(3000)

await page.screenshot({ path: 'testing/screenshots/install-test/05-discover-view.png' })
console.log('Screenshot: discover view')

// Find the App Manager window's iframe
const findFrame = async () => {
  for (const frame of page.frames()) {
    try {
      const count = await frame.locator('.pkg-root').count()
      if (count > 0) return frame
    } catch (_) {}
  }
  return null
}

const appFrame = await findFrame()
if (!appFrame) {
  console.log('App Manager frame not found. Checking all frames...')
  for (const frame of page.frames()) {
    try {
      const html = await frame.evaluate(() => document.body?.innerHTML?.slice(0, 100) || 'empty')
      console.log(`  ${frame.url().slice(0,40)}: ${html}`)
    } catch (_) {}
  }
  await browser.close()
  process.exit(1)
}

console.log('App Manager frame found!')

// Check the Discover view
const sidebar = await appFrame.locator('.pkg-nav-item').all()
console.log(`Sidebar items: ${sidebar.length}`)

// Click Installed
const installedNav = appFrame.locator('.pkg-nav-item', { hasText: 'Installed' })
if (await installedNav.count() > 0) {
  await installedNav.click({ force: true })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'testing/screenshots/install-test/05-installed-view.png' })
  console.log('Screenshot: installed view')
}

console.log('\nApp Manager is working!')
await browser.close()
