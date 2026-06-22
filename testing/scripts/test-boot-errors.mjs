import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage()

const errors = []
const warnings = []
page.on('console', msg => {
  const text = msg.text()
  if (msg.type() === 'error') errors.push(text)
  if (msg.type() === 'warning') warnings.push(text)
})
page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`))

// Track 404s
const notFound = []
page.on('response', res => {
  if (res.status() === 404) notFound.push(res.url())
})

await page.goto('http://localhost:8080/', { waitUntil: 'load' })
await page.reload({ waitUntil: 'load' })
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(10000)

console.log('=== 404 URLS ===')
notFound.forEach(u => console.log(u))

console.log('\n=== PAGE ERRORS ===')
errors.filter(e => e.includes('PAGE ERROR')).forEach(e => console.log(e.slice(0, 300)))

console.log('\n=== CONSOLE ERRORS ===')
errors.filter(e => !e.includes('PAGE ERROR') && !e.includes('404')).forEach(e => console.log(e.slice(0, 300)))

console.log('\n=== WARNINGS ===')
warnings.forEach(w => console.log(w.slice(0, 300)))

// Check taskbar items
const taskbar = await page.evaluate(() => {
  const items = document.querySelectorAll('[aria-label]')
  return Array.from(items).map(el => el.getAttribute('aria-label'))
})
console.log('\n=== TASKBAR ITEMS ===')
console.log(taskbar)

await page.screenshot({ path: 'testing/screenshots/boot-errors.png' })
await browser.close()
