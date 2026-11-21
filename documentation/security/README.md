# Security model — sandboxed apps

| Document | What it holds |
|---|---|
| [audit.md](audit.md) | Findings (KRN / BOOT / WIN / NET / APP), each with location, exploit, fix and test idea |
| [decisions.md](decisions.md) | Design decisions D1–D16 — the sandbox architecture and why |
| [runtime-spec.md](runtime-spec.md) | Phase-2 contract: app manifest, permissions, handshake, RPC methods, code delivery, SDK |
| [/TODO.md](../../TODO.md) | The plan: phases, tasks, owners, progress |
| `testing/scripts/security/` | Playwright regression suite — one test per finding |

## Goal

Only the **layout** — the compiled shell selected at boot — touches the top document. Every **app** runs in
an opaque-origin sandbox: it gets its own DOM, and reaches the vfs, storage, other apps and the window
chrome only through the kernel's **capability broker**, which enforces that app's permissions.

## Hosting constraints (GitHub Pages, served from `docs/`)

- Static files only — we can't send response headers, so no CSP / COOP / COEP / `frame-ancestors`
  headers. Available instead: `<meta http-equiv="Content-Security-Policy">` in `index.html`, headers on
  responses the service worker synthesizes, the `sandbox` attribute on iframes, and JS checks for framing
  and openers.
- One origin (`pankajdevesh.com`, via `CNAME`) for the kernel, the apps and user content. Isolation must
  come from **opaque origins** (`sandbox` without `allow-same-origin`), not from separate domains.
- The service worker controls only same-origin, non-opaque clients, so a sandboxed app can't read vfs
  files through `/(sw)/` — code reaches it as static files or over the broker.

## Trust levels

| Level | What | Runs in | Can touch |
|---|---|---|---|
| TCB (rings 0–2) | `docs/index.html` + `docs/*.bundle.js`: kernel (vfs, SW bridge, broker), platform, layout | top document | everything |
| App (ring 3) | every app — `/opt/apps/*` (first-party too), installed packages, user `.html`/`.js`, `/bin/*.run`, cron / widget / settings scripts | opaque-origin sandboxed iframe | its own DOM; broker RPC within its permissions |
| Data | everything else in the vfs | never executed | — |

The vfs is writable by apps, peers, drag-and-drop and archive extraction, so **nothing read from the vfs
is trusted code** — including the vfs copies of first-party apps.

## Attackers

A1 malicious/compromised app · A2 malicious file content opened in a first-party viewer · A3 malicious
WebRTC peer · A4 malicious website (opens the OS in a popup, is opened by it, is embedded by an app, or
embeds the OS) · A5 malicious SSH host / bridge / network service / CDN · A6 malicious deep link or URL.

## Invariants (what the test suite asserts)

- **I1** No vfs-sourced code runs in the top realm.
- **I2** An app can't reach `top`/`parent` DOM, `window.platform`, the raw fs, or the origin's
  IndexedDB / localStorage / caches / service worker.
- **I3** Every privileged operation arrives over a per-instance `MessagePort` and is checked against that
  instance's permissions; nothing privileged listens on `window` `message`.
- **I4** Paths are normalised before every ACL check; system paths (`/bin`, `/boot`, `/etc`, `/opt`,
  `/usr`, `/meta.json`, `/.initd.run`, `/home/user1/initd.run`) are writable only by the kernel.
- **I5** Nothing served from `/(sw)/` or `/cache/` can become a same-origin document.
- **I6** The OS refuses to boot inside a cross-origin frame; pages it opens get no `opener`.
- **I7** Commands are namespaced; an app can't replace another app's or the system's commands, and no
  code is ever built from strings (file names, URLs, peer data).
- **I8** Content from peers, mounts, downloads and archives is never executed without an explicit Run,
  and then only sandboxed.

## Target architecture

```
top document (TCB)                                   opaque-origin sandboxes (ring 3)
┌──────────────────────────────────────────┐        ┌──────────────────────────────┐
│ kernel  vfs · sw-bridge · broker · policy │◄─port─►│ app instance  (wos SDK)      │
│ layout  windows · taskbar · desktop       │        │ own DOM only, async RPC      │
│         (the only DOM owner)              │◄─port─►│ app instance …               │
└──────────────────────────────────────────┘        └──────────────────────────────┘
        ▲ static code only: docs/*.bundle.js, /public/mount/** (immutable, served by GitHub Pages)
```
