import React, { useRef } from "react";
import { Platform, UICallbackProps } from "@shared/index";
import { createRoot } from "react-dom/client";

// import { EditorView, basicSetup } from "codemirror";
// import { EditorState } from "@codemirror/state";
// import { javascript } from "@codemirror/lang-javascript";
// import { html } from "@codemirror/lang-html";

// import { placeholder } from "@codemirror/view";
import { FileType } from '@shared/types';
import { getFileExtension } from "@shared/utils";
import { ListDirConponent } from "./desktop";

const platform = Platform.getInstance()

const cacheName = 'MyFancyCacheName_v1';
const cacheRef = {current: null as Cache|null}

// caches.open(cacheName).then((cache) => {cacheRef.current = cache})
// const putCache = (key: string, value: string) => {
//     cacheRef.current?.put(key, 
//         new Response(value, { headers: {'Content-Type': 'text/html'}})
//     )
// }

const fullScreenCallbackRef = {
    current: (...args: any[]) => {}
}
const resizeCallbackRef = {
    current: (...args: any[]) => {}
}
platform.register('fullscreen', (...args: any[]) => fullScreenCallbackRef.current(...args))
platform.register('resize', (...args: any[]) => resizeCallbackRef.current(...args))
platform.host.registerCommand('ui.file-explorer', (body: HTMLBodyElement, props: UICallbackProps, file: FileType) => {
    const container = platform.window.document.createElement('div')
    if(typeof file === 'string') {
        const fs = platform.host.getFS()
        file = {
            name: (file as string).split('/').at(-1)!,
            path: file,
            meta: {ext: getFileExtension(file)},
            type: fs.statSync(file).isDirectory() ? 'dir' : 'file'
        }       
    }
    
    if(!file) {
        file = {
            name: '',
            path: '/',
            meta: {ext: '.'},
            type: 'dir'
        }
    }

    body.appendChild(container)
    const win = body.ownerDocument.defaultView!

    const styles = new win.CSSStyleSheet()
    styles.replace(`
        html, body {
            margin: 0;
            padding:0;
            font-family: monospace; 
            height: 100svh;
            // background: black;
        }

        @font-face {
            font-family: 'Material Symbols Outlined';
            font-style: normal;
            font-weight: 100 700;
            src: url(https://fonts.gstatic.com/s/materialsymbolsoutlined/v138/kJEhBvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oFsLjBuVY.woff2) format('woff2');
        }
        .material-symbols-outlined {
            font-family: 'Material Symbols Outlined';
            font-weight: normal;
            font-style: normal;
            font-size: 24px;
            line-height: 1;
            letter-spacing: normal;
            text-transform: none;
            display: inline-block;
            white-space: nowrap;
            word-wrap: normal;
            direction: ltr;
            -webkit-font-feature-settings: 'liga';
            -webkit-font-smoothing: antialiased;
        }
    
        * {
            box-sizing: border-box;
        }

        .file-explorer {

        }
        .file-explorer > header {
            background: black;
            color: white;
            padding: 7px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .heading {

        }

        .dir-list {
            flex-grow: 1;
            overflow: auto;
        }

        .dir-list > div {
            cursor: pointer;
        }

        .dir-list > div:hover {
            background: aqua;
        }


    `)

    body.ownerDocument.adoptedStyleSheets.push(styles)

    const move = (diff: {[key in 'left'|'right'|'top'|'bottom']?: number}) => {
        return () => {
            const rect = props.getBoundingClientRect()
            const dir = {left:0, right:0, top: 0, bottom: 0, ...diff}
            const newPosition = {...rect, left: rect.left+dir.left, right: rect.right+dir.right, top: rect.top+dir.top, bottom: rect.bottom+dir.bottom}
            props.setBoundingClientRect(newPosition)
        }
    }

    move({right:100, left:100, top: 100, bottom: 100})();

    // props.setTitle(`File Explorer (${file.path})`)

    props.setWindowView(true)
    render(container, {...props, file})
    fullScreenCallbackRef.current = props.toggleFullScreen
    resizeCallbackRef.current = props.setBoundingClientRect

}, {icon: 'folder', title: 'File explorer', fullScreen: false})

const render = (container: HTMLElement, props: UICallbackProps & {file: FileType}) => {

    const root = createRoot(container)
    root.render(<App {...props} />)
}



