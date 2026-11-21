// Ring 0 — path policy (documentation/security/decisions.md, D6).
//
// The one implementation of path normalisation and containment checks. Every
// caller that turns untrusted input into a vfs path uses it: namespace ACLs,
// package installs, archive extraction, WebRTC / SSH mounts, shell commands.
// vfs scripts reach it as `platform.host.pathPolicy` (compiled, so a vfs
// write can't weaken it). path-policy.test.ts is the spec.
//
// No imports on purpose — this module must stay dependency-free so anything
// (kernel, platform, host, SW-side code, tests) can import it without cycles.

export class PathPolicyError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'PathPolicyError'
    }
}

// C0 controls, DEL and C1 controls: never valid in a vfs path or name.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/

/**
 * Resolves `.`, `..` and repeated slashes in a vfs path. Relative paths resolve
 * against `cwd`. `..` above the root stays at the root (POSIX semantics).
 * Rejects non-strings, control characters (incl. NUL) and backslashes.
 * Returns an absolute path with no trailing slash ('/' for the root).
 */
export function normalizePath(path: string, cwd: string = '/'): string {
    if (typeof path !== 'string') throw new PathPolicyError('path must be a string')
    if (CONTROL_CHARS.test(path)) throw new PathPolicyError('control character in path')
    if (path.includes('\\')) throw new PathPolicyError('backslash in path')
    const full = path.startsWith('/') ? path : `${cwd}/${path}`
    const out: string[] = []
    for (const segment of full.split('/')) {
        if (segment === '' || segment === '.') continue
        if (segment === '..') { out.pop(); continue }
        out.push(segment)
    }
    return '/' + out.join('/')
}

/**
 * True when `path` is `base` or lies under it, compared segment by segment
 * ('/a/bc' is not inside '/a/b'). Both sides are normalised first.
 */
export function isInside(base: string, path: string): boolean {
    const b = normalizePath(base)
    const p = normalizePath(path)
    if (b === '/') return true
    return p === b || p.startsWith(b + '/')
}

/**
 * True for a single, safe path segment coming from an untrusted source: a
 * peer's file listing, an SSH host, an archive entry segment, a package file.
 */
export function isValidName(name: string, maxLength: number = 255): boolean {
    return typeof name === 'string'
        && name.length > 0
        && name.length <= maxLength
        && name !== '.'
        && name !== '..'
        && !name.includes('/')
        && !name.includes('\\')
        && !CONTROL_CHARS.test(name)
}

/**
 * Joins an untrusted relative path (it may contain '/'-separated segments, like
 * an archive entry 'dir/file.txt') onto `base`. Throws on absolute paths, '..'
 * or otherwise invalid segments, and on any result outside `base`.
 */
export function safeJoin(base: string, relative: string): string {
    if (typeof relative !== 'string' || relative === '') throw new PathPolicyError('empty path')
    if (relative.startsWith('/')) throw new PathPolicyError(`absolute path not allowed: ${relative}`)
    const segments = relative.split('/').filter(s => s !== '' && s !== '.')
    if (segments.length === 0) throw new PathPolicyError(`empty path: ${relative}`)
    for (const segment of segments) {
        if (!isValidName(segment)) throw new PathPolicyError(`invalid path segment: ${JSON.stringify(segment)}`)
    }
    const b = normalizePath(base)
    const full = normalizePath(`${b}/${segments.join('/')}`)
    if (!isInside(b, full) || full === b) throw new PathPolicyError(`path escapes ${b}: ${relative}`)
    return full
}

/**
 * System paths only the kernel may write (invariant I4). Enforced for every
 * caller that goes through a namespace (ProxyFS, the IPC bus, the broker).
 */
export const KERNEL_OWNED_PATHS: readonly string[] = Object.freeze([
    '/bin', '/boot', '/etc', '/opt', '/usr', '/meta.json', '/.initd.run', '/home/user1/initd.run',
])

export function isKernelOwned(path: string): boolean {
    const p = normalizePath(path)
    return KERNEL_OWNED_PATHS.some(k => isInside(k, p))
}

/** App ids double as directory names under /opt/apps and ~/.local/share. */
export const APP_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/

export function isValidAppId(id: string): boolean {
    return typeof id === 'string' && APP_ID_RE.test(id) && !id.includes('..')
}

/** Frozen bundle of the helpers, exposed to vfs code as `platform.host.pathPolicy`. */
export const pathPolicy = Object.freeze({
    normalizePath, isInside, isValidName, safeJoin, isKernelOwned, isValidAppId,
    KERNEL_OWNED_PATHS, APP_ID_RE, PathPolicyError,
})
export type PathPolicy = typeof pathPolicy
