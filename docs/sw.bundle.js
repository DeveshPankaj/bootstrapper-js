/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/kernel/path-policy.ts"
/*!***********************************!*\
  !*** ./src/kernel/path-policy.ts ***!
  \***********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   APP_ID_RE: () => (/* binding */ APP_ID_RE),
/* harmony export */   KERNEL_OWNED_PATHS: () => (/* binding */ KERNEL_OWNED_PATHS),
/* harmony export */   PathPolicyError: () => (/* binding */ PathPolicyError),
/* harmony export */   isInside: () => (/* binding */ isInside),
/* harmony export */   isKernelOwned: () => (/* binding */ isKernelOwned),
/* harmony export */   isValidAppId: () => (/* binding */ isValidAppId),
/* harmony export */   isValidName: () => (/* binding */ isValidName),
/* harmony export */   normalizePath: () => (/* binding */ normalizePath),
/* harmony export */   pathPolicy: () => (/* binding */ pathPolicy),
/* harmony export */   safeJoin: () => (/* binding */ safeJoin)
/* harmony export */ });
// Ring 0 — path policy (documentation/security/decisions.md, D6).
//
// The one implementation of path normalisation and containment checks. Every
// caller that turns untrusted input into a vfs path uses it: namespace ACLs,
// package installs, archive extraction, WebRTC / SSH mounts, shell commands.
// vfs scripts reach it as `platform.host.pathPolicy` (compiled, so a vfs
// write can't weaken it). path-policy.test.ts is the spec.
//
// No imports on purpose — this module must stay dependency-free so anything
// (kernel, platform, host, SW-side code, tests) can import it without cycles.
class PathPolicyError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PathPolicyError';
    }
}
// C0 controls, DEL and C1 controls: never valid in a vfs path or name.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;
/**
 * Resolves `.`, `..` and repeated slashes in a vfs path. Relative paths resolve
 * against `cwd`. `..` above the root stays at the root (POSIX semantics).
 * Rejects non-strings, control characters (incl. NUL) and backslashes.
 * Returns an absolute path with no trailing slash ('/' for the root).
 */
function normalizePath(path, cwd = '/') {
    if (typeof path !== 'string')
        throw new PathPolicyError('path must be a string');
    if (CONTROL_CHARS.test(path))
        throw new PathPolicyError('control character in path');
    if (path.includes('\\'))
        throw new PathPolicyError('backslash in path');
    const full = path.startsWith('/') ? path : `${cwd}/${path}`;
    const out = [];
    for (const segment of full.split('/')) {
        if (segment === '' || segment === '.')
            continue;
        if (segment === '..') {
            out.pop();
            continue;
        }
        out.push(segment);
    }
    return '/' + out.join('/');
}
/**
 * True when `path` is `base` or lies under it, compared segment by segment
 * ('/a/bc' is not inside '/a/b'). Both sides are normalised first.
 */
function isInside(base, path) {
    const b = normalizePath(base);
    const p = normalizePath(path);
    if (b === '/')
        return true;
    return p === b || p.startsWith(b + '/');
}
/**
 * True for a single, safe path segment coming from an untrusted source: a
 * peer's file listing, an SSH host, an archive entry segment, a package file.
 */
function isValidName(name, maxLength = 255) {
    return typeof name === 'string'
        && name.length > 0
        && name.length <= maxLength
        && name !== '.'
        && name !== '..'
        && !name.includes('/')
        && !name.includes('\\')
        && !CONTROL_CHARS.test(name);
}
/**
 * Joins an untrusted relative path (it may contain '/'-separated segments, like
 * an archive entry 'dir/file.txt') onto `base`. Throws on absolute paths, '..'
 * or otherwise invalid segments, and on any result outside `base`.
 */
