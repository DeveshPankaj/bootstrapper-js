/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/kernel/deeplink.ts"
/*!********************************!*\
  !*** ./src/kernel/deeplink.ts ***!
  \********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   DEEPLINK_CHANNEL: () => (/* binding */ DEEPLINK_CHANNEL),
/* harmony export */   isValidDeepLinkCommand: () => (/* binding */ isValidDeepLinkCommand),
/* harmony export */   parseDeepLink: () => (/* binding */ parseDeepLink),
/* harmony export */   showHandoffNotice: () => (/* binding */ showHandoffNotice),
/* harmony export */   tryHandoffDeepLink: () => (/* binding */ tryHandoffDeepLink)
/* harmony export */ });
/* harmony import */ var _path_policy__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./path-policy */ "./src/kernel/path-policy.ts");
// Ring 0 — Deep links (pre-boot half).
//
// A deep link is a URL whose *hash* asks the OS to open a command with one
// string argument once it has booted:
//
//   https://host/path/#open=<command>&app=<appId>&arg=<string>
//
// The hash (not the query) is used on purpose: it is never sent to the web
// server, and args such as WebRTC session descriptions contain IP addresses.
//
// This file only implements the part that has to run BEFORE anything else
// boots: if another tab of this same origin is already running the OS and
// has a handler for the command (see /usr/bin/deeplink.js, which installs
// the receiving side and does the actual command dispatch), the link is
// handed to that tab over a BroadcastChannel and this tab need not boot at
// all. Anything not acknowledged within the timeout falls through to a
// normal boot, where /usr/bin/deeplink.js opens the command locally.
//
// Deep links are only ever honored for commands that opt in by setting
// `deepLink: true` in their registerCommand meta - the URL is untrusted
// input, so it must not be able to launch arbitrary commands.

const DEEPLINK_CHANNEL = 'wos-deeplink';
const NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_ARG = 20000;
const SKIP_HANDOFF_KEY = '__wosNoHandoff';
/**
 * A command name a link may name: letters, digits, '.', '_', '-', at most 64
 * characters, no leading dot and no '..' (audit KRN-12, BOOT-9). Keep in sync
 * with /usr/bin/deeplink.js. App ids follow path-policy's isValidAppId.
 */
function isValidDeepLinkCommand(name) {
    return typeof name === 'string' && NAME_RE.test(name) && !name.startsWith('.') && !name.includes('..');
}
function parseDeepLink(hash) {
    if (!hash || hash.length < 2)
        return null;
    const params = new URLSearchParams(hash.slice(1));
    const command = params.get('open');
    if (!isValidDeepLinkCommand(command))
        return null;
    const app = params.get('app');
    return {
        command,
        app: app && (0,_path_policy__WEBPACK_IMPORTED_MODULE_0__.isValidAppId)(app) ? app : null,
        arg: (params.get('arg') || '').slice(0, MAX_ARG),
    };
}
// Resolves true if another tab took ownership of the link.
function tryHandoffDeepLink(timeoutMs = 800) {
    const link = parseDeepLink(window.location.hash);
    if (!link || typeof BroadcastChannel === 'undefined')
        return Promise.resolve(false);
    try {
        if (sessionStorage.getItem(SKIP_HANDOFF_KEY)) {
            sessionStorage.removeItem(SKIP_HANDOFF_KEY);
            return Promise.resolve(false);
        }
    }
    catch (_) { }
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const channel = new BroadcastChannel(DEEPLINK_CHANNEL);
    return new Promise(resolve => {
        let settled = false;
        const finish = (handedOff) => {
            if (settled)
                return;
            settled = true;
            channel.close();
            resolve(handedOff);
        };
        channel.onmessage = (e) => {
            if (e.data && e.data.t === 'ack' && e.data.id === id)
                finish(true);
        };
        channel.postMessage({ t: 'open', id, command: link.command, arg: link.arg });
        setTimeout(() => finish(false), timeoutMs);
    });
}
// Replaces the page with a short notice once a link has been handed off.
function showHandoffNotice() {
    try {
        window.close();
    }
    catch (_) { }
    document.body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'font:14px/1.5 system-ui,sans-serif;max-width:420px;margin:18vh auto;padding:0 20px;text-align:center;color:#333';
    const title = document.createElement('h2');
    title.textContent = 'Opened in your other tab';
    title.style.cssText = 'margin:0 0 8px;font-size:18px';
    const text = document.createElement('p');
    text.textContent = 'This link was handed to the tab where the app is already open. You can close this tab.';
    const button = document.createElement('button');
    button.textContent = 'Open here instead';
    button.style.cssText = 'margin-top:10px;padding:8px 14px;border-radius:8px;border:1px solid #bbb;background:#f5f5f5;cursor:pointer';
    button.onclick = () => {
        try {
            sessionStorage.setItem(SKIP_HANDOFF_KEY, '1');
        }
        catch (_) { }
        window.location.reload();
    };
    wrap.append(title, text, button);
    document.body.append(wrap);
}


