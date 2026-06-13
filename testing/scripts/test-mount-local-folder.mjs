import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

// Headless Chromium cannot show the native OS directory-picker dialog, so
// `showDirectoryPicker()` rejects immediately with AbortError when called
// directly (verified separately). To still exercise the real mount code path
// (`mountLocalFolderClick` -> `mountLocalDirectory` -> BrowserFS writes under
// /mnt/<name>), this test stubs `window.showDirectoryPicker` in the explorer
// iframe to resolve with a fake FileSystemDirectoryHandle built from a small
// fixture folder, then clicks the real "mount local folder" button.

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('pageerror', err => { errors.push(err.message); console.log('PAGEERROR:', err.message); });
page.on('console', msg => { if (msg.type() === 'error') { errors.push(msg.text()); console.log('CONSOLE ERROR:', msg.text()); } });
page.on('dialog', async dialog => {
  console.log('DIALOG:', dialog.type(), dialog.message());
  await dialog.dismiss();
});

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

await page.locator('.taskbar .material-symbols-outlined', { hasText: 'folder' }).first().click({ force: true });
await page.waitForTimeout(2000);

let explorerFrame = null;
for (const frame of page.frames()) {
  if (await frame.locator('[aria-label="mount_local_folder"]').count() > 0) {
    explorerFrame = frame;
    break;
  }
}
console.log('explorer frame found:', !!explorerFrame);

// Build a fake FileSystemDirectoryHandle tree mirroring the fixture folder.
const fakeTree = {
  name: 'sample-mount-folder',
  kind: 'directory',
  children: [
    { name: 'root.txt', kind: 'file', content: 'hello from root file\n' },
    { name: 'subdir', kind: 'directory', children: [
      { name: 'nested.txt', kind: 'file', content: 'hello from subdir file\n' },
    ] },
  ],
};

const stubFn = (tree) => {
  const buildHandle = (node) => {
    if (node.kind === 'file') {
      return {
        kind: 'file',
        name: node.name,
        getFile: async () => new File([node.content], node.name, { type: 'text/plain' }),
      };
    }
    return {
      kind: 'directory',
      name: node.name,
      entries: async function* () {
        for (const child of node.children) {
          yield [child.name, buildHandle(child)];
        }
      },
    };
  };

  window.showDirectoryPicker = async () => buildHandle(tree);
};

// Stub on every frame's window (top, layout, explorer) since we don't know
// which `window` the executed explorer.js module's `platform.window` refers to.
for (const frame of page.frames()) {
  try { await frame.evaluate(stubFn, fakeTree); } catch {}
}
await page.evaluate(stubFn, fakeTree);

// Click the mount-local-folder button
await explorerFrame.locator('[aria-label="mount_local_folder"]').click({ force: true });
await page.waitForTimeout(2000);

// Inspect resulting virtual fs state
const result = await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  const dir = '/mnt/sample-mount-folder';
  if (!fs.existsSync(dir)) return { mounted: false };
  return {
    mounted: true,
    rootEntries: fs.readdirSync(dir),
    subdirEntries: fs.readdirSync(`${dir}/subdir`),
    rootFile: fs.readFileSync(`${dir}/root.txt`, 'utf-8').toString(),
    nestedFile: fs.readFileSync(`${dir}/subdir/nested.txt`, 'utf-8').toString(),
  };
});
console.log('mount result:', JSON.stringify(result, null, 2));

// Verify the explorer navigated into the mounted folder and lists its files
const breadcrumb = await explorerFrame.locator('.file-explorer-breadcrumb, .breadcrumb').first().textContent().catch(() => null);
console.log('breadcrumb:', breadcrumb);

const itemNames = await explorerFrame.locator('.file-item .file-name, .file-item span').allTextContents().catch(() => []);
console.log('explorer items:', itemNames);

await page.screenshot({ path: 'testing/screenshots/mount-local-folder.png' });

console.log('console/page errors:', errors);

await browser.close();
