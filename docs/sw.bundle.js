/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
var __webpack_exports__ = {};
/*!*******************!*\
  !*** ./src/sw.ts ***!
  \*******************/

const cacheName = 'WebOS_v1';
self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(cacheName));
    self.skipWaiting();
});
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});
let uid = 0;
const getUUID = () => {
    return `${++uid}`;
};
// Injected into every /opt/apps/**/*.html response so sandboxed iframes get
// a postMessage-based AppSDK without needing same-origin access.
// Each method queues its call until the parent sends the wos:sdk-init message
// with a MessagePort — then the queue drains and all subsequent calls go direct.
const APPSDK_BOOTSTRAP = `<script id="wos-appsdk-bootstrap">(function(){var _p=null,_q=[],_d={},_i=0;function _c(m,a){return new Promise(function(s,f){var id=++_i;_d[id]={s:s,f:f};var msg={t:m,id:id,a:a};_p?_p.postMessage(msg):_q.push(msg)})}window.AppSDK={readText:function(p){return _c('r',[p])},writeText:function(p,t){return _c('w',[p,t])},mkdir:function(p){return _c('d',[p])},remove:function(p){return _c('rm',[p])},list:function(p){return _c('ls',[p])},exists:function(p){return _c('e',[p])},stat:function(p){return _c('st',[p])},rename:function(a,b){return _c('mv',[a,b])},setTitle:function(t){return _c('title',[t])},log:function(m){return _c('log',[m])}};window.addEventListener('message',function(ev){if(!ev.data||ev.data.type!=='wos:sdk-init'||!ev.ports||!ev.ports[0])return;_p=ev.ports[0];_p.onmessage=function(e){var d=e.data,cb=_d[d.id];if(!cb)return;delete _d[d.id];d.err?cb.f(new Error(d.err)):cb.s(d.r)};for(var i=0;i<_q.length;i++)_p.postMessage(_q[i]);_q=[]},{once:true})})()</script>`;
const injectAppSdkBootstrap = (html) => {
    if (html.includes('<head>'))
        return html.replace('<head>', '<head>' + APPSDK_BOOTSTRAP);
    const m = html.match(/<head\s[^>]*>/);
    if (m)
        return html.replace(m[0], m[0] + APPSDK_BOOTSTRAP);
    return APPSDK_BOOTSTRAP + html;
};
const clientRequests = new Map();
const getMIMEtype = (fileName) => {
    if (fileName.endsWith('.png'))
        return 'image/png';
    if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg'))
        return 'image/jpeg';
    if (fileName.endsWith('.gif'))
        return 'image/gif';
    if (fileName.endsWith('.webp'))
        return 'image/webp';
    if (fileName.endsWith('.svg'))
        return 'image/svg+xml';
    if (fileName.endsWith('.bmp'))
        return 'image/bmp';
    if (fileName.endsWith('.ico'))
        return 'image/x-icon';
    if (fileName.endsWith('.avif'))
        return 'image/avif';
    if (fileName.endsWith('.html'))
        return 'text/html';
    if (fileName.endsWith('.js'))
        return 'application/javascript';
    if (fileName.endsWith('.json'))
        return 'application/json';
};
self.addEventListener('message', event => {
    // console.log(event.data)
    if (event.data.type === 'fs/reply') {
        const callback = clientRequests.get(event.data.payload.request_id);
        callback === null || callback === void 0 ? void 0 : callback(event.data.payload.data, event.data.payload.error);
    }
    // clients.matchAll().then(clients => {
    //     clients.forEach(client => {
    //         client.postMessage(event.data)
    //     })
    // })
}, {});
self.addEventListener('fetch', function (event) {
    const url = event.request.url;
    // console.log(url)
    // if (url.endsWith('style.css')){
    //    event.respondWith('your_file_response')
    // }
    // if(url.endsWith('.png')) {
    //     event.respondWith(
    //         fetch('https://play-lh.googleusercontent.com/1-hPxafOxdYpYZEOKzNIkSP43HXCNftVJVttoo4ucl7rsMASXW3Xr6GlXURCubE1tA=w3840-h2160-rw')
    //     )
    // }
    // if(url.endsWith('.png')) {
    //     event.respondWith(
    //         fetch('/wp-4.jpeg')
    //     )
    // }
    // if(url.endsWith('react-dom.js')) {
    //     event.respondWith(
    //         fetch('https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js')
    //     )
    // }
    const _url = new URL(url);
    if (_url.pathname.startsWith('/(sw)/')) {
        // console.log(_url.pathname)
        clients.get(event.clientId).then(client => {
            if (!client)
                return;
            const client_url = new URL(client.url);
            console.log(`${client_url.href || '[root]'} --> ${_url.pathname}`);
        });
        // event.respondWith(new Response("<h1>we are working on interprocess message passing</h1>", {headers: {'Content-Type': "text/html"}}))
        event.respondWith(caches.open(cacheName).then((cache) => {
            // Respond with the image from the cache or from the network
            return cache.match(url).then((cachedResponse) => {
                if (!cachedResponse) {
                    return new Promise((resolve, reject) => {
                        const request_id = getUUID();
                        const vfsPath = decodeURIComponent(_url.pathname.slice('/(sw)'.length));
                        clientRequests.set(request_id, (fileData, error) => {
                            clientRequests.delete(request_id);
                            if (error) {
                                resolve(fetch(_url.pathname.slice('/(sw)'.length)));
                            }
                            else {
                                const mimeType = getMIMEtype(url);
                                // Inject AppSDK bootstrap into app HTML so sandboxed
                                // iframes get a postMessage-based AppSDK without
                                // needing same-origin (window.top) access.
                                // fileData may arrive as Uint8Array (Buffer from BrowserFS
                                // readFileSync without 'utf-8' encoding), so decode first.
                                const isAppHtml = mimeType === 'text/html' && vfsPath.startsWith('/opt/apps/');
                                let body = fileData;
                                if (isAppHtml) {
                                    const htmlStr = typeof fileData === 'string'
                                        ? fileData
                                        : new TextDecoder().decode(fileData);
                                    body = injectAppSdkBootstrap(htmlStr);
                                }
                                resolve(new Response(body, { headers: { 'Content-Type': mimeType } }));
                            }
                        });
                        clients.matchAll().then(clients => {
                            clients.forEach(client => {
                                client.postMessage({ type: 'fs/file-request', payload: { path: vfsPath, request_id } });
                            });
                            if (clients.length === 0) {
                                resolve(fetch('/public/mount' + vfsPath));
                            }
                        });
                        // resolve(new Response("<h1>400</h1>", {headers: {'Content-Type': 'text/html'}}))
                    });
                }
                return cachedResponse !== null && cachedResponse !== void 0 ? cachedResponse : new Response("<h1>404</h1>", { headers: { 'Content-Type': getMIMEtype(url) } });
            });
        })
        // new Response(localStorage.getItem('__script_for_testing__')??"", {
        //     headers: {'Content-Type': 'text/html'}
        // })
        );
    }
    if (_url.pathname.startsWith('/cache')) {
        event.respondWith(caches.open(cacheName).then((cache) => {
            // Respond with the image from the cache or from the network
            return cache.match(url).then((cachedResponse) => {
                if (!cachedResponse) {
                    console.log(_url.pathname);
                    return new Promise((resolve, reject) => {
                        const request_id = getUUID();
                        clientRequests.set(request_id, (fileData) => {
                            clientRequests.delete(request_id);
                            resolve(new Response(fileData, { headers: { 'Content-Type': getMIMEtype(url) } }));
                        });
                        clients.matchAll().then(clients => {
                            clients.forEach(client => {
                                client.postMessage({ type: 'fs/file-request', payload: { path: decodeURIComponent(_url.pathname.slice('/cache'.length)), request_id } });
                            });
                            if (clients.length === 0) {
                                resolve(new Response("<h1>ERROR: no client available to serve the request. (if it's first time you are seeing this error, then try reloding app after saving your changes)</h1>", { headers: { 'Content-Type': 'text/html' } }));
                            }
                        });
                        // resolve(new Response("<h1>400</h1>", {headers: {'Content-Type': 'text/html'}}))
                    });
                }
                return cachedResponse !== null && cachedResponse !== void 0 ? cachedResponse : new Response("<h1>404</h1>", { headers: { 'Content-Type': getMIMEtype(url) } });
            });
        })
        // new Response(localStorage.getItem('__script_for_testing__')??"", {
        //     headers: {'Content-Type': 'text/html'}
        // })
        );
        // event.respondWith(
        //     fetch('https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js')
        // )
    }
});

/******/ })()
;
//# sourceMappingURL=sw.bundle.js.map