function safeJoin(base, relative) {
    if (typeof relative !== 'string' || relative === '')
        throw new PathPolicyError('empty path');
    if (relative.startsWith('/'))
        throw new PathPolicyError(`absolute path not allowed: ${relative}`);
    const segments = relative.split('/').filter(s => s !== '' && s !== '.');
    if (segments.length === 0)
        throw new PathPolicyError(`empty path: ${relative}`);
    for (const segment of segments) {
        if (!isValidName(segment))
            throw new PathPolicyError(`invalid path segment: ${JSON.stringify(segment)}`);
    }
    const b = normalizePath(base);
    const full = normalizePath(`${b}/${segments.join('/')}`);
    if (!isInside(b, full) || full === b)
        throw new PathPolicyError(`path escapes ${b}: ${relative}`);
    return full;
}
/**
 * System paths only the kernel may write (invariant I4). Enforced for every
 * caller that goes through a namespace (ProxyFS, the IPC bus, the broker).
 */
const KERNEL_OWNED_PATHS = Object.freeze([
    '/bin', '/boot', '/etc', '/opt', '/usr', '/meta.json', '/.initd.run', '/home/user1/initd.run',
]);
function isKernelOwned(path) {
    const p = normalizePath(path);
    return KERNEL_OWNED_PATHS.some(k => isInside(k, p));
}
/** App ids double as directory names under /opt/apps and ~/.local/share. */
const APP_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
function isValidAppId(id) {
    return typeof id === 'string' && APP_ID_RE.test(id) && !id.includes('..');
}
/** Frozen bundle of the helpers, exposed to vfs code as `platform.host.pathPolicy`. */
const pathPolicy = Object.freeze({
    normalizePath, isInside, isValidName, safeJoin, isKernelOwned, isValidAppId,
    KERNEL_OWNED_PATHS, APP_ID_RE, PathPolicyError,
});


/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	const __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		const cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		const module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		if (!(moduleId in __webpack_modules__)) {
/******/ 			delete __webpack_module_cache__[moduleId];
/******/ 			const e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	// define getter/value functions for harmony exports
/******/ 	__webpack_require__.d = (exports, definition) => {
/******/ 		for(var key in definition) {
/******/ 			if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 				Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 			}
/******/ 		}
/******/ 	};
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop));
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = (exports) => {
/******/ 		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/ 	
/************************************************************************/
let __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!*******************!*\
  !*** ./src/sw.ts ***!
  \*******************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _kernel_path_policy__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./kernel/path-policy */ "./src/kernel/path-policy.ts");

