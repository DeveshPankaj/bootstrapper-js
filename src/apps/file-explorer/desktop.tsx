import React from "react";
import { Platform } from "@shared/index";
import { FileType } from "@shared/types";
import { DESKTOP_PATH, appendStyleSheet, getFileExtension } from "@shared/utils";

import { DESKTOP_CONTAINER_CLASS } from "../../core/window-manager";

const platform = Platform.getInstance()

export const ListDirComponent = ({ dir, openFile, showFileActions, customClass }: { dir?: string, openFile: (file: FileType) => void, showFileActions: (file: FileType, event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void , customClass?: string}) => {

    dir ??= DESKTOP_PATH;

    const extIconMap: Record<string, string> = {
        '.js': '/(sw)/usr/share/icons/js-icon.png',
        '.ts': '/(sw)/usr/share/icons/ts-icon.png',
        '.proj': '/(sw)/usr/share/icons/game-icon.png',
        '.html': '/(sw)/usr/share/icons/html-icon.png',
        '.png': '/(sw)/usr/share/icons/png-icon.png',
        '.jpg': '/(sw)/usr/share/icons/png-icon.png',
        '.jpeg': '/(sw)/usr/share/icons/png-icon.png',
        '.gif': '/(sw)/usr/share/icons/png-icon.png',
        '.webp': '/(sw)/usr/share/icons/png-icon.png',
        '.svg': '/(sw)/usr/share/icons/png-icon.png',
        '.bmp': '/(sw)/usr/share/icons/png-icon.png',
        '.ico': '/(sw)/usr/share/icons/png-icon.png',
        '.avif': '/(sw)/usr/share/icons/png-icon.png',
        '.run': '/(sw)/usr/share/icons/bash.png',
        '.md': '/(sw)/usr/share/icons/note-icon.webp',
        '.json': '/(sw)/usr/share/icons/json.png',
        '.db': '/(sw)/usr/share/icons/db-icon.svg',
        '.sqlite': '/(sw)/usr/share/icons/db-icon.svg',
        '.sqlite3': '/(sw)/usr/share/icons/db-icon.svg',
        '.ipynb': '/(sw)/usr/share/icons/ipynb-icon.png',
        '.mp3': '/(sw)/usr/share/icons/audio-icon.png',
        '.wav': '/(sw)/usr/share/icons/audio-icon.png',
        '.ogg': '/(sw)/usr/share/icons/audio-icon.png',
        '.flac': '/(sw)/usr/share/icons/audio-icon.png',
        '.m4a': '/(sw)/usr/share/icons/audio-icon.png',
        '.aac': '/(sw)/usr/share/icons/audio-icon.png',
        '.opus': '/(sw)/usr/share/icons/audio-icon.png',
        '.mp4': '/(sw)/usr/share/icons/video-icon.svg',
        '.mkv': '/(sw)/usr/share/icons/video-icon.svg',
        '.webm': '/(sw)/usr/share/icons/video-icon.svg',
        '.': '/(sw)/usr/share/icons/folder-icon.png',
        '': '/(sw)/usr/share/icons/invalid-file-icon.png'
    }

    const imageExtensions = new Set([
        '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif',
    ])

    const fs = platform.host.getFS()
    const ls: Array<FileType> = fs.readdirSync(dir, {}).map(x => ({
        name: x as string,
        path: `${dir}/${x}`,
        type: fs.statSync(`${dir}/${x}`).isDirectory() ? 'dir' : 'file',
        meta: { ext: getFileExtension(x as string) }
    }));

    const files: Array<FileType> = [
        ...ls,
        // {name: '123.js', path: '/123.js', meta: {ext: '.js'}, type:'file'},
        // {name: 'index.html', path: '/usr/desktop/index.html', meta: {ext: '.html'}, type: 'file'},
        // {name: 'app.proj', path: '/c/app.proj', meta: {ext: '.proj'}, type: 'file'},
        // {name: 'projects', path: '/usr/desktop/projects', meta: {ext: '.'}, type: 'dir'},
    ]

    const orderPath = `${dir}/.desktop-order.json`
    const [order, setOrder] = React.useState<string[]>(() => {
        try { return JSON.parse(fs.readFileSync(orderPath) as any) } catch { return [] }
    })
    const dragSrc = React.useRef<string | null>(null)
    const [dragOver, setDragOver] = React.useState<string | null>(null)

    const sortedFiles = React.useMemo(() => {
        if (!order.length) return files
        return [...files].sort((a, b) => {
            const ia = order.indexOf(a.name), ib = order.indexOf(b.name)
            if (ia === -1 && ib === -1) return 0
            if (ia === -1) return 1
            if (ib === -1) return -1
            return ia - ib
        })
    }, [files, order])

    const saveOrder = (names: string[]) => {
        try { fs.writeFileSync(orderPath, JSON.stringify(names)) } catch {}
        setOrder(names)
    }

    const onDragStart = (e: React.DragEvent, name: string) => {
        dragSrc.current = name
        e.dataTransfer.setData('application/x-desktop-reorder', name)
        e.dataTransfer.effectAllowed = 'move'
    }
    const onDragOver = (e: React.DragEvent, name: string) => {
        if (!e.dataTransfer.types.includes('application/x-desktop-reorder')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOver(name)
    }
    const onDrop = (e: React.DragEvent, targetName: string) => {
        e.preventDefault()
        setDragOver(null)
        const src = dragSrc.current
        if (!src || src === targetName) return
        const names = sortedFiles.map(f => f.name)
        const from = names.indexOf(src), to = names.indexOf(targetName)
        if (from === -1 || to === -1) return
        names.splice(from, 1)
        names.splice(to, 0, src)
        saveOrder(names)
    }
    const onDragEnd = () => { dragSrc.current = null; setDragOver(null) }

    const containerRef = React.useRef<HTMLElement>(null)
    React.useLayoutEffect(() => {
        if (!containerRef.current) return;
        const doc = containerRef.current.ownerDocument;
        const styles = new doc.defaultView!.CSSStyleSheet();

        styles.replaceSync(`

        .${DESKTOP_CONTAINER_CLASS}-files {
            // height: 100%;
            padding: .5rem;
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;

            // background: #3e3e3e;
        }
        .${DESKTOP_CONTAINER_CLASS} {
            display: contents;
        }

        .desktop-icons{
            flex-direction: column;
            width: min-content;
            height: 100%;
        }

        .${DESKTOP_CONTAINER_CLASS}-files .file[data-ext] {
        }

        .${DESKTOP_CONTAINER_CLASS}-files .file {
            box-sizing: border-box;
            display: inline-block;
            padding: .5rem;
            width: 4rem;
            height: 4rem;
            overflow: hidden;
            cursor: pointer;
        }

        .${DESKTOP_CONTAINER_CLASS}-files .desktop-item.drag-over {
            outline: 2px dashed rgba(10,132,255,0.6);
            border-radius: 6px;
        }

        `);

        appendStyleSheet(doc, styles)
        doc.adoptedStyleSheets
    }, []);

    const rightClickHandler = (file: FileType, event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        event.preventDefault();
        const customEvent = new CustomEvent('showmenu', { detail: {} });
        event.target.dispatchEvent(customEvent);
        showFileActions(file, event)
    }

    return (
        <main className={`${DESKTOP_CONTAINER_CLASS}-files ${customClass??''}` } ref={containerRef}>
            {
                sortedFiles.map(file => (
                    <div
                        key={file.path}
                        className={`desktop-item${dragOver === file.name ? ' drag-over' : ''}`}
                        draggable
                        onDragStart={e => onDragStart(e, file.name)}
                        onDragOver={e => onDragOver(e, file.name)}
                        onDragLeave={() => setDragOver(null)}
                        onDrop={e => onDrop(e, file.name)}
                        onDragEnd={onDragEnd}
                        onDoubleClick={() => openFile(file)}
                        style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}
                    >
                        <div className={`file`} data-ext={file.meta.ext} style={{ backgroundImage: `url('${file.type === 'file' && imageExtensions.has(file.meta.ext as string) ? `/(sw)${file.path}` : extIconMap[file.meta.ext as string] ?? extIconMap['']}')`, backgroundRepeat: 'no-repeat', backgroundSize: 'cover', backgroundPosition: 'center center' }} onContextMenu={ev => rightClickHandler(file, ev)}></div>
                        <span style={{ color: 'black', mixBlendMode: 'difference', overflow: 'hidden', maxWidth: '8rem', textOverflow: 'ellipsis', filter: 'contrast(0)' }}>{file.name}</span>
                    </div>
                ))
            }
        </main>
    )
}