/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/core/ipc.ts":
/*!*************************!*\
  !*** ./src/core/ipc.ts ***!
  \*************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   broadcastIpcEvent: () => (/* binding */ broadcastIpcEvent),
/* harmony export */   initIpc: () => (/* binding */ initIpc),
/* harmony export */   registerIpcHandler: () => (/* binding */ registerIpcHandler)
/* harmony export */ });
// Host-side IPC router — handles postMessage calls from sandboxed iframes.
// Pairs with /usr/lib/ipc.js (VFS client library).
var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const handlers = new Map();
function registerIpcHandler(event, handler) {
    handlers.set(event, handler);
}
function broadcastIpcEvent(event, data) {
    document.querySelectorAll('iframe').forEach(f => {
        var _a;
        try {
            (_a = f.contentWindow) === null || _a === void 0 ? void 0 : _a.postMessage({ type: 'wos-ipc-event', event, data }, '*');
        }
        catch (_) { }
    });
}
function initIpc(fs) {
    window.addEventListener('message', (e) => __awaiter(this, void 0, void 0, function* () {
        if (!e.data || e.data.type !== 'wos-ipc')
            return;
        const { id, event, data } = e.data;
        const source = e.source;
        if (!source)
            return;
        const handler = handlers.get(event);
        if (!handler) {
            source.postMessage({ type: 'wos-ipc-response', id, error: `Unknown IPC event: ${event}` }, '*');
            return;
        }
        try {
            const result = yield handler(data, source);
            source.postMessage({ type: 'wos-ipc-response', id, result: result !== null && result !== void 0 ? result : null }, '*');
        }
        catch (err) {
            source.postMessage({ type: 'wos-ipc-response', id, error: String(err) }, '*');
        }
    }));
    registerIpcHandler('fs.read', (d) => Array.from(fs.readFileSync(d.path)));
    registerIpcHandler('fs.readText', (d) => fs.readFileSync(d.path, 'utf8'));
    registerIpcHandler('fs.write', (d) => {
        const content = d.content;
        if (typeof content === 'string')
            fs.writeFileSync(d.path, content);
        else
            fs.writeFileSync(d.path, Buffer.from(content));
        return true;
    });
    registerIpcHandler('fs.list', (d) => fs.readdirSync(d.path));
    registerIpcHandler('fs.exists', (d) => fs.existsSync(d.path));
    registerIpcHandler('fs.mkdir', (d) => { fs.mkdirSync(d.path, { recursive: true }); return true; });
    registerIpcHandler('fs.rm', (d) => { fs.unlinkSync(d.path); return true; });
    registerIpcHandler('fs.stat', (d) => {
        var _a;
        const s = fs.statSync(d.path);
        return { isDirectory: s.isDirectory(), size: (_a = s.size) !== null && _a !== void 0 ? _a : 0 };
    });
}


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
/*!**********************!*\
  !*** ./src/index.ts ***!
  \**********************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _core_ipc__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./core/ipc */ "./src/core/ipc.ts");
var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};

