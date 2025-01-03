import React from "react";
import { Platform } from "@shared/index";
import { FileType } from "@shared/types";
import { DESKTOP_PATH, appendStyleSheet, getFileExtension } from "@shared/utils";

import { DESKTOP_CONTAINER_CLASS } from "../../core/window-manager";

const platform = Platform.getInstance()

export const ListDirComponent = ({ dir, openFile, showFileActions, customClass }: { dir?: string, openFile: (file: FileType) => void, showFileActions: (file: FileType, event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void , customClass?: string}) => {

    dir ??= DESKTOP_PATH;

    const extIconMap: Record<string, string> = {
        '.js': '/public/js-icon.png',
        '.ts': '/public/ts-icon.png',
        '.proj': '/public/game-icon.png',
        '.html': '/public/html-icon.png',
        '.png': '/public/png-icon.png',
        '.run': '/public/bash.png',
        '.md': '/public/note-icon.webp',
        '.json': '/public/json.png',
        '.': '/public/folder-icon.png',
        '': '/public/invalid-file-icon.png'
    }

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
            height: 100vh;
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
        
        `);

        appendStyleSheet(doc, styles)
        doc.adoptedStyleSheets
    }, []);

    const rightClickHandler = (file: FileType, event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        // console.log(event);
        event.preventDefault();
        const customEvent = new CustomEvent('showmenu', { detail: {} });
        event.target.dispatchEvent(customEvent);
        showFileActions(file, event)
    }

    return (
        <main className={`${DESKTOP_CONTAINER_CLASS}-files ${customClass??''}` } ref={containerRef}>
            {
                files.map(file => (
                    <div key={file.path} onClick={() => openFile(file)} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                        <div className={`file`} data-ext={file.meta.ext} style={{ backgroundImage: `url(${extIconMap[file.meta.ext as string] ?? extIconMap['']})`, backgroundRepeat: 'no-repeat', backgroundSize: 'cover', backgroundPosition: 'center center' }} onContextMenu={ev => rightClickHandler(file, ev)}></div>
                        <span style={{ color: 'black', mixBlendMode: 'difference', overflow: 'hidden', maxWidth: '8rem', textOverflow: 'ellipsis', filter: 'contrast(0)' }}>{file.name}</span>
                    </div>
                ))
            }
        </main>
    )
}