// Legacy Cache Storage bucket. Nothing writes it legitimately, and any
// same-origin script could caches.put() a poisoned entry into it, so it's no
// longer read; activate deletes whatever is left in it (audit KRN-7 / NET-1).
const cacheName = 'WebOS_v1';
self.addEventListener('install', (event) => {
    self.skipWaiting();
});
self.addEventListener('activate', (event) => {
    event.waitUntil(caches.delete(cacheName).catch(() => false)
        .then(() => self.clients.claim()));
});
// Request ids are random (audit KRN-8): a reply has to name a request that
// exists and come from a client that was asked for it.
const newRequestId = () => {
    const c = self.crypto;
    if (typeof c.randomUUID === 'function')
        return c.randomUUID();
    const bytes = c.getRandomValues(new Uint8Array(16));
    return Array.prototype.map.call(bytes, (b) => (b + 0x100).toString(16).slice(1)).join('');
};
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
const injectAppSdkBootstrap = (html) => {
    if (html.includes('<head>'))
        return html.replace('<head>', '<head>' + APPSDK_BOOTSTRAP);
    const m = html.match(/<head\s[^>]*>/);
    if (m)
        return html.replace(m[0], m[0] + APPSDK_BOOTSTRAP);
    return APPSDK_BOOTSTRAP + html;
};
const clientRequests = new Map();
const ERROR_GRACE_MS = 1500;
const REQUEST_TIMEOUT_MS = 10000;
// Asks the OS tabs for a vfs file. Resolves false when there is no tab to ask.
const requestFromClients = (vfsPath, settle) => self.clients.matchAll({ type: 'window' }).then((all) => {
    // Only top-level OS tabs serve files — never a nested frame (an app or
    // a page inside the OS), whatever it is.
    const tabs = all.filter(c => c && c.frameType === 'top-level' && typeof c.id === 'string');
    if (!tabs.length)
        return false;
    const request_id = newRequestId();
    let timeout;
    const finish = (data, error) => {
        const pending = clientRequests.get(request_id);
        if (!pending)
            return;
        clientRequests.delete(request_id);
        clearTimeout(timeout);
        if (pending.graceTimer)
            clearTimeout(pending.graceTimer);
        settle(data, error);
    };
    clientRequests.set(request_id, { asked: new Set(tabs.map(c => c.id)), errored: new Set(), settle: finish });
    timeout = setTimeout(() => finish('', 'no reply'), REQUEST_TIMEOUT_MS);
    tabs.forEach(client => {
        try {
            client.postMessage({ type: 'fs/file-request', payload: { path: vfsPath, request_id } });
        }
        catch (_) { }
    });
    return true;
});
// Content types by extension. Anything unknown is application/octet-stream
// (with nosniff below, never guessed as HTML or script).
const MIME_TYPES = new Map([
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
]);
const getMIMEtype = (vfsPath) => {
    const name = vfsPath.slice(vfsPath.lastIndexOf('/') + 1).toLowerCase();
    const dot = name.lastIndexOf('.');
    return (dot > 0 && MIME_TYPES.get(name.slice(dot))) || 'application/octet-stream';
};
// Every /(sw)/ and /cache/ response is data, never a same-origin document
// (decisions.md D11, audit KRN-7): an opaque-origin sandbox, no sniffing, no
// cross-origin embedding.
const SANDBOX_CSP = 'sandbox allow-scripts allow-forms allow-modals';
const vfsHeaders = (contentType, sandbox) => {
    const headers = new Headers({
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
    });
    if (sandbox)
        headers.set('Content-Security-Policy', SANDBOX_CSP);
    return headers;
};
const textResponse = (status, text, sandbox) => new Response(text, { status, headers: vfsHeaders('text/plain; charset=utf-8', sandbox) });
// Network fallbacks get the same headers. A 404 becomes plain text, so a
// missing file never turns into the server's 404 page (the OS boot page).
const fetchWrapped = (url, contentType, sandbox) => fetch(url).then(res => {
    if (res.status === 404)
        return textResponse(404, 'Not found', sandbox);
    const body = [101, 204, 205, 304].includes(res.status) ? null : res.body;
    return new Response(body, { status: res.status, statusText: res.statusText, headers: vfsHeaders(contentType, sandbox) });
}, () => textResponse(503, 'Service unavailable', sandbox));
const encodePath = (vfsPath) => vfsPath.split('/').map(encodeURIComponent).join('/');
const NO_CLIENT_MESSAGE = "ERROR: no client available to serve the request. (if it's first time you are seeing this error, then try reloding app after saving your changes)";
const handleVfsRequest = (event, prefix) => {
    const _url = new URL(event.request.url);
    // The path that is checked is the path that is read: decoded, then
    // normalised (an encoded '%2F..%2F' can't climb out of a prefix).
    let vfsPath;
    try {
        vfsPath = (0,_kernel_path_policy__WEBPACK_IMPORTED_MODULE_0__.normalizePath)(decodeURIComponent(_url.pathname.slice(prefix.length)));
    }
    catch (_) {
        return Promise.resolve(textResponse(400, 'Bad request', true));
    }
    const mimeType = getMIMEtype(vfsPath);
    // Transitional exception (D11, phase 1 only): first-party app pages under
    // /opt/apps stay same-origin when loaded in an iframe, because they still
    // get window.platform from their window. Top-level navigations and
    // everything else are always sandboxed.
    const sandbox = !(prefix === '/(sw)' && event.request.destination === 'iframe' && (0,_kernel_path_policy__WEBPACK_IMPORTED_MODULE_0__.isInside)('/opt/apps', vfsPath));
    return new Promise((resolve) => {
        const settle = (fileData, error) => {
            if (error) {
                resolve(prefix === '/(sw)'
                    ? fetchWrapped(encodePath(vfsPath), mimeType, sandbox)
                    : textResponse(404, 'Not found', sandbox));
                return;
            }
            // Inject AppSDK bootstrap into app HTML so sandboxed
            // iframes get a postMessage-based AppSDK without
            // needing same-origin (window.top) access.
            // fileData may arrive as Uint8Array (Buffer from BrowserFS
            // readFileSync without 'utf-8' encoding), so decode first.
            const isAppHtml = prefix === '/(sw)' && mimeType.startsWith('text/html') && (0,_kernel_path_policy__WEBPACK_IMPORTED_MODULE_0__.isInside)('/opt/apps', vfsPath);
            let body = fileData;
            if (isAppHtml) {
                const htmlStr = typeof fileData === 'string'
                    ? fileData
                    : new TextDecoder().decode(fileData);
                body = injectAppSdkBootstrap(htmlStr);
            }
            resolve(new Response(body, { headers: vfsHeaders(mimeType, sandbox) }));
        };
        const noClient = () => resolve(prefix === '/(sw)'
            ? fetchWrapped('/public/mount' + encodePath(vfsPath), mimeType, sandbox)
            : new Response(`<h1>${NO_CLIENT_MESSAGE}</h1>`, { headers: vfsHeaders('text/html; charset=utf-8', true) }));
        requestFromClients(vfsPath, settle).then(asked => { if (!asked)
            noClient(); }, noClient);
    });
};
// fs/reply from an OS tab (src/kernel/sw-bridge.ts). Accepted only for a
// pending request id, and only from a client that request was sent to.
self.addEventListener('message', (event) => {
    const msg = event && event.data;
    if (!msg || typeof msg !== 'object' || msg.type !== 'fs/reply')
        return;
    const payload = msg.payload;
    if (!payload || typeof payload !== 'object' || typeof payload.request_id !== 'string')
        return;
    const pending = clientRequests.get(payload.request_id);
    const sourceId = event.source && typeof event.source.id === 'string' ? event.source.id : '';
    if (!pending || !pending.asked.has(sourceId) || pending.errored.has(sourceId))
        return;
    const data = payload.data;
    if (!payload.error) {
        if (typeof data === 'string' || data instanceof Uint8Array)
            pending.settle(data, '');
        else if (data instanceof ArrayBuffer)
            pending.settle(new Uint8Array(data), '');
        else
            pending.settle('', 'bad reply');
        return;
    }
    pending.errored.add(sourceId);
    const error = String(payload.error);
    if (pending.errored.size >= pending.asked.size) {
        pending.settle('', error);
        return;
    }
    if (!pending.graceTimer)
        pending.graceTimer = setTimeout(() => pending.settle('', error), ERROR_GRACE_MS);
});
self.addEventListener('fetch', function (event) {
    const url = event.request.url;
    const _url = new URL(url);
    if (_url.pathname.startsWith('/(sw)/')) {
        self.clients.get(event.clientId).then((client) => {
            if (!client)
                return;
            const client_url = new URL(client.url);
            console.log(`${client_url.href || '[root]'} --> ${_url.pathname}`);
        });
        event.respondWith(handleVfsRequest(event, '/(sw)'));
        return;
    }
    if (_url.pathname === '/cache' || _url.pathname.startsWith('/cache/')) {
        event.respondWith(handleVfsRequest(event, '/cache'));
    }
});

})();

/******/ })()
;
//# sourceMappingURL=sw.bundle.js.map