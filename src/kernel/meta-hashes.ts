// Ring 0 — the server's file hashes from meta.json (src/kernel/vfs.ts records them
// at boot). Kernel closure state: exposed read-only through the frozen
// `window.__wosKernel.metaSha256` hook, never writable by apps.
//
// Lets trusted code use a vfs copy instead of downloading the static one: the
// layout runs a system module from the vfs only when the exact bytes it read hash
// to the server's value (src/system/static-code.ts) — the same code as the
// immutable static copy, without a network request.

const hashes = new Map<string, string>()

export function recordMetaHashes(entries: ReadonlyArray<{ path?: unknown; sha256?: unknown }>): void {
    hashes.clear()
    for (const e of entries) {
        if (typeof e?.path === 'string' && typeof e.sha256 === 'string' && /^[0-9a-f]{64}$/.test(e.sha256)) {
            hashes.set(e.path, e.sha256)
        }
    }
}

/** The server's sha256 for a vfs path listed in meta.json, if any. */
export const metaSha256 = (path: string): string | undefined => hashes.get(path)
