/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/kernel/ipc-bus.ts":
/*!*******************************!*\
  !*** ./src/kernel/ipc-bus.ts ***!
  \*******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   broadcastIpcEvent: () => (/* binding */ broadcastIpcEvent),
/* harmony export */   initIpcBus: () => (/* binding */ initIpcBus),
/* harmony export */   registerIpcHandler: () => (/* binding */ registerIpcHandler),
/* harmony export */   registerWmBridge: () => (/* binding */ registerWmBridge)
/* harmony export */ });
// Ring 0 — IPC bus kernel module
// Raw postMessage router. All inter-process messaging goes through here.
// Platform (Ring 1) builds higher-level MessageBus on top of this.
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
function broadcastIpcEvent(event, data, targetDoc = document) {
    targetDoc.querySelectorAll('iframe').forEach(f => {
        var _a;
        try {
            (_a = f.contentWindow) === null || _a === void 0 ? void 0 : _a.postMessage({ type: 'wos-ipc-event', event, data }, '*');
        }
        catch (_) { }
    });
}
function registerWmBridge(getWindows, toggleWindow, mainWindow = window, getLaunchItems) {
    mainWindow.__wosWmBridge = {
        getWindows,
        toggleWindow,
        getLaunchItems: getLaunchItems !== null && getLaunchItems !== void 0 ? getLaunchItems : (() => []),
    };
}
function initIpcBus(fs) {
    if (!window.__wosIpcInit) {
        window.__wosIpcInit = true;
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
    }
    // Window manager bridge handlers
    registerIpcHandler('wm.getWindows', () => { var _a, _b; return (_b = (_a = window.__wosWmBridge) === null || _a === void 0 ? void 0 : _a.getWindows()) !== null && _b !== void 0 ? _b : []; });
    registerIpcHandler('wm.toggleWindow', (d) => { var _a; (_a = window.__wosWmBridge) === null || _a === void 0 ? void 0 : _a.toggleWindow(Number(d.pid)); return true; });
    registerIpcHandler('wm.getLaunchItems', () => { var _a, _b; return (_b = (_a = window.__wosWmBridge) === null || _a === void 0 ? void 0 : _a.getLaunchItems()) !== null && _b !== void 0 ? _b : []; });
    registerIpcHandler('wm.launch', (d) => { var _a, _b; (_b = (_a = window.__wosWmBridge) === null || _a === void 0 ? void 0 : _a.launch) === null || _b === void 0 ? void 0 : _b.call(_a, String(d.name)); return true; });
    // Dock bridge handlers
    registerIpcHandler('dock.registerSettings', (d) => {
        var _a, _b, _c, _d;
        if (window.__wosDockBridge) {
            window.__wosDockBridge.schema = (_a = d.schema) !== null && _a !== void 0 ? _a : [];
            window.__wosDockBridge.dockId = (_b = d.dockId) !== null && _b !== void 0 ? _b : '';
        }
        else {
            window.__wosDockBridge = { schema: (_c = d.schema) !== null && _c !== void 0 ? _c : [], dockId: (_d = d.dockId) !== null && _d !== void 0 ? _d : '', set: () => { } };
        }
        broadcastIpcEvent('dock.schemaChanged', { schema: window.__wosDockBridge.schema, dockId: window.__wosDockBridge.dockId });
        return true;
    });
    registerIpcHandler('dock.getSchema', () => window.__wosDockBridge
        ? { schema: window.__wosDockBridge.schema, dockId: window.__wosDockBridge.dockId }
        : { schema: [], dockId: '' });
    registerIpcHandler('dock.setSetting', (d) => {
        if (!window.__wosDockBridge)
            return false;
        const entry = window.__wosDockBridge.schema.find(e => e.key === d.key);
        if (entry)
            entry.value = d.value;
        broadcastIpcEvent('dock.settingChanged', { key: d.key, value: d.value });
        return true;
    });
    registerIpcHandler('dock.getSettings', () => window.__wosDockBridge
        ? window.__wosDockBridge.schema.reduce((acc, e) => { acc[e.key] = e.value; return acc; }, {})
        : {});
    // FS handlers — accessed through platform's ProxyFS in Ring 1;
    // these raw handlers remain for trusted system callers (SW bridge, dock, etc.)
    registerIpcHandler('fs.read', (d) => Array.from(fs.readFileSync(d.path)));
    registerIpcHandler('fs.readText', (d) => fs.readFileSync(d.path, 'utf8'));
    registerIpcHandler('fs.write', (d) => {
        const c = d.content;
        if (typeof c === 'string')
            fs.writeFileSync(d.path, c);
        else
            fs.writeFileSync(d.path, Buffer.from(c));
        return true;
    });
    registerIpcHandler('fs.list', (d) => fs.readdirSync(d.path));
    registerIpcHandler('fs.exists', (d) => fs.existsSync(d.path));
    registerIpcHandler('fs.mkdir', (d) => { fs.mkdirSync(d.path); return true; });
    registerIpcHandler('fs.rm', (d) => { fs.unlinkSync(d.path); return true; });
    registerIpcHandler('fs.stat', (d) => {
        var _a;
        const s = fs.statSync(d.path);
        return { isDirectory: s.isDirectory(), size: (_a = s.size) !== null && _a !== void 0 ? _a : 0 };
    });
}


