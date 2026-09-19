// Verifies the pkg-manager polish work: uninstall confirmation, update awareness
// (installed vs registry version), and rollback via file backups.
//
// Never touches docs/registry.json — instead it downgrades one already-installed
// app's version directly in the runtime vfs (/etc/pkg/installed.json), so the app
// sees the *real*, unmodified registry.json as "ahead" of the (artificially lowered)
// installed version. It also plants a unique marker string into that app's on-disk
// file so update/rollback can be verified by actual file contents, not just the
// version field.
import { chromium } from 'playwright';
import fs from 'fs';

const SCREENSHOT_DIR = 'testing/screenshots/pkg-manager-update-rollback';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const TARGET_APP_ID = 'image-viewer';
const TARGET_APP_DIR = '/opt/apps/image-viewer';
const TARGET_MAIN = '/opt/apps/image-viewer/main.js';
const DOWNGRADED_VERSION = '0.5.0';
const MARKER = '// TEST_MARKER_V0_5_0_' + Date.now();

const UNINSTALL_APP_ID = 'audio-player';
const UNINSTALL_APP_DIR = '/opt/apps/audio-player';

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}`);
  if (!cond) failures++;
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', err => console.log('PAGE ERROR:', err.message.slice(0, 200)));

console.log('Loading app...');
await page.goto('http://localhost:8081/', { waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(6000);

// ── Helpers ──────────────────────────────────────────────────────────────────

const findFrame = async () => {
  for (const frame of page.frames()) {
    try {
      const count = await frame.locator('.pkg-root').count();
      if (count > 0) return frame;
    } catch (_) {}
  }
  return null;
};

// Find the dock's own `about:srcdoc` iframe and click its "App Manager" item.
// (The classic `.taskbar` element with `[aria-label="open-pkg-manager"]` still exists
// in the DOM but is collapsed to zero size once the dock app is active — this repo
// recently migrated the desktop launcher to a pluggable dock, see
// docs/public/mount/opt/apps/dock/. That app is owned by a parallel worktree/agent and
// must not be touched here, so this test just adapts to click through it instead.)
const findDockItem = async (title) => {
  for (const frame of page.frames()) {
    try {
      // The dock's icon items carry their name in the `title` attribute (the visible
      // text is just the material-symbols icon ligature, e.g. "package_2").
      const loc = frame.locator(`#dock .item[title="${title}"]`);
      if (await loc.count() > 0) return loc.first();
    } catch (_) {}
  }
  return null;
};

const openPkgManager = async () => {
  let item = null;
  for (let i = 0; i < 30 && !item; i++) {
    item = await findDockItem('App Manager');
    if (!item) await page.waitForTimeout(1000);
  }
  if (!item) {
    console.log('DEBUG: dock item not found. Frame URLs:', page.frames().map(f => f.url()));
    await page.screenshot({ path: `${SCREENSHOT_DIR}/debug-no-dock.png`, fullPage: true });
    throw new Error('Dock "App Manager" item not found');
  }
  await item.click({ force: true });
  await page.waitForTimeout(1500);
  const frame = await findFrame();
  if (!frame) throw new Error('pkg-manager frame not found');
  return frame;
};

const goToInstalledTab = async (frame) => {
  const nav = frame.locator('.pkg-nav-item', { hasText: 'Installed' });
  await nav.click({ force: true });
  await page.waitForTimeout(800);
};

// Registry apps (needed to detect updates) are fetched async — poll until the
// Discover tab's card grid (or empty state) settles, meaning fetchRegistries resolved.
const waitForRegistryFetch = async (frame) => {
  // Give the mount effect a moment to flip loading=true before polling for it to
  // clear again — otherwise we can race the very first render (loading still false)
  // and return immediately, before the fetch has even started.
  await page.waitForTimeout(800);
  for (let i = 0; i < 15; i++) {
    const stillLoading = await frame.locator('.pkg-loading').count().catch(() => 0);
    if (stillLoading === 0) return;
    await page.waitForTimeout(500);
  }
};

// Read a JSON/text file from the vfs via the running page's platform instance.
const readVfsFile = (path) => page.evaluate((p) => {
  try {
    const fs = window.platform.host.getFS();
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return null;
  }
}, path);

const vfsExists = (path) => page.evaluate((p) => {
  try { return window.platform.host.getFS().existsSync(p); } catch (e) { return false; }
}, path);

// ── Step 1: downgrade the target app's installed version + plant a marker ──────

