import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const errors = [];
page.on('pageerror', err => { errors.push(err.message); console.log('PAGEERROR:', err.message); });
page.on('console', msg => { if (msg.type() === 'error') { errors.push(msg.text()); console.log('CONSOLE ERROR:', msg.text()); } });

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Open Settings app via desktop icon / taskbar
const settingsIcon = page.locator('.material-symbols-outlined', { hasText: 'settings' }).first();
await settingsIcon.click({ force: true });
await page.waitForTimeout(2000);

let settingsFrame = null;
for (const frame of page.frames()) {
  if (await frame.locator('.settings-sidebar').count() > 0) {
    settingsFrame = frame;
    break;
  }
}
console.log('settings frame found:', !!settingsFrame);

await page.screenshot({ path: 'testing/screenshots/settings-about.png' });

// Projects
await settingsFrame.getByText('Projects', { exact: true }).click({ force: true });
await page.waitForTimeout(500);
await page.screenshot({ path: 'testing/screenshots/settings-projects.png' });

// Contact
await settingsFrame.getByText('Contact', { exact: true }).click({ force: true });
await page.waitForTimeout(500);
const contactText = await settingsFrame.locator('.settings-page').innerText();
console.log('Contact page text:', contactText);
await page.screenshot({ path: 'testing/screenshots/settings-contact.png' });

// Wallpaper
await settingsFrame.getByText('Wallpaper', { exact: true }).click({ force: true });
await page.waitForTimeout(800);
await page.screenshot({ path: 'testing/screenshots/settings-wallpaper.png' });

// Open file picker
await settingsFrame.getByText('Choose from Files').click({ force: true });
await page.waitForTimeout(800);
const pickerVisible = await settingsFrame.locator('.filepicker-dialog').count();
console.log('file picker visible:', pickerVisible);
await page.screenshot({ path: 'testing/screenshots/settings-filepicker.png' });

// Navigate into projects folder, pick an image if present, else just close
await settingsFrame.locator('.filepicker-item', { hasText: 'projects' }).dblclick({ force: true }).catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: 'testing/screenshots/settings-filepicker-projects.png' });

await settingsFrame.locator('.filepicker-close').click({ force: true });
await page.waitForTimeout(300);

// Layout & WM pages still work
await settingsFrame.getByText('Layout', { exact: true }).click({ force: true });
await page.waitForTimeout(500);
await page.screenshot({ path: 'testing/screenshots/settings-layout.png' });

await settingsFrame.getByText('Window Manager', { exact: true }).click({ force: true });
await page.waitForTimeout(500);
await page.screenshot({ path: 'testing/screenshots/settings-wm.png' });

console.log('errors:', errors);

await browser.close();
