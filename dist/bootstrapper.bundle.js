/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/index.ts":
/*!**********************!*\
  !*** ./src/index.ts ***!
  \**********************/
/***/ (() => {

eval("\nconst __BOOTSTRAP_SCRIPT_PATH_KEY__ = '__BOOTSTRAP_SCRIPT_PATH__';\nconst loadBootstrapScript = (storage) => {\n    const bootstrap_script_path = storage.getItem(__BOOTSTRAP_SCRIPT_PATH_KEY__);\n    if (!bootstrap_script_path)\n        return;\n    const script = window.document.createElement('script');\n    script.src = bootstrap_script_path;\n    window.document.head.appendChild(script);\n};\nwindow.addEventListener('load', () => {\n    loadBootstrapScript(localStorage);\n});\n\n\n//# sourceURL=webpack:///./src/index.ts?");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = {};
/******/ 	__webpack_modules__["./src/index.ts"]();
/******/ 	
/******/ })()
;