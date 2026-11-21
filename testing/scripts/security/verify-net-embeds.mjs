// NET-2 (TODO 1E.12): third-party frames our apps embed (YouTube, fast.com, code-server) get a
// restrictive sandbox that still lets them work — never allow-top-navigation* or
// allow-popups-to-escape-sandbox — plus a referrer policy.
// Run: node testing/scripts/security/verify-net-embeds.mjs   (dev server on :8080; YouTube/fast.com
// reachability is reported but only required for the "still works" checks when online)
import { launchBrowser, bootPage, openWindow, appFrame, waitFor, waitForCommand, check, finish, sleep } from './verify-net-lib.mjs';

const FORBIDDEN = ['allow-top-navigation', 'allow-top-navigation-by-user-activation', 'allow-top-navigation-to-custom-protocols', 'allow-popups-to-escape-sandbox', 'allow-storage-access-by-user-activation'];
const sandboxOk = (attr, must) => {
  const tokens = String(attr || '').split(/\s+/).filter(Boolean);
  return attr != null && must.every((t) => tokens.includes(t)) && !tokens.some((t) => FORBIDDEN.includes(t));
};
const browser = await launchBrowser();
const page = await bootPage(browser);
const topUrl = page.url();

// Finds a nested frame whose URL matches and tries to navigate the OS from inside it.
async function tryTopNavigation(frameUrlPart) {
  const fr = page.frames().find((f) => f.url().includes(frameUrlPart));
  if (!fr) return 'frame-not-loaded';
  const r = await fr.evaluate(() => { try { top.location.href = 'https://example.com/#pwned'; return 'no-exception'; } catch (e) { return 'blocked: ' + e.name; } }).catch((e) => 'eval-failed: ' + e.message.slice(0, 80));
  await sleep(800);
  return r + (page.url() === topUrl ? ' (top unchanged)' : ' (TOP NAVIGATED)');
}

// ── YouTube player ──
await waitForCommand(page, 'ui.youtube-player');
await openWindow(page, 'ui.youtube-player');
const yt = await appFrame(page, 'youtube-player/main.html');
await waitFor(() => yt.evaluate(() => !!window.__youtubePlayerApp), 15000);
await yt.evaluate(() => window.__youtubePlayerApp.loadFromInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
const ytAttrs = await yt.evaluate(() => { const f = document.getElementById('video-frame'); return { sandbox: f.getAttribute('sandbox'), referrer: f.getAttribute('referrerpolicy'), src: f.src }; });
check('NET-2: YouTube frame is sandboxed (scripts/own origin/forms/popups/presentation only)', sandboxOk(ytAttrs.sandbox, ['allow-scripts', 'allow-same-origin', 'allow-forms']), JSON.stringify(ytAttrs));
check('NET-2: YouTube frame sends only the origin as referrer (YouTube embeds need one)', ytAttrs.referrer === 'strict-origin-when-cross-origin', ytAttrs.referrer);
const ytLoaded = await waitFor(() => page.frames().some((f) => f.url().includes('youtube-nocookie.com/embed/dQw4w9WgXcQ')), 20000);
if (ytLoaded) {
  const player = await waitFor(async () => { const f = page.frames().find((x) => x.url().includes('youtube-nocookie.com/embed/')); return !!f && await f.evaluate(() => !!document.querySelector('.html5-video-player, #movie_player')).catch(() => false); }, 25000);
  check('NET-2: the YouTube player still starts inside its sandbox', player);
  const nav = await tryTopNavigation('youtube-nocookie.com/embed/');
  check('NET-2: the YouTube frame cannot navigate the OS window', /top unchanged/.test(nav), nav);
} else console.log('INFO  YouTube not reachable from here — skipped the live-player checks');

// ── Speed test (fast.com) ──
await openWindow(page, 'ui.iframe', '/opt/apps/speed-test/main.html');
const st = await appFrame(page, 'speed-test/main.html');
const stAttrs = await st.evaluate(() => { const f = document.querySelector('iframe'); return { sandbox: f.getAttribute('sandbox'), referrer: f.getAttribute('referrerpolicy'), src: f.src }; });
check('NET-2: fast.com frame is sandboxed (no popups, no top navigation)', sandboxOk(stAttrs.sandbox, ['allow-scripts', 'allow-same-origin']) && !/allow-popups/.test(stAttrs.sandbox), JSON.stringify(stAttrs));
check('NET-2: fast.com frame gets no referrer', stAttrs.referrer === 'no-referrer');
if (await waitFor(() => page.frames().some((f) => f.url().startsWith('https://fast.com')), 20000)) {
  const running = await waitFor(async () => { const f = page.frames().find((x) => x.url().startsWith('https://fast.com')); return !!f && await f.evaluate(() => !!document.querySelector('#speed-value, .speed-results-container')).catch(() => false); }, 25000);
  check('NET-2: the fast.com speed test still runs inside its sandbox', running);
  const nav = await tryTopNavigation('fast.com');
  check('NET-2: the fast.com frame cannot navigate the OS window', /top unchanged/.test(nav), nav);
} else console.log('INFO  fast.com not reachable from here — skipped the live checks');

// ── VS Code online (code-server) ──
await openWindow(page, 'ui.iframe', '/opt/apps/vscode-online/main.html');
const vs = await appFrame(page, 'vscode-online/main.html');
const vsAttrs = await vs.evaluate(() => { const f = document.querySelector('iframe'); return { sandbox: f.getAttribute('sandbox'), referrer: f.getAttribute('referrerpolicy'), allow: f.getAttribute('allow') }; });
check('NET-2: code-server frame is sandboxed (no top navigation, no escaping popups)', sandboxOk(vsAttrs.sandbox, ['allow-scripts', 'allow-same-origin', 'allow-forms']), JSON.stringify(vsAttrs));
check('NET-2: code-server frame gets no referrer', vsAttrs.referrer === 'no-referrer');

check('no page errors', !page.__errors.length, page.__errors.join(' | '));
await finish(browser);
