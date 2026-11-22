# Security suite — prod-build

- BASE_URL: `http://localhost:8090`
- static checks scanned: `this repo`
- finished: 2026-11-22T04:38:45.474Z
- **phase1**: 47/47 findings pass (0 fail, 0 error); 121/121 checks
- **phase2**: 0/8 findings pass (8 fail, 0 error); 0/9 checks
- **info**: 4/5 findings pass (1 fail, 0 error); 5/6 checks

## phase1

| Finding | Result | Checks passed | Not passing | Script |
|---|---|---|---|---|
| APP-1 | PASS | 1/1 |  | test-dsl-injection.mjs |
| APP-5 | PASS | 2/2 |  | test-static.mjs, test-xss.mjs |
| APP-6 | PASS | 1/1 |  | test-static.mjs |
| APP-7 | PASS | 2/2 |  | test-static.mjs, test-xss.mjs |
| APP-8 | PASS | 2/2 |  | test-static.mjs |
| APP-9 | PASS | 1/1 |  | test-ipc.mjs |
| APP-10 | PASS | 3/3 |  | test-static.mjs, test-xss.mjs |
| APP-11 | PASS | 1/1 |  | test-static.mjs |
| APP-12 | PASS | 1/1 |  | test-static.mjs |
| APP-13 | PASS | 2/2 |  | test-static.mjs, test-xss.mjs |
| APP-14 | PASS | 7/7 |  | test-static.mjs, test-xss.mjs |
| BOOT-3 | PASS | 2/2 |  | test-open-policy.mjs |
| BOOT-4 | PASS | 2/2 |  | test-traversal.mjs |
| BOOT-5 | PASS | 2/2 |  | test-autorun.mjs |
| BOOT-6 | PASS | 1/1 |  | test-boot-integrity.mjs |
| BOOT-8 | PASS | 3/3 |  | test-traversal.mjs |
| BOOT-9 | PASS | 2/2 |  | test-commands.mjs |
| BOOT-10 | PASS | 1/1 |  | test-traversal.mjs |
| BOOT-11 | PASS | 1/1 |  | test-autorun.mjs |
| D15 | PASS | 1/1 |  | test-static.mjs |
| KRN-1 | PASS | 2/2 |  | test-ipc.mjs |
| KRN-2 | PASS | 3/3 |  | test-url-launcher.mjs |
| KRN-3 | PASS | 14/14 |  | test-dsl-injection.mjs, test-static.mjs |
| KRN-5 | PASS | 7/7 |  | test-acl.mjs |
| KRN-7 | PASS | 5/5 |  | test-sw.mjs |
| KRN-8 | PASS | 2/2 |  | test-sw.mjs |
| KRN-9 | PASS | 3/3 |  | test-boot-integrity.mjs |
| KRN-10 | PASS | 3/3 |  | test-commands.mjs |
| KRN-11 | PASS | 5/5 |  | test-framing.mjs |
| KRN-13 | PASS | 1/1 |  | test-ipc.mjs |
| NET-1 | PASS | 2/2 |  | test-peer.mjs |
| NET-3 | PASS | 1/1 |  | test-peer.mjs |
| NET-4 | PASS | 1/1 |  | test-traversal.mjs |
| NET-5 | PASS | 2/2 |  | test-peer.mjs, test-static.mjs |
| NET-6 | PASS | 1/1 |  | test-peer.mjs |
| NET-8 | PASS | 5/5 |  | test-open-policy.mjs |
| NET-10 | PASS | 1/1 |  | test-peer.mjs |
| NET-11 | PASS | 2/2 |  | test-peer.mjs |
| NET-12 | PASS | 1/1 |  | test-static.mjs |
| WIN-2 | PASS | 4/4 |  | test-dsl-injection.mjs |
| WIN-3 | PASS | 3/3 |  | test-open-policy.mjs |
| WIN-4 | PASS | 2/2 |  | test-ipc.mjs |
| WIN-5 | PASS | 5/5 |  | test-static.mjs, test-xss.mjs |
| WIN-6 | PASS | 4/4 |  | test-autorun.mjs |
| WIN-7 | PASS | 2/2 |  | test-ipc.mjs |
| WIN-8 | PASS | 1/1 |  | test-xss.mjs |
| WIN-10 | PASS | 1/1 |  | test-acl.mjs |

