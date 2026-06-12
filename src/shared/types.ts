
export type FileType = { name: string; path: string; meta: Record<string, unknown>; type: 'file' | 'dir' | 'fd'; };

declare global {
    interface Window {
        showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
    }
}
