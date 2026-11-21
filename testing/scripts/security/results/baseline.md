# Security suite — baseline

- BASE_URL: `http://localhost:8090`
- static checks scanned: `../baseline (git worktree of f2ed3dd)`
- finished: 2026-11-21T03:25:26.903Z
- **phase1**: 0/47 findings pass (47 fail, 0 error); 0/121 checks
- **phase2**: 0/8 findings pass (8 fail, 0 error); 0/9 checks
- **info**: 3/5 findings pass (2 fail, 0 error); 4/6 checks

## phase1

| Finding | Result | Checks passed | Not passing | Script |
|---|---|---|---|---|
| APP-1 | FAIL | 0/1 | FAIL explorer-sifi-double-click-and-menu | test-dsl-injection.mjs |
| APP-5 | FAIL | 0/2 | FAIL static-notebook-markdown-sanitised; FAIL notebook-markdown-cell-no-script | test-static.mjs, test-xss.mjs |
| APP-6 | FAIL | 0/1 | FAIL static-ai-dom-lens-page-frame-no-scripts | test-static.mjs |
| APP-7 | FAIL | 0/2 | FAIL static-mermaid-security-level; FAIL mermaid-click-javascript | test-static.mjs, test-xss.mjs |
| APP-8 | FAIL | 0/2 | FAIL static-innerhtml-totp-auth/main.html; FAIL static-totp-no-localstorage | test-static.mjs |
| APP-9 | FAIL | 0/1 | FAIL bookmark-no-opener-no-ipc | test-ipc.mjs |
| APP-10 | FAIL | 0/3 | FAIL static-innerhtml-trainboard/main.html; FAIL static-innerhtml-trainboard/board.html; FAIL trainboard-log-values-are-text | test-static.mjs, test-xss.mjs |
| APP-11 | FAIL | 0/1 | FAIL static-cdn-pinned-sri-viewer-apps | test-static.mjs |
| APP-12 | FAIL | 0/1 | FAIL static-ts-ide-preview-no-same-origin | test-static.mjs |
| APP-13 | FAIL | 0/2 | FAIL static-dashboard-no-inline-handlers; FAIL dashboard-picker-folder-name | test-static.mjs, test-xss.mjs |
| APP-14 | FAIL | 0/7 | FAIL static-innerhtml-dock/gnome.html; FAIL static-innerhtml-dock/macos.html; FAIL static-innerhtml-audio-player/player.html; FAIL static-innerhtml-fs-inspector/main.html; FAIL media-player-file-name-is-text; FAIL dock-gnome-title-is-text; FAIL dock-macos-title-is-text | test-static.mjs, test-xss.mjs |
| BOOT-3 | FAIL | 0/2 | FAIL open-js-in-home; FAIL open-run-in-home | test-open-policy.mjs |
| BOOT-4 | FAIL | 0/2 | FAIL registry-dest-traversal; FAIL registry-wrong-sha256 | test-traversal.mjs |
| BOOT-5 | FAIL | 0/2 | FAIL managers-json-wm-id-traversal; FAIL installed-json-mainfile-outside-app-dir | test-autorun.mjs |
| BOOT-6 | FAIL | 0/1 | FAIL vfs-meta-json-not-authoritative | test-boot-integrity.mjs |
| BOOT-8 | FAIL | 0/3 | FAIL files-extract-zip-slip; FAIL unzip-run-zip-slip; FAIL tar-run-path-slip | test-traversal.mjs |
| BOOT-9 | FAIL | 0/2 | FAIL deeplink-app-dotdot; FAIL deeplink-uninstalled-app | test-commands.mjs |
| BOOT-10 | FAIL | 0/1 | FAIL uninstall-uses-validated-app-dir | test-traversal.mjs |
| BOOT-11 | FAIL | 0/1 | FAIL tampered-menu-item-js | test-autorun.mjs |
| D15 | FAIL | 0/1 | FAIL static-dead-exec-engine-removed | test-static.mjs |
| KRN-1 | FAIL | 0/2 | FAIL unregistered-sandboxed-frame; FAIL cross-site-popup | test-ipc.mjs |
| KRN-2 | FAIL | 0/3 | FAIL app-param-breakout; FAIL apps-param-breakout; FAIL args-without-deeplink-optin | test-url-launcher.mjs |
| KRN-3 | FAIL | 0/14 | FAIL host-exec-txt; FAIL host-exec-md; FAIL host-exec-png; FAIL host-exec-unknown-ext; FAIL host-exec-folder; FAIL ui-settings-initial-section; FAIL files-double-click-txt; FAIL files-double-click-audio; FAIL files-context-menu-file; FAIL files-context-menu-folder; FAIL desktop-icon-double-click; FA | test-dsl-injection.mjs, test-static.mjs |
| KRN-5 | FAIL | 0/7 | FAIL namespace-traversal-write-denied; FAIL namespace-foreign-app-data-unreadable; FAIL namespace-kernel-owned-not-writable; FAIL namespace-tmp-per-app; FAIL namespace-bad-id-no-write-scope; FAIL proxyfs-refuses-traversal-and-secret; FAIL appsdk-port-refuses-traversal-and-secret | test-acl.mjs |
| KRN-7 | FAIL | 0/5 | FAIL top-level-html-is-opaque; FAIL top-level-svg-is-opaque; FAIL top-level-opt-apps-is-opaque; FAIL iframe-home-html-is-opaque; FAIL vfs-response-headers | test-sw.mjs |
| KRN-8 | FAIL | 0/2 | FAIL request-ids-unpredictable; FAIL forged-reply-from-nested-frame | test-sw.mjs |
| KRN-9 | FAIL | 0/3 | FAIL bootstrap-override-cross-site; FAIL bootstrap-override-vfs-file; FAIL fsbackend-link-needs-consent | test-boot-integrity.mjs |
| KRN-10 | FAIL | 0/3 | FAIL app-cannot-replace-ui.notepad; FAIL app-cannot-replace-ui.remote-machines; FAIL extension-claim-not-default | test-commands.mjs |
| KRN-11 | FAIL | 0/5 | FAIL cross-site-embed-refused; FAIL os-popup-drops-opener; FAIL window-open-from-top-has-no-opener; FAIL window-open-from-app-window-has-no-opener; FAIL meta-csp-in-index-and-404 | test-framing.mjs |
| KRN-13 | FAIL | 0/1 | FAIL broadcast-to-foreign-frame | test-ipc.mjs |
| NET-1 | FAIL | 0/2 | FAIL dc-task-not-run-before-opt-in; FAIL dc-task-after-opt-in-is-opaque | test-peer.mjs |
| NET-3 | FAIL | 0/1 | FAIL mount-traversal-stays-inside | test-peer.mjs |
| NET-4 | FAIL | 0/1 | FAIL ssh-mirror-and-save-stay-inside | test-traversal.mjs |
| NET-5 | FAIL | 0/2 | FAIL roster-peer-name-is-text; FAIL static-innerhtml-ui/app.js | test-peer.mjs, test-static.mjs |
| NET-6 | FAIL | 0/1 | FAIL webrtc-api-share-from-other-app-refused | test-peer.mjs |
| NET-8 | FAIL | 0/5 | FAIL open-js-in-mnt; FAIL open-run-in-mnt; FAIL open-svg-in-mnt; FAIL open-html-in-mnt; FAIL files-double-click-in-mnt | test-open-policy.mjs |
| NET-10 | FAIL | 0/1 | FAIL no-rw-share-of-system-folder | test-peer.mjs |
| NET-11 | FAIL | 0/2 | FAIL auto-mesh-off-by-default; FAIL group-add-needs-consent | test-peer.mjs |
| NET-12 | FAIL | 0/1 | FAIL static-webamp-pinned | test-static.mjs |
| WIN-2 | FAIL | 0/4 | FAIL files-multi-select-menu; FAIL compiled-explorer-double-click-audio; FAIL compiled-explorer-context-menu; FAIL markdown-edit-in-notepad | test-dsl-injection.mjs |
| WIN-3 | FAIL | 0/3 | FAIL open-svg-in-home; FAIL open-html-in-home; FAIL files-double-click-in-home | test-open-policy.mjs |
| WIN-4 | FAIL | 0/2 | FAIL browser-app-page-ipc; FAIL browser-app-cross-origin-sandboxed | test-ipc.mjs |
| WIN-5 | FAIL | 0/5 | FAIL static-innerhtml-core/window-manager.ts; FAIL html-title-and-icon-render-as-text; FAIL header-style-allowlist; FAIL geometry-ignores-cssText; FAIL action-button-icon-is-text | test-static.mjs, test-xss.mjs |
| WIN-6 | FAIL | 0/4 | FAIL tampered-window-manager-js; FAIL tampered-wm-style-module; FAIL desktop-module-unknown-or-traversal-id; FAIL tampered-desktop-manager-js | test-autorun.mjs |
| WIN-7 | FAIL | 0/2 | FAIL dock-frame-fs; FAIL wallpaper-frame-fs | test-ipc.mjs |
| WIN-8 | FAIL | 0/1 | FAIL markdown-viewer-no-script | test-xss.mjs |
| WIN-10 | FAIL | 0/1 | FAIL props-cannot-widen-acl | test-acl.mjs |

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
| APP-11 | FAIL | 0/1 | FAIL static-cdn-pinned-sri-other-apps | test-static.mjs |
| KRN-2 | PASS | 1/1 |  | test-url-launcher.mjs |
| KRN-3 | PASS | 1/1 |  | test-dsl-injection.mjs |
| KRN-8 | FAIL | 1/2 | FAIL forged-reply-from-second-tab | test-sw.mjs |
| KRN-10 | PASS | 1/1 |  | test-commands.mjs |