## phase2

| Finding | Result | Checks passed | Not passing | Script |
|---|---|---|---|---|
| APP-15 | FAIL | 0/1 | FAIL static-apps-no-top-parent | test-static.mjs |
| BOOT-5 | FAIL | 0/1 | FAIL planted-widget-runs-sandboxed | test-autorun.mjs |
| KRN-4 | FAIL | 0/1 | FAIL explicit-run-is-not-top-realm | test-sandbox-phase2.mjs |
| KRN-6 | FAIL | 0/2 | FAIL sandbox-app-iframe-opaque; FAIL static-no-same-origin-app-sandboxes | test-sandbox-phase2.mjs, test-static.mjs |
| KRN-12 | FAIL | 0/1 | FAIL deeplink-handoff-not-swallowable | test-commands.mjs |
| NET-7 | FAIL | 0/1 | FAIL other-app-cannot-open-keystore | test-sandbox-phase2.mjs |
| WIN-1 | FAIL | 0/1 | FAIL app-window-isolated | test-sandbox-phase2.mjs |
| WIN-9 | FAIL | 0/1 | FAIL app-cannot-kill-other-window | test-sandbox-phase2.mjs |

## info

| Finding | Result | Checks passed | Not passing | Script |
|---|---|---|---|---|
| APP-11 | PASS | 1/1 |  | test-static.mjs |
| KRN-2 | PASS | 1/1 |  | test-url-launcher.mjs |
| KRN-3 | PASS | 1/1 |  | test-dsl-injection.mjs |
| KRN-8 | FAIL | 1/2 | FAIL forged-reply-from-second-tab | test-sw.mjs |
| KRN-10 | PASS | 1/1 |  | test-commands.mjs |

## Scripts

| Script | Exit | Seconds | Checks |
|---|---|---|---|
| test-acl.mjs | 0 | 7 | 8 |
| test-autorun.mjs | 0 | 26 | 8 |
| test-boot-integrity.mjs | 0 | 28 | 4 |
| test-commands.mjs | 0 | 58 | 7 |
| test-dsl-injection.mjs | 0 | 121 | 18 |
| test-framing.mjs | 0 | 42 | 5 |
| test-ipc.mjs | 0 | 45 | 8 |
| test-open-policy.mjs | 0 | 53 | 10 |
| test-peer.mjs | 0 | 51 | 8 |
| test-sandbox-phase2.mjs | 0 | 7 | 5 |
| test-static.mjs | 0 | 0 | 23 |
| test-sw.mjs | 0 | 18 | 9 |
| test-traversal.mjs | 0 | 30 | 7 |
| test-url-launcher.mjs | 0 | 48 | 4 |
| test-xss.mjs | 0 | 30 | 12 |

## All checks

