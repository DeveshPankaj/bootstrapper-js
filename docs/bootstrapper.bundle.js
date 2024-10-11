/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	// The require scope
/******/ 	var __webpack_require__ = {};
/******/ 	
/************************************************************************/
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
/*!**********************!*\
  !*** ./src/index.ts ***!
  \**********************/
__webpack_require__.r(__webpack_exports__);
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
(function () {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
        this._method = method;
        this._url = url;
        console.log('XMLHttpRequest opened:', { method, url, async, user, password });
        return originalOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
        console.log('XMLHttpRequest sent:', { body });
        this.addEventListener('readystatechange', function () {
            if (this.readyState === 4) { // Request is complete
                console.log('XMLHttpRequest response received:', {
                    method: this._method,
                    url: this._url,
                    status: this.status,
                    response: this.responseText,
                });
            }
        });
        return originalSend.apply(this, arguments);
    };
})();
const loadBootstrapScript = (storage) => {
    const bootstrap_script_path = storage.getItem(__BOOTSTRAP_SCRIPT_PATH_KEY__) || "/remote.bundle.js";
    if (!bootstrap_script_path)
        return;
    const script = window.document.createElement('script');
    script.src = bootstrap_script_path;
    window.document.head.appendChild(script);
};
const initWindow = () => {
    // @ts-ignore
    window.BrowserFS.install(window);
    const defaultDirs = [
        '/home',
        '/home/user1',
        '/home/user1/apps',
        '/home/user1/tools',
        '/home/user1/projects',
        // '/home/user1/projects/Snake.html', // Specific project file (not a directory, but included for completeness)
        // '/home/user1/projects/WebGL.html', // Specific project file (not a directory, but included for completeness)
        // '/home/user1/projects/WebGL-Earth.html', // Specific project file (not a directory, but included for completeness)
        '/usr',
        '/usr/bin',
        '/usr/lib',
        '/usr/local',
        '/bin',
        '/root',
        '/media',
        '/etc',
        '/proc',
        '/lib',
        '/mnt',
        '/opt',
        '/run',
        '/srv',
        '/sys',
        '/tmp',
        '/var',
        '/var/log',
        '/var/spool'
    ];
    // @ts-ignore
    window.BrowserFS.configure({ fs: "LocalStorage", options: {} }, (err) => __awaiter(void 0, void 0, void 0, function* () {
        if (err) {
            alert(err);
        }
        else {
            const fs = window.require('fs');
            // @ts-ignore
            window.fs = fs;
            // fs.mkdirSync('/c')
            // fs.mkdirSync('/d')
            // console.log(fs.readdirSync('/'))
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
            defaultFiles.forEach((item) => __awaiter(void 0, void 0, void 0, function* () {
                if (fs.existsSync(item.path) && !item.force_reload)
                    return;
                const path = item.file.startsWith('http') ? item.file : `/public/mount${item.file.startsWith('/') ? '' : '/'}${item.file}`;
                const fileData = yield (yield fetch(path)).arrayBuffer();
                fs.writeFileSync(item.path, Buffer.from(fileData));
                // navigator.serviceWorker.controller?.postMessage({type: 'fs/file-added', payload: {file: item.path}});
            }));
        }
    }));
    if (navigator.serviceWorker) {
        navigator.serviceWorker.register('/sw.bundle.js', { scope: '/' }).then(function (reg) {
            if (reg.active)
                console.log('serviceworker installed');
            navigator.serviceWorker.addEventListener('message', event => {
                // console.log(event.data)
                var _a, _b, _c;
                //@ts-ignore
                const fs = window.fs;
                if (!fs) {
                    (_a = navigator.serviceWorker.controller) === null || _a === void 0 ? void 0 : _a.postMessage({ type: 'fs/reply', payload: { data: "File system not mounted!", request_id: event.data.payload.request_id } });
                }
                else if (fs.existsSync(event.data.payload.path)) {
                    (_b = navigator.serviceWorker.controller) === null || _b === void 0 ? void 0 : _b.postMessage({ type: 'fs/reply', payload: { data: fs.readFileSync(event.data.payload.path), request_id: event.data.payload.request_id } });
                }
                else {
                    (_c = navigator.serviceWorker.controller) === null || _c === void 0 ? void 0 : _c.postMessage({ type: 'fs/reply', payload: { data: `File not found! ${event.data.payload.path}`, request_id: event.data.payload.request_id } });
                }
            });
        })
            .catch(function (err) {
            console.log('registration failed: ' + err);
        });
    }
};
const channelRef = { current: null };
const initChannel = () => {
    const channel = new BroadcastChannel('my_channel');
    channel.onmessage = (event) => {
        var _a;
        const data = JSON.parse(event.data);
        // console.log(data)
        (_a = workerRef.current) === null || _a === void 0 ? void 0 : _a.postMessage(data);
    };
    channel.postMessage(JSON.stringify({ type: 'msg', data: 'New tab created' }));
    channel.postMessage(JSON.stringify({ type: 'cmd', data: 'this.getuser()' }));
    channelRef.current = channel;
};
const workerRef = { current: null };
const initWorker = () => {
    function startWorker() {
        const workerCode = `
            onmessage = function(event) {
                const receivedMessage = event.data;
                
                if(receivedMessage.type === 'reply') console.log(receivedMessage)

                if(receivedMessage.type === 'cmd') {
                    const factory = new Function('a', 'b', 'return ' + receivedMessage.data)
                    const context = {
                        getuser: () => 'Admin'
                    }
                    const res = factory.apply(context, [10, 20])
                    // console.log(res)
                    // postMessage(res);
                    const channel = new BroadcastChannel('my_channel')
                    channel.postMessage(JSON.stringify({type: 'reply', data: res}))


                }

                // postMessage(receivedMessage);
            }
        `;
        const blob = new Blob([workerCode], { type: "application/javascript" });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);
        worker.onmessage = function (event) {
            console.log(event.data);
        };
        workerRef.current = worker;
        return worker;
    }
    function stopWorker(worker) {
        worker.terminate();
    }
    const worker = startWorker();
};
window.addEventListener('load', () => __awaiter(void 0, void 0, void 0, function* () {
    initWindow();
    // initWorker()
    // initChannel()
    loadBootstrapScript(localStorage);
}));


/******/ })()
;
//# sourceMappingURL=bootstrapper.bundle.js.map