/***/ },

/***/ "./src/kernel/ipc-bus.ts"
/*!*******************************!*\
  !*** ./src/kernel/ipc-bus.ts ***!
  \*******************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   broadcastIpcEvent: () => (/* binding */ broadcastIpcEvent),
/* harmony export */   checkIpcFsAccess: () => (/* binding */ checkIpcFsAccess),
/* harmony export */   getIpcFramePolicy: () => (/* binding */ getIpcFramePolicy),
/* harmony export */   hardenWindow: () => (/* binding */ hardenWindow),
/* harmony export */   initIpcBus: () => (/* binding */ initIpcBus),
/* harmony export */   isIpcEventAllowed: () => (/* binding */ isIpcEventAllowed),
/* harmony export */   registerIpcFrame: () => (/* binding */ registerIpcFrame),
/* harmony export */   registerIpcHandler: () => (/* binding */ registerIpcHandler),
/* harmony export */   registerWmBridge: () => (/* binding */ registerWmBridge)
/* harmony export */ });
/* harmony import */ var _path_policy__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./path-policy */ "./src/kernel/path-policy.ts");
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

/**
 * Wraps `win.open` so that cross-origin URLs always open with
 * `noopener,noreferrer`: the opened page gets no `window.opener` reference
 * back into the OS (audit KRN-11, APP-9). Same-origin opens, and about:blank
 * (which takes our origin), are unchanged. Idempotent per document: a
 * WindowProxy survives navigation, so "already hardened" is read from the
 * current document's own `open` property (our wrapper is locked), and a frame
 * that navigated to a new document is wrapped again. Ignores windows it can't
 * touch.
 */
