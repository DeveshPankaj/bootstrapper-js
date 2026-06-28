import type fs from 'fs'

export type VFS = typeof fs

export const removeRecursive = (fileSystem: VFS, path: string): void => {
    if (!fileSystem.existsSync(path)) return
    for (const entry of fileSystem.readdirSync(path) as string[]) {
        const entryPath = `${path.endsWith('/') ? path : `${path}/`}${entry}`
        if (fileSystem.statSync(entryPath).isDirectory()) removeRecursive(fileSystem, entryPath)
        else fileSystem.unlinkSync(entryPath)
    }
    fileSystem.rmdirSync(path)
}

export const readJsonFile = <T = unknown>(fileSystem: VFS, path: string, fallback: T | null = null): T | null => {
    try {
        if (fileSystem.existsSync(path)) {
            return JSON.parse(fileSystem.readFileSync(path, 'utf-8') as string) as T
        }
    } catch (err) {
        console.error(`readJsonFile(${path}):`, err)
    }
    return fallback
}

export const writeJsonFile = (fileSystem: VFS, path: string, data: unknown, mkdirParent = false): void => {
    if (mkdirParent) {
        const dir = path.slice(0, path.lastIndexOf('/')) || '/'
        ensureDir(fileSystem, dir)
    }
    fileSystem.writeFileSync(path, JSON.stringify(data, null, 2))
}

export const ensureDir = (fileSystem: VFS, path: string): void => {
    if (!fileSystem.existsSync(path)) {
        fileSystem.mkdirSync(path, { recursive: true })
    }
}