console.log('\n--- Setup: downgrading installed version + planting file marker ---');
const setup = await page.evaluate(({ appId, appDir, mainFile, downgraded, marker }) => {
  const fs = window.platform.host.getFS();
  const INSTALLED_PATH = '/etc/pkg/installed.json';
  const installed = JSON.parse(fs.readFileSync(INSTALLED_PATH, 'utf8') || '[]');
  const idx = installed.findIndex(p => p.id === appId);
  if (idx < 0) return { ok: false, reason: `app ${appId} not found in installed.json` };
  const originalVersion = installed[idx].version;
  installed[idx] = { ...installed[idx], version: downgraded };
  fs.writeFileSync(INSTALLED_PATH, JSON.stringify(installed, null, 2));

  // Append a unique marker to the app's main file so we can prove update/rollback
  // actually swap file contents, not just the version field.
  const original = fs.readFileSync(mainFile, 'utf8');
  fs.writeFileSync(mainFile, original + '\n' + marker + '\n');

  return { ok: true, originalVersion };
}, { appId: TARGET_APP_ID, appDir: TARGET_APP_DIR, mainFile: TARGET_MAIN, downgraded: DOWNGRADED_VERSION, marker: MARKER });

check('downgrade + marker setup succeeded', setup.ok);
console.log('  original installed version was:', setup.originalVersion);

// Fetch the real registry.json's version for image-viewer, exactly like the app does.
const registryVersion = await page.evaluate(async (appId) => {
  const resp = await fetch(window.top.location.origin + '/registry.json');
  const data = await resp.json();
  const app = (data.apps || []).find(a => a.id === appId);
  return app ? app.version : null;
}, TARGET_APP_ID);
console.log('  live registry.json version:', registryVersion);
check('registry version differs from downgraded installed version', registryVersion && registryVersion !== DOWNGRADED_VERSION);

// Deliberately do NOT reload here: /opt/apps/image-viewer/main.js is one of the
// `force_reload: true` bootstrap files in meta.json, so a reload would immediately
// wipe our test marker back to the pristine shipped content before we ever get to
// verify the backup/rollback round-trip. Since pkg-manager hasn't been opened yet,
// its first mount will read the just-mutated installed.json directly from the live
// in-memory vfs — no reload needed.

// ── Step 2: open pkg-manager, verify update-available badge ────────────────────

console.log('\n--- Update awareness ---');
let frame = await openPkgManager();
// Discover is the default tab and kicks off fetchRegistries() on mount — wait for it
// to resolve before switching to Installed (which relies on that same data for the
// update-available comparison).
await waitForRegistryFetch(frame);
await goToInstalledTab(frame);
await page.screenshot({ path: `${SCREENSHOT_DIR}/01-installed-before-update.png` });

const targetRow = frame.locator('.pkg-list-row', { hasText: 'Image Viewer' });
check('Image Viewer row present', await targetRow.count() > 0);

const badge = targetRow.locator('.pkg-update-badge');
check('Update available badge shown', await badge.count() > 0);

const updateBtn = targetRow.locator('button', { hasText: 'Update' });
check('Update button shown', await updateBtn.count() > 0);

await page.screenshot({ path: `${SCREENSHOT_DIR}/02-update-badge-closeup.png` });

// ── Step 3: uninstall confirmation flow (decline, then confirm) on a different app ──

console.log('\n--- Uninstall confirmation ---');
const uninstallRow = frame.locator('.pkg-list-row', { hasText: 'Audio Player' });
check('Audio Player row present', await uninstallRow.count() > 0);

await uninstallRow.locator('button', { hasText: 'Uninstall' }).click({ force: true });
await page.waitForTimeout(400);

const modal = frame.locator('.pkg-modal-overlay');
check('Confirm modal appears on Uninstall click', await modal.count() > 0);
const modalText = await modal.innerText().catch(() => '');
check('Confirm modal mentions the app name', modalText.includes('Audio Player'));
await page.screenshot({ path: `${SCREENSHOT_DIR}/03-uninstall-confirm-dialog.png` });

// Decline
await modal.locator('button', { hasText: 'Cancel' }).click({ force: true });
await page.waitForTimeout(400);
check('Modal closes on Cancel', await frame.locator('.pkg-modal-overlay').count() === 0);
check('App still installed after declining (vfs)', await vfsExists(UNINSTALL_APP_DIR));
const installedAfterDecline = JSON.parse(await readVfsFile('/etc/pkg/installed.json'));
check('App still in installed.json after declining', installedAfterDecline.some(p => p.id === UNINSTALL_APP_ID));

