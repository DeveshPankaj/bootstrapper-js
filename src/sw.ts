import { normalizePath, isInside } from './kernel/path-policy'

// Legacy Cache Storage bucket. Nothing writes it legitimately, and any
// same-origin script could caches.put() a poisoned entry into it, so it's no
// longer read; activate deletes whatever is left in it (audit KRN-7 / NET-1).
const cacheName = 'WebOS_v1';

self.addEventListener('install', (event: Event | any) => {
    (self as any).skipWaiting();
});

self.addEventListener('activate', (event: Event | any) => {
    event.waitUntil(
        caches.delete(cacheName).catch(() => false)
            .then(() => (self as any).clients.claim())
    );
});




// Request ids are random (audit KRN-8): a reply has to name a request that
// exists and come from a client that was asked for it.
const newRequestId = (): string => {
    const c: Crypto = (self as any).crypto
    if (typeof c.randomUUID === 'function') return c.randomUUID()
    const bytes = c.getRandomValues(new Uint8Array(16))
    return Array.prototype.map.call(bytes, (b: number) => (b + 0x100).toString(16).slice(1)).join('')
}

// Injected into every /opt/apps/**/*.html response so sandboxed iframes get
// a postMessage-based AppSDK without needing same-origin access.
// Each method queues its call until the parent sends the wos:sdk-init message
// with a MessagePort — then the queue drains and all subsequent calls go direct.
// The port is taken once, and only from the window hosting the app (audit
// KRN-6, WIN-10): its parent, or a same-origin window that is neither this
// page nor one of its own child frames — the OS posts it from the layout
// bundle's realm, which the app sees as ev.source. A child frame (an embed
// inside the app) racing in, a cross-origin sender, or any other message is
// ignored and leaves the listener in place.
const APPSDK_BOOTSTRAP = `<script id="wos-appsdk-bootstrap">(function(){var _p=null,_q=[],_d=Object.create(null),_i=0;function _c(m,a){return new Promise(function(s,f){var id=++_i;_d[id]={s:s,f:f};var msg={t:m,id:id,a:a};_p?_p.postMessage(msg):_q.push(msg)})}window.AppSDK={readText:function(p){return _c('r',[p])},writeText:function(p,t){return _c('w',[p,t])},mkdir:function(p){return _c('d',[p])},remove:function(p){return _c('rm',[p])},list:function(p){return _c('ls',[p])},exists:function(p){return _c('e',[p])},stat:function(p){return _c('st',[p])},rename:function(a,b){return _c('mv',[a,b])},setTitle:function(t){return _c('title',[t])},log:function(m){return _c('log',[m])}};function _host(ev){var s=ev.source;if(!s||s===window)return false;if(s===window.parent)return true;if(ev.origin!==location.origin)return false;try{for(var w=s,n=0;n<64;n++){if(w===window)return false;if(w===w.parent)return true;w=w.parent}}catch(_){}return false}function _init(ev){var d=ev.data;if(!d||d.type!=='wos:sdk-init'||!ev.ports||!ev.ports[0]||!_host(ev))return;window.removeEventListener('message',_init);_p=ev.ports[0];_p.onmessage=function(e){var r=e.data,cb=r&&_d[r.id];if(!cb)return;delete _d[r.id];r.err?cb.f(new Error(r.err)):cb.s(r.r)};for(var i=0;i<_q.length;i++)_p.postMessage(_q[i]);_q=[]}window.addEventListener('message',_init)})()</script>`;

const injectAppSdkBootstrap = (html: string): string => {
    if (html.includes('<head>')) return html.replace('<head>', '<head>' + APPSDK_BOOTSTRAP)
    const m = html.match(/<head\s[^>]*>/)
    if (m) return html.replace(m[0], m[0] + APPSDK_BOOTSTRAP)
    return APPSDK_BOOTSTRAP + html
}

// A file request in flight. It is sent to every top-level window client (the
// OS tabs); the first successful reply wins. An error reply settles it once
// every asked client has errored, or ERROR_GRACE_MS after the first error
// (tabs that never answer, e.g. a deep-link handoff tab). Nobody answering
// at all settles it as an error after REQUEST_TIMEOUT_MS.
type PendingRequest = {
    asked: Set<string>
    errored: Set<string>
    settle: (data: string | Uint8Array, error: string) => void
    graceTimer?: ReturnType<typeof setTimeout>
}
const clientRequests: Map<string, PendingRequest> = new Map();
const ERROR_GRACE_MS = 1500
const REQUEST_TIMEOUT_MS = 10000

