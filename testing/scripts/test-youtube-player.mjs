import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT = process.env.PORT || 8108;

const APP_DIR = '/opt/apps/youtube-player';
const MAIN_JS = fs.readFileSync(path.join(REPO_ROOT, 'docs/public/mount/opt/apps/youtube-player/main.js'), 'utf8');
const MAIN_HTML = fs.readFileSync(path.join(REPO_ROOT, 'docs/public/mount/opt/apps/youtube-player/main.html'), 'utf8');

const SCREENSHOT_DIR = path.join(REPO_ROOT, 'testing/screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.log(`FAIL: ${name}${extra !== undefined ? ' -- ' + JSON.stringify(extra) : ''}`);
  }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto(`http://localhost:${PORT}`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  // Poll for boot to actually finish rather than a fixed sleep — under heavy parallel load
  // (multiple dev servers/agents running at once) a fixed wait isn't always long enough.
  for (let t0 = Date.now(); Date.now() - t0 < 60000; ) {
    if (await page.evaluate(() => !!window.platform && !!window.platform.host).catch(() => false)) break;
    await page.waitForTimeout(1000);
  }

  // Inject the app's files into the running VFS manually (it isn't in the
  // shipped meta.json yet — this app is still being reviewed/wired in).
  await page.evaluate(({ appDir, mainJs, mainHtml }) => {
    const fs = window.platform.host.getFS();
    function mkdirpSync(dirPath) {
      const parts = dirPath.split('/').filter(Boolean);
      let cur = '';
      for (const part of parts) {
        cur += '/' + part;
        try { fs.mkdirSync(cur); } catch (e) { if (e.code !== 'EEXIST') throw e; }
      }
    }
    mkdirpSync(appDir);
    fs.writeFileSync(`${appDir}/main.js`, mainJs);
    fs.writeFileSync(`${appDir}/main.html`, mainHtml);
    // Also wipe any previous history file/dir from an earlier test run so
    // the "persists correctly" check below reflects only this run.
    function rmrf(p) {
      try {
        const st = fs.statSync(p);
        if (st.isDirectory()) { fs.readdirSync(p).forEach((n) => rmrf(p + '/' + n)); fs.rmdirSync(p); }
        else fs.unlinkSync(p);
      } catch (_) {}
    }
    rmrf('/home/user1/.local/share/youtube-player');
  }, { appDir: APP_DIR, mainJs: MAIN_JS, mainHtml: MAIN_HTML });

  // Register the command, then open a window for it. Under heavy parallel load the
  // layout module's 'open-window' service can still be registering during boot — retry
  // instead of a single one-shot call.
  await page.evaluate((appDir) => { window.platform.host.exec(window.platform, `${appDir}/main.js`); }, APP_DIR);
  let frame = null;
  for (let attempt = 0; attempt < 20 && !frame; attempt++) {
    await page.evaluate(() => {
      // execCommand's command string runs as an async IIFE, so a failure (the layout
      // service not registered yet, this early in boot) rejects a Promise rather than
      // throwing synchronously — catch that too, or it surfaces as an unhandled rejection.
      try { Promise.resolve(window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.youtube-player'))", window.platform)).catch(() => {}); } catch (_) {}
    });
    await page.waitForTimeout(1000);
    for (const fr of page.frames()) {
      if (fr.url().includes('youtube-player/main.html')) { frame = fr; break; }
    }
  }
  check('app window loads main.html in an iframe', !!frame);
  if (!frame) {
    console.log(`${pass} passed, ${fail} failed`);
    await browser.close();
    process.exit(1);
  }

  // Re-find the frame helper — per project testing conventions, frame refs
  // found before a DOM-mutating action can go stale afterward.
  function findFrame() {
    for (const fr of page.frames()) {
      if (fr.url().includes('youtube-player/main.html')) return fr;
    }
    return null;
  }

  await frame.waitForFunction(() => !!window.__youtubePlayerApp, null, { timeout: 5000 }).catch(() => {});

  const VIDEO_ID = 'dQw4w9WgXcQ';
  const PLAYLIST_ID = 'PLxyz1234567890';

  const urlFormats = [
    { label: 'watch?v= form', input: `https://www.youtube.com/watch?v=${VIDEO_ID}&feature=share` },
    { label: 'youtu.be short form', input: `https://youtu.be/${VIDEO_ID}?t=42` },
    { label: 'embed form', input: `https://www.youtube.com/embed/${VIDEO_ID}` },
    { label: 'bare 11-char id', input: VIDEO_ID },
    { label: 'params in reversed order', input: `https://www.youtube.com/watch?feature=share&v=${VIDEO_ID}` },
    { label: 'nocookie domain', input: `https://www.youtube-nocookie.com/embed/${VIDEO_ID}` },
  ];

  for (const { label, input } of urlFormats) {
    const f = findFrame();
    const result = await f.evaluate((raw) => {
      const parsed = window.__youtubePlayerApp.parseYouTubeInput(raw);
      window.__youtubePlayerApp.loadFromInput(raw);
      const src = document.getElementById('video-frame').src;
      return { parsed, src };
    }, input);
    const expectedSrc = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`;
    check(
      `${label}: extracts video id ${VIDEO_ID}`,
      result.parsed.videoId === VIDEO_ID,
      result.parsed
    );
    check(
      `${label}: embed src is correct`,
      result.src === expectedSrc,
      result.src
    );
  }

  // Playlist form: video id + list param should both end up in the embed src.
  {
    const f = findFrame();
    const raw = `https://www.youtube.com/watch?v=${VIDEO_ID}&list=${PLAYLIST_ID}&index=3`;
    const result = await f.evaluate((raw) => {
      const parsed = window.__youtubePlayerApp.parseYouTubeInput(raw);
      window.__youtubePlayerApp.loadFromInput(raw);
      const src = document.getElementById('video-frame').src;
      return { parsed, src };
    }, raw);
    const expectedSrc = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?list=${PLAYLIST_ID}`;
    check('playlist form: extracts both video id and playlist id', result.parsed.videoId === VIDEO_ID && result.parsed.playlistId === PLAYLIST_ID, result.parsed);
    check('playlist form: embed src includes ?list=', result.src === expectedSrc, result.src);
  }

  // Invalid input: inline error shown, iframe src untouched (not "loaded").
  {
    const f = findFrame();
    // First load something valid so the iframe has a known-good src.
    await f.evaluate((raw) => window.__youtubePlayerApp.loadFromInput(raw), `https://youtu.be/${VIDEO_ID}`);
    const before = await f.evaluate(() => document.getElementById('video-frame').src);

    const invalidInputs = ['not a youtube link at all', 'https://example.com/watch?v=123', 'short'];
    for (const bad of invalidInputs) {
      const result = await f.evaluate((raw) => {
        const input = document.getElementById('url-input');
        input.value = raw;
        document.getElementById('play-btn').click();
        return {
          errorText: document.getElementById('error-row').textContent,
          src: document.getElementById('video-frame').src,
        };
      }, bad);
      check(`invalid input "${bad}" shows an inline error`, !!result.errorText && result.errorText.length > 0, result.errorText);
      check(`invalid input "${bad}" does not change the embed src`, result.src === before, { before, after: result.src });
    }
  }

  // History: after playing videos above, history should contain entries and
  // be persisted to the VFS path documented in CLAUDE.md.
  {
    const historyFromVfs = await page.evaluate(() => {
      const fs = window.platform.host.getFS();
      const p = '/home/user1/.local/share/youtube-player/history.json';
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    });
    check('history.json exists at the documented VFS path', Array.isArray(historyFromVfs), historyFromVfs);
    check('history.json is capped and non-empty', !!historyFromVfs && historyFromVfs.length > 0 && historyFromVfs.length <= 20, historyFromVfs && historyFromVfs.length);
    if (historyFromVfs && historyFromVfs.length) {
      const e = historyFromVfs[0];
      check('history entries have expected shape (videoId, input, playedAt)',
        typeof e.playedAt === 'number' && (typeof e.videoId === 'string' || e.videoId === null) && typeof e.input === 'string',
        e);
    }
  }

  // Clicking a history entry reloads that same video id, and — since it plays the exact
  // same {videoId, playlistId} that row already represents — must move it to the top
  // in place rather than adding a second, identical row (the reported bug).
  {
    const f = findFrame();
    const beforeClick = await f.evaluate((expectedId) => Array.from(document.querySelectorAll('.hist-title')).filter((el) => el.textContent === expectedId).length, VIDEO_ID);
    const clickResult = await f.evaluate((expectedId) => {
      const items = Array.from(document.querySelectorAll('.hist-item'));
      const target = items.find((el) => el.querySelector('.hist-title')?.textContent === expectedId);
      if (!target) return { found: false };
      // Clear the src first so we can prove the click actually re-set it.
      document.getElementById('video-frame').src = 'about:blank';
      target.click();
      return { found: true, src: document.getElementById('video-frame').src };
    }, VIDEO_ID);
    check('a history entry for the video id exists in the list', clickResult.found, clickResult);
    check('clicking a history entry reloads the same video id', clickResult.src === `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`, clickResult.src);

    const afterClick = await f.evaluate((expectedId) => Array.from(document.querySelectorAll('.hist-title')).filter((el) => el.textContent === expectedId).length, VIDEO_ID);
    check('clicking a history entry does not add a duplicate row for that exact entry', afterClick === beforeClick, { beforeClick, afterClick });
    // Click the SAME row again (same identity twice in a row) — the clearest form of the
    // reported bug — and confirm the count still doesn't grow.
    await f.evaluate((expectedId) => {
      const items = Array.from(document.querySelectorAll('.hist-item'));
      const target = items.find((el) => el.querySelector('.hist-title')?.textContent === expectedId);
      if (target) target.click();
    }, VIDEO_ID);
    const afterSecondClick = await f.evaluate((expectedId) => Array.from(document.querySelectorAll('.hist-title')).filter((el) => el.textContent === expectedId).length, VIDEO_ID);
    check('clicking it again still does not duplicate it', afterSecondClick === beforeClick, { beforeClick, afterSecondClick });
  }

  check('no uncaught page errors during the run', pageErrors.length === 0, pageErrors);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'youtube-player.png') });
  const f = findFrame();
  if (f) {
    const frameEl = await f.frameElement();
    await frameEl.screenshot({ path: path.join(SCREENSHOT_DIR, 'youtube-player-app.png') }).catch(() => {});
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
