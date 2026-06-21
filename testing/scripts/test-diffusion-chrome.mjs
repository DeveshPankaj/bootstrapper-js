import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'

const browser = await chromium.launch({ headless: false, args: ['--disable-gpu-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

const logs = []
page.on('console', msg => {
  const text = msg.text()
  if (text.includes('Diffusion') || text.includes('loss') || text.includes('error') || text.includes('Error') || text.includes('diffusion')) {
    logs.push(`[${msg.type()}] ${text.slice(0, 200)}`)
  }
})
page.on('pageerror', err => logs.push(`[pageerror] ${err.message.slice(0, 200)}`))

console.log('Loading...')
await page.goto('http://localhost:8080/', { waitUntil: 'load' })
await page.waitForTimeout(3000)
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(3000)
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(3000)
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(8000)

// Open NN-IDE
console.log('Opening NN-IDE...')
await page.evaluate(() => {
  try {
    window.platform.host.execCommand(
      "service('001-core.layout','open-window')(command('ui.iframe'),'/opt/apps/nn-ide/nn-ide.html')",
      window.platform
    )
  } catch(e) { console.error('open failed', e) }
})
await page.waitForTimeout(5000)

const findFrame = async (sel) => {
  for (const f of page.frames()) {
    try { if (await f.locator(sel).count() > 0) return f } catch(_) {}
  }
  return null
}

let nn = await findFrame('#cv-wrap')
if (!nn) { nn = await findFrame('#bot') }
if (!nn) {
  for (const f of page.frames()) {
    try { const t = await f.title(); if (t.includes('Neural')) { nn = f; break } } catch(_) {}
  }
}
if (!nn) {
  console.log('NN-IDE not found. Trying all frames:')
  for (const f of page.frames()) {
    try {
      const url = f.url().slice(0, 50)
      const html = await f.evaluate(() => document.body?.innerHTML?.slice(0, 80) || '')
      console.log(`  ${url}: ${html}`)
    } catch(_) {}
  }
  await page.screenshot({ path: 'testing/screenshots/diffusion-chrome-noframe.png' })
  await browser.close(); process.exit(1)
}
console.log('NN-IDE found')

// Load diffusion preset
const diffBtn = nn.locator('button', { hasText: 'Diffusion 32' })
await diffBtn.click({ force: true })
await page.waitForTimeout(1000)

// Load dataset
nn = await findFrame('#cv-wrap') || nn
const loadBtn = nn.locator('button', { hasText: 'Load' }).first()
await loadBtn.click({ force: true })
await page.waitForTimeout(1000)

const dsStatus = await nn.locator('#diff-status').textContent()
console.log('Dataset:', dsStatus)

// Set 3 epochs for quick test
await nn.locator('#diff-epochs').fill('3')
await nn.locator('#diff-repeats').fill('2')

// Check TF backend
const backend = await nn.evaluate(() => {
  try { return typeof tf !== 'undefined' ? tf.getBackend() : 'tf not loaded' } catch(e) { return 'error: ' + e.message }
})
console.log('TF backend:', backend)

// Click Train
console.log('Training 3 epochs...')
const trainBtn = nn.locator('button', { hasText: '▶ Train' }).first()
await trainBtn.click({ force: true })
await page.waitForTimeout(3000)

// Monitor training
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(1000)
  nn = await findFrame('#cv-wrap') || nn
  try {
    const status = await nn.locator('#diff-status').textContent()
    if (i % 3 === 0 || status.includes('complete') || status.includes('Error')) console.log(`  [${i}s] ${status}`)
    if (status.includes('complete') || status.includes('Error') || status.includes('Stopped')) break
  } catch(_) {}
}

// Check model internals
const debug = await nn.evaluate(() => {
  try {
    if (!window.diffModel) return 'diffModel is null'
    const w = window.diffModel.getWeights()
    const w0 = w[0].dataSync()
    const wSum = Array.from(w0.slice(0, 10)).map(v => v.toFixed(4))
    return `weights count: ${w.length}, first 10 of w[0]: [${wSum}]`
  } catch(e) { return 'error: ' + e.message }
})
console.log('Model debug:', debug)

await page.screenshot({ path: 'testing/screenshots/diffusion-chrome-test.png' })

console.log('\nRelevant logs:')
logs.forEach(l => console.log('  ' + l))

await browser.close()