function hardenWindow(win) {
    if (!win)
        return;
    let nativeOpen;
    try {
        const current = Object.getOwnPropertyDescriptor(win, 'open');
        if (current && current.configurable === false)
            return;
        nativeOpen = win.open.bind(win);
    }
    catch (_) {
        return;
    }
    const wrapped = function (url, target, features) {
        let resolved = null;
        try {
            resolved = new URL(String(url !== null && url !== void 0 ? url : ''), win.location.href);
        }
        catch (_) { /* let the browser reject it */ }
        if (resolved && resolved.protocol !== 'about:' && resolved.origin !== win.location.origin) {
            const list = String(features !== null && features !== void 0 ? features : '').split(',').map(s => s.trim()).filter(Boolean);
            for (const f of ['noopener', 'noreferrer'])
                if (!list.includes(f))
                    list.push(f);
            return nativeOpen(resolved.href, target !== null && target !== void 0 ? target : '_blank', list.join(','));
        }
        return nativeOpen(url, target, features);
    };
    try {
        Object.defineProperty(win, 'open', { value: wrapped, writable: false, configurable: false });
    }
    catch (_) { /* already locked or cross-origin */ }
}
const ipcFrames = new WeakMap();
// The same windows, iterable, for broadcasts. Discarded frames (closed) are
// pruned on the next broadcast.
const ipcFrameWindows = new Set();
// True only in the bundle copy that installed the listener (see initIpcBus).
let isKernelCopy = false;
// The hook installed by the kernel copy, looked up from this realm upwards
// (a module iframe's own window has none; its parent — the OS window — does).
function findKernelHook() {
    let w = window;
    for (let depth = 0; depth < 16; depth++) {
        try {
            if (w.__wosKernel)
                return w.__wosKernel;
        }
        catch (_) {
            return undefined;
        }
        if (w.parent === w)
            return undefined;
        w = w.parent;
    }
    return undefined;
}
const toStringList = (list) => Array.isArray(list) ? list.filter((s) => typeof s === 'string' && s !== '') : [];
// fs scopes must be absolute, normalisable paths; anything else is dropped.
const toScopeList = (list) => toStringList(list).filter(p => {
    try {
        return p.startsWith('/') && (0,_path_policy__WEBPACK_IMPORTED_MODULE_0__.normalizePath)(p) !== undefined;
    }
    catch (_) {
        return false;
    }
});
/** Registers a kernel-created frame's window with a policy. Returns an unregister function. */
function registerIpcFrame(win, policy) {
    var _a, _b, _c;
    if (!win)
        return () => { };
    // Another bundle's copy of this module: register in the kernel's registry,
    // the only one the listener reads.
    if (!isKernelCopy) {
        const hook = findKernelHook();
        if (hook && hook.registerIpcFrame !== registerIpcFrame)
            return hook.registerIpcFrame(win, policy);
    }
    const frozen = Object.freeze({
        id: String((_a = policy === null || policy === void 0 ? void 0 : policy.id) !== null && _a !== void 0 ? _a : ''),
        events: Object.freeze(toStringList(policy === null || policy === void 0 ? void 0 : policy.events)),
        fs: Object.freeze({
            read: Object.freeze(toScopeList((_b = policy === null || policy === void 0 ? void 0 : policy.fs) === null || _b === void 0 ? void 0 : _b.read)),
            write: Object.freeze(toScopeList((_c = policy === null || policy === void 0 ? void 0 : policy.fs) === null || _c === void 0 ? void 0 : _c.write)),
        }),
    });
    const entry = { policy: frozen };
    ipcFrames.set(win, entry);
    ipcFrameWindows.add(win);
    return () => {
        if (ipcFrames.get(win) !== entry)
            return;
        ipcFrames.delete(win);
        ipcFrameWindows.delete(win);
    };
}
/** The policy registered for a message source, or undefined for anything the kernel didn't register. */
function getIpcFramePolicy(source) {
    var _a;
    return source ? (_a = ipcFrames.get(source)) === null || _a === void 0 ? void 0 : _a.policy : undefined;
}
/** True when `event` is in the policy's list — exactly, or under a trailing-'*' prefix entry ('dock.*'). */
function isIpcEventAllowed(policy, event) {
    return policy.events.some(p => p === event || (p.endsWith('*') && event.startsWith(p.slice(0, -1))));
}
// fs.* events by the scope they need. An fs.* event in neither set is refused.
const FS_READ_EVENTS = ['fs.read', 'fs.readText', 'fs.list', 'fs.exists', 'fs.stat'];
const FS_WRITE_EVENTS = ['fs.write', 'fs.mkdir', 'fs.rm'];
/**
 * Checks an fs.* request against the frame's policy and returns the
 * normalised path the handler must use. Throws when it isn't allowed:
 * read events need policy.fs.read, write events policy.fs.write, and system
 * paths (path-policy isKernelOwned, invariant I4) are never writable over IPC.
 */
