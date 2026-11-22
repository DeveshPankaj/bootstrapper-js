# Security suite — deeplink-recheck

- BASE_URL: `http://localhost:8090`
- static checks scanned: `this repo`
- finished: 2026-11-22T18:19:28.565Z
- **phase1**: 2/2 findings pass (0 fail, 0 error); 5/5 checks
- **phase2**: 0/1 findings pass (1 fail, 0 error); 0/1 checks
- **info**: 1/1 findings pass (0 fail, 0 error); 1/1 checks

## phase1

| Finding | Result | Checks passed | Not passing | Script |
|---|---|---|---|---|
| BOOT-9 | PASS | 2/2 |  | test-commands.mjs |
| KRN-10 | PASS | 3/3 |  | test-commands.mjs |

## phase2

| Finding | Result | Checks passed | Not passing | Script |
|---|---|---|---|---|
| KRN-12 | FAIL | 0/1 | FAIL deeplink-handoff-not-swallowable | test-commands.mjs |

## info

| Finding | Result | Checks passed | Not passing | Script |
|---|---|---|---|---|
| KRN-10 | PASS | 1/1 |  | test-commands.mjs |

## Scripts

| Script | Exit | Seconds | Checks |
|---|---|---|---|
| test-commands.mjs | 0 | 56 | 7 |

## All checks

| Finding | Phase | Result | Check | Detail |
|---|---|---|---|---|
| BOOT-9 | phase1 | PASS | deeplink-app-dotdot | booted=true; sentinels=[] |
| BOOT-9 | phase1 | PASS | deeplink-uninstalled-app | booted=true; sentinels=[] |
| KRN-10 | phase1 | PASS | app-cannot-replace-ui.notepad | owner before=005-ui.notepad; script ran; replaced=false; sentinels=[] |
| KRN-10 | phase1 | PASS | app-cannot-replace-ui.remote-machines | owner before=/(sw)/opt/apps/remote-machines/main.js; script ran; replaced=false; sentinels=[] |
| KRN-10 | phase1 | PASS | extension-claim-not-default | opened={"readme.txt":["ui.notepad"],"pic.svg":["ui.imageviewer"]}; sentinels=[] |
| KRN-10 | info | PASS | explorer-owned-by-files-app | {"owner":"/(sw)/opt/apps/file-explorer/main.js","fallback":false} |
| KRN-12 | phase2 | FAIL | deeplink-handoff-not-swallowable | newTabBooted=false; rogueAcks=1; newTabText="Opened in your other tab\n\nThis link was handed to the tab where the app is alrea" |
