// NET-9 (TODO 1E.7): a received SVG never becomes a same-origin blob: document — download links
// are application/octet-stream, previews are <img>-only (SVG as a data: URL).
// Run: node testing/scripts/security/verify-net-svg.mjs   (dev server on :8080)
import { launchBrowser, bootPage, connectPair, waitFor, check, finish, sleep } from './verify-net-lib.mjs';

const browser = await launchBrowser();
const pA = await bootPage(browser), pB = await bootPage(browser);
const { fA, fB, idA } = await connectPair(pA, pB);

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30" onload="try{localStorage.setItem('svgpwn','1')}catch(e){};try{top.__svgpwn=1}catch(e){}"><rect width="40" height="30" fill="red"/><script>try{localStorage.setItem('svgpwn','2')}catch(e){}</script></svg>`;
await fB.evaluate(async ({ svg, a }) => {
  const app = window.__webrtcApp;
  const png = await new Promise((r) => { const c = document.createElement('canvas'); c.width = 8; c.height = 8; c.getContext('2d').fillRect(0, 0, 8, 8); c.toBlob(r, 'image/png'); });
  await app.sendFilesTo('dm:' + a, [new File([svg], 'evil.svg', { type: 'image/svg+xml' }), new File([png], 'ok.png', { type: 'image/png' })]);
}, { svg: SVG, a: idA });

const idB = await fA.evaluate(() => [...window.__webrtcApp.peers.keys()][0]);
check('both files arrive', await waitFor(() => fA.evaluate((b) => { const c = window.__webrtcApp.convs.get('dm:' + b); return !!c && c.messages.filter((m) => m.file && m.file.state === 'done').length === 2; }, idB), 20000));
await fA.evaluate((b) => { const items = [...document.querySelectorAll('#chat-list .item')]; const it = items.find((x) => /Bob/.test(x.textContent)); if (it) it.click(); }, idB);
await sleep(1200);

const inspect = (frame, key) => frame.evaluate(async (key) => {
  const app = window.__webrtcApp, c = app.convs.get(key);
  const typeOf = async (u) => { try { const r = await fetch(u); return r.headers.get('content-type'); } catch (e) { return 'ERR ' + e.message; } };
  const files = [];
  for (const m of c.messages.filter((x) => x.file)) files.push({ name: m.file.name, url: m.file.url, urlType: await typeOf(m.file.url), preview: (m.file.previewUrl || '').slice(0, 30), previewType: m.file.previewUrl && m.file.previewUrl.startsWith('blob:') ? await typeOf(m.file.previewUrl) : null });
  const blobLinks = [];
  for (const el of document.querySelectorAll('#messages a[href^="blob:"], #messages img[src^="blob:"]')) blobLinks.push({ tag: el.tagName, type: await typeOf(el.href || el.src) });
  const imgs = [...document.querySelectorAll('#messages img.preview')].map((i) => i.src.slice(0, 26));
  return { files, blobLinks, imgs };
}, key);

const a = await inspect(fA, 'dm:' + idB);
const svgA = a.files.find((x) => x.name === 'evil.svg'), pngA = a.files.find((x) => x.name === 'ok.png');
check('NET-9: received SVG download link is application/octet-stream', svgA && svgA.urlType === 'application/octet-stream', JSON.stringify(svgA));
check('NET-9: received SVG preview is a data: URL (opaque if opened), not a blob', svgA && svgA.preview.startsWith('data:image/svg+xml'), JSON.stringify(svgA));
check('NET-9: received PNG download link is octet-stream, preview a typed image blob', pngA && pngA.urlType === 'application/octet-stream' && pngA.previewType === 'image/png', JSON.stringify(pngA));
check('NET-9: no link or image in the chat points at an SVG/HTML blob', a.blobLinks.length > 0 && a.blobLinks.every((l) => !/svg|html/.test(l.type || '')), JSON.stringify(a.blobLinks));
check('NET-9: the SVG preview is rendered by an <img>', a.imgs.some((s) => s.startsWith('data:image/svg+xml')), JSON.stringify(a.imgs));

const b = await inspect(fB, 'dm:' + idA);
check('NET-9: the sender\'s own copy follows the same rules', b.files.every((x) => x.urlType === 'application/octet-stream') && b.files.find((x) => x.name === 'evil.svg').preview.startsWith('data:'), JSON.stringify(b.files));

// Opening the download link in a new tab must not render the SVG on the site's origin.
const ctxA = pA.context();
const tab = await ctxA.newPage();
const dl = tab.waitForEvent('download', { timeout: 8000 }).then(() => 'download').catch(() => 'no-download');
await tab.goto(svgA.url).catch(() => {});
const outcome = await dl;
await sleep(800);
const pwned = await pA.evaluate(() => ({ ls: localStorage.getItem('svgpwn'), top: window.__svgpwn === 1 }));
check('NET-9: opening the download link downloads instead of rendering', outcome === 'download', outcome);
check('NET-9: the SVG\'s script never ran on the site origin', pwned.ls === null && !pwned.top, JSON.stringify(pwned));
await tab.close().catch(() => {});

// Lightbox uses the same <img>-only preview.
await fA.evaluate(() => document.querySelector('#messages img.preview[src^="data:image/svg+xml"]')?.click());
const lb = await fA.evaluate(() => { const i = document.querySelector('.lightbox img'); return i ? i.src.slice(0, 20) : null; });
check('NET-9: the lightbox shows the SVG through <img> + data: URL', lb === 'data:image/svg+xml;b', String(lb));
await fA.evaluate(() => document.querySelector('.lightbox')?.click());

check('no page errors', !pA.__errors.length && !pB.__errors.length, [...pA.__errors, ...pB.__errors].join(' | '));
await finish(browser);
