# Security suite — phase1-pass1-dsl-rerun

- BASE_URL: `http://localhost:8080`
- static checks scanned: `this repo`
- finished: 2026-11-21T03:30:57.008Z
- **info**: 1/1 findings pass (0 fail, 0 error); 1/1 checks
- **phase1**: 3/3 findings pass (0 fail, 0 error); 17/17 checks

## phase1

| Finding | Result | Checks passed | Not passing | Script |
|---|---|---|---|---|
| APP-1 | PASS | 1/1 |  | test-dsl-injection.mjs |
| KRN-3 | PASS | 12/12 |  | test-dsl-injection.mjs |
| WIN-2 | PASS | 4/4 |  | test-dsl-injection.mjs |

## info

| Finding | Result | Checks passed | Not passing | Script |
|---|---|---|---|---|
| KRN-3 | PASS | 1/1 |  | test-dsl-injection.mjs |

## Scripts

| Script | Exit | Seconds | Checks |
|---|---|---|---|
| test-dsl-injection.mjs | 0 | 124 | 18 |

## All checks

| Finding | Phase | Result | Check | Detail |
|---|---|---|---|---|
| APP-1 | phase1 | PASS | explorer-sifi-double-click-and-menu | double-click sentinel=[]; menu fired on: []; actions: ["Edit","Open","Rename","Compare with…","Compress to ZIP","Copy","Cut","Properties","Text Editor","VS Code","Spreadsheet","Image Viewer","Music Player","SQLite Browser","Python REPL","Br |
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
| WIN-2 | phase1 | PASS | files-multi-select-menu | menu=["Download","Delete 2 items"] fired on: [] |
| WIN-2 | phase1 | PASS | compiled-explorer-double-click-audio | sentinel=[] |
| WIN-2 | phase1 | PASS | compiled-explorer-context-menu | fired on: []; actions tried: ["Edit","Open","Download","Rename","Copy","Cut","Properties","Delete"] |
| WIN-2 | phase1 | PASS | markdown-edit-in-notepad | sentinel=[] |
