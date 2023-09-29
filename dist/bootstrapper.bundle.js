/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
var __webpack_exports__ = {};
/*!**********************!*\
  !*** ./src/index.ts ***!
  \**********************/

const __BOOTSTRAP_SCRIPT_PATH_KEY__ = '__BOOTSTRAP_SCRIPT_PATH__';
const loadBootstrapScript = (storage) => {
    const bootstrap_script_path = storage.getItem(__BOOTSTRAP_SCRIPT_PATH_KEY__) || "dist/remote.bundle.js";
    if (!bootstrap_script_path)
        return;
    const script = window.document.createElement('script');
    script.src = bootstrap_script_path;
    window.document.head.appendChild(script);
};
const initWindow = () => { };
window.addEventListener('load', () => {
    initWindow();
    loadBootstrapScript(localStorage);
});

/******/ })()
;
//# sourceMappingURL=bootstrapper.bundle.js.map