function checkIpcFsAccess(policy, event, data) {
    var _a, _b, _c;
    const isWrite = FS_WRITE_EVENTS.includes(event);
    if (!isWrite && !FS_READ_EVENTS.includes(event))
        throw new Error(`${event}: not available over IPC`);
    const raw = data && typeof data === 'object' ? data.path : undefined;
    if (typeof raw !== 'string' || !raw.startsWith('/'))
        throw new Error(`${event}: an absolute path is required`);
    const path = (0,_path_policy__WEBPACK_IMPORTED_MODULE_0__.normalizePath)(raw);
    if (isWrite && (0,_path_policy__WEBPACK_IMPORTED_MODULE_0__.isKernelOwned)(path))
        throw new Error(`${event}: permission denied: ${path} is a system path`);
    const scopes = (_c = (isWrite ? (_a = policy.fs) === null || _a === void 0 ? void 0 : _a.write : (_b = policy.fs) === null || _b === void 0 ? void 0 : _b.read)) !== null && _c !== void 0 ? _c : [];
    if (!scopes.some(base => (0,_path_policy__WEBPACK_IMPORTED_MODULE_0__.isInside)(base, path)))
        throw new Error(`${event}: permission denied: ${path}`);
    return path;
}
// Non-fs events that act on one file: the path is checked exactly like a read
// (the frame may only name files inside its fs.read scope).
const PATH_READ_EVENTS = ['editor.open'];
// postMessage can't target an opaque origin by name, so sandboxed frames get
// '*' — the message still goes only to that one window.
const replyTargetOrigin = (origin) => (origin && origin !== 'null' ? origin : '*');
function handleIpcMessage(e) {
    return __awaiter(this, void 0, void 0, function* () {
        const msg = e.data;
        if (!msg || typeof msg !== 'object' || msg.type !== 'wos-ipc')
            return;
        const source = e.source;
        const entry = source ? ipcFrames.get(source) : undefined;
        // Unregistered or foreign sender (other sites via opener/popup/embed, frames
        // the kernel didn't create): no reply at all.
        if (!source || !entry)
            return;
        if (entry.origin === undefined)
            entry.origin = e.origin;
        else if (entry.origin !== e.origin)
            return;
        const { id, event, data } = msg;
        const reply = (body) => {
            // Only to that registered window, and only while it still holds the
            // registration it had when it asked.
            if (ipcFrames.get(source) !== entry)
                return;
            try {
                source.postMessage(Object.assign({ type: 'wos-ipc-response', id }, body), replyTargetOrigin(e.origin));
            }
            catch (_) { }
        };
        if (typeof event !== 'string' || !isIpcEventAllowed(entry.policy, event)) {
            reply({ error: `IPC event not permitted: ${String(event)}` });
            return;
        }
        const handler = handlers.get(event);
        if (!handler) {
            reply({ error: `Unknown IPC event: ${event}` });
            return;
        }
        try {
            const arg = event.startsWith('fs.')
                ? Object.assign(Object.assign({}, data), { path: checkIpcFsAccess(entry.policy, event, data) }) : PATH_READ_EVENTS.includes(event)
                ? Object.assign(Object.assign({}, data), { path: checkIpcFsAccess(entry.policy, 'fs.readText', data) }) : data;
            const result = yield handler(arg, source);
            reply({ result: result !== null && result !== void 0 ? result : null });
        }
        catch (err) {
            reply({ error: String(err) });
        }
    });
}
const handlers = new Map();
function registerIpcHandler(event, handler) {
    handlers.set(event, handler);
}
// A broadcast `ns.name` reaches a registered frame whose policy allows that
// event (isIpcEventAllowed) or any other event in the same namespace — a dock
// allowed 'wm.getWindows' also gets 'wm.windowsChanged'; a frame with only
// fs.* gets no window titles (audit KRN-13).
function isIpcBroadcastFor(policy, event) {
    if (isIpcEventAllowed(policy, event))
        return true;
    const dot = event.indexOf('.');
    if (dot <= 0)
        return false;
    const ns = event.slice(0, dot + 1);
    return policy.events.some(p => p.startsWith(ns));
}
/**
 * Posts a `wos-ipc-event` to the frames registered with registerIpcFrame whose
 * policy covers `event`, and to nothing else (audit KRN-13). `targetDoc` is
 * kept for compatibility and no longer used: registered frames are reached
 * wherever they are. Other bundles' copies delegate to the kernel's registry.
 */
