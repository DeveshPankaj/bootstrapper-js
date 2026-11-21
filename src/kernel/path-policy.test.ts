import { describe, expect, it } from 'vitest'
import {
    isInside, isKernelOwned, isValidAppId, isValidName, normalizePath, PathPolicyError, safeJoin,
} from './path-policy'

describe('normalizePath', () => {
    it('resolves dot segments and repeated slashes', () => {
        expect(normalizePath('/a//b/./c/')).toBe('/a/b/c')
        expect(normalizePath('/a/b/../c')).toBe('/a/c')
        expect(normalizePath('/')).toBe('/')
        expect(normalizePath('')).toBe('/')
    })
    it('clamps .. at the root', () => {
        expect(normalizePath('/../../etc/crontab')).toBe('/etc/crontab')
        expect(normalizePath('/tmp/../../etc')).toBe('/etc')
    })
    it('resolves relative paths against cwd', () => {
        expect(normalizePath('x.txt', '/home/user1')).toBe('/home/user1/x.txt')
        expect(normalizePath('../y', '/home/user1/docs')).toBe('/home/user1/y')
    })
    it('rejects NUL, control characters and backslashes', () => {
        expect(() => normalizePath('/tmp/a\u0000b')).toThrow(PathPolicyError)
        expect(() => normalizePath('/tmp/a\nb')).toThrow(PathPolicyError)
        expect(() => normalizePath('/tmp\\..\\etc')).toThrow(PathPolicyError)
        // @ts-expect-error runtime guard
        expect(() => normalizePath(undefined)).toThrow(PathPolicyError)
    })
})

describe('isInside', () => {
    it('compares segment-wise', () => {
        expect(isInside('/a/b', '/a/b')).toBe(true)
        expect(isInside('/a/b', '/a/b/c')).toBe(true)
        expect(isInside('/a/b', '/a/bc')).toBe(false)
        expect(isInside('/', '/anything')).toBe(true)
    })
    it('sees through traversal', () => {
        expect(isInside('/tmp', '/tmp/../etc/crontab')).toBe(false)
        expect(isInside('/opt/apps/x', '/opt/apps/x/../../../.initd.run')).toBe(false)
    })
})

describe('isValidName', () => {
    it('accepts ordinary names, incl. spaces, dots and unicode', () => {
        for (const n of ['a.txt', '5C27-EN - Detailed version.jpg', '.hidden', 'ünïcødé', "it's"]) {
            expect(isValidName(n)).toBe(true)
        }
    })
    it('rejects traversal, separators, control chars and oversize names', () => {
        for (const n of ['', '.', '..', 'a/b', '../x', 'a\\b', 'a\u0000', 'x\u007f', 'a'.repeat(256)]) {
            expect(isValidName(n)).toBe(false)
        }
    })
})

describe('safeJoin', () => {
    it('joins nested relative paths inside the base', () => {
        expect(safeJoin('/home/user1/x', 'dir/file.txt')).toBe('/home/user1/x/dir/file.txt')
        expect(safeJoin('/home/user1/x/', './a//b')).toBe('/home/user1/x/a/b')
    })
    it('refuses absolute paths, .. segments and empty results (zip-slip)', () => {
        expect(() => safeJoin('/home/user1/x', '/etc/crontab')).toThrow(PathPolicyError)
        expect(() => safeJoin('/home/user1/x', '../../../.initd.run')).toThrow(PathPolicyError)
        expect(() => safeJoin('/home/user1/x', 'a/../../b')).toThrow(PathPolicyError)
        expect(() => safeJoin('/home/user1/x', '')).toThrow(PathPolicyError)
        expect(() => safeJoin('/home/user1/x', './')).toThrow(PathPolicyError)
        expect(() => safeJoin('/home/user1/x', 'a\\..\\b')).toThrow(PathPolicyError)
    })
})

describe('isKernelOwned', () => {
    it('covers system trees and boot hooks, including traversal spellings', () => {
        for (const p of ['/etc/crontab', '/bin/ls.run', '/opt/window-manager.js', '/usr/lib/x.js',
            '/meta.json', '/.initd.run', '/home/user1/initd.run', '/tmp/../etc/widgets/x.js']) {
            expect(isKernelOwned(p)).toBe(true)
        }
    })
    it('leaves user space alone', () => {
        for (const p of ['/home/user1/notes.txt', '/tmp/x', '/mnt/webrtc/a/b', '/home/user1/.local/share/x/y',
            '/etc-backup/x', '/optional']) {
            expect(isKernelOwned(p)).toBe(false)
        }
    })
})

describe('isValidAppId', () => {
    it('accepts lowercase ids with dots, dashes and underscores', () => {
        for (const id of ['notepad', 'remote-machines', 'ui.files', 'a_b', '7zip']) expect(isValidAppId(id)).toBe(true)
    })
    it('rejects traversal and odd characters', () => {
        for (const id of ['', '..', '../../etc', 'a/b', 'A', '-x', '.x', 'a..b', 'x'.repeat(65)]) {
            expect(isValidAppId(id)).toBe(false)
        }
    })
})
