import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
import { writeFileSync } from 'fs'

const browser = await chromium.launch({ headless: false, slowMo: 150 })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()

const errors = []
page.on('pageerror', e => errors.push(`[pageerror] ${e.message.slice(0, 300)}`))

await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)

// Open Nexplorer
await page.evaluate(() => {
  window.platform?.host?.execCommand(
    "service('001-core.layout','open-window')(command('explorer-sifi'))",
    window.platform
  )
})
await page.waitForTimeout(4000)

// Find the explorer-sifi iframe
let siFrame = null
for (const frame of page.frames()) {
  try {
    const count = await frame.locator('.sifi-explorer').count()
    if (count > 0) { siFrame = frame; console.log('Found sifi-explorer frame, url:', frame.url().slice(0,100)); break }
  } catch (_) {}
}

if (!siFrame) {
  // Try by navmesh class
  for (const frame of page.frames()) {
    try {
      const count = await frame.locator('.sifi-navmesh').count()
      if (count > 0) { siFrame = frame; console.log('Found frame by .sifi-navmesh'); break }
    } catch (_) {}
  }
}

if (!siFrame) {
  console.log('❌ Could not find sifi-explorer frame')
  for (const frame of page.frames()) {
    try {
      const body = await frame.evaluate(() => document.body?.innerHTML?.slice(0, 400))
      if (body && body.length > 50) console.log('Frame:', frame.url().slice(0,80), '→', body.slice(0,200))
    } catch (_) {}
  }
} else {
  console.log('✓ Nexplorer frame found')
  const hasHUD     = await siFrame.locator('.sifi-hud').count() > 0
  const hasNavmesh = await siFrame.locator('.sifi-navmesh').count() > 0
  const hasStatus  = await siFrame.locator('.sifi-statusbar').count() > 0
  const hasTiles   = await siFrame.locator('.file-item').count()
  console.log(`  HUD: ${hasHUD} | NAVMESH: ${hasNavmesh} | STATUS: ${hasStatus} | TILES: ${hasTiles}`)

  // Navigate into /home/user1
  await siFrame.locator('.sifi-navmesh-item').first().click({ force: true })
  await page.waitForTimeout(1500)

  const tilesAfter = await siFrame.locator('.file-item').count()
  console.log(`  After nav to Home — tiles: ${tilesAfter}`)
}

writeFileSync('testing/screenshots/explorer-sifi.png', await page.screenshot())
console.log('Screenshot saved: testing/screenshots/explorer-sifi.png')

if (errors.length) console.log('Errors:', errors)
else console.log('✓ No errors')

await browser.close()