function broadcastIpcEvent(event, data, _targetDoc) {
    if (!isKernelCopy) {
        const hook = findKernelHook();
        if ((hook === null || hook === void 0 ? void 0 : hook.broadcastIpcEvent) && hook.broadcastIpcEvent !== broadcastIpcEvent)
            hook.broadcastIpcEvent(event, data);
        return;
    }
    ipcFrameWindows.forEach(win => {
        var _a;
        const entry = ipcFrames.get(win);
        let closed = true;
        try {
            closed = win.closed;
        }
        catch (_) { }
        if (!entry || closed) {
            ipcFrameWindows.delete(win);
            if (entry && closed)
                ipcFrames.delete(win);
            return;
        }
        if (!isIpcBroadcastFor(entry.policy, event))
            return;
        try {
            win.postMessage({ type: 'wos-ipc-event', event, data }, replyTargetOrigin((_a = entry.origin) !== null && _a !== void 0 ? _a : ''));
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
    if (!window.__wosIpcInit && !Object.getOwnPropertyDescriptor(window, '__wosKernel')) {
        window.__wosIpcInit = true;
        isKernelCopy = true;
        // Cross-bundle entry point to the registry above (see the comment there).
        Object.defineProperty(window, '__wosKernel', {
            value: Object.freeze({ registerIpcFrame, hardenWindow, broadcastIpcEvent }),
            writable: false,
            configurable: false,
            enumerable: false,
        });
        // The only wos-ipc listener (audit KRN-1): it answers frames registered
        // through registerIpcFrame, within their policy, and nobody else.
        window.addEventListener('message', (e) => { void handleIpcMessage(e); });
    }
    // Window manager bridge handlers
    registerIpcHandler('wm.getWindows', () => { var _a, _b; return (_b = (_a = window.__wosWmBridge) === null || _a === void 0 ? void 0 : _a.getWindows()) !== null && _b !== void 0 ? _b : []; });
    registerIpcHandler('wm.toggleWindow', (d) => { var _a; (_a = window.__wosWmBridge) === null || _a === void 0 ? void 0 : _a.toggleWindow(Number(d.pid)); return true; });
    registerIpcHandler('wm.getLaunchItems', () => { var _a, _b; return (_b = (_a = window.__wosWmBridge) === null || _a === void 0 ? void 0 : _a.getLaunchItems()) !== null && _b !== void 0 ? _b : []; });
    // Launches only what the dock was offered (wm.getLaunchItems), not any
    // command by name (audit WIN-7).
    registerIpcHandler('wm.launch', (d) => {
        var _a, _b, _c, _d, _e;
        const name = String((_a = d === null || d === void 0 ? void 0 : d.name) !== null && _a !== void 0 ? _a : '');
        const offered = ((_c = (_b = window.__wosWmBridge) === null || _b === void 0 ? void 0 : _b.getLaunchItems()) !== null && _c !== void 0 ? _c : []).some(item => item.name === name);
        if (!offered)
            throw new Error(`wm.launch: ${name} is not a launch item`);
        (_e = (_d = window.__wosWmBridge) === null || _d === void 0 ? void 0 : _d.launch) === null || _e === void 0 ? void 0 : _e.call(_d, name);
        return true;
    });
    // Opens a file the frame may read in the system editor (Notepad). The path
    // was already checked against the frame's fs.read scope; the editor is the
    // user's tool, so saving needs the user. Throttled so a page can't flood
    // the desktop with windows.
    const lastEditorOpen = new WeakMap();
    registerIpcHandler('editor.open', (d, source) => {
        var _a, _b;
        const now = Date.now();
        if (now - ((_a = lastEditorOpen.get(source)) !== null && _a !== void 0 ? _a : 0) < 1000)
            throw new Error('editor.open: too many requests');
        lastEditorOpen.set(source, now);
        if (!fs.existsSync(d.path) || fs.statSync(d.path).isDirectory())
            throw new Error(`editor.open: not a file: ${d.path}`);
        const host = (_b = window.platform) === null || _b === void 0 ? void 0 : _b.host;
        if (typeof (host === null || host === void 0 ? void 0 : host.openWindow) !== 'function')
            throw new Error('editor.open: the desktop is not ready');
        host.openWindow('ui.notepad', d.path);
        return true;
    });
    // Dock bridge handlers
    registerIpcHandler('dock.registerSettings', (d, source) => {
        var _a, _b, _c, _d, _e;
        // A dock frame the layout registered as `dock:<id>` is that dock,
        // whatever dockId it reports about itself.
        const pinned = /^dock:([a-z0-9-]{1,64})$/.exec((_b = (_a = ipcFrames.get(source)) === null || _a === void 0 ? void 0 : _a.policy.id) !== null && _b !== void 0 ? _b : '');
        const dockId = pinned ? pinned[1] : String((_c = d === null || d === void 0 ? void 0 : d.dockId) !== null && _c !== void 0 ? _c : '');
        if (window.__wosDockBridge) {
            window.__wosDockBridge.schema = (_d = d === null || d === void 0 ? void 0 : d.schema) !== null && _d !== void 0 ? _d : [];
            window.__wosDockBridge.dockId = dockId;
        }
        else {
            window.__wosDockBridge = { schema: (_e = d === null || d === void 0 ? void 0 : d.schema) !== null && _e !== void 0 ? _e : [], dockId, set: () => { } };
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
    // FS handlers. handleIpcMessage has already checked the event and the
    // path against the calling frame's policy (checkIpcFsAccess) and passes
    // the normalised path in `d.path`.
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


/***/ },

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


/***/ },

/***/ "./src/kernel/sw-bridge.ts"
/*!*********************************!*\
  !*** ./src/kernel/sw-bridge.ts ***!
  \*********************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

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
        // Requests come only from our own service worker (this container
        // receives nothing else). The SW sends a normalised path and a
        // random request id, and accepts the reply only from this tab
        // (src/sw.ts, audit KRN-8). The reply goes back to the worker
        // that asked, even while a newer one is taking over.
        navigator.serviceWorker.addEventListener('message', event => {
            var _a, _b;
            const { type, payload } = (_a = event.data) !== null && _a !== void 0 ? _a : {};
            if (type !== 'fs/file-request')
                return;
            const { path, request_id } = payload !== null && payload !== void 0 ? payload : {};
            if (typeof path !== 'string' || typeof request_id !== 'string')
                return;
            const sw = (_b = event.source) !== null && _b !== void 0 ? _b : navigator.serviceWorker.controller;
            const reply = (data, error) => {
                try {
                    sw === null || sw === void 0 ? void 0 : sw.postMessage({ type: 'fs/reply', payload: { data, error, request_id } });
                }
                catch (_) { }
            };
            if (!window.fs) {
                reply('File system not mounted!', 'File system not mounted!');
                return;
            }
            try {
                if (fs.existsSync(path) && !fs.statSync(path).isDirectory()) {
                    reply(fs.readFileSync(path), '');
                }
                else {
                    reply(`File not found! ${path}`, 'File not found!');
                }
            }
            catch (err) {
                reply(`File not readable! ${path}`, String((err === null || err === void 0 ? void 0 : err.code) || (err === null || err === void 0 ? void 0 : err.message) || err));
            }
        });
    })
        .catch(err => console.error('[sw-bridge] registration failed:', err));
}


/***/ },

/***/ "./src/kernel/vfs.ts"
/*!***************************!*\
  !*** ./src/kernel/vfs.ts ***!
  \***************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   FS_BACKEND_QUERY_PARAM: () => (/* binding */ FS_BACKEND_QUERY_PARAM),
/* harmony export */   FS_BACKEND_STORAGE_KEY: () => (/* binding */ FS_BACKEND_STORAGE_KEY),
/* harmony export */   initVFS: () => (/* binding */ initVFS),
/* harmony export */   mkdirRecursive: () => (/* binding */ mkdirRecursive),
/* harmony export */   resolveFsBackend: () => (/* binding */ resolveFsBackend)
/* harmony export */ });
/* harmony import */ var _ipc_bus__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./ipc-bus */ "./src/kernel/ipc-bus.ts");
/* harmony import */ var _path_policy__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./path-policy */ "./src/kernel/path-policy.ts");
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
// Removes one query parameter from the address bar, keeping the rest of the
// URL (other params, the deep-link hash) as it was.
function stripQueryParam(name) {
    try {
        const url = new URL(window.location.href);
        if (!url.searchParams.has(name))
            return;
        url.searchParams.delete(name);
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
    catch (_) { /* best effort */ }
}
function resolveFsBackend() {
    let stored = 'indexeddb';
    try {
        if (localStorage.getItem(FS_BACKEND_STORAGE_KEY) === 'localstorage')
            stored = 'localstorage';
    }
    catch (_) { }
    const params = new URLSearchParams(window.location.search);
    if (!params.has(FS_BACKEND_QUERY_PARAM))
        return stored;
    const fromQuery = params.get(FS_BACKEND_QUERY_PARAM);
    // Consumed either way, so a reload or a copied link doesn't apply it again.
    stripQueryParam(FS_BACKEND_QUERY_PARAM);
    if ((fromQuery !== 'indexeddb' && fromQuery !== 'localstorage') || fromQuery === stored)
        return stored;
    // The two backends are separate filesystems: a link must not switch this
    // browser to another one without the user agreeing (audit KRN-9). Settings
    // > Storage stores the choice before reloading, so it never gets here.
    let ok = false;
    try {
        ok = window.confirm(`This link asks to switch this browser's file system storage from "${stored}" to "${fromQuery}".\n\n` +
            'The two are separate file systems — your files stay where they are, but you will see ' +
            'the other one until you switch back in Settings > Storage.\n\nSwitch now?');
    }
    catch (_) {
        ok = false;
    }
    if (!ok)
        return stored;
    try {
        localStorage.setItem(FS_BACKEND_STORAGE_KEY, fromQuery);
    }
    catch (_) { }
    return fromQuery;
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
    '/home', '/home/user1', '/home/user1/projects',
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
        fs.mount = (mountPoint, backend) => mfs.mount(mountPoint, backend);
        fs.umount = (mountPoint) => mfs.umount(mountPoint);
        fs.createBackend = (name, opts = {}) => createBackend(window.BrowserFS.FileSystem[name], opts);
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
const META_SERVER_PATH = '/public/mount/meta.json';
const STATIC_ROOT = '/public/mount';
// Where a meta.json entry may be written: an absolute, already-normalised vfs path.
function metaTargetPath(path) {
    if (typeof path !== 'string' || !path.startsWith('/'))
        return null;
    try {
        return (0,_path_policy__WEBPACK_IMPORTED_MODULE_1__.normalizePath)(path) === path && path !== '/' ? path : null;
    }
    catch (_) {
        return null;
    }
}
// The static copy a meta.json entry may come from: a path under /public/mount on
// this origin. Absolute or protocol-relative URLs, '..', query/fragment
// characters, backslashes and control characters are refused.
function metaSourceUrl(file) {
    if (typeof file !== 'string' || file === '')
        return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(file) || file.startsWith('//') || /[?#%\\]/.test(file))
        return null;
    if (file.split('/').includes('..'))
        return null;
    let rel;
    try {
        rel = (0,_path_policy__WEBPACK_IMPORTED_MODULE_1__.normalizePath)(file.startsWith('/') ? file : `/${file}`);
    }
    catch (_) {
        return null;
    }
    const url = STATIC_ROOT + rel;
    return url !== STATIC_ROOT && (0,_path_policy__WEBPACK_IMPORTED_MODULE_1__.isInside)(STATIC_ROOT, url) ? url : null;
}
function bootstrapMetaFiles(fs, bootLog) {
    return __awaiter(this, void 0, void 0, function* () {
        const t1 = Date.now();
        // The server's meta.json decides what is restored and from where (audit
        // BOOT-6, decisions.md D12). The vfs copy at /meta.json is plain data —
        // any app can write it — so it can no longer switch refreshing off or name
        // other sources; it is just overwritten with the server copy.
        let entries;
        try {
            const res = yield fetch(META_SERVER_PATH);
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const list = yield res.json();
            if (!Array.isArray(list))
                throw new Error('not a list');
            entries = list;
        }
        catch (err) {
            bootLog('meta.json bootstrap', t1, `server meta.json unavailable: ${err}`);
            return;
        }
        let fileCount = 0;
        const rejected = [];
        const failed = [];
        yield Promise.all(entries.map((item) => __awaiter(this, void 0, void 0, function* () {
            const target = metaTargetPath(item === null || item === void 0 ? void 0 : item.path);
            const source = metaSourceUrl(item === null || item === void 0 ? void 0 : item.file);
            if (!target || !source) {
                rejected.push(String(item === null || item === void 0 ? void 0 : item.path));
                return;
            }
            if (fs.existsSync(target) && !item.force_reload)
                return;
            try {
                const res = yield fetch(source);
                if (!res.ok)
                    throw new Error(`HTTP ${res.status}`);
                const fileData = yield res.arrayBuffer();
                const dir = target.slice(0, target.lastIndexOf('/')) || '/';
                if (!fs.existsSync(dir))
                    mkdirRecursive(fs, dir);
                fs.writeFileSync(target, Buffer.from(fileData));
                fileCount++;
            }
            catch (err) {
                failed.push(target);
                console.warn('[vfs] meta.json entry not restored:', target, err);
            }
        })));
        if (rejected.length)
            console.warn('[vfs] meta.json entries rejected (not a /public/mount source or bad path):', rejected);
        const problems = [rejected.length && `${rejected.length} rejected`, failed.length && `${failed.length} failed`].filter(Boolean).join(', ');
        bootLog(`meta.json bootstrap (${fileCount} files written)`, t1, problems || undefined);
    });
}


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
/*!**********************!*\
  !*** ./src/index.ts ***!
  \**********************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _kernel_vfs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./kernel/vfs */ "./src/kernel/vfs.ts");
/* harmony import */ var _kernel_sw_bridge__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./kernel/sw-bridge */ "./src/kernel/sw-bridge.ts");
/* harmony import */ var _kernel_deeplink__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./kernel/deeplink */ "./src/kernel/deeplink.ts");
/* harmony import */ var _kernel_ipc_bus__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./kernel/ipc-bus */ "./src/kernel/ipc-bus.ts");
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




