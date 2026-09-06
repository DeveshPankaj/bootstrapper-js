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
        this.acl = [
            { path: this.appDir,                           read: true, write: true },
            { path: `/home/user1/.local/share/${opts.id}`, read: true, write: true },
            { path: '/tmp',                                read: true, write: true },
            { path: '/var/log',                            read: true, write: true },
            { path: '/',                                   read: true, write: false }, // catch-all read
            ...(opts.extraAcl ?? []),
        ]
    }

    private bestMatch(path: string): AclEntry | undefined {
        // Find the most-specific ACL entry whose path is a prefix of the target path.
        return this.acl
            .filter(e => path === e.path || path.startsWith(e.path + '/'))
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