// Confirm
await uninstallRow.locator('button', { hasText: 'Uninstall' }).click({ force: true });
await page.waitForTimeout(400);
await frame.locator('.pkg-modal-overlay button', { hasText: 'Uninstall' }).click({ force: true });
await page.waitForTimeout(1200);

check('Modal closes after confirming', await frame.locator('.pkg-modal-overlay').count() === 0);
check('App removed from vfs after confirming', !(await vfsExists(UNINSTALL_APP_DIR)));
const installedAfterConfirm = JSON.parse(await readVfsFile('/etc/pkg/installed.json'));
check('App removed from installed.json after confirming', !installedAfterConfirm.some(p => p.id === UNINSTALL_APP_ID));

// ── Step 4: perform the Update, verify backup + version bump + file contents ───

console.log('\n--- Update + backup ---');
await page.screenshot({ path: `${SCREENSHOT_DIR}/04-installed-after-uninstall.png` });

const targetRow2 = frame.locator('.pkg-list-row', { hasText: 'Image Viewer' });
await targetRow2.locator('button', { hasText: 'Update' }).click({ force: true });
await page.waitForTimeout(2500);

const afterUpdateInstalled = JSON.parse(await readVfsFile('/etc/pkg/installed.json'));
const ivAfterUpdate = afterUpdateInstalled.find(p => p.id === TARGET_APP_ID);
check('installed.json version bumped to registry version', ivAfterUpdate && ivAfterUpdate.version === registryVersion);

const backupManifestRaw = await readVfsFile(`/etc/pkg/backups/${TARGET_APP_ID}/manifest.json`);
check('backup manifest.json created', !!backupManifestRaw);
const backupManifest = backupManifestRaw ? JSON.parse(backupManifestRaw) : [];
check('backup manifest records the old (downgraded) version', backupManifest.some(b => b.version === DOWNGRADED_VERSION));

const backedUpFile = await readVfsFile(`/etc/pkg/backups/${TARGET_APP_ID}/${DOWNGRADED_VERSION}/main.js`);
check('backup file exists under /etc/pkg/backups/<id>/<old-version>/', !!backedUpFile);
check('backup file contains the pre-update marker (captured old content)', !!backedUpFile && backedUpFile.includes(MARKER));

const liveFileAfterUpdate = await readVfsFile(TARGET_MAIN);
check('live app file no longer has the marker (fresh content installed)', !!liveFileAfterUpdate && !liveFileAfterUpdate.includes(MARKER));

await goToInstalledTab(frame);
await page.screenshot({ path: `${SCREENSHOT_DIR}/05-installed-after-update.png` });

const rowAfterUpdate = frame.locator('.pkg-list-row', { hasText: 'Image Viewer' });
check('Update badge gone after updating', await rowAfterUpdate.locator('.pkg-update-badge').count() === 0);
const rollbackBtn = rowAfterUpdate.locator('button', { hasText: 'Rollback' });
check('Rollback button now shown', await rollbackBtn.count() > 0);

// ── Step 5: rollback, verify restored content + reverted version ───────────────

console.log('\n--- Rollback ---');
await rollbackBtn.click({ force: true });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SCREENSHOT_DIR}/06-installed-after-rollback.png` });

const afterRollbackInstalled = JSON.parse(await readVfsFile('/etc/pkg/installed.json'));
const ivAfterRollback = afterRollbackInstalled.find(p => p.id === TARGET_APP_ID);
check('installed.json version reverted to old (downgraded) version', ivAfterRollback && ivAfterRollback.version === DOWNGRADED_VERSION);

const liveFileAfterRollback = await readVfsFile(TARGET_MAIN);
check('live app file restored to pre-update content (marker back)', !!liveFileAfterRollback && liveFileAfterRollback.includes(MARKER));

// ── Sanity: registry.json on disk was never touched ─────────────────────────────

console.log('\n--- Sanity: registry.json untouched ---');
const registryOnDisk = fs.readFileSync('docs/registry.json', 'utf8');
const registryJson = JSON.parse(registryOnDisk);
const ivInRegistry = (registryJson.apps || []).find(a => a.id === TARGET_APP_ID);
check('docs/registry.json image-viewer version unchanged (still the real shipped version)', ivInRegistry && ivInRegistry.version === registryVersion);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
