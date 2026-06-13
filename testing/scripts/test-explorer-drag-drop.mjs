import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('pageerror', err => { errors.push(err.message); console.log('PAGEERROR:', err.message); });
page.on('console', msg => { if (msg.type() === 'error') { errors.push(msg.text()); console.log('CONSOLE ERROR:', msg.text()); } });

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Set up test fixture: a fresh dir with a source file and an empty target folder.
await page.evaluate(() => {
  const fs = window.fs;
  if (fs.existsSync('/home/user1/dnd-test')) {
    // clean up from a previous run
    const rmrf = (p) => {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        for (const child of fs.readdirSync(p)) rmrf(`${p}/${child}`);
        fs.rmdirSync(p);
      } else {
        fs.unlinkSync(p);
      }
    };
    rmrf('/home/user1/dnd-test');
  }
  fs.mkdirSync('/home/user1/dnd-test');
  fs.mkdirSync('/home/user1/dnd-test/target-folder');
  fs.writeFileSync('/home/user1/dnd-test/source.txt', 'hello from source');
});

// Open the explorer at /home/user1/dnd-test
await page.evaluate(() => {
  window.platform.host.execCommand(`service('001-core.layout', 'open-window') (command('explorer'), '/home/user1/dnd-test')`, window.platform);
});
await page.waitForTimeout(1500);

let explorerFrame = null;
for (const frame of page.frames()) {
  if (await frame.locator('text=source.txt').count() > 0) { explorerFrame = frame; break; }
}
console.log('explorer frame found:', !!explorerFrame);

// --- Test 1: internal move (drag source.txt onto target-folder) ---
const sourceItem = explorerFrame.locator('.file-item', { has: explorerFrame.locator('text=source.txt') });
const targetFolder = explorerFrame.locator('.file-item', { has: explorerFrame.locator('text=target-folder') });

const sourceBox = await sourceItem.boundingBox();
const targetBox = await targetFolder.boundingBox();
console.log('source box:', sourceBox, 'target box:', targetBox);

// Simulate HTML5 drag and drop via dispatched events with a shared DataTransfer object.
const moveResult = await explorerFrame.evaluate(() => {
  const items = Array.from(document.querySelectorAll('.file-item'));
  const source = items.find(el => el.querySelector('.file-name')?.textContent === 'source.txt');
  const target = items.find(el => el.querySelector('.file-name')?.textContent === 'target-folder');
  if (!source || !target) return { ok: false, error: 'elements not found', found: items.map(el => el.querySelector('.file-name')?.textContent) };

  const dataTransfer = new DataTransfer();
  source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  return { ok: true };
});
console.log('move drag/drop result:', JSON.stringify(moveResult));

await page.waitForTimeout(500);

const afterMove = await page.evaluate(() => {
  const fs = window.fs;
  return {
    sourceStillThere: fs.existsSync('/home/user1/dnd-test/source.txt'),
    movedIntoFolder: fs.existsSync('/home/user1/dnd-test/target-folder/source.txt'),
    movedContent: fs.existsSync('/home/user1/dnd-test/target-folder/source.txt') ? fs.readFileSync('/home/user1/dnd-test/target-folder/source.txt', 'utf-8') : null,
  };
});
console.log('after internal move:', JSON.stringify(afterMove));

// --- Test 2: external OS file drop into current dir ---
const externalDropResult = await explorerFrame.evaluate(() => {
  const main = document.querySelector('.file-item') ? document.querySelector('.file-item').closest('main') : document.querySelector('main');
  if (!main) return { ok: false, error: 'main not found' };

  const file = new File(['dropped from OS'], 'external.txt', { type: 'text/plain' });
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  main.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
  main.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  return { ok: true };
});
console.log('external drop result:', JSON.stringify(externalDropResult));

await page.waitForTimeout(500);

const afterExternalDrop = await page.evaluate(() => {
  const fs = window.fs;
  return {
    externalFileExists: fs.existsSync('/home/user1/dnd-test/external.txt'),
    externalContent: fs.existsSync('/home/user1/dnd-test/external.txt') ? fs.readFileSync('/home/user1/dnd-test/external.txt', 'utf-8') : null,
  };
});
console.log('after external drop:', JSON.stringify(afterExternalDrop));

// --- Test 3: external OS folder drop (recursive, via webkitGetAsEntry-like entries) ---
const folderDropResult = await explorerFrame.evaluate(() => {
  const main = document.querySelector('main');
  if (!main) return { ok: false, error: 'main not found' };

  // Fake a FileSystemDirectoryEntry/FileSystemFileEntry pair, since real
  // webkitGetAsEntry() requires an actual OS drag which Playwright can't simulate.
  const childFile = new File(['nested file content'], 'nested.txt', { type: 'text/plain' });
  const fileEntry = {
    isDirectory: false,
    isFile: true,
    name: 'nested.txt',
    file: (resolve) => resolve(childFile),
  };
  const dirEntry = {
    isDirectory: true,
    isFile: false,
    name: 'dropped-folder',
    createReader: () => {
      let done = false;
      return {
        readEntries: (cb) => {
          if (done) { cb([]); return; }
          done = true;
          cb([fileEntry]);
        },
      };
    },
  };

  const dataTransfer = new DataTransfer();
  // dataTransfer.items can't hold arbitrary objects, so stub webkitGetAsEntry
  // on a minimal items-like structure by monkey-patching the DataTransfer instance.
  const fakeFile = new File([''], 'placeholder', { type: 'application/x-directory' });
  dataTransfer.items.add(fakeFile);
  Object.defineProperty(dataTransfer.items[0], 'webkitGetAsEntry', { value: () => dirEntry });

  main.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
  main.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  return { ok: true };
});
console.log('folder drop result:', JSON.stringify(folderDropResult));

await page.waitForTimeout(500);

const afterFolderDrop = await page.evaluate(() => {
  const fs = window.fs;
  return {
    folderExists: fs.existsSync('/home/user1/dnd-test/dropped-folder'),
    nestedFileExists: fs.existsSync('/home/user1/dnd-test/dropped-folder/nested.txt'),
    nestedContent: fs.existsSync('/home/user1/dnd-test/dropped-folder/nested.txt') ? fs.readFileSync('/home/user1/dnd-test/dropped-folder/nested.txt', 'utf-8') : null,
  };
});
console.log('after folder drop:', JSON.stringify(afterFolderDrop));

await page.screenshot({ path: 'testing/screenshots/explorer-drag-drop.png' });
console.log('errors:', errors);

await browser.close();