/***/ }),

/***/ "./src/kernel/sw-bridge.ts":
/*!*********************************!*\
  !*** ./src/kernel/sw-bridge.ts ***!
  \*********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   initSwBridge: () => (/* binding */ initSwBridge)
/* harmony export */ });
// Ring 0 — Service worker bridge
// Registers the SW and routes /(sw)/<path> file requests back to the VFS.
function initSwBridge(fs) {
    if (!navigator.serviceWorker)
        return;
    navigator.serviceWorker
        .register('/sw.bundle.js', { scope: '/' })
        .then(reg => {
        if (reg.active)
            console.log('[sw-bridge] service worker active');
        const worker = reg.installing || reg.waiting;
        if (worker) {
            worker.addEventListener('statechange', () => {
                if (worker.state === 'activated')
                    location.reload();
            });
        }
        navigator.serviceWorker.addEventListener('message', event => {
            var _a, _b, _c, _d;
            const { type, payload } = (_a = event.data) !== null && _a !== void 0 ? _a : {};
            if (type !== 'fs/file-request')
                return;
            const { path, request_id } = payload !== null && payload !== void 0 ? payload : {};
            if (!window.fs) {
                (_b = navigator.serviceWorker.controller) === null || _b === void 0 ? void 0 : _b.postMessage({
                    type: 'fs/reply',
                    payload: { data: 'File system not mounted!', error: 'File system not mounted!', request_id },
                });
                return;
            }
            if (fs.existsSync(path)) {
                (_c = navigator.serviceWorker.controller) === null || _c === void 0 ? void 0 : _c.postMessage({
                    type: 'fs/reply',
                    payload: { data: fs.readFileSync(path), error: '', request_id },
                });
            }
            else {
                (_d = navigator.serviceWorker.controller) === null || _d === void 0 ? void 0 : _d.postMessage({
                    type: 'fs/reply',
                    payload: { data: `File not found! ${path}`, error: 'File not found!', request_id },
                });
            }
        });
    })
        .catch(err => console.error('[sw-bridge] registration failed:', err));
}


/***/ }),

/***/ "./src/kernel/vfs.ts":
/*!***************************!*\
  !*** ./src/kernel/vfs.ts ***!
  \***************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   FS_BACKEND_QUERY_PARAM: () => (/* binding */ FS_BACKEND_QUERY_PARAM),
/* harmony export */   FS_BACKEND_STORAGE_KEY: () => (/* binding */ FS_BACKEND_STORAGE_KEY),
/* harmony export */   initVFS: () => (/* binding */ initVFS),
/* harmony export */   mkdirRecursive: () => (/* binding */ mkdirRecursive),
/* harmony export */   resolveFsBackend: () => (/* binding */ resolveFsBackend)
/* harmony export */ });
/* harmony import */ var _ipc_bus__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./ipc-bus */ "./src/kernel/ipc-bus.ts");
// Ring 0 — VFS kernel module
// Owns BrowserFS mount, path bootstrap from meta.json, and segment-safe mkdir.
// No business logic. Called once at boot from src/index.ts.
var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};

