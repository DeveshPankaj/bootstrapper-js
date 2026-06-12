
export const DESKTOP_PATH = '/home/user1'

export const getFileExtension = (fileName: string) => {
    const ext = fileName.split('.').at(-1)
    if(ext?.length === 0 || ((ext?.length||0) >= fileName.length-1)) return '.'
    return `.${ext}`
}


export const appendStyleSheet = (document: Document, styleSheet: CSSStyleSheet) => {
    if(document.adoptedStyleSheets.find(s => s === styleSheet)) return;

    document.adoptedStyleSheets.push(styleSheet)
}

// Recursively copies a local directory (picked via the File System Access API)
// into the BrowserFS-backed virtual filesystem at `targetPath`.
export const mountLocalDirectory = async (fs: typeof import('fs'), dirHandle: FileSystemDirectoryHandle, targetPath: string): Promise<void> => {
    if(!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true })

    for await (const [name, handle] of (dirHandle as any).entries() as AsyncIterable<[string, any]>) {
        const entryPath = `${targetPath}/${name}`

        if(handle.kind === 'directory') {
            await mountLocalDirectory(fs, handle as FileSystemDirectoryHandle, entryPath)
        } else {
            const file: File = await handle.getFile()
            const buffer = await file.arrayBuffer()
            fs.writeFileSync(entryPath, Buffer.from(buffer))
        }
    }
}
