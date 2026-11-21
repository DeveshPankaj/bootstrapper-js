// Ring 1 — Namespace
// Per-app context. Each spawned process gets one Namespace that defines its
// identity (pid, id) and its access control list for VFS paths.
//
// Path rules (audit KRN-5, decisions.md D5/D6) — every target and every ACL
// entry goes through the kernel path policy (src/kernel/path-policy.ts):
//   - targets and entries are normalised ('.', '..', '//'; NUL, control
//     characters and '\' are rejected), entries match segment by segment;
//   - the id must be a valid app id (APP_ID_RE); an invalid id gets no write
//     scope at all;
//   - kernel-owned paths (/bin, /boot, /etc, /opt, /usr, /meta.json, init
//     scripts) are never writable through a namespace, whatever the ACL says;
//   - an app writes only its own data dir (~/.local/share/<id>), its own
//     /tmp/<id>, and TrainBoard's shared log (see below);
//   - other apps' data dirs under ~/.local/share are not readable either;
//     everything else stays readable in phase 1 (apps open user files).
// The ACL is still advisory until phase 2 (apps also reach host.getFS()), but
// it is the rule set the broker will enforce.

import { normalizePath, isInside, isKernelOwned, isValidAppId } from '../kernel/path-policy'

export type AclEntry = {
    path: string
    read: boolean
    write: boolean
}

export type NamespaceOpts = {
    pid: number
    id: string        // app id, e.g. 'model-builder' (a window's id is its command name)
    appDir?: string   // e.g. '/opt/apps/model-builder'
    extraAcl?: AclEntry[]
}

export const APP_DATA_ROOT = '/home/user1/.local/share'
export const APP_TMP_ROOT = '/tmp'

// TrainBoard's shared cross-app metrics log: any app writes {run,step,metric,value}
// rows to log.jsonl there so TrainBoard can chart them (nn-ide, model-builder,
// snake-cnn3d, snake-qlearning, snake-lstm, robot-sim). Every app may read and
// write it — the one deliberate exception to "own data dir only".
export const SHARED_APP_DATA: readonly string[] = Object.freeze([`${APP_DATA_ROOT}/trainboard`])

// Deliberate cross-app reads, keyed by app id: AI DOM Lens offers Vector Store's
// projects as knowledge bases (it lists and reads ~/.local/share/ui.vector-store).
const CROSS_APP_READS: Readonly<Record<string, readonly string[]>> = Object.freeze({
    'ai-dom-lens': Object.freeze(['ui.vector-store', 'vector-store']),
})

// A window's namespace id is its command name. First-party apps install to
// /opt/apps/<app-id> and register `ui.<app-id>`, and both names appear in their
// data paths (snake-game keeps ~/.local/share/snake-game, ts-ide keeps
// ~/.local/share/ui.ts-ide), so `ui.<app-id>` owns the dirs of both names.
export const ownIdsOf = (id: string): string[] => {
    if (!isValidAppId(id)) return []
    const ids = [id]
    if (id.startsWith('ui.') && isValidAppId(id.slice(3))) ids.push(id.slice(3))
    return ids
}

const tryNormalize = (path: unknown): string | null => {
    try { return typeof path === 'string' && path.startsWith('/') ? normalizePath(path) : null }
    catch (_) { return null }
}

export class Namespace {
    public readonly pid: number
    public readonly id: string
    public readonly appDir: string
    private readonly acl: ReadonlyArray<Readonly<AclEntry>>

    constructor(opts: NamespaceOpts) {
        this.pid = opts.pid
        this.id = String(opts.id)
        const ownIds = ownIdsOf(this.id)
        const appId = ownIds[ownIds.length - 1]
        // appDir is informational (task manager) and readable; /opt is kernel-owned.
        this.appDir = tryNormalize(opts.appDir) ?? (appId ? `/opt/apps/${appId}` : '')

        const entries: AclEntry[] = []
        for (const own of ownIds) {
            entries.push({ path: `${APP_DATA_ROOT}/${own}`, read: true, write: true })
            entries.push({ path: `${APP_TMP_ROOT}/${own}`, read: true, write: true })
        }
        if (ownIds.length) {
            for (const shared of SHARED_APP_DATA) entries.push({ path: shared, read: true, write: true })
            for (const other of CROSS_APP_READS[appId] ?? []) entries.push({ path: `${APP_DATA_ROOT}/${other}`, read: true, write: false })
        }
        if (this.appDir) entries.push({ path: this.appDir, read: true, write: false })
        entries.push({ path: APP_DATA_ROOT, read: false, write: false }) // other apps' private data
        entries.push({ path: '/', read: true, write: false })            // catch-all read (phase 1)
        for (const e of opts.extraAcl ?? []) entries.push(e)

        // Normalise every entry; drop the ones that don't name an absolute path.
        const acl: Array<Readonly<AclEntry>> = []
        for (const e of entries) {
            const path = tryNormalize(e?.path)
            if (path) acl.push(Object.freeze({ path, read: e.read === true, write: e.write === true }))
        }
        this.acl = Object.freeze(acl)
        Object.freeze(this)
    }

    // The most specific entry containing the (already normalised) path; later
    // entries win ties, so an extraAcl entry can override a default one.
    private bestMatch(path: string): Readonly<AclEntry> | undefined {
        let best: Readonly<AclEntry> | undefined
        for (const e of this.acl) {
            if (!isInside(e.path, path)) continue
            if (!best || e.path.length >= best.path.length) best = e
        }
        return best
    }

    // Both checks return the normalised path — callers must use it for the
    // actual fs operation, so what was checked is what gets touched.
    public checkRead(path: string): string {
        const p = tryNormalize(path)
        const match = p ? this.bestMatch(p) : undefined
        if (!p || !match || !match.read) {
            throw new Error(`[acl] read denied: pid=${this.pid} id=${this.id} path=${String(path)}`)
        }
        return p
    }

    public checkWrite(path: string): string {
        const p = tryNormalize(path)
        const match = p ? this.bestMatch(p) : undefined
        if (!p || !match || !match.write || isKernelOwned(p)) {
            throw new Error(`[acl] write denied: pid=${this.pid} id=${this.id} path=${String(path)}`)
        }
        return p
    }

    public canRead(path: string): boolean {
        try { this.checkRead(path); return true } catch (_) { return false }
    }

    public canWrite(path: string): boolean {
        try { this.checkWrite(path); return true } catch (_) { return false }
    }
}