## Scripts

| Script | Exit | Seconds | Checks |
|---|---|---|---|
| test-acl.mjs | 0 | 44 | 8 |
| test-autorun.mjs | 0 | 77 | 8 |
| test-boot-integrity.mjs | 0 | 351 | 4 |
| test-commands.mjs | 0 | 120 | 7 |
| test-dsl-injection.mjs | 0 | 214 | 18 |
| test-framing.mjs | 0 | 34 | 5 |
| test-ipc.mjs | 0 | 50 | 8 |
| test-open-policy.mjs | 0 | 68 | 10 |
| test-peer.mjs | 0 | 65 | 8 |
| test-sandbox-phase2.mjs | 0 | 13 | 5 |
| test-static.mjs | 0 | 1 | 23 |
| test-sw.mjs | 0 | 16 | 9 |
| test-traversal.mjs | 0 | 33 | 7 |
| test-url-launcher.mjs | 0 | 54 | 4 |
| test-xss.mjs | 0 | 33 | 12 |

## All checks

| Finding | Phase | Result | Check | Detail |
|---|---|---|---|---|
| APP-1 | phase1 | FAIL | explorer-sifi-double-click-and-menu | double-click sentinel=["__sec_k3"]; menu fired on: ["Edit","Open","Rename","Compress to ZIP","Copy","Cut","Properties","Text Editor","VS Code","Image Viewer","Music Player","SQLite Browser","Browser","Delete"]; actions: ["Edit","Open","Rena |
| APP-5 | phase1 | FAIL | static-notebook-markdown-sanitised | 2 unsanitised marked → innerHTML: 537 marked.parse(src) \| 684 marked.parse(src) |
| APP-5 | phase1 | FAIL | notebook-markdown-cell-no-script | fired=["__sec_nb@http://localhost:8090/"] |
| APP-6 | phase1 | FAIL | static-ai-dom-lens-page-frame-no-scripts | pageFrame sandbox values: [] (tag: <iframe id="pageFrame" style="flex:1;border:none;display:none;background:#fff">) |
| APP-7 | phase1 | FAIL | static-mermaid-security-level | securityLevel values: ["loose"] |
| APP-7 | phase1 | FAIL | mermaid-click-javascript | fired=["__sec_mm@http://localhost:8090/","__sec_mm2@http://localhost:8090/"]; javascript: links in svg=2 |
| APP-8 | phase1 | FAIL | static-innerhtml-totp-auth/main.html | 1 raw sinks in docs/public/mount/opt/apps/totp-auth/main.html: docs/public/mount/opt/apps/totp-auth/main.html:171 [e.name] ` <div class="card-name" title="${e.name}">${e.name}</div> |
| APP-8 | phase1 | FAIL | static-totp-no-localstorage | localStorage writes at lines 128 |
| APP-9 | phase1 | FAIL | bookmark-no-opener-no-ipc | popup http://127.0.0.1:50983/bm.html; opener=true; 8 replies, 8 successful: [{"id":"bm-opener-read","result":"\"SEC-IPC-rrgh4znjo6\""},{"id":"bm-opener-write","result":"true"},{"id":"bm-opener-list","result":"[\"projects\",\"Notes.md\",\".l |
| APP-10 | phase1 | FAIL | static-innerhtml-trainboard/main.html | 2 raw sinks in docs/public/mount/opt/apps/trainboard/main.html: docs/public/mount/opt/apps/trainboard/main.html:153 [run] `<span class="swatch" style="background:${color}"></span>${run}` \| docs/public/mount/opt/apps/trainboard/main.html:214 |
| APP-10 | phase1 | FAIL | static-innerhtml-trainboard/board.html | 2 raw sinks in docs/public/mount/opt/apps/trainboard/board.html: docs/public/mount/opt/apps/trainboard/board.html:169 [metric,run] runs.map((r, i) => ` <label class="run-item${selectedRuns.has(r.na \| docs/public/mount/opt/apps/trainboard/bo |
| APP-10 | phase1 | FAIL | trainboard-log-values-are-text | fired=["__sec_tb_run@http://localhost:8090/"] |
| APP-11 | phase1 | FAIL | static-cdn-pinned-sri-viewer-apps | 34 CDN <script src> in 1F-owned apps without exact version+SRI: docs/public/mount/opt/apps/alpine-wasm/main.html:8 no-SRI https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js \| docs/public/mount/opt/apps/alpine-wasm/main.html:9 no-SRI http |
| APP-11 | info | FAIL | static-cdn-pinned-sri-other-apps | 15 in other apps / pages: docs/public/mount/opt/apps/distributed-compute/main.html:148 no-SRI https://unpkg.com/codemirror@5.65.16/lib/codemirror.js \| docs/public/mount/opt/apps/distributed-compute/main.html:149 no-SRI https://unpkg.com/cod |
| APP-12 | phase1 | FAIL | static-ts-ide-preview-no-same-origin | ts-ide preview sandbox values: ["allow-scripts allow-same-origin"] |
| APP-13 | phase1 | FAIL | static-dashboard-no-inline-handlers | 5 inline handlers with interpolation: 273 onclick="fpNavigate('${ \| 276 onclick="fpNavigate('${ \| 296 onclick="fpNavigate('${ \| 298 onclick="fpSelect('${ \| 798 onclick="selColor('${ |
| APP-13 | phase1 | FAIL | dashboard-picker-folder-name | fired=["__sec_db@http://localhost:8090/"] |
| APP-14 | phase1 | FAIL | static-innerhtml-dock/gnome.html | 1 raw sinks in docs/public/mount/opt/apps/dock/gnome.html: docs/public/mount/opt/apps/dock/gnome.html:153 [label,icon] '<span class="icon">' + icon + '</span><span class="label">' + label + |
| APP-14 | phase1 | FAIL | static-innerhtml-dock/macos.html | 1 raw sinks in docs/public/mount/opt/apps/dock/macos.html: docs/public/mount/opt/apps/dock/macos.html:179 [w.title,w.name,w.icon] '<span class="icon">' + (w.icon \|\| 'apps') + '</span>' + '<spa |
| APP-14 | phase1 | FAIL | static-innerhtml-audio-player/player.html | 1 raw sinks in docs/public/mount/opt/apps/audio-player/player.html: docs/public/mount/opt/apps/audio-player/player.html:284 [name] `<span class="pl-dot"></span><span class="pl-item-name" title="${name} |
| APP-14 | phase1 | FAIL | static-innerhtml-fs-inspector/main.html | 1 raw sinks in docs/public/mount/opt/apps/fs-inspector/main.html: docs/public/mount/opt/apps/fs-inspector/main.html:606 [name] `<span class="file-icon">${icon}</span><span class="file-name">${name} |
| APP-14 | phase1 | FAIL | media-player-file-name-is-text | fired=["__sec_ap@http://localhost:8090/"] |
| APP-14 | phase1 | FAIL | dock-gnome-title-is-text | {"xss":true,"imgs":1,"text":false} |
| APP-14 | phase1 | FAIL | dock-macos-title-is-text | {"xss":true,"imgs":1,"text":false} |
| APP-15 | phase2 | FAIL | static-apps-no-top-parent | 13 app files reference top./parent.: audio-player/main.js(1), audio-player/player.html(1), bookmarks/main.js(1), explorer-sifi/main.js(5), file-explorer/main.js(5), fs-inspector/main.html(3), mermaid-viewer/main.js(1), pkg-manager/main.js(1 |
| BOOT-3 | phase1 | FAIL | open-js-in-home | ran=["__sec_op_js_home","/tmp/sec-op-js-home"] windows=[] dialogs(declined)=[] |
| BOOT-3 | phase1 | FAIL | open-run-in-home | ran=["__sec_op_run_home","/tmp/sec-op-run-home"] windows=[] dialogs(declined)=[] |
| BOOT-4 | phase1 | FAIL | registry-dest-traversal | initd.run changed=true; /etc/widgets/sec-boot4.js=true; outside=["/.initd.run","/etc/widgets/sec-boot4.js"]; fileFetches=[1,1,1]; prompts(accepted)=[] |
| BOOT-4 | phase1 | FAIL | registry-wrong-sha256 | main.js written=true; ran=["__sec_boot4_badhash"]; fetched=1 |
| BOOT-5 | phase1 | FAIL | managers-json-wm-id-traversal | sentinels=["__sec_ar_wm_id"] |
| BOOT-5 | phase1 | FAIL | installed-json-mainfile-outside-app-dir | ran at boot=true (all boot sentinels ["__sec_ar_widget","__sec_ar_installed_main"]) |
| BOOT-5 | phase2 | FAIL | planted-widget-runs-sandboxed | /etc/widgets/sec-evil.js ran in the top realm=true |
| BOOT-6 | phase1 | FAIL | vfs-meta-json-not-authoritative | booted=false; explorerEqualsServerCopy=false (len 68854 vs 68817); attackerFetches=0; sentinels=[] |
| BOOT-8 | phase1 | FAIL | files-extract-zip-slip | via menu:Extract here; outside=["/home/user1/sec-slip-x-up1.txt","/home/user1/sec-slip-x-mid.txt","/tmp/sec-slip-x-tmp.txt"]; inside=2; prompts=[] |
| BOOT-8 | phase1 | FAIL | unzip-run-zip-slip | ran; outside=["/home/user1/sec-uz/sec-slip-u-up1.txt","/home/user1/sec-uz/sec-slip-u-mid.txt","/home/tmp/sec-slip-u-tmp.txt"]; inside=2 |
| BOOT-8 | phase1 | FAIL | tar-run-path-slip | ran; outside=["/home/user1/sec-tar-up.txt","/tmp/sec-tar-tmp.txt"]; inside=2 |
| BOOT-9 | phase1 | FAIL | deeplink-app-dotdot | booted=true; sentinels=["__sec_dl_dotdot"] |
| BOOT-9 | phase1 | FAIL | deeplink-uninstalled-app | booted=true; sentinels=["__sec_dl_evil"] |
| BOOT-10 | phase1 | FAIL | uninstall-uses-validated-app-dir | ~/sec-b10 survived=false; pre-uninstall ran=["__sec_b10_preuninstall"]; /opt/apps/sec-victim-pkg removed=false |
| BOOT-11 | phase1 | FAIL | tampered-menu-item-js | menuShown=true; sentinels=["__sec_ar_menu"] |
| D15 | phase1 | FAIL | static-dead-exec-engine-removed | still present: src/platform/exec-engine.ts, src/platform/message-bus.ts |
| KRN-1 | phase1 | FAIL | unregistered-sandboxed-frame | 4 replies, 4 successful: [{"id":"sbx-read","result":"\"SEC-IPC-rrgh4znjo6\""},{"id":"sbx-write","result":"true"},{"id":"sbx-list","result":"[\"projects\",\"Notes.md\",\".local\",\"index.html\",\"initd.run\",\"se"},{"id":"sbx-wins","result": |
| KRN-1 | phase1 | FAIL | cross-site-popup | popupBooted=true; 36 replies, 36 successful: [{"id":"popup-read","result":"\"SEC-IPC-rrgh4znjo6\""},{"id":"popup-write","result":"true"},{"id":"popup-list","result":"[\"projects\",\"Notes.md\",\".local\",\"sec-ipc\",\"bookmarks.json\",\""}, |
| KRN-2 | phase1 | FAIL | app-param-breakout | booted=true; sentinels=["__sec_krn2_app","__sec_krn2_self"] |
| KRN-2 | phase1 | FAIL | apps-param-breakout | booted=true; sentinels=["__sec_krn2_apps"] |
| KRN-2 | phase1 | FAIL | args-without-deeplink-optin | booted=true; attackerFetches=1; attackerFrames=1; windows=["ui.iframe"] |
| KRN-2 | info | PASS | launcher-still-opens-valid-name | windows=["ui.notepad"] |
| KRN-3 | info | PASS | control-payload-is-live | sentinel after hand-built DSL: ["__sec_k3"] |
| KRN-3 | phase1 | FAIL | host-exec-txt | sentinel=["__sec_k3"] windows=["ui.notepad"] |
| KRN-3 | phase1 | FAIL | host-exec-md | sentinel=["__sec_k3"] windows=["ui.markdown"] |
| KRN-3 | phase1 | FAIL | host-exec-png | sentinel=["__sec_k3"] windows=["ui.imageviewer"] |
| KRN-3 | phase1 | FAIL | host-exec-unknown-ext | sentinel=["__sec_k3"] windows=["ui.notepad"] |
| KRN-3 | phase1 | FAIL | host-exec-folder | sentinel=["__sec_k3"] windows=["explorer"] |
| KRN-3 | phase1 | FAIL | ui-settings-initial-section | sentinel=["__sec_k3"] |
| KRN-3 | phase1 | FAIL | files-double-click-txt | sentinel=["__sec_k3"] |
| KRN-3 | phase1 | FAIL | files-double-click-audio | sentinel=["__sec_k3"] |
| KRN-3 | phase1 | FAIL | files-context-menu-file | fired on: ["Edit","Open","Download","Rename","Compress to ZIP","Copy","Cut","Properties","Edit (about.html)","VS Code","Browser","Delete"]; actions tried: ["Edit","Open","Download","Rename","Compare with…","Compress to ZIP","Copy","Cut","Pr |
| KRN-3 | phase1 | FAIL | files-context-menu-folder | fired on: ["Open in explorer","Rename","Compress to ZIP","Copy","Cut","Properties","Delete"]; actions tried: ["Open in explorer","Rename","Compress to ZIP","Copy","Cut","Properties","Delete"] |
| KRN-3 | phase1 | FAIL | desktop-icon-double-click | sentinel=["__sec_k3"] |
| KRN-3 | phase1 | FAIL | desktop-icon-context-menu | fired on: ["Edit","Open","Edit (about.html)","VS Code","Browser","Delete"]; actions tried: ["Edit","Open","Edit (about.html)","VS Code","Browser","Delete"] |
| KRN-3 | phase1 | FAIL | static-no-interpolated-dsl | 101 interpolated DSL sites: src/apps/file-explorer/index.tsx:768 execCommand, src/apps/file-explorer/index.tsx:847 cmd-template, src/apps/file-explorer/index.tsx:853 cmd-template, src/apps/file-explorer/index.tsx:864 cmd-template, src/apps/ |
| KRN-3 | phase1 | FAIL | static-no-interpolated-dsl-etc-scripts | 5 interpolated DSL sites in /etc/settings + /etc/widgets scripts (not assigned in TODO 1A–1F): docs/public/mount/etc/settings/19-apps.js:25 execCommand, docs/public/mount/etc/settings/19-apps.js:26 dsl-template, docs/public/mount/etc/settin |
| KRN-4 | phase2 | FAIL | explicit-run-is-not-top-realm | vfs script reached the top realm=true |
| KRN-5 | phase1 | FAIL | namespace-traversal-write-denied | allowed=["/tmp/../etc/crontab","/tmp//../etc/crontab","/tmp/sec-acl-app/../../etc/widgets/x.js","/home/user1/.local/share/sec-acl-app/../../../../etc/crontab","/home/user1/.local/share/sec-acl-app/x\\0/../../../../../etc/crontab"] |
| KRN-5 | phase1 | FAIL | namespace-foreign-app-data-unreadable | allowed=["/home/user1/.local/share/remote-machines/connections.json","/home/user1/.local/share/remote-machines/secrets.json","/home/user1/.local/share/sec-acl-app/../remote-machines/connections.json"] |
| KRN-5 | phase1 | FAIL | namespace-kernel-owned-not-writable | allowed=["/opt/apps/sec-acl-app/main.js"] |
| KRN-5 | phase1 | FAIL | namespace-tmp-per-app | shared allowed=["/tmp/other-app/x","/tmp/x","/var/log/sec.log"]; own dirs={"/tmp/sec-acl-app/x":"ALLOWED","/home/user1/.local/share/sec-acl-app/x":"ALLOWED"} |
| KRN-5 | phase1 | FAIL | namespace-bad-id-no-write-scope | appDir=/opt/apps/../../etc; allowed=["/opt/apps/../../etc/crontab"] |
| KRN-5 | phase1 | FAIL | proxyfs-refuses-traversal-and-secret | {"write":"ALLOWED","read":"LEAKED","onDisk":true} |
| KRN-5 | phase1 | FAIL | appsdk-port-refuses-traversal-and-secret | {"write":"ALLOWED","read":"LEAKED","kernel":"denied: [acl] write denied: pid=9 id=ui.snake-ga"}; /etc/sec-acl-sdk.txt=true; window-manager.js overwritten=false |
| KRN-6 | phase2 | FAIL | sandbox-app-iframe-opaque | reachable: ["parentDocument","indexedDB","removeSandbox"] |
| KRN-6 | phase2 | FAIL | static-no-same-origin-app-sandboxes | 2 sandbox strings with allow-scripts+allow-same-origin: src/core/window-manager.ts:440, docs/public/mount/opt/apps/ts-ide/main.html:131 |
| KRN-7 | phase1 | FAIL | top-level-html-is-opaque | {"origin":"http://localhost:8090","localStorage":"ALLOWED","indexedDB":"ALLOWED","parentPlatform":false} |
| KRN-7 | phase1 | FAIL | top-level-svg-is-opaque | {"origin":"http://localhost:8090","localStorage":"ALLOWED"} |
| KRN-7 | phase1 | FAIL | top-level-opt-apps-is-opaque | {"origin":"http://localhost:8090","localStorage":"ALLOWED","indexedDB":"ALLOWED","parentPlatform":false} |
| KRN-7 | phase1 | FAIL | iframe-home-html-is-opaque | {"origin":"http://localhost:8090","localStorage":"ALLOWED","indexedDB":"ALLOWED","parentPlatform":true} |
| KRN-7 | phase1 | FAIL | vfs-response-headers | {"/(sw)/tmp/sec-sw/x.html":{"status":200,"type":"text/html","csp":null,"nosniff":null,"corp":null},"/(sw)/tmp/sec-sw/a.unknownext":{"status":200,"type":"undefined","csp":null,"nosniff":null,"corp":null},"/cache/tmp/sec-sw/t.txt":{"status":2 |
| KRN-8 | phase1 | FAIL | request-ids-unpredictable | ids=["12","13","14","15"] consecutiveIntegers=true |
| KRN-8 | phase1 | FAIL | forged-reply-from-nested-frame | {"status":200,"body":"FORGED-BY-FRAME","ms":2}; nestedFrameGotRequestsDirectly=1 |
| KRN-8 | info | FAIL | forged-reply-from-second-tab | {"status":200,"body":"FORGED-BY-TAB","ms":2}; secondTabGotRequestsDirectly=1 (residual: one registered kernel client per request) |
| KRN-8 | info | PASS | os-tab-still-serves | {"status":200,"body":"REAL-CONTENT","ms":2} |
| KRN-9 | phase1 | FAIL | bootstrap-override-cross-site | osBooted=false; evilFetched=1; sentinels=["__sec_krn9_xsite"]; scripts=["bootstrapper.bundle.js","http://127.0.0.1:50632/evil-kernel.js"] |
| KRN-9 | phase1 | FAIL | bootstrap-override-vfs-file | osBooted=false; sentinels=["__sec_krn9_vfs"]; keyAfterBoot="/(sw)/tmp/sec-boot/evil-kernel.js" |
| KRN-9 | phase1 | FAIL | fsbackend-link-needs-consent | storedBackend="localstorage"; idbMarkerVisibleAfterReload=false; dialogs=[] |
| KRN-10 | phase1 | FAIL | app-cannot-replace-ui.notepad | owner before=005-ui.notepad; script ran; replaced=true; sentinels=["__sec_k10_ui_notepad"] |
| KRN-10 | phase1 | FAIL | app-cannot-replace-ui.remote-machines | owner before=root; script ran; replaced=true; sentinels=["__sec_k10_ui_remote_machines"] |
| KRN-10 | phase1 | FAIL | extension-claim-not-default | opened={"readme.txt":["sec.aaa"],"pic.svg":["sec.aaa"]}; sentinels=["__sec_k10_sec_aaa"] |
| KRN-10 | info | PASS | explorer-owned-by-files-app | {"owner":"root","fallback":false} |
| KRN-11 | phase1 | FAIL | cross-site-embed-refused | {"fs":true,"platform":false,"ipc":true,"desktop":false,"text":""} |
| KRN-11 | phase1 | FAIL | os-popup-drops-opener | popupBooted=true; popup.window.opener set=true; attackerStillHoldsHandle=true |
| KRN-11 | phase1 | FAIL | window-open-from-top-has-no-opener | {"ret":"window","opened":true,"hadOpener":true,"referrer":"http://localhost:8090/"} |
| KRN-11 | phase1 | FAIL | window-open-from-app-window-has-no-opener | {"ret":"window","opened":true,"hadOpener":true,"referrer":""} |
| KRN-11 | phase1 | FAIL | meta-csp-in-index-and-404 | {"/":{"meta":false,"objectSrcNone":false,"baseUriSelf":false,"scriptSrc":false},"/404.html":{"meta":false,"objectSrcNone":false,"baseUriSelf":false,"scriptSrc":false}} |
| KRN-12 | phase2 | FAIL | deeplink-handoff-not-swallowable | newTabBooted=false; rogueAcks=1; newTabText="Opened in your other tab\n\nThis link was handed to the tab where the app is alrea" |
| KRN-13 | phase1 | FAIL | broadcast-to-foreign-frame | wos-ipc-events=7 [{"event":"wm.windowsChanged","data":"[{\"pid\":3,\"name\":\"ui.notepad\",\"title\":\"Edit (about.html)\",\"icon\":\"edit_note\",\"minimized\":false,\"active\":true}]"},{"event":"wm.windowsChanged","data":"[{\"pid\":3,\"nam |
| NET-1 | phase1 | FAIL | dc-task-not-run-before-opt-in | subscribers=1; reply={"type":"dc-result","to":"sec-attacker","taskId":"sec-task-1","ok":true,"result":{"origin":"http://localhost:8090","idb":"ALLOWED","xhr":"ALLOWED 200","top":false,"caches":"object"}} |
| NET-1 | phase1 | FAIL | dc-task-after-opt-in-is-opaque | opted in via settings-file; task sees {"origin":"http://localhost:8090","idb":"ALLOWED","xhr":"ALLOWED 200","top":false,"caches":"object"} |
| NET-3 | phase1 | FAIL | mount-traversal-stays-inside | mount=/mnt/webrtc/Mallory-stuff (mountShare did not settle in 20s); outside=["/home/user1/sec-net3-home.txt","/etc/widgets/sec-net3.js"]; inside=3 |
| NET-4 | phase1 | FAIL | ssh-mirror-and-save-stay-inside | mount=ERR Error: EEXIST: File exists., '/mnt/ssh'; save=saved; outside=["/home/user1/ok.txt","/home/user1/..\\..\\sec-net4-bs.txt","/home/user1/sub/inner.txt","/home/user1/sec-net4-home.txt","/etc/widgets/sec-net4.js","/etc/sec-net4-etc.txt |
| NET-5 | phase1 | FAIL | roster-peer-name-is-text | {"imgs":1,"text":"Victim (you)","xss":true} |
| NET-5 | phase1 | FAIL | static-innerhtml-ui/app.js | 1 raw sinks in docs/public/mount/opt/apps/distributed-compute/ui/app.js: docs/public/mount/opt/apps/distributed-compute/ui/app.js:76 [w.name,w.id] `<span class="worker-dot${w.isSelf ? ' self' : ''}"></span><span class |
| NET-6 | phase1 | FAIL | webrtc-api-share-from-other-app-refused | result="[object Object]"; shares=["/home/user1/sec-net6:rw"]; prompts (declined)=[] |
| NET-7 | phase2 | FAIL | other-app-cannot-open-keystore | OPENED stores= |
| NET-8 | phase1 | FAIL | open-js-in-mnt | ran=["__sec_op_js_mnt","/tmp/sec-op-js-mnt"] windows=[] dialogs(declined)=[] |
| NET-8 | phase1 | FAIL | open-run-in-mnt | ran=["__sec_op_run_mnt","/tmp/sec-op-run-mnt"] windows=[] dialogs(declined)=[] |
| NET-8 | phase1 | FAIL | open-svg-in-mnt | ran=["__sec_op_svg_mnt","__sec_op_svgload_mnt","localStorage:__sec_op_svg_mnt"] windows=["ui.iframe"] dialogs(declined)=[] |
| NET-8 | phase1 | FAIL | open-html-in-mnt | ran=["__sec_op_html_mnt","localStorage:__sec_op_html_mnt"] windows=["ui.iframe"] dialogs(declined)=[] |
| NET-8 | phase1 | FAIL | files-double-click-in-mnt | ran=["__sec_op_js_mnt","/tmp/sec-op-js-mnt","__sec_op_run_mnt","/tmp/sec-op-run-mnt","__sec_op_html_mnt","localStorage:__sec_op_html_mnt"] opened=["js:explorer","run:explorer","svg:explorer+ui.imageviewer","html:explorer+ui.iframe"] |
| NET-10 | phase1 | FAIL | no-rw-share-of-system-folder | rw system shares=["/etc:rw","/opt:rw"]; attempts={"/etc":"[object Object]","/etc:direct":"refused: That folder is already shared","/opt":"[object Object]","/opt:direct":"refused: That folder is already shared"} |
| NET-11 | phase1 | FAIL | auto-mesh-off-by-default | fresh profile settings.autoMesh=true |
| NET-11 | phase1 | FAIL | group-add-needs-consent | victim became a member without consent=true; prompts (declined)=[] |
| NET-12 | phase1 | FAIL | static-webamp-pinned | unpinned webamp: docs/public/mount/opt/apps/wamp-client/WAMP.html:2 https://unpkg.com/webamp \| docs/public/mount/opt/apps/wamp-client/WAMP.html:212 https://unpkg.com/webamp |
| WIN-1 | phase2 | FAIL | app-window-isolated | reachable from an app window: ["topDocument","parentPlatform","topFs","indexedDB","localStorage","sibling"] |
| WIN-2 | phase1 | FAIL | files-multi-select-menu | menu=["Download","Delete 2 items"] fired on: ["Download"] |
| WIN-2 | phase1 | FAIL | compiled-explorer-double-click-audio | sentinel=["__sec_k3"] |
| WIN-2 | phase1 | FAIL | compiled-explorer-context-menu | fired on: ["Edit","Open","Download","Rename","Copy","Cut","Properties","Delete"]; actions tried: ["Edit","Open","Download","Rename","Copy","Cut","Properties","Delete"] |
| WIN-2 | phase1 | FAIL | markdown-edit-in-notepad | sentinel=["__sec_k3"] |
| WIN-3 | phase1 | FAIL | open-svg-in-home | ran=["__sec_op_svg_home","__sec_op_svgload_home","localStorage:__sec_op_svg_home"] windows=["ui.iframe"] dialogs(declined)=[] |
| WIN-3 | phase1 | FAIL | open-html-in-home | ran=["__sec_op_html_home","localStorage:__sec_op_html_home"] windows=["ui.iframe"] dialogs(declined)=[] |
| WIN-3 | phase1 | FAIL | files-double-click-in-home | ran=["__sec_op_js_home","/tmp/sec-op-js-home","__sec_op_run_home","/tmp/sec-op-run-home","__sec_op_html_home","localStorage:__sec_op_html_home"] opened=["js:explorer","run:explorer","svg:explorer+ui.imageviewer","html:explorer+ui.iframe"] |
| WIN-4 | phase1 | FAIL | browser-app-page-ipc | 8 replies, 8 successful: [{"id":"embed-read","result":"\"SEC-IPC-rrgh4znjo6\""},{"id":"embed-write","result":"true"},{"id":"embed-list","result":"[\"projects\",\"Notes.md\",\".local\",\"index.html\",\"initd.run\",\"se"},{"id":"embed-wins"," |
| WIN-4 | phase1 | FAIL | browser-app-cross-origin-sandboxed | sandbox=null referrerpolicy=null |
| WIN-5 | phase1 | FAIL | static-innerhtml-core/window-manager.ts | 3 raw sinks in src/core/window-manager.ts: src/core/window-manager.ts:597 [command.name,command.meta] (command.meta.title as string) \|\| command.name \| src/core/window-manager.ts:605 [command.meta] `${command.meta?.icon}` \| src/core/window-m |
| WIN-5 | phase1 | FAIL | html-title-and-icon-render-as-text | sentinels=["__sec_win5_title@http://localhost:8090/","__sec_win5_icon@http://localhost:8090/"]; <img> in chrome=2 |
| WIN-5 | phase1 | FAIL | header-style-allowlist | {"position":"fixed","zIndex":"2147483647","inline":"position: fixed; inset: 0px; z-index: 2147483647;"} |
| WIN-5 | phase1 | FAIL | geometry-ignores-cssText | {"position":"fixed","zIndex":"2147483647","inline":"position: fixed; inset: 0px; z-index: 2147483647;"} |
| WIN-5 | phase1 | FAIL | action-button-icon-is-text | sentinels=["__sec_win5_btn@http://localhost:8090/"] |
| WIN-6 | phase1 | FAIL | tampered-window-manager-js | sentinels=["__sec_ar_wm_base"] |
| WIN-6 | phase1 | FAIL | tampered-wm-style-module | sentinels=["__sec_ar_wm_style"] |
| WIN-6 | phase1 | FAIL | desktop-module-unknown-or-traversal-id | sentinels=["__sec_ar_desk_id","__sec_ar_desk_trav"] |
| WIN-6 | phase1 | FAIL | tampered-desktop-manager-js | sentinels=["__sec_ar_desk_mgr"] |
| WIN-7 | phase1 | FAIL | dock-frame-fs | 4 replies, 4 successful: [{"id":"dock-read","result":"\"SEC-IPC-rrgh4znjo6\""},{"id":"dock-write","result":"true"},{"id":"dock-widget","result":"true"},{"id":"dock-list","result":"[\"projects\",\"Notes.md\",\".local\",\"index.html\",\"initd |
| WIN-7 | phase1 | FAIL | wallpaper-frame-fs | 3 replies, 3 successful: [{"id":"wall-read","result":"\"SEC-IPC-rrgh4znjo6\""},{"id":"wall-write","result":"true"},{"id":"wall-wins","result":"[]"}]; secretLeaked=true; fileWritten=true |
| WIN-8 | phase1 | FAIL | markdown-viewer-no-script | viewer=ui.markdown dom={"onerrorAttrs":1,"jsLinks":1}; fired=["dom:{\"onerrorAttrs\":1,\"jsLinks\":1}"] |
| WIN-9 | phase2 | FAIL | app-cannot-kill-other-window | other app's window still open after process.kill from an app=false |
| WIN-10 | phase1 | FAIL | props-cannot-widen-acl | {"namespaceExposed":true,"proxyFsExposed":true,"aclPushed":true,"write":"ALLOWED","onDisk":true} |
