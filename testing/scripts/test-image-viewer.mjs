import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

const errors = []
page.on('pageerror', err => errors.push('PAGE: ' + err.message))
page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('404')) errors.push('CON: ' + msg.text()) })

console.log('Loading app...')
await page.goto('http://localhost:8080/', { waitUntil: 'load' })
await page.reload({ waitUntil: 'load' })
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(8000)

// Check if ui.imageviewer command is registered
const hasCmd = await page.evaluate(() => {
  try { return !!window.platform?.host?.getCommand('ui.imageviewer') } catch(_) { return false }
})
console.log(`ui.imageviewer command registered: ${hasCmd}`)

// Check what commands have fileExtensions for .png
const pngApps = await page.evaluate(() => {
  try { return window.platform?.host?.getCommandsForExtension?.('png') || [] } catch(_) { return [] }
})
console.log(`Apps for .png:`, pngApps)

// Try opening an image via explorer - find a .png file on desktop
// First check what files are on the desktop
const desktopFiles = await page.evaluate(() => {
  try {
    const fs = window.platform?.host?.getFS()
    if (!fs) return 'no fs'
    return fs.readdirSync('/home/user1').filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp'))
  } catch(e) { return 'error: ' + e.message }
})
console.log('Image files in /home/user1:', desktopFiles)

// Check if there are images anywhere we can test with
const testImages = await page.evaluate(() => {
  try {
    const fs = window.platform?.host?.getFS()
    const imgs = []
    const scan = (dir) => {
      try {
        for (const f of fs.readdirSync(dir)) {
          const p = dir + '/' + f
          try {
            if (fs.statSync(p).isDirectory()) { if (imgs.length < 3) scan(p) }
            else if (/\.(png|jpg|jpeg|webp|gif)$/i.test(f)) imgs.push(p)
          } catch(_) {}
          if (imgs.length >= 3) return
        }
      } catch(_) {}
    }
    scan('/usr/share/icons')
    return imgs
  } catch(e) { return 'error: ' + e.message }
})
console.log('Found test images:', testImages)

if (Array.isArray(testImages) && testImages.length > 0) {
  const testImg = testImages[0]
  console.log(`\nTrying to open: ${testImg}`)

  // Try exec directly
  const execResult = await page.evaluate((path) => {
    try {
      window.platform.host.exec(window.platform, path)
      return 'ok'
    } catch(e) { return 'error: ' + e.message }
  }, testImg)
  console.log(`exec result: ${execResult}`)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'testing/screenshots/image-viewer-test.png' })

  // Check what windows opened
  const windowTitles = await page.evaluate(() => {
    const wins = document.querySelectorAll('.window .window-header .title')
    return Array.from(wins).map(w => w.textContent)
  })
  console.log('Open windows:', windowTitles)
}

console.log('\nErrors:', errors.length ? errors : 'none')
await browser.close()