const FS_BACKEND_STORAGE_KEY = '__app_fs_backend__';
const FS_BACKEND_QUERY_PARAM = 'fsBackend';
function resolveFsBackend() {
    const fromQuery = new URLSearchParams(window.location.search).get(FS_BACKEND_QUERY_PARAM);
    if (fromQuery === 'indexeddb' || fromQuery === 'localstorage') {
        localStorage.setItem(FS_BACKEND_STORAGE_KEY, fromQuery);
        return fromQuery;
    }
    return localStorage.getItem(FS_BACKEND_STORAGE_KEY) === 'localstorage' ? 'localstorage' : 'indexeddb';
}
// BrowserFS ignores { recursive: true } — create each segment individually.
function mkdirRecursive(fs, path) {
    const segments = path.replace(/^\//, '').split('/');
    let cur = '';
    for (const seg of segments) {
        cur += '/' + seg;
        try {
            fs.mkdirSync(cur);
        }
        catch (e) {
            if (e.code !== 'EEXIST')
                throw e;
        }
    }
}
const DEFAULT_DIRS = [
    '/home', '/home/user1', '/home/user1/apps', '/home/user1/tools',
    '/home/user1/projects', '/home/user1/quotes',
    '/mnt', '/usr', '/usr/bin', '/usr/lib', '/usr/local',
    '/usr/share', '/usr/share/icons',
    '/bin', '/etc', '/etc/wm', '/etc/pkg',
    '/opt', '/opt/apps',
    '/proc', '/srv', '/sys', '/tmp',
    '/var', '/var/log', '/var/spool',
];
const createBackend = (Ctor, opts) => new Promise((resolve, reject) => Ctor.Create(opts, (err, fs) => err ? reject(err) : resolve(fs)));
const createIndexedDBMirror = (Backend, storeName) => __awaiter(void 0, void 0, void 0, function* () {
    const idbFS = yield createBackend(Backend.IndexedDB, { storeName });
    yield new Promise((resolve, reject) => idbFS.makeRootDirectory((err) => err ? reject(err) : resolve()));
    const memFS = yield createBackend(Backend.InMemory, {});
    return createBackend(Backend.AsyncMirror, { sync: memFS, async: idbFS });
});
function initVFS(bootLog) {
    return __awaiter(this, void 0, void 0, function* () {
        const t0 = Date.now();
        window.BrowserFS.install(window);
        const Backend = window.BrowserFS.FileSystem;
        const fsBackend = resolveFsBackend();
        let mfs;
        if (fsBackend === 'localstorage') {
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
        window.BrowserFS.initialize(mfs);
        bootLog(`VFS init (${fsBackend})`, t0);
        const fs = window.require('fs');
        window.fs = fs;
        // Wire IPC fs handlers so service worker / iframes can call fs via postMessage
        (0,_ipc_bus__WEBPACK_IMPORTED_MODULE_0__.initIpcBus)(fs);
        DEFAULT_DIRS.forEach(dir => {
            if (!fs.existsSync(dir))
                fs.mkdirSync(dir);
        });
        yield bootstrapMetaFiles(fs, bootLog);
        return fs;
    });
}
function bootstrapMetaFiles(fs, bootLog) {
    return __awaiter(this, void 0, void 0, function* () {
        const t1 = Date.now();
        const metaFilePath = '/meta.json';
        const metaFileServerPath = '/public/mount/meta.json';
        let defaultFiles = [];
        if (fs.existsSync(metaFilePath)) {
            defaultFiles = JSON.parse(fs.readFileSync(metaFilePath).toString());
        }
        const ignoreMetaReload = defaultFiles.find(item => item.path === metaFilePath && item.force_reload === false);
        if (!ignoreMetaReload)
            defaultFiles = yield (yield fetch(metaFileServerPath)).json();
        let fileCount = 0;
        yield Promise.all(defaultFiles.map((item) => __awaiter(this, void 0, void 0, function* () {
            if (fs.existsSync(item.path) && !item.force_reload)
                return;
            const serverPath = item.file.startsWith('http')
                ? item.file
                : `/public/mount${item.file.startsWith('/') ? '' : '/'}${item.file}`;
            const fileData = yield (yield fetch(serverPath)).arrayBuffer();
            const dir = item.path.slice(0, item.path.lastIndexOf('/')) || '/';
            if (!fs.existsSync(dir))
                mkdirRecursive(fs, dir);
            fs.writeFileSync(item.path, Buffer.from(fileData));
            fileCount++;
        })));
        bootLog(`meta.json bootstrap (${fileCount} files written)`, t1);
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
/* harmony import */ var _kernel_vfs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./kernel/vfs */ "./src/kernel/vfs.ts");
/* harmony import */ var _kernel_sw_bridge__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./kernel/sw-bridge */ "./src/kernel/sw-bridge.ts");
var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
//@ts-nocheck


const __BOOTSTRAP_SCRIPT_PATH_KEY__ = '__BOOTSTRAP_SCRIPT_PATH__';
const loadBootstrapScript = (storage) => {
    const path = storage.getItem(__BOOTSTRAP_SCRIPT_PATH_KEY__) || '/remote.bundle.js';
    if (!path)
        return;
    const script = window.document.createElement('script');
    script.src = path;
    window.document.head.appendChild(script);
};
window.addEventListener('load', () => __awaiter(void 0, void 0, void 0, function* () {
    // Boot log — phases pushed here; readable from Settings > Boot Log.
    window.__bootLog = [];
    const bootLog = (label, startMs, error) => {
        window.__bootLog.push({ label, durationMs: Date.now() - startMs, error });
    };
    // Ring 0: bring up VFS + IPC bus
    const fs = yield (0,_kernel_vfs__WEBPACK_IMPORTED_MODULE_0__.initVFS)(bootLog);
    // Ring 0: register service worker + VFS file bridge
    (0,_kernel_sw_bridge__WEBPACK_IMPORTED_MODULE_1__.initSwBridge)(fs);
    // Load the main app bundle (remote.bundle.js → Platform + Layout)
    loadBootstrapScript(localStorage);
}));

})();

/******/ })()
;
//# sourceMappingURL=bootstrapper.bundle.js.map