| Finding | Phase | Result | Check | Detail |
|---|---|---|---|---|
| APP-1 | phase1 | PASS | explorer-sifi-double-click-and-menu | double-click sentinel=[]; menu fired on: []; actions: ["Edit","Open","Rename","Compare with…","Compress to ZIP","Copy","Cut","Properties","Text Editor","VS Code","Spreadsheet","Image Viewer","Music Player","SQLite Browser","Python REPL","Br |
| APP-5 | phase1 | PASS | static-notebook-markdown-sanitised | 0 unsanitised marked → innerHTML: |
| APP-5 | phase1 | PASS | notebook-markdown-cell-no-script | fired=[] |
| APP-6 | phase1 | PASS | static-ai-dom-lens-page-frame-no-scripts | pageFrame sandbox values: ["allow-same-origin"] (tag: <iframe id="pageFrame" sandbox="allow-same-origin" style="flex:1;border:none;display:none;) |
| APP-7 | phase1 | PASS | static-mermaid-security-level | securityLevel values: ["strict"] |
| APP-7 | phase1 | PASS | mermaid-click-javascript | fired=[]; javascript: links in svg=0 |
| APP-8 | phase1 | PASS | static-innerhtml-totp-auth/main.html | 0 raw sinks in docs/public/mount/opt/apps/totp-auth/main.html |
| APP-8 | phase1 | PASS | static-totp-no-localstorage | no localStorage writes |
| APP-9 | phase1 | PASS | bookmark-no-opener-no-ipc | in-OS frame; opener=false; 0 replies, 0 successful; secretLeaked=false |
| APP-10 | phase1 | PASS | static-innerhtml-trainboard/main.html | 0 raw sinks in docs/public/mount/opt/apps/trainboard/main.html |
| APP-10 | phase1 | PASS | static-innerhtml-trainboard/board.html | 0 raw sinks in docs/public/mount/opt/apps/trainboard/board.html |
| APP-10 | phase1 | PASS | trainboard-log-values-are-text | fired=[] |
| APP-11 | phase1 | PASS | static-cdn-pinned-sri-viewer-apps | 0 CDN <script src> in 1F-owned apps without exact version+SRI: |
| APP-11 | info | PASS | static-cdn-pinned-sri-other-apps | 0 in other apps / pages: |
| APP-12 | phase1 | PASS | static-ts-ide-preview-no-same-origin | ts-ide preview sandbox values: ["allow-scripts"] |
| APP-13 | phase1 | PASS | static-dashboard-no-inline-handlers | 0 inline handlers with interpolation: |
| APP-13 | phase1 | PASS | dashboard-picker-folder-name | fired=[] |
| APP-14 | phase1 | PASS | static-innerhtml-dock/gnome.html | 0 raw sinks in docs/public/mount/opt/apps/dock/gnome.html |
| APP-14 | phase1 | PASS | static-innerhtml-dock/macos.html | 0 raw sinks in docs/public/mount/opt/apps/dock/macos.html |
| APP-14 | phase1 | PASS | static-innerhtml-audio-player/player.html | 0 raw sinks in docs/public/mount/opt/apps/audio-player/player.html |
| APP-14 | phase1 | PASS | static-innerhtml-fs-inspector/main.html | 0 raw sinks in docs/public/mount/opt/apps/fs-inspector/main.html |
| APP-14 | phase1 | PASS | media-player-file-name-is-text | fired=[] |
| APP-14 | phase1 | PASS | dock-gnome-title-is-text | {"xss":false,"imgs":0,"text":true} |
| APP-14 | phase1 | PASS | dock-macos-title-is-text | {"xss":false,"imgs":0,"text":true} |
| APP-15 | phase2 | FAIL | static-apps-no-top-parent | 14 app files reference top./parent.: audio-player/main.js(1), audio-player/player.html(1), bookmarks/main.js(1), distributed-compute/lib/worker-task-runtime.js(1), explorer-sifi/main.js(5), file-explorer/main.js(5), fs-inspector/main.html(3 |
| BOOT-3 | phase1 | PASS | open-js-in-home | ran=[] windows=["ui.notepad"] dialogs(declined)=[] |
| BOOT-3 | phase1 | PASS | open-run-in-home | ran=[] windows=["ui.notepad"] dialogs(declined)=[] |
| BOOT-4 | phase1 | PASS | registry-dest-traversal | initd.run changed=false; /etc/widgets/sec-boot4.js=false; outside=[]; fileFetches=[0,0,0]; prompts(accepted)=[] |
| BOOT-4 | phase1 | PASS | registry-wrong-sha256 | main.js written=false; ran=[]; fetched=1 |
| BOOT-5 | phase1 | PASS | managers-json-wm-id-traversal | sentinels=[] |
| BOOT-5 | phase1 | PASS | installed-json-mainfile-outside-app-dir | ran at boot=false (all boot sentinels ["__sec_ar_widget"]) |
| BOOT-5 | phase2 | FAIL | planted-widget-runs-sandboxed | /etc/widgets/sec-evil.js ran in the top realm=true |
| BOOT-6 | phase1 | PASS | vfs-meta-json-not-authoritative | booted=true; explorerEqualsServerCopy=true (len 70329 vs 70329); attackerFetches=0; sentinels=[] |
| BOOT-8 | phase1 | PASS | files-extract-zip-slip | via menu:Extract here; outside=[]; inside=1; prompts=[] |
| BOOT-8 | phase1 | PASS | unzip-run-zip-slip | ran; outside=[]; inside=1 |
| BOOT-8 | phase1 | PASS | tar-run-path-slip | ran; outside=[]; inside=1 |
| BOOT-9 | phase1 | PASS | deeplink-app-dotdot | booted=true; sentinels=[] |
| BOOT-9 | phase1 | PASS | deeplink-uninstalled-app | booted=true; sentinels=[] |
| BOOT-10 | phase1 | PASS | uninstall-uses-validated-app-dir | ~/sec-b10 survived=true; pre-uninstall ran=[]; /opt/apps/sec-victim-pkg removed=true |
| BOOT-11 | phase1 | PASS | tampered-menu-item-js | menuShown=true; sentinels=[] |
| D15 | phase1 | PASS | static-dead-exec-engine-removed | removed |
| KRN-1 | phase1 | PASS | unregistered-sandboxed-frame | 0 replies, 0 successful; secretLeaked=false; fileWritten=false |
| KRN-1 | phase1 | PASS | cross-site-popup | popupBooted=true; 0 replies, 0 successful; secretLeaked=false; fileWritten=false |
| KRN-2 | phase1 | PASS | app-param-breakout | booted=true; sentinels=[] |
| KRN-2 | phase1 | PASS | apps-param-breakout | booted=true; sentinels=[] |
| KRN-2 | phase1 | PASS | args-without-deeplink-optin | booted=true; attackerFetches=0; attackerFrames=0; windows=["ui.iframe"] |
| KRN-2 | info | PASS | launcher-still-opens-valid-name | windows=["ui.notepad"] |
| KRN-3 | info | PASS | control-payload-is-live | sentinel after hand-built DSL: ["__sec_k3"] |
| KRN-3 | phase1 | PASS | host-exec-txt | sentinel=[] windows=["ui.notepad"] |
| KRN-3 | phase1 | PASS | host-exec-md | sentinel=[] windows=["ui.markdown"] |
| KRN-3 | phase1 | PASS | host-exec-png | sentinel=[] windows=["ui.imageviewer"] |
| KRN-3 | phase1 | PASS | host-exec-unknown-ext | sentinel=[] windows=["ui.notepad"] |
| KRN-3 | phase1 | PASS | host-exec-folder | sentinel=[] windows=["explorer"] |
| KRN-3 | phase1 | PASS | ui-settings-initial-section | sentinel=[] |
| KRN-3 | phase1 | PASS | files-double-click-txt | sentinel=[] |
| KRN-3 | phase1 | PASS | files-double-click-audio | sentinel=[] |
| KRN-3 | phase1 | PASS | files-context-menu-file | fired on: []; actions tried: ["Edit","Open","Download","Rename","Compare with…","Compress to ZIP","Copy","Cut","Properties","Edit (about.html)","VS Code","Browser","Delete"] |
| KRN-3 | phase1 | PASS | files-context-menu-folder | fired on: []; actions tried: ["Open in explorer","Rename","Compress to ZIP","Copy","Cut","Properties","Delete"] |
| KRN-3 | phase1 | PASS | desktop-icon-double-click | sentinel=[] |
| KRN-3 | phase1 | PASS | desktop-icon-context-menu | fired on: []; actions tried: ["Edit","Open","Edit (about.html)","VS Code","Browser","Delete"] |
| KRN-3 | phase1 | PASS | static-no-interpolated-dsl | 0 interpolated DSL sites: |
| KRN-3 | phase1 | PASS | static-no-interpolated-dsl-etc-scripts | 0 interpolated DSL sites in /etc/settings + /etc/widgets scripts (not assigned in TODO 1A–1F): |
| KRN-4 | phase2 | FAIL | explicit-run-is-not-top-realm | vfs script reached the top realm=true |
| KRN-5 | phase1 | PASS | namespace-traversal-write-denied | allowed=[] |
| KRN-5 | phase1 | PASS | namespace-foreign-app-data-unreadable | allowed=[] |
| KRN-5 | phase1 | PASS | namespace-kernel-owned-not-writable | allowed=[] |
| KRN-5 | phase1 | PASS | namespace-tmp-per-app | shared allowed=[]; own dirs={"/tmp/sec-acl-app/x":"ALLOWED","/home/user1/.local/share/sec-acl-app/x":"ALLOWED"} |
| KRN-5 | phase1 | PASS | namespace-bad-id-no-write-scope | appDir=; allowed=[] |
| KRN-5 | phase1 | PASS | proxyfs-refuses-traversal-and-secret | {"write":"denied","read":"denied","onDisk":false} |
| KRN-5 | phase1 | PASS | appsdk-port-refuses-traversal-and-secret | {"write":"denied: [acl] write denied: pid=9 id=ui.snake-game path=/tmp/../etc/","read":"denied: [acl] read denied: pid=9 id=ui.snake-game path=/home/user1/.","kernel":"denied: [acl] write denied: pid=9 id=ui.snake-ga"}; /etc/sec-acl-sdk.txt |
| KRN-6 | phase2 | FAIL | sandbox-app-iframe-opaque | reachable: ["parentDocument","indexedDB","removeSandbox"] |
| KRN-6 | phase2 | FAIL | static-no-same-origin-app-sandboxes | 1 sandbox strings with allow-scripts+allow-same-origin: src/core/window-manager.ts:600 |
| KRN-7 | phase1 | PASS | top-level-html-is-opaque | {"origin":"null","localStorage":"BLOCKED SecurityError","indexedDB":"BLOCKED SecurityError","parentPlatform":false} |
| KRN-7 | phase1 | PASS | top-level-svg-is-opaque | {"origin":"null","localStorage":"BLOCKED SecurityError"} |
| KRN-7 | phase1 | PASS | top-level-opt-apps-is-opaque | {"origin":"null","localStorage":"BLOCKED SecurityError","indexedDB":"BLOCKED SecurityError","parentPlatform":false} |
| KRN-7 | phase1 | PASS | iframe-home-html-is-opaque | {"origin":"null","localStorage":"BLOCKED SecurityError","indexedDB":"BLOCKED SecurityError","parentPlatform":"BLOCKED SecurityError"} |
| KRN-7 | phase1 | PASS | vfs-response-headers | {"/(sw)/tmp/sec-sw/x.html":{"status":200,"type":"text/html; charset=utf-8","csp":"sandbox allow-scripts allow-forms allow-modals","nosniff":"nosniff","corp":"same-origin"},"/(sw)/tmp/sec-sw/a.unknownext":{"status":200,"type":"application/oc |
| KRN-8 | phase1 | PASS | request-ids-unpredictable | ids=["818e0bb7-ca71-4ca8-bd0f-4f29c65af029","9a50926f-705b-4eab-9a65-88bd835c6e20","9c142ae5-e90f-4496-8700-a36cb8c3a8ae","9cc9b881-2d52-4b44-b0d8-4a65f3e3feab"] consecutiveIntegers=false |
| KRN-8 | phase1 | PASS | forged-reply-from-nested-frame | {"status":404,"body":"Not found","ms":10019}; nestedFrameGotRequestsDirectly=0 |
| KRN-8 | info | FAIL | forged-reply-from-second-tab | {"status":200,"body":"FORGED-BY-TAB","ms":2}; secondTabGotRequestsDirectly=1 (residual: one registered kernel client per request) |
| KRN-8 | info | PASS | os-tab-still-serves | {"status":200,"body":"REAL-CONTENT","ms":1} |
| KRN-9 | phase1 | PASS | bootstrap-override-cross-site | osBooted=true; evilFetched=0; sentinels=[]; scripts=["bootstrapper.bundle.js","/remote.bundle.js"] |
| KRN-9 | phase1 | PASS | bootstrap-override-vfs-file | osBooted=true; sentinels=[]; keyAfterBoot=null |
| KRN-9 | phase1 | PASS | fsbackend-link-needs-consent | storedBackend=null; idbMarkerVisibleAfterReload=true; dialogs=["This link asks to switch this browser's file system storage from \"indexeddb\" to "] |
| KRN-10 | phase1 | PASS | app-cannot-replace-ui.notepad | owner before=005-ui.notepad; script ran; replaced=false; sentinels=[] |
| KRN-10 | phase1 | PASS | app-cannot-replace-ui.remote-machines | owner before=/(sw)/opt/apps/remote-machines/main.js; script ran; replaced=false; sentinels=[] |
| KRN-10 | phase1 | PASS | extension-claim-not-default | opened={"readme.txt":["ui.notepad"],"pic.svg":["ui.imageviewer"]}; sentinels=[] |
| KRN-10 | info | PASS | explorer-owned-by-files-app | {"owner":"/(sw)/opt/apps/file-explorer/main.js","fallback":false} |
| KRN-11 | phase1 | PASS | cross-site-embed-refused | {"fs":false,"platform":false,"ipc":false,"desktop":false,"text":"This page can’t run inside another site\nOpen it in its own tab"} |
| KRN-11 | phase1 | PASS | os-popup-drops-opener | popupBooted=true; popup.window.opener set=false; attackerStillHoldsHandle=true |
| KRN-11 | phase1 | PASS | window-open-from-top-has-no-opener | {"ret":"null","opened":true,"hadOpener":false,"referrer":""} |
| KRN-11 | phase1 | PASS | window-open-from-app-window-has-no-opener | {"ret":"null","opened":true,"hadOpener":false,"referrer":""} |
| KRN-11 | phase1 | PASS | meta-csp-in-index-and-404 | {"/":{"meta":true,"objectSrcNone":true,"baseUriSelf":true,"scriptSrc":true},"/404.html":{"meta":true,"objectSrcNone":true,"baseUriSelf":true,"scriptSrc":true}} |
| KRN-12 | phase2 | FAIL | deeplink-handoff-not-swallowable | newTabBooted=false; rogueAcks=1; newTabText="Opened in your other tab\n\nThis link was handed to the tab where the app is alrea" |
| KRN-13 | phase1 | PASS | broadcast-to-foreign-frame | wos-ipc-events=0 []; other=[] |
| NET-1 | phase1 | PASS | dc-task-not-run-before-opt-in | subscribers=1; reply={"type":"dc-result","to":"sec-attacker","taskId":"sec-task-1","ok":false,"refused":true,"error":"not accepting tasks from this group"} |
| NET-1 | phase1 | PASS | dc-task-after-opt-in-is-opaque | opted in via hook; task sees {"origin":"null","idb":"BLOCKED SecurityError","xhr":"BLOCKED NetworkError","top":false,"caches":"undefined"} |
| NET-3 | phase1 | PASS | mount-traversal-stays-inside | mount=/mnt/webrtc/Mallory-stuff (mountShare did not settle in 20s); outside=[]; inside=2 |
| NET-4 | phase1 | PASS | ssh-mirror-and-save-stay-inside | mount=/mnt/ssh/sec-evil-box; save=saved; outside=[]; inside=3 |
| NET-5 | phase1 | PASS | roster-peer-name-is-text | {"imgs":0,"text":"Victim (you)<img src=x onerror=\"window.__sec_dc_xss=1\">","xss":false} |
| NET-5 | phase1 | PASS | static-innerhtml-ui/app.js | 0 raw sinks in docs/public/mount/opt/apps/distributed-compute/ui/app.js |
| NET-6 | phase1 | PASS | webrtc-api-share-from-other-app-refused | result="[object Object]"; shares=[]; prompts (declined)=["Another app or the terminal asks WebRTC Chat to run:\n\n webrtc share add /home/u"] |
| NET-7 | phase2 | FAIL | other-app-cannot-open-keystore | OPENED stores= |
| NET-8 | phase1 | PASS | open-js-in-mnt | ran=[] windows=["ui.notepad"] dialogs(declined)=[] |
| NET-8 | phase1 | PASS | open-run-in-mnt | ran=[] windows=["ui.notepad"] dialogs(declined)=[] |
| NET-8 | phase1 | PASS | open-svg-in-mnt | ran=[] windows=["ui.imageviewer"] dialogs(declined)=[] |
| NET-8 | phase1 | PASS | open-html-in-mnt | ran=[] windows=["ui.sandboxed-app"] dialogs(declined)=[] |
| NET-8 | phase1 | PASS | files-double-click-in-mnt | ran=[] opened=["js:explorer+ui.notepad","run:explorer+ui.notepad","svg:explorer+ui.imageviewer","html:explorer+ui.sandboxed-app"] |
| NET-10 | phase1 | PASS | no-rw-share-of-system-folder | rw system shares=[]; attempts={"/etc":"[object Object]","/etc:direct":"refused: /etc is in a system folder (/etc) — it can only be shared read-only","/opt":"[object Object]","/opt:direct":"refused: /opt is in a system folder (/opt) — it can |
| NET-11 | phase1 | PASS | auto-mesh-off-by-default | fresh profile settings.autoMesh=false |
| NET-11 | phase1 | PASS | group-add-needs-consent | victim became a member without consent=false; prompts (declined)=["Mallory wants to add you to the group \"Trap\".\n\nGroup members can message you the"] |
| NET-12 | phase1 | PASS | static-webamp-pinned | no unpinned webamp URL |
| WIN-1 | phase2 | FAIL | app-window-isolated | reachable from an app window: ["topDocument","parentPlatform","topFs","indexedDB","localStorage","sibling"] |
| WIN-2 | phase1 | PASS | files-multi-select-menu | menu=["Download","Delete 2 items"] fired on: [] |
| WIN-2 | phase1 | PASS | compiled-explorer-double-click-audio | sentinel=[] |
| WIN-2 | phase1 | PASS | compiled-explorer-context-menu | fired on: []; actions tried: ["Edit","Open","Download","Rename","Copy","Cut","Properties","Delete"] |
| WIN-2 | phase1 | PASS | markdown-edit-in-notepad | sentinel=[] |
| WIN-3 | phase1 | PASS | open-svg-in-home | ran=[] windows=["ui.imageviewer"] dialogs(declined)=[] |
| WIN-3 | phase1 | PASS | open-html-in-home | ran=[] windows=["ui.sandboxed-app"] dialogs(declined)=[] |
| WIN-3 | phase1 | PASS | files-double-click-in-home | ran=[] opened=["js:explorer+ui.notepad","run:explorer+ui.notepad","svg:explorer+ui.imageviewer","html:explorer+ui.sandboxed-app"] |
| WIN-4 | phase1 | PASS | browser-app-page-ipc | 0 replies, 0 successful; secretLeaked=false; fileWritten=false |
| WIN-4 | phase1 | PASS | browser-app-cross-origin-sandboxed | sandbox="allow-scripts allow-same-origin allow-forms" referrerpolicy=no-referrer |
| WIN-5 | phase1 | PASS | static-innerhtml-core/window-manager.ts | 0 raw sinks in src/core/window-manager.ts |
| WIN-5 | phase1 | PASS | html-title-and-icon-render-as-text | sentinels=[]; <img> in chrome=0 |
| WIN-5 | phase1 | PASS | header-style-allowlist | {"position":"static","zIndex":"9","inline":""} |
| WIN-5 | phase1 | PASS | geometry-ignores-cssText | {"position":"absolute","zIndex":"10","inline":""} |
| WIN-5 | phase1 | PASS | action-button-icon-is-text | sentinels=[] |
| WIN-6 | phase1 | PASS | tampered-window-manager-js | sentinels=[] |
| WIN-6 | phase1 | PASS | tampered-wm-style-module | sentinels=[] |
| WIN-6 | phase1 | PASS | desktop-module-unknown-or-traversal-id | sentinels=[] |
| WIN-6 | phase1 | PASS | tampered-desktop-manager-js | sentinels=[] |
| WIN-7 | phase1 | PASS | dock-frame-fs | 4 replies, 0 successful; secretLeaked=false; written=[] |
| WIN-7 | phase1 | PASS | wallpaper-frame-fs | 3 replies, 0 successful; secretLeaked=false; fileWritten=false |
| WIN-8 | phase1 | PASS | markdown-viewer-no-script | viewer=ui.markdown dom={"onerrorAttrs":0,"jsLinks":0}; fired=[] |
| WIN-9 | phase2 | FAIL | app-cannot-kill-other-window | other app's window still open after process.kill from an app=false |
| WIN-10 | phase1 | PASS | props-cannot-widen-acl | {"namespaceExposed":false,"proxyFsExposed":true,"write":"denied","onDisk":false} |