const App = (props: UICallbackProps & {file: FileType}) => {
    const fs = platform.host.getFS()
    const dirRef = React.useRef(props.file.path || '/')
    const [dirList, setDirList] = React.useState<Array<string>>(fs.readdirSync(dirRef.current || '/'))

    const open = (file: string) => {
        const selectedFilePath = fs.realpathSync(dirRef.current.endsWith('/') ? `${dirRef.current}${file}` : `${dirRef.current}/${file}`);
        const stat = fs.statSync(selectedFilePath);

        if(stat.isDirectory()) {
            dirRef.current = selectedFilePath;
            console.log(selectedFilePath)
            setDirList(fs.readdirSync(dirRef.current))

            // props.setTitle(`File Explorer (${dirRef.current})`)
        }

        else {
            platform.host.exec(selectedFilePath)
        }
    }

    const makeDirClick = () => {
        const dirName = prompt('Dir name?')
        if(!dirName) return;
        const dirPath = dirRef.current.endsWith('/') ? `${dirRef.current}${dirName}` : `${dirRef.current}/${dirName}`
        fs.mkdirSync(dirPath)
        setDirList(fs.readdirSync(dirRef.current))
    }
    const makeFileClick = () => {
        const fileName = prompt('File name?')
        if(!fileName) return;
        const filePath = dirRef.current.endsWith('/') ? `${dirRef.current}${fileName}` : `${dirRef.current}/${fileName}`
        fs.writeFileSync(filePath, '')
        setDirList(fs.readdirSync(dirRef.current))
    }

    const openFile = (file: FileType) => {
        open(file.name)
    }
    const showFileActionsHandler = (file: FileType, event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        const openContextMenu = platform.host.getService('001-core.layout', 'show-context-menu') as Function;
        if(!openContextMenu)return;
        const rect = props.getBoundingClientRect()


        const actions = [];
        const stats = fs.statSync(file.path)
        if(stats.isFile()) {
            actions.push({id: 'edit_file', type:'action', title: 'Edit', cmd: `service('001-core.layout', 'open-window') (command('ui.notepad'), '${file.path}')`})
            actions.push({id: 'open_file', type:'action', title: 'Open', cmd: `service('001-core.layout', 'open-window') (command('ui.iframe'), '${file.path}')`})
            actions.push({id: 'delete_file', type:'action', title: 'Delete', cmd: `service('root', 'fs')('rm', '${file.path}')`})
        }

        else {
            actions.push({id: 'open_file', type:'action', title: 'Open in explorer', cmd: `service('001-core.layout', 'open-window') (command('ui.file-explorer'), '${file.path}')`})
        }

        openContextMenu(event.clientX+rect.x, event.clientY+rect.y, actions)
    }



    return (
        <div style={{display: 'flex', height: '100%', flexDirection: 'column'}} className="file-explorer">
            <header>
                <div style={{display: 'flex', alignItems: "center", gap: '.5rem'}}>
                    {dirRef.current != '/' ? <span className="material-symbols-outlined" style={{cursor: 'pointer'}} onClick={() => open('..')} aria-label="back" title="back">reply</span> : null}
                    <span>{dirRef.current}</span>
                </div>
                <div style={{display: 'flex', alignItems: "center"}} >
                    <span className="material-symbols-outlined" style={{cursor: 'pointer'}} onClick={makeDirClick} aria-label="create_new_folder" title="create folder">create_new_folder</span>
                    <span className="material-symbols-outlined" style={{cursor: 'pointer'}} onClick={makeFileClick} aria-label="create_file" title="create file">post_add</span>
                </div>
                {/* <div>
                    <span className="material-symbols-outlined" style={{cursor: 'pointer'}} onClick={props.close} aria-label="create_file" title="create file">close</span>
                </div> */}
                
                {/* <button onClick={makeDirClick}>New Diractory</button>
                <button onClick={makeFileClick}>New File</button> */}
            </header>
            <section className="dir-list">
                {/* {dirRef.current != '/' ? <div onClick={() => open('..')}>..</div> : null} */}
                {/* {
                    dirList.map(file => <div key={`${dirRef.current}/${file}`} onClick={() => open(file)}>{file}</div>)
                } */}

                <ListDirConponent dir={dirRef.current} openFile={openFile} showFileActions={showFileActionsHandler}/>
            </section>
        </div>
    )
}

