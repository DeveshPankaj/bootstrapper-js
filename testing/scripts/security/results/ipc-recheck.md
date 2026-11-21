# Security suite — ipc-recheck

- BASE_URL: `http://localhost:8080`
- static checks scanned: `this repo`
- finished: 2026-11-21T08:43:08.392Z
- **phase1**: 22/22 findings pass (0 fail, 0 error); 38/38 checks
- **info**: 1/1 findings pass (0 fail, 0 error); 1/1 checks
- **phase2**: 0/2 findings pass (2 fail, 0 error); 0/2 checks

## phase1

| Finding | Result | Checks passed | Not passing | Script |
|---|---|---|---|---|
| APP-5 | PASS | 1/1 |  | test-static.mjs |
| APP-6 | PASS | 1/1 |  | test-static.mjs |
| APP-7 | PASS | 1/1 |  | test-static.mjs |
| APP-8 | PASS | 2/2 |  | test-static.mjs |
| APP-9 | PASS | 1/1 |  | test-ipc.mjs |
| APP-10 | PASS | 2/2 |  | test-static.mjs |
| APP-11 | PASS | 1/1 |  | test-static.mjs |
| APP-12 | PASS | 1/1 |  | test-static.mjs |
| APP-13 | PASS | 1/1 |  | test-static.mjs |
| APP-14 | PASS | 4/4 |  | test-static.mjs |
| BOOT-3 | PASS | 2/2 |  | test-open-policy.mjs |
| D15 | PASS | 1/1 |  | test-static.mjs |
| KRN-1 | PASS | 2/2 |  | test-ipc.mjs |
| KRN-3 | PASS | 2/2 |  | test-static.mjs |
| KRN-13 | PASS | 1/1 |  | test-ipc.mjs |
| NET-5 | PASS | 1/1 |  | test-static.mjs |
| NET-8 | PASS | 5/5 |  | test-open-policy.mjs |
| NET-12 | PASS | 1/1 |  | test-static.mjs |
| WIN-3 | PASS | 3/3 |  | test-open-policy.mjs |
| WIN-4 | PASS | 2/2 |  | test-ipc.mjs |
| WIN-5 | PASS | 1/1 |  | test-static.mjs |
| WIN-7 | PASS | 2/2 |  | test-ipc.mjs |

## phase2

| Finding | Result | Checks passed | Not passing | Script |
|---|---|---|---|---|
| APP-15 | FAIL | 0/1 | FAIL static-apps-no-top-parent | test-static.mjs |
| KRN-6 | FAIL | 0/1 | FAIL static-no-same-origin-app-sandboxes | test-static.mjs |

## info

| Finding | Result | Checks passed | Not passing | Script |
|---|---|---|---|---|
| APP-11 | PASS | 1/1 |  | test-static.mjs |

## Scripts

| Script | Exit | Seconds | Checks |
|---|---|---|---|
| test-ipc.mjs | 0 | 53 | 8 |
| test-open-policy.mjs | 0 | 60 | 10 |
| test-static.mjs | 0 | 1 | 23 |

## All checks

