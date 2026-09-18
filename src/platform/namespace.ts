// Ring 1 — Namespace
// Per-app context. Each spawned process gets one Namespace that defines its
// identity (pid, id) and its access control list for VFS paths.

export type AclEntry = {
    path: string
    read: boolean
    write: boolean
}

export type NamespaceOpts = {
    pid: number
    id: string        // app id, e.g. 'model-builder'
    appDir?: string   // e.g. '/opt/apps/model-builder'
    extraAcl?: AclEntry[]
}

export class Namespace {
    public readonly pid: number
    public readonly id: string
    public readonly appDir: string
    private readonly acl: AclEntry[]

    constructor(opts: NamespaceOpts) {
        this.pid = opts.pid
        this.id = opts.id
        this.appDir = opts.appDir ?? `/opt/apps/${opts.id}`

        // Default ACL: read+write own app dir and user data dir.
        // System paths (/tmp, /var/log) are readable + writable.
        // Everything else is read-only by default.
        //
        // /home/user1/.local/share/trainboard is a deliberate exception:
        // it's TrainBoard's shared cross-app metrics log (any app writes
        // {run,step,metric,value} rows to log.jsonl there so TrainBoard
        // can chart them), so every sandboxed app needs write access to
        // it specifically, not just its own id's data dir. Without this,
        // every app following that convention (nn-ide, model-builder,
        // snake-cnn3d, snake-qlearning, snake-lstm, and now robot-sim)
        // fails silently — each wraps the write in its own try/catch,
        // so the ACL denial never surfaced as a visible error anywhere.
        this.acl = [
            { path: this.appDir,                              read: true, write: true },
            { path: `/home/user1/.local/share/${opts.id}`,    read: true, write: true },
            { path: '/home/user1/.local/share/trainboard',    read: true, write: true },
            { path: '/tmp',                                   read: true, write: true },
            { path: '/var/log',                               read: true, write: true },
            { path: '/',                                      read: true, write: false }, // catch-all read
            ...(opts.extraAcl ?? []),
        ]
    }

    private bestMatch(path: string): AclEntry | undefined {
        // Find the most-specific ACL entry whose path is a prefix of the target path.
        // Special-case e.path === '/' so the catch-all works: any '/foo' starts with '/'
        // without adding an extra slash (which would require '//').
        return this.acl
            .filter(e => path === e.path || e.path === '/' || path.startsWith(e.path + '/'))
            .sort((a, b) => b.path.length - a.path.length)[0]
    }

    public checkRead(path: string): void {
        const match = this.bestMatch(path)
        if (!match || !match.read) {
            throw new Error(`[acl] read denied: pid=${this.pid} id=${this.id} path=${path}`)
        }
    }

    public checkWrite(path: string): void {
        const match = this.bestMatch(path)
        if (!match || !match.write) {
            throw new Error(`[acl] write denied: pid=${this.pid} id=${this.id} path=${path}`)
        }
    }

    public canRead(path: string): boolean {
        try { this.checkRead(path); return true } catch (_) { return false }
    }

    public canWrite(path: string): boolean {
        try { this.checkWrite(path); return true } catch (_) { return false }
    }
}