// Asks the OS tabs for a vfs file. Resolves false when there is no tab to ask.
const requestFromClients = (vfsPath: string, settle: PendingRequest['settle']): Promise<boolean> =>
    (self as any).clients.matchAll({ type: 'window' }).then((all: any[]) => {
        // Only top-level OS tabs serve files — never a nested frame (an app or
        // a page inside the OS), whatever it is.
        const tabs = all.filter(c => c && c.frameType === 'top-level' && typeof c.id === 'string')
        if (!tabs.length) return false
        const request_id = newRequestId()
        let timeout: ReturnType<typeof setTimeout> | undefined
        const finish = (data: string | Uint8Array, error: string) => {
            const pending = clientRequests.get(request_id)
            if (!pending) return
            clientRequests.delete(request_id)
            clearTimeout(timeout)
            if (pending.graceTimer) clearTimeout(pending.graceTimer)
            settle(data, error)
        }
        clientRequests.set(request_id, { asked: new Set(tabs.map(c => c.id)), errored: new Set(), settle: finish })
        timeout = setTimeout(() => finish('', 'no reply'), REQUEST_TIMEOUT_MS)
        tabs.forEach(client => {
            try { client.postMessage({ type: 'fs/file-request', payload: { path: vfsPath, request_id } }) } catch (_) {}
        })
        return true
    })