| Finding | Phase | Result | Check | Detail |
|---|---|---|---|---|
| APP-5 | phase1 | PASS | static-notebook-markdown-sanitised | 0 unsanitised marked → innerHTML: |
| APP-6 | phase1 | PASS | static-ai-dom-lens-page-frame-no-scripts | pageFrame sandbox values: ["allow-same-origin"] (tag: <iframe id="pageFrame" sandbox="allow-same-origin" style="flex:1;border:none;display:none;) |
| APP-7 | phase1 | PASS | static-mermaid-security-level | securityLevel values: ["strict"] |
| APP-8 | phase1 | PASS | static-innerhtml-totp-auth/main.html | 0 raw sinks in docs/public/mount/opt/apps/totp-auth/main.html |
| APP-8 | phase1 | PASS | static-totp-no-localstorage | no localStorage writes |
| APP-9 | phase1 | PASS | bookmark-no-opener-no-ipc | in-OS frame; opener=false; 0 replies, 0 successful; secretLeaked=false |
| APP-10 | phase1 | PASS | static-innerhtml-trainboard/main.html | 0 raw sinks in docs/public/mount/opt/apps/trainboard/main.html |
| APP-10 | phase1 | PASS | static-innerhtml-trainboard/board.html | 0 raw sinks in docs/public/mount/opt/apps/trainboard/board.html |
| APP-11 | phase1 | PASS | static-cdn-pinned-sri-viewer-apps | 0 CDN <script src> in 1F-owned apps without exact version+SRI: |
| APP-11 | info | PASS | static-cdn-pinned-sri-other-apps | 0 in other apps / pages: |
| APP-12 | phase1 | PASS | static-ts-ide-preview-no-same-origin | ts-ide preview sandbox values: ["allow-scripts"] |
| APP-13 | phase1 | PASS | static-dashboard-no-inline-handlers | 0 inline handlers with interpolation: |
| APP-14 | phase1 | PASS | static-innerhtml-dock/gnome.html | 0 raw sinks in docs/public/mount/opt/apps/dock/gnome.html |
| APP-14 | phase1 | PASS | static-innerhtml-dock/macos.html | 0 raw sinks in docs/public/mount/opt/apps/dock/macos.html |
| APP-14 | phase1 | PASS | static-innerhtml-audio-player/player.html | 0 raw sinks in docs/public/mount/opt/apps/audio-player/player.html |
| APP-14 | phase1 | PASS | static-innerhtml-fs-inspector/main.html | 0 raw sinks in docs/public/mount/opt/apps/fs-inspector/main.html |
| APP-15 | phase2 | FAIL | static-apps-no-top-parent | 14 app files reference top./parent.: audio-player/main.js(1), audio-player/player.html(1), bookmarks/main.js(1), distributed-compute/lib/worker-task-runtime.js(1), explorer-sifi/main.js(5), file-explorer/main.js(5), fs-inspector/main.html(3 |
| BOOT-3 | phase1 | PASS | open-js-in-home | ran=[] windows=["ui.notepad"] dialogs(declined)=[] |
| BOOT-3 | phase1 | PASS | open-run-in-home | ran=[] windows=["ui.notepad"] dialogs(declined)=[] |
| D15 | phase1 | PASS | static-dead-exec-engine-removed | removed |
| KRN-1 | phase1 | PASS | unregistered-sandboxed-frame | 0 replies, 0 successful; secretLeaked=false; fileWritten=false |
| KRN-1 | phase1 | PASS | cross-site-popup | popupBooted=true; 0 replies, 0 successful; secretLeaked=false; fileWritten=false |
| KRN-3 | phase1 | PASS | static-no-interpolated-dsl | 0 interpolated DSL sites: |
| KRN-3 | phase1 | PASS | static-no-interpolated-dsl-etc-scripts | 0 interpolated DSL sites in /etc/settings + /etc/widgets scripts (not assigned in TODO 1A–1F): |
| KRN-6 | phase2 | FAIL | static-no-same-origin-app-sandboxes | 1 sandbox strings with allow-scripts+allow-same-origin: src/core/window-manager.ts:592 |
| KRN-13 | phase1 | PASS | broadcast-to-foreign-frame | wos-ipc-events=0 []; other=[] |
| NET-5 | phase1 | PASS | static-innerhtml-ui/app.js | 0 raw sinks in docs/public/mount/opt/apps/distributed-compute/ui/app.js |
| NET-8 | phase1 | PASS | open-js-in-mnt | ran=[] windows=["ui.notepad"] dialogs(declined)=[] |
| NET-8 | phase1 | PASS | open-run-in-mnt | ran=[] windows=["ui.notepad"] dialogs(declined)=[] |
| NET-8 | phase1 | PASS | open-svg-in-mnt | ran=[] windows=["ui.imageviewer"] dialogs(declined)=[] |
| NET-8 | phase1 | PASS | open-html-in-mnt | ran=[] windows=["ui.sandboxed-app"] dialogs(declined)=[] |
| NET-8 | phase1 | PASS | files-double-click-in-mnt | ran=[] opened=["js:explorer+ui.notepad","run:explorer+ui.notepad","svg:explorer+ui.imageviewer","html:explorer+ui.sandboxed-app"] |
| NET-12 | phase1 | PASS | static-webamp-pinned | no unpinned webamp URL |
| WIN-3 | phase1 | PASS | open-svg-in-home | ran=[] windows=["ui.imageviewer"] dialogs(declined)=[] |
| WIN-3 | phase1 | PASS | open-html-in-home | ran=[] windows=["ui.sandboxed-app"] dialogs(declined)=[] |
| WIN-3 | phase1 | PASS | files-double-click-in-home | ran=[] opened=["js:explorer+ui.notepad","run:explorer+ui.notepad","svg:explorer+ui.imageviewer","html:explorer+ui.sandboxed-app"] |
| WIN-4 | phase1 | PASS | browser-app-page-ipc | 0 replies, 0 successful; secretLeaked=false; fileWritten=false |
| WIN-4 | phase1 | PASS | browser-app-cross-origin-sandboxed | sandbox="allow-scripts allow-same-origin allow-forms" referrerpolicy=no-referrer |
| WIN-5 | phase1 | PASS | static-innerhtml-core/window-manager.ts | 0 raw sinks in src/core/window-manager.ts |
| WIN-7 | phase1 | PASS | dock-frame-fs | 4 replies, 0 successful; secretLeaked=false; written=[] |
| WIN-7 | phase1 | PASS | wallpaper-frame-fs | 3 replies, 0 successful; secretLeaked=false; fileWritten=false |