// The main bundle is fixed (audit KRN-9, decisions.md D12). It used to be
// overridable through localStorage, which let any same-origin script swap
// the kernel for its own on every boot; a leftover value is removed.
const BOOTSTRAP_SCRIPT = '/remote.bundle.js';
const LEGACY_BOOTSTRAP_OVERRIDE_KEY = '__BOOTSTRAP_SCRIPT_PATH__';
const loadBootstrapScript = () => {
    try {
        localStorage.removeItem(LEGACY_BOOTSTRAP_OVERRIDE_KEY);
    }
    catch (_) { }
    const script = window.document.createElement('script');
    script.src = BOOTSTRAP_SCRIPT;
    window.document.head.appendChild(script);
};
// True when any ancestor frame belongs to another origin (or can't be read,
// e.g. the OS was loaded into an opaque sandbox). A same-origin parent — the
// OS opened inside its own Browser app — is fine.
const isFramedByAnotherOrigin = () => {
    if (window.top === window.self)
        return false;
    try {
        for (let w = window, depth = 0; w !== w.top && depth < 64; depth++) {
            w = w.parent;
            if (w.location.origin !== window.location.origin)
                return true;
        }
        return false;
    }
    catch (_) {
        return true;
    }
};
// Replaces the page with a short notice and a link to open it on its own.
const showFramedNotice = () => {
    const show = () => {
        document.body.textContent = '';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'font:14px/1.5 system-ui,sans-serif;max-width:420px;margin:18vh auto;padding:0 20px;text-align:center;color:#333';
        const title = document.createElement('h2');
        title.textContent = 'This page can’t run inside another site';
        title.style.cssText = 'margin:0 0 8px;font-size:18px';
        const link = document.createElement('a');
        link.textContent = 'Open it in its own tab';
        link.href = window.location.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        wrap.append(title, link);
        document.body.append(wrap);
    };
    if (document.body)
        show();
    else
        window.addEventListener('DOMContentLoaded', show, { once: true });
};
// Ring 0: never boot inside a frame of another site (audit KRN-11, decisions.md
// D12) — it could overlay or click-jack the desktop, and on browsers without
// storage partitioning it would see this origin's real files.
if (isFramedByAnotherOrigin()) {
    showFramedNotice();
}
else {
    // A page that opened this one keeps no handle the OS would talk back to,
    // and pages the OS opens on other origins get no opener (KRN-11, APP-9).
    try {
        window.opener = null;
    }
    catch (_) { }
    ;(0,_kernel_ipc_bus__WEBPACK_IMPORTED_MODULE_3__.hardenWindow)(window);
    window.addEventListener('load', () => __awaiter(void 0, void 0, void 0, function* () {
        // Deep link opened in a fresh tab while another tab already runs the OS
        // and can handle it: hand it over and skip booting entirely.
        if (yield (0,_kernel_deeplink__WEBPACK_IMPORTED_MODULE_2__.tryHandoffDeepLink)()) {
            (0,_kernel_deeplink__WEBPACK_IMPORTED_MODULE_2__.showHandoffNotice)();
            return;
        }
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
        loadBootstrapScript();
    }));
}

})();

/******/ })()
;
//# sourceMappingURL=bootstrapper.bundle.js.map