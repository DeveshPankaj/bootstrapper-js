import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'

const browser = await chromium.launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

const logs = []
page.on('console', msg => {
  const t = msg.text()
  if (t.includes('iffusion') || t.includes('loss') || t.includes('rror')) logs.push(`[${msg.type()}] ${t.slice(0,150)}`)
})
page.on('pageerror', err => logs.push(`[pageerror] ${err.message.slice(0,150)}`))

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
  try { window.platform.host.execCommand("service('001-core.layout','open-window')(command('ui.iframe'),'/opt/apps/nn-ide/nn-ide.html')", window.platform) } catch(_) {}
})
await page.waitForTimeout(5000)

const findFrame = async (sel) => {
  for (const f of page.frames()) {
    try { if (await f.locator(sel).count() > 0) return f } catch(_) {}
  }
  for (const f of page.frames()) {
    try { const t = await f.title(); if (t.includes('Neural')) return f } catch(_) {}
  }
  return null
}

let nn = await findFrame('#cv-wrap')
if (!nn) {
  // Try once more after waiting
  await page.waitForTimeout(5000)
  nn = await findFrame('#cv-wrap')
}
if (!nn) { console.log('NN-IDE not found'); await page.screenshot({path:'testing/screenshots/dfv2-noframe.png'}); await browser.close(); process.exit(1) }
console.log('NN-IDE found')

// Load diffusion preset
await nn.locator('button', { hasText: 'Diffusion 32' }).click({ force: true })
await page.waitForTimeout(1000)

// Check edges
nn = await findFrame('#cv-wrap')
const edges = await nn.locator('#cv-svg path').count()
console.log(`Edges: ${edges}`)
await page.screenshot({ path: 'testing/screenshots/dfv2-01-preset.png' })

// Load dataset
await nn.locator('button', { hasText: 'Load' }).first().click({ force: true })
await page.waitForTimeout(1000)
nn = await findFrame('#cv-wrap')
console.log(`Dataset: ${await nn.locator('#df-status').textContent()}`)

// Set 5 epochs, 2 reps for quick test
await nn.locator('#df-epochs').fill('5')
await nn.locator('#df-reps').fill('2')

// Train
console.log('Training 5 epochs...')
await nn.locator('button', { hasText: '▶ Train' }).first().click({ force: true })

// Monitor
const losses = []
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(1000)
  nn = await findFrame('#cv-wrap')
  try {
    const s = await nn.locator('#df-status').textContent()
    if (i % 2 === 0) console.log(`  [${i}s] ${s}`)
    const m = s.match(/loss: ([\d.]+)/)
    if (m) losses.push(parseFloat(m[1]))
    if (s.includes('complete') || s.includes('Error') || s.includes('Stopped')) break
  } catch(_) {}
}

console.log(`\nLoss values: ${losses.join(', ')}`)
const learning = losses.length >= 2 && losses[losses.length-1] < losses[0]
console.log(`Learning: ${learning} (${losses[0]?.toFixed(4)} → ${losses[losses.length-1]?.toFixed(4)})`)

await page.screenshot({ path: 'testing/screenshots/dfv2-02-trained.png' })

// Check previews
nn = await findFrame('#cv-wrap')
const thumbs = await nn.locator('#df-previews canvas').count()
console.log(`Preview thumbnails: ${thumbs}`)

// Generate
await nn.locator('#df-prompt').fill('a blue circle on white background')
await nn.locator('#df-gen-btn').click({ force: true })
await page.waitForTimeout(5000)
await page.screenshot({ path: 'testing/screenshots/dfv2-03-generated.png' })

nn = await findFrame('#cv-wrap')
const genCanvas = await nn.locator('#df-gen-out canvas').count()
console.log(`Generated image: ${genCanvas > 0}`)

console.log('\nLogs:')
logs.forEach(l => console.log('  ' + l))

console.log('\nDone!')
await browser.close()