const __BOOTSTRAP_SCRIPT_PATH_KEY__ = '__BOOTSTRAP_SCRIPT_PATH__';
// Which storage backend the virtual filesystem persists to: 'indexeddb' (default,
// GB-scale) or 'localstorage' (~5-10MB, used by older versions of this app). The
// choice is read from this localStorage key, and can be overridden (and persisted)
// via the `?fsBackend=indexeddb|localstorage` query param. Settings.html's "Storage"
// page reads/writes the same key/param names.
const FS_BACKEND_STORAGE_KEY = '__app_fs_backend__';
const FS_BACKEND_QUERY_PARAM = 'fsBackend';
const resolveFsBackend = () => {
    const fromQuery = new URLSearchParams(window.location.search).get(FS_BACKEND_QUERY_PARAM);
    if (fromQuery === 'indexeddb' || fromQuery === 'localstorage') {
        localStorage.setItem(FS_BACKEND_STORAGE_KEY, fromQuery);
        return fromQuery;
    }
    return localStorage.getItem(FS_BACKEND_STORAGE_KEY) === 'localstorage' ? 'localstorage' : 'indexeddb';
};
const loadBootstrapScript = (storage) => {
    const bootstrap_script_path = storage.getItem(__BOOTSTRAP_SCRIPT_PATH_KEY__) || "/remote.bundle.js";
    if (!bootstrap_script_path)
        return;
    const script = window.document.createElement('script');
    script.src = bootstrap_script_path;
    window.document.head.appendChild(script);
};
const initWindow = () => {
    // Boot log — phases are pushed here; readable from Settings > Boot Log via window.__bootLog.
    // @ts-ignore
    window.__bootLog = [];
    const bootLog = (label, startMs, error) => {
        // @ts-ignore
        window.__bootLog.push({ label, durationMs: Date.now() - startMs, error });
    };
    // @ts-ignore
    window.BrowserFS.install(window);
    const defaultDirs = [
        '/home',
        '/home/user1',
        '/home/user1/apps',
        '/home/user1/tools',
        '/home/user1/projects',
        '/home/user1/quotes',
        '/mnt',
        // '/home/user1/projects/Snake.html', // Specific project file (not a directory, but included for completeness)
        // '/home/user1/projects/WebGL.html', // Specific project file (not a directory, but included for completeness)
        // '/home/user1/projects/WebGL-Earth.html', // Specific project file (not a directory, but included for completeness)
        '/usr',
        '/usr/bin',
        '/usr/lib',
        '/usr/local',
        '/usr/share/',
        '/usr/share/icons/',
        '/bin',
        // '/root',
        // '/media',
        '/etc',
        '/etc/wm',
        '/etc/pkg',
        '/opt',
        '/opt/apps',
        '/proc',
        // '/lib',                        // Existing system directories
        // '/mnt',
        // '/run',
        '/srv',
        '/sys',
        '/tmp',
        '/var',
        '/var/log',
        '/var/spool'
    ];
    // LocalStorage has a ~5-10MB quota, far too small for this app's filesystem
    // (and for mounted local folders). Use IndexedDB (often GB-scale) for everything
    // instead. IndexedDB is async-only, so mirror it behind an InMemory filesystem
    // to keep the synchronous `fs` API working.
    const createBackend = (Ctor, opts) => new Promise((resolve, reject) => Ctor.Create(opts, (err, fs) => err ? reject(err) : resolve(fs)));
    // Creates an IndexedDB-backed filesystem mirrored behind an InMemory filesystem,
    // so it can be used synchronously while being persisted to IndexedDB (storeName).
    const createIndexedDBMirror = (Backend, storeName) => __awaiter(void 0, void 0, void 0, function* () {
        const idbFS = yield createBackend(Backend.IndexedDB, { storeName });
        yield new Promise((resolve, reject) => idbFS.makeRootDirectory((err) => err ? reject(err) : resolve()));
        const memFS = yield createBackend(Backend.InMemory, {});
        return createBackend(Backend.AsyncMirror, { sync: memFS, async: idbFS });
    });
    const fsReady = (() => __awaiter(void 0, void 0, void 0, function* () {
        const t0 = Date.now();
        try {
            // @ts-ignore
            const Backend = window.BrowserFS.FileSystem;
            const fsBackend = resolveFsBackend();
            let mfs;
            if (fsBackend === 'localstorage') {
                // LocalStorage is a single global synchronous key-value store (no
                // namespacing), so only '/' is backed by it; '/tmp' and '/mnt' are
                // in-memory (ephemeral) to avoid key collisions.
                const rootFS = yield createBackend(Backend.LocalStorage, {});
                const tmpFS = yield createBackend(Backend.InMemory, {});
                const mntFS = yield createBackend(Backend.InMemory, {});
                mfs = yield createBackend(Backend.MountableFileSystem, { '/': rootFS, '/tmp': tmpFS, '/mnt': mntFS });
            }
            else {
                const rootFS = yield createIndexedDBMirror(Backend, 'fs');
                const tmpFS = yield createIndexedDBMirror(Backend, 'tmp');
                const mntFS = yield createIndexedDBMirror(Backend, 'mnt');
                mfs = yield createBackend(Backend.MountableFileSystem, { '/': rootFS, '/tmp': tmpFS, '/mnt': mntFS });
            }
            // @ts-ignore
            window.BrowserFS.initialize(mfs);
            bootLog(`VFS init (${fsBackend})`, t0);
            const fs = window.require('fs');
            // @ts-ignore
            window.fs = fs;
            (0,_core_ipc__WEBPACK_IMPORTED_MODULE_0__.initIpc)(fs);
            defaultDirs.forEach(dir => {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir);
                }
            });
            const metaFilePath = '/meta.json';
            const metaFileServerPath = '/public/mount/meta.json';
            const isMetaFileExist = fs.existsSync(metaFilePath);
            let defaultFiles = [];
            if (isMetaFileExist) {
                const metaFileRawContent = fs.readFileSync(metaFilePath);
                defaultFiles = JSON.parse(metaFileRawContent);
            }
            const ignoreMetaReload = defaultFiles.find(item => item.path === metaFilePath && item.force_reload === false);
            if (!ignoreMetaReload)
                defaultFiles = yield (yield fetch(metaFileServerPath)).json();
            const t1 = Date.now();
            let fileCount = 0;
            defaultFiles.forEach((item) => __awaiter(void 0, void 0, void 0, function* () {
                if (fs.existsSync(item.path) && !item.force_reload)
                    return;
                const path = item.file.startsWith('http') ? item.file : `/public/mount${item.file.startsWith('/') ? '' : '/'}${item.file}`;
                const fileData = yield (yield fetch(path)).arrayBuffer();
                const dir = item.path.slice(0, item.path.lastIndexOf('/')) || "/";
                if (!fs.existsSync(dir)) {
                    const parts = dir.split('/').filter(Boolean);
                    let cur = '';
                    for (const part of parts) {
                        cur += '/' + part;
                        try {
                            fs.mkdirSync(cur);
                        }
                        catch (e) {
                            if (e.code !== 'EEXIST')
                                throw e;
                        }
                    }
                }
                fs.writeFileSync(item.path, Buffer.from(fileData));
                fileCount++;
                // navigator.serviceWorker.controller?.postMessage({type: 'fs/file-added', payload: {file: item.path}});
            }));
            bootLog(`meta.json bootstrap (${fileCount} files written)`, t1);
        }
        catch (err) {
            bootLog('VFS error', t0, String(err));
            alert(err);
        }
    }))();
    if (navigator.serviceWorker) {
        navigator.serviceWorker.register('/sw.bundle.js', { scope: '/' }).then(function (reg) {
            if (reg.active)
                console.log('serviceworker installed');
            // On first install the SW isn't controlling the page yet — reload once it activates.
            const worker = reg.installing || reg.waiting;
            if (worker) {
                worker.addEventListener('statechange', () => {
                    if (worker.state === 'activated')
                        location.reload();
                });
            }
            navigator.serviceWorker.addEventListener('message', event => {
                // console.log(event.data)
                var _a, _b, _c;
                //@ts-ignore
                const fs = window.fs;
                if (!fs) {
                    (_a = navigator.serviceWorker.controller) === null || _a === void 0 ? void 0 : _a.postMessage({ type: 'fs/reply', payload: { data: "File system not mounted!", error: "File system not mounted!", request_id: event.data.payload.request_id } });
                }
                else if (fs.existsSync(event.data.payload.path)) {
                    (_b = navigator.serviceWorker.controller) === null || _b === void 0 ? void 0 : _b.postMessage({ type: 'fs/reply', payload: { data: fs.readFileSync(event.data.payload.path), error: "", request_id: event.data.payload.request_id } });
                }
                else {
                    (_c = navigator.serviceWorker.controller) === null || _c === void 0 ? void 0 : _c.postMessage({ type: 'fs/reply', payload: { data: `File not found! ${event.data.payload.path}`, error: "File not found!", request_id: event.data.payload.request_id } });
                }
            });
        })
            .catch(function (err) {
            console.log('registration failed: ' + err);
        });
    }
    return fsReady;
};
window.addEventListener('load', () => __awaiter(void 0, void 0, void 0, function* () {
    yield initWindow();
    loadBootstrapScript(localStorage);
}));

})();

/******/ })()
;
//# sourceMappingURL=bootstrapper.bundle.js.map