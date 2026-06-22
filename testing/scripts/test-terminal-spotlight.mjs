import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

const errors = []
page.on('console', msg => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    errors.push(`[${msg.type()}] ${msg.text()}`)
  }
})
page.on('pageerror', err => errors.push(`[pageerror] ${err.message}`))

console.log('Loading...')
await page.goto('http://localhost:8080/', { waitUntil: 'load' })
await page.reload({ waitUntil: 'load' })
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(8000)

// Check if xtermjs.html exists in VFS
const vfsCheck = await page.evaluate(() => {
  try {
    const fs = window.__fs || null
    if (!fs) return 'no __fs'
    const exists = fs.existsSync('/home/user1/apps/xtermjs.html')
    return `exists: ${exists}`
  } catch (e) { return `error: ${e.message}` }
})
console.log('VFS xtermjs.html:', vfsCheck)

// Test Alt+Space (spotlight)
errors.length = 0
console.log('\nTesting Alt+Space (spotlight)...')
await page.keyboard.down('Alt')
await page.keyboard.press('Space')
await page.keyboard.up('Alt')
await page.waitForTimeout(1500)
await page.screenshot({ path: 'testing/screenshots/test-spotlight.png' })
const spotlightErrors = errors.filter(e => e.includes('spotlight') || e.includes('not registered'))
console.log('Spotlight errors:', spotlightErrors.length ? spotlightErrors : 'none')
// Close spotlight if opened
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// Test Alt+T (terminal)
errors.length = 0
console.log('\nTesting Alt+T (terminal)...')
await page.keyboard.down('Alt')
await page.keyboard.press('KeyT')
await page.keyboard.up('Alt')
await page.waitForTimeout(2000)
await page.screenshot({ path: 'testing/screenshots/test-terminal.png' })
const termErrors = errors.filter(e => e.includes('xtermjs') || e.includes('terminal') || e.includes('not found') || e.includes('iframe'))
console.log('Terminal errors:', termErrors.length ? termErrors : 'none')

console.log('\nAll console messages during test:')
errors.forEach(e => console.log('  ' + e.slice(0, 200)))

await browser.close()
