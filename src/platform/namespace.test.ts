// Spec for the namespace ACL (TODO 1B.5, audit KRN-5). Run: npx vitest run
import { describe, it, expect } from 'vitest'
import { Namespace, ownIdsOf } from './namespace'

const ns = (id: string, extra: Partial<ConstructorParameters<typeof Namespace>[0]> = {}) => new Namespace({ pid: 7, id, ...extra })
const DATA = '/home/user1/.local/share'

describe('Namespace ACL', () => {
    it('normalises targets: /tmp/../etc/crontab is checked as /etc/crontab', () => {
        expect(() => ns('ui.x').checkWrite('/tmp/../etc/crontab')).toThrow(/write denied/)
        expect(() => ns('ui.x').checkWrite('/tmp/ui.x/../../etc/crontab')).toThrow(/write denied/)
        expect(ns('ui.x').checkWrite('//tmp//ui.x/./a/../b')).toBe('/tmp/ui.x/b')
        expect(ns('ui.x').checkRead('/home/user1/projects/../Notes.md')).toBe('/home/user1/Notes.md')
    })

    it('rejects paths the path policy rejects (NUL, control chars, backslash, relative)', () => {
        for (const bad of ['/tmp/ui.x/a\u0000b', '/tmp/ui.x/a\nb', '/tmp/ui.x\\a', 'tmp/ui.x/a', '']) {
            expect(() => ns('ui.x').checkWrite(bad)).toThrow(/write denied/)
            expect(() => ns('ui.x').checkRead(bad)).toThrow(/read denied/)
        }
    })

    it("denies reading other apps' private data, but not one's own", () => {
        const app = ns('ui.snake-game')
        expect(() => app.checkRead(`${DATA}/remote-machines/connections.json`)).toThrow(/read denied/)
        expect(() => app.checkRead(DATA)).toThrow(/read denied/)
        expect(() => app.checkRead(`${DATA}/ui.snake-game/../remote-machines/secrets.json`)).toThrow(/read denied/)
        expect(app.canRead(`${DATA}/snake-game/highscore.txt`)).toBe(true)
        expect(app.canRead(`${DATA}/ui.snake-game/x`)).toBe(true)
        // segment-wise: snake-gamex is somebody else
        expect(app.canRead(`${DATA}/snake-gamex/x`)).toBe(false)
    })

    it('writes only its own data dir, its own /tmp/<id> and the shared TrainBoard log', () => {
        const app = ns('ui.snake-game')
        for (const ok of [`${DATA}/snake-game/highscore.txt`, `${DATA}/ui.snake-game/a/b`, '/tmp/ui.snake-game/x', '/tmp/snake-game/x', `${DATA}/trainboard/log.jsonl`]) {
            expect(app.canWrite(ok)).toBe(true)
        }
        for (const no of ['/tmp/x', '/tmp/other-app/x', '/tmp', '/var/log/notifications.json', '/home/user1/notes.txt', `${DATA}/other/x`, '/mnt/x', '/user-preferences.json']) {
            expect(app.canWrite(no)).toBe(false)
        }
    })

    it('never allows writes to kernel-owned paths, even through extraAcl or appDir', () => {
        const app = ns('ui.x', { extraAcl: [{ path: '/etc', read: true, write: true }, { path: '/', read: true, write: true }] })
        for (const p of ['/etc/crontab', '/opt/window-manager.js', '/opt/apps/x/main.js', '/bin/ls.run', '/usr/bin/x.js', '/meta.json', '/.initd.run', '/home/user1/initd.run', '/boot/x']) {
            expect(app.canWrite(p)).toBe(false)
        }
        expect(app.canWrite('/home/user1/docs/a.txt')).toBe(true) // the extra '/' rw entry still applies elsewhere
    })

    it('an invalid id gets no write scope at all', () => {
        for (const id of ['../../etc', 'Foo', 'a/b', '', '.hidden', 'x'.repeat(80), 'a..b']) {
            const app = ns(id)
            for (const p of [`${DATA}/${id}/x`, `/tmp/${id}/x`, `${DATA}/trainboard/log.jsonl`, '/tmp/x', '/etc/crontab']) {
                expect(app.canWrite(p)).toBe(false)
            }
            expect(app.canRead('/home/user1/Notes.md')).toBe(true)
        }
        expect(ns('../../etc').appDir).toBe('')
    })

    it('derives the app id and appDir from ui.<app-id> command names', () => {
        expect(ownIdsOf('ui.snake-game')).toEqual(['ui.snake-game', 'snake-game'])
        expect(ownIdsOf('explorer')).toEqual(['explorer'])
        expect(ownIdsOf('ui.')).toEqual(['ui.']) // valid id; '' alias isn't
        expect(ownIdsOf('ui.UPPER')).toEqual([])
        expect(ns('ui.snake-game').appDir).toBe('/opt/apps/snake-game')
        expect(ns('ui.x', { appDir: '/opt/apps/x/../y' }).appDir).toBe('/opt/apps/y')
        expect(ns('ui.snake-game').canRead('/opt/apps/snake-game/main.html')).toBe(true)
        expect(ns('ui.snake-game').canWrite('/opt/apps/snake-game/main.html')).toBe(false)
    })

    it("keeps AI DOM Lens' read-only view of Vector Store's projects", () => {
        expect(ns('ui.ai-dom-lens').canRead(`${DATA}/ui.vector-store/p.json`)).toBe(true)
        expect(ns('ui.ai-dom-lens').canWrite(`${DATA}/ui.vector-store/p.json`)).toBe(false)
        expect(ns('ui.trainboard').canRead(`${DATA}/ui.vector-store/p.json`)).toBe(false)
        expect(ns('ui.vector-store').canWrite(`${DATA}/ui.vector-store/p.json`)).toBe(true)
    })

    it('keeps the phase-1 catch-all read of user content, read-only', () => {
        const app = ns('ui.cpp-ide')
        expect(app.canRead('/home/user1/projects/cpp/hello/main.cpp')).toBe(true)
        expect(app.canWrite('/home/user1/projects/cpp/hello/main.cpp')).toBe(false)
        expect(app.canRead('/tmp/other-app/file')).toBe(true)
    })

    it('normalises extraAcl entries and ignores malformed ones', () => {
        const app = ns('ui.x', { extraAcl: [
            { path: '/home/user1/../user1/docs', read: true, write: true },
            { path: 'relative/dir', read: true, write: true },
            { path: '/bad\u0000dir', read: true, write: true },
        ] })
        expect(app.canWrite('/home/user1/docs/a.txt')).toBe(true)
        expect(app.canWrite('/home/user1/relative/dir/a')).toBe(false)
    })

    it('is immutable', () => {
        const app = ns('ui.x')
        expect(Object.isFrozen(app)).toBe(true)
        expect(Object.isFrozen((app as any).acl)).toBe(true)
        expect(() => { (app as any).acl.push({ path: '/', read: true, write: true }) }).toThrow()
        expect(() => { (app as any).acl[0].write = true; if (!(app as any).acl[0].write) throw new Error('frozen') }).toThrow()
        expect(app.canWrite('/etc/x')).toBe(false)
    })
})