// Content types by extension. Anything unknown is application/octet-stream
// (with nosniff below, never guessed as HTML or script).
const MIME_TYPES = new Map<string, string>([
    ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.gif', 'image/gif'],
    ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'], ['.bmp', 'image/bmp'], ['.ico', 'image/x-icon'],
    ['.avif', 'image/avif'],
    ['.html', 'text/html; charset=utf-8'], ['.htm', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json'], ['.map', 'application/json'],
    ['.ipynb', 'application/json'], ['.wasm', 'application/wasm'], ['.xml', 'application/xml'],
    ['.txt', 'text/plain; charset=utf-8'], ['.md', 'text/markdown; charset=utf-8'], ['.csv', 'text/csv; charset=utf-8'],
    ['.run', 'text/plain; charset=utf-8'],
    ['.mp3', 'audio/mpeg'], ['.wav', 'audio/wav'], ['.ogg', 'audio/ogg'], ['.opus', 'audio/ogg'],
    ['.flac', 'audio/flac'], ['.m4a', 'audio/mp4'], ['.aac', 'audio/aac'],
    ['.mp4', 'video/mp4'], ['.webm', 'video/webm'],
    ['.pdf', 'application/pdf'],
    ['.woff', 'font/woff'], ['.woff2', 'font/woff2'], ['.ttf', 'font/ttf'], ['.otf', 'font/otf'],
])

const getMIMEtype = (vfsPath: string): string => {
    const name = vfsPath.slice(vfsPath.lastIndexOf('/') + 1).toLowerCase()
    const dot = name.lastIndexOf('.')
    return (dot > 0 && MIME_TYPES.get(name.slice(dot))) || 'application/octet-stream'
}

// Every /(sw)/ and /cache/ response is data, never a same-origin document
// (decisions.md D11, audit KRN-7): an opaque-origin sandbox, no sniffing, no
// cross-origin embedding.
const SANDBOX_CSP = 'sandbox allow-scripts allow-forms allow-modals'

const vfsHeaders = (contentType: string, sandbox: boolean): Headers => {
    const headers = new Headers({
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
    })
    if (sandbox) headers.set('Content-Security-Policy', SANDBOX_CSP)
    return headers
}

const textResponse = (status: number, text: string, sandbox: boolean) =>
    new Response(text, { status, headers: vfsHeaders('text/plain; charset=utf-8', sandbox) })

// Network fallbacks get the same headers. A 404 becomes plain text, so a
// missing file never turns into the server's 404 page (the OS boot page).
const fetchWrapped = (url: string, contentType: string, sandbox: boolean): Promise<Response> =>
    fetch(url).then(res => {
        if (res.status === 404) return textResponse(404, 'Not found', sandbox)
        const body = [101, 204, 205, 304].includes(res.status) ? null : res.body
        return new Response(body, { status: res.status, statusText: res.statusText, headers: vfsHeaders(contentType, sandbox) })
    }, () => textResponse(503, 'Service unavailable', sandbox))

const encodePath = (vfsPath: string) => vfsPath.split('/').map(encodeURIComponent).join('/')

const NO_CLIENT_MESSAGE = "ERROR: no client available to serve the request. (if it's first time you are seeing this error, then try reloding app after saving your changes)"

const handleVfsRequest = (event: any, prefix: '/(sw)' | '/cache'): Promise<Response> => {
    const _url = new URL(event.request.url)
    // The path that is checked is the path that is read: decoded, then
    // normalised (an encoded '%2F..%2F' can't climb out of a prefix).
    let vfsPath: string
    try { vfsPath = normalizePath(decodeURIComponent(_url.pathname.slice(prefix.length))) }
    catch (_) { return Promise.resolve(textResponse(400, 'Bad request', true)) }

    const mimeType = getMIMEtype(vfsPath)
    // Transitional exception (D11, phase 1 only): first-party app pages under
    // /opt/apps stay same-origin when loaded in an iframe, because they still
    // get window.platform from their window. Top-level navigations and
    // everything else are always sandboxed.
    const sandbox = !(prefix === '/(sw)' && event.request.destination === 'iframe' && isInside('/opt/apps', vfsPath))

    return new Promise<Response>((resolve) => {
        const settle = (fileData: string | Uint8Array, error: string) => {
            if (error) {
                resolve(prefix === '/(sw)'
                    ? fetchWrapped(encodePath(vfsPath), mimeType, sandbox)
                    : textResponse(404, 'Not found', sandbox))
                return
            }
            // Inject AppSDK bootstrap into app HTML so sandboxed
            // iframes get a postMessage-based AppSDK without
            // needing same-origin (window.top) access.
            // fileData may arrive as Uint8Array (Buffer from BrowserFS
            // readFileSync without 'utf-8' encoding), so decode first.
            const isAppHtml = prefix === '/(sw)' && mimeType.startsWith('text/html') && isInside('/opt/apps', vfsPath)
            let body: string | Uint8Array = fileData
            if (isAppHtml) {
                const htmlStr = typeof fileData === 'string'
                    ? fileData
                    : new TextDecoder().decode(fileData as Uint8Array)
                body = injectAppSdkBootstrap(htmlStr)
            }
            resolve(new Response(body as BodyInit, { headers: vfsHeaders(mimeType, sandbox) }))
        }

        const noClient = () => resolve(prefix === '/(sw)'
            ? fetchWrapped('/public/mount' + encodePath(vfsPath), mimeType, sandbox)
            : new Response(`<h1>${NO_CLIENT_MESSAGE}</h1>`, { headers: vfsHeaders('text/html; charset=utf-8', true) }))

        requestFromClients(vfsPath, settle).then(asked => { if (!asked) noClient() }, noClient)
    })
}



// fs/reply from an OS tab (src/kernel/sw-bridge.ts). Accepted only for a
// pending request id, and only from a client that request was sent to.
self.addEventListener('message', (event: any) => {
    const msg = event && event.data
    if (!msg || typeof msg !== 'object' || msg.type !== 'fs/reply') return
    const payload = msg.payload
    if (!payload || typeof payload !== 'object' || typeof payload.request_id !== 'string') return
    const pending = clientRequests.get(payload.request_id)
    const sourceId = event.source && typeof event.source.id === 'string' ? event.source.id : ''
    if (!pending || !pending.asked.has(sourceId) || pending.errored.has(sourceId)) return
    const data = payload.data
    if (!payload.error) {
        if (typeof data === 'string' || data instanceof Uint8Array) pending.settle(data, '')
        else if (data instanceof ArrayBuffer) pending.settle(new Uint8Array(data), '')
        else pending.settle('', 'bad reply')
        return
    }
    pending.errored.add(sourceId)
    const error = String(payload.error)
    if (pending.errored.size >= pending.asked.size) { pending.settle('', error); return }
    if (!pending.graceTimer) pending.graceTimer = setTimeout(() => pending.settle('', error), ERROR_GRACE_MS)
});



self.addEventListener('fetch', function(event: Event | any) {
    const url = event.request.url as string;
    const _url = new URL(url)
    if(_url.pathname.startsWith('/(sw)/')) {
        (self as any).clients.get(event.clientId).then((client: any) => {
            if(!client) return;
            const client_url = new URL(client.url)
            console.log(`${client_url.href || '[root]'} --> ${_url.pathname}`)
        })
        event.respondWith(handleVfsRequest(event, '/(sw)'))
        return
    }
    if(_url.pathname === '/cache' || _url.pathname.startsWith('/cache/')) {
        event.respondWith(handleVfsRequest(event, '/cache'))
    }
})
