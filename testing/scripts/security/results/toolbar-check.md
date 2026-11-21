# Security suite — toolbar-check

- BASE_URL: `http://localhost:8080`
- static checks scanned: `this repo`
- finished: 2026-11-21T03:32:08.721Z
- **phase1**: 12/14 findings pass (2 fail, 0 error); 18/20 checks
- **info**: 0/1 findings pass (1 fail, 0 error); 0/1 checks
- **phase2**: 0/2 findings pass (2 fail, 0 error); 0/2 checks

## phase1

| Finding | Result | Checks passed | Not passing | Script |
|---|---|---|---|---|
| APP-5 | PASS | 1/1 |  | test-static.mjs |
| APP-6 | PASS | 1/1 |  | test-static.mjs |
| APP-7 | PASS | 1/1 |  | test-static.mjs |
| APP-8 | PASS | 2/2 |  | test-static.mjs |
| APP-10 | PASS | 2/2 |  | test-static.mjs |
| APP-11 | FAIL | 0/1 | FAIL static-cdn-pinned-sri-viewer-apps | test-static.mjs |
| APP-12 | PASS | 1/1 |  | test-static.mjs |
| APP-13 | FAIL | 0/1 | FAIL static-dashboard-no-inline-handlers | test-static.mjs |
| APP-14 | PASS | 4/4 |  | test-static.mjs |
| D15 | PASS | 1/1 |  | test-static.mjs |
| KRN-3 | PASS | 2/2 |  | test-static.mjs |
| NET-5 | PASS | 1/1 |  | test-static.mjs |
| NET-12 | PASS | 1/1 |  | test-static.mjs |
| WIN-5 | PASS | 1/1 |  | test-static.mjs |

## phase2

| Finding | Result | Checks passed | Not passing | Script |
|---|---|---|---|---|
| APP-15 | FAIL | 0/1 | FAIL static-apps-no-top-parent | test-static.mjs |
| KRN-6 | FAIL | 0/1 | FAIL static-no-same-origin-app-sandboxes | test-static.mjs |

## info

| Finding | Result | Checks passed | Not passing | Script |
|---|---|---|---|---|
| APP-11 | FAIL | 0/1 | FAIL static-cdn-pinned-sri-other-apps | test-static.mjs |

## Scripts

| Script | Exit | Seconds | Checks |
|---|---|---|---|
| test-static.mjs | 0 | 0 | 23 |

## All checks

| Finding | Phase | Result | Check | Detail |
|---|---|---|---|---|
| APP-5 | phase1 | PASS | static-notebook-markdown-sanitised | 0 unsanitised marked → innerHTML: |
| APP-6 | phase1 | PASS | static-ai-dom-lens-page-frame-no-scripts | pageFrame sandbox values: ["allow-same-origin"] (tag: <iframe id="pageFrame" sandbox="allow-same-origin" style="flex:1;border:none;display:none;) |
| APP-7 | phase1 | PASS | static-mermaid-security-level | securityLevel values: ["strict"] |
| APP-8 | phase1 | PASS | static-innerhtml-totp-auth/main.html | 0 raw sinks in docs/public/mount/opt/apps/totp-auth/main.html |
| APP-8 | phase1 | PASS | static-totp-no-localstorage | no localStorage writes |
| APP-10 | phase1 | PASS | static-innerhtml-trainboard/main.html | 0 raw sinks in docs/public/mount/opt/apps/trainboard/main.html |
| APP-10 | phase1 | PASS | static-innerhtml-trainboard/board.html | 0 raw sinks in docs/public/mount/opt/apps/trainboard/board.html |
| APP-11 | phase1 | FAIL | static-cdn-pinned-sri-viewer-apps | 4 CDN <script src> in 1F-owned apps without exact version+SRI: docs/public/mount/opt/apps/python-demo/demo.html:237 unpinned https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js \| docs/public/mount/opt/apps/python-repl/python.html:99 un |
| APP-11 | info | FAIL | static-cdn-pinned-sri-other-apps | 4 in other apps / pages: docs/public/mount/opt/apps/distributed-compute/main.html:157 no-SRI https://unpkg.com/codemirror@5.65.16/lib/codemirror.js \| docs/public/mount/opt/apps/distributed-compute/main.html:158 no-SRI https://unpkg.com/code |
| APP-12 | phase1 | PASS | static-ts-ide-preview-no-same-origin | ts-ide preview sandbox values: ["allow-scripts"] |
| APP-13 | phase1 | FAIL | static-dashboard-no-inline-handlers | 1 inline handlers with interpolation: 830 onclick="selColor('${ |
| APP-14 | phase1 | PASS | static-innerhtml-dock/gnome.html | 0 raw sinks in docs/public/mount/opt/apps/dock/gnome.html |
| APP-14 | phase1 | PASS | static-innerhtml-dock/macos.html | 0 raw sinks in docs/public/mount/opt/apps/dock/macos.html |
| APP-14 | phase1 | PASS | static-innerhtml-audio-player/player.html | 0 raw sinks in docs/public/mount/opt/apps/audio-player/player.html |
| APP-14 | phase1 | PASS | static-innerhtml-fs-inspector/main.html | 0 raw sinks in docs/public/mount/opt/apps/fs-inspector/main.html |
| APP-15 | phase2 | FAIL | static-apps-no-top-parent | 14 app files reference top./parent.: audio-player/main.js(1), audio-player/player.html(1), bookmarks/main.js(1), distributed-compute/lib/worker-task-runtime.js(1), explorer-sifi/main.js(5), file-explorer/main.js(5), fs-inspector/main.html(3 |
| D15 | phase1 | PASS | static-dead-exec-engine-removed | removed |
| KRN-3 | phase1 | PASS | static-no-interpolated-dsl | 0 interpolated DSL sites: |
| KRN-3 | phase1 | PASS | static-no-interpolated-dsl-etc-scripts | 0 interpolated DSL sites in /etc/settings + /etc/widgets scripts (not assigned in TODO 1A–1F): |
| KRN-6 | phase2 | FAIL | static-no-same-origin-app-sandboxes | 2 sandbox strings with allow-scripts+allow-same-origin: src/core/window-manager.ts:592, docs/public/mount/opt/apps/dashboard/dashboard.html:528 |
| NET-5 | phase1 | PASS | static-innerhtml-ui/app.js | 0 raw sinks in docs/public/mount/opt/apps/distributed-compute/ui/app.js |
| NET-12 | phase1 | PASS | static-webamp-pinned | no unpinned webamp URL |
| WIN-5 | phase1 | PASS | static-innerhtml-core/window-manager.ts | 0 raw sinks in src/core/window-manager.ts |
