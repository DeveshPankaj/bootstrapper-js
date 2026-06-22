import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
import { writeFileSync } from 'fs'

const browser = await chromium.launch({ headless: false, slowMo: 200 })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()

const errors = []
page.on('console', msg => { if (msg.type() === 'error') errors.push(`[page] ${msg.text().slice(0, 300)}`) })
page.on('pageerror', e => errors.push(`[pageerror] ${e.message.slice(0, 300)}`))

await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)

// Open FS.html
await page.evaluate(() => {
  window.platform?.host?.execCommand(
    "service('001-core.layout','open-window')(command('ui.iframe'),'/home/user1/apps/FS.html')",
    window.platform
  )
})
await page.waitForTimeout(5000)

// List all frame URLs
console.log('All frames:')
for (const frame of page.frames()) {
  console.log(' ', frame.url().slice(0, 100))
}

// Search for FS.html frame
let fsFrame = null
for (const frame of page.frames()) {
  try {
    const url = frame.url()
    if (url.includes('FS.html')) { fsFrame = frame; console.log('Found FS frame by URL:', url); break }
  } catch (_) {}
}

if (!fsFrame) {
  // Try by content
  for (const frame of page.frames()) {
    try {
      const count = await frame.locator('#toolbar').count()
      if (count > 0) { fsFrame = frame; console.log('Found FS frame by #toolbar'); break }
    } catch (_) {}
  }
}

if (!fsFrame) {
  // Try by text
  for (const frame of page.frames()) {
    try {
      const count = await frame.locator('text=Open Folder').count()
      if (count > 0) { fsFrame = frame; console.log('Found FS frame by text'); break }
    } catch (_) {}
  }
}

if (!fsFrame) {
  console.log('❌ Could not find FS.html frame')
  // Check what content the window iframe has
  for (const frame of page.frames()) {
    try {
      const body = await frame.evaluate(() => document.body?.innerHTML?.slice(0, 500))
      if (body && body.length > 10) console.log('Frame content:', frame.url().slice(0,80), '→', body.slice(0,200))
    } catch (_) {}
  }
} else {
  console.log('✓ Found FS.html frame')
  const hasCM = await fsFrame.evaluate(() => !!document.querySelector('.cm-editor'))
  console.log(hasCM ? '✓ CodeMirror present' : '❌ CodeMirror NOT found')

  // Check iframe console errors
  fsFrame.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[fs-frame] ${msg.text().slice(0,300)}`)
  })
  await page.waitForTimeout(3000)
}

if (errors.length) { console.log('Errors:', errors) }
else { console.log('✓ No errors') }

writeFileSync('testing/screenshots/fs-html-test.png', await page.screenshot())
console.log('Screenshot saved')
await browser.close()
