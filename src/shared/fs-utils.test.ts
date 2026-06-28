import { describe, it, expect, vi } from 'vitest'
import { removeRecursive, readJsonFile, writeJsonFile, ensureDir } from './fs-utils'

const createMockFS = (files: Record<string, string | null> = {}, dirs: Set<string> = new Set()) => ({
    existsSync: vi.fn((path: string) => files[path] !== undefined || dirs.has(path)),
    readFileSync: vi.fn((path: string, _enc?: string) => {
        if (files[path] === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        return files[path]
    }),
    writeFileSync: vi.fn((path: string, data: string) => { files[path] = data }),
    mkdirSync: vi.fn((_path: string, _opts?: any) => {}),
    unlinkSync: vi.fn((path: string) => { delete files[path] }),
    rmdirSync: vi.fn((path: string) => { dirs.delete(path) }),
    readdirSync: vi.fn((path: string) => {
        const prefix = path.endsWith('/') ? path : path + '/'
        const entries = new Set<string>()
        for (const key of Object.keys(files)) {
            if (key.startsWith(prefix)) {
                const rest = key.slice(prefix.length)
                entries.add(rest.split('/')[0])
            }
        }
        for (const d of dirs) {
            if (d.startsWith(prefix) && d !== path) {
                const rest = d.slice(prefix.length)
                if (!rest.includes('/')) entries.add(rest)
            }
        }
        return Array.from(entries)
    }),
    statSync: vi.fn((path: string) => ({
        isDirectory: () => dirs.has(path),
        isFile: () => files[path] !== undefined && !dirs.has(path),
    })),
}) as any

describe('readJsonFile', () => {
    it('returns parsed JSON for existing valid file', () => {
        const fs = createMockFS({ '/test.json': '{"key":"value"}' })
        expect(readJsonFile(fs, '/test.json')).toEqual({ key: 'value' })
    })

    it('returns null for non-existent file', () => {
        const fs = createMockFS({})
        expect(readJsonFile(fs, '/missing.json')).toBeNull()
    })

    it('returns fallback for non-existent file', () => {
        const fs = createMockFS({})
        expect(readJsonFile(fs, '/missing.json', { default: true })).toEqual({ default: true })
    })

    it('returns null for invalid JSON', () => {
        const fs = createMockFS({ '/bad.json': 'not json{' })
        expect(readJsonFile(fs, '/bad.json')).toBeNull()
    })
})

describe('writeJsonFile', () => {
    it('writes formatted JSON', () => {
        const files: Record<string, string | null> = {}
        const fs = createMockFS(files)
        writeJsonFile(fs, '/out.json', { a: 1 })
        expect(fs.writeFileSync).toHaveBeenCalledWith('/out.json', '{\n  "a": 1\n}')
    })

    it('creates parent directory when mkdirParent is true', () => {
        const fs = createMockFS({})
        writeJsonFile(fs, '/etc/wm/config.json', {}, true)
        expect(fs.mkdirSync).toHaveBeenCalledWith('/etc/wm', { recursive: true })
    })
})

describe('ensureDir', () => {
    it('creates directory if it does not exist', () => {
        const fs = createMockFS({})
        ensureDir(fs, '/new/dir')
        expect(fs.mkdirSync).toHaveBeenCalledWith('/new/dir', { recursive: true })
    })

    it('does nothing if directory already exists', () => {
        const fs = createMockFS({}, new Set(['/existing']))
        ensureDir(fs, '/existing')
        expect(fs.mkdirSync).not.toHaveBeenCalled()
    })
})

describe('removeRecursive', () => {
    it('does nothing for non-existent path', () => {
        const fs = createMockFS({})
        removeRecursive(fs, '/nope')
        expect(fs.readdirSync).not.toHaveBeenCalled()
    })

    it('removes files and directory', () => {
        const dirs = new Set(['/dir'])
        const files: Record<string, string | null> = { '/dir/a.txt': 'a', '/dir/b.txt': 'b' }
        const fs = createMockFS(files, dirs)
        removeRecursive(fs, '/dir')
        expect(fs.unlinkSync).toHaveBeenCalledWith('/dir/a.txt')
        expect(fs.unlinkSync).toHaveBeenCalledWith('/dir/b.txt')
        expect(fs.rmdirSync).toHaveBeenCalledWith('/dir')
    })
})
