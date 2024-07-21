import {filter} from 'rxjs'
import { Command, Platform } from '@shared/index'
import {createRoot} from 'react-dom/client'
import React from 'react'
import { Commands } from './commands'
import { ContextMenu, ContextMenuItem } from './contextmenu'
import { DESKTOP_CONTAINER_CLASS, WINDOWS_CONTAINER_CLASS, WindowManager } from '../services/window-manager'
import { FileType } from '../shared/types'
import { ListDirConponent } from '../projects/file-explorer/desktop'
import { Header } from './header'

const platform = Platform.getInstance()

const styles = platform.host.createCSSStyleSheet()
styles.replace(`
    html, body {
        margin: 0;
        padding:0;
        font-family: monospace;
        height: 100svh;
        overflow: hidden;
    }

    * {
        box-sizing: border-box;
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

    .layout-default {
        // background: #292a2d;
        // color: #919191;
        height: -webkit-fill-available;

        display: grid;
        grid-template-columns: auto 1fr auto;
        grid-template-rows: auto 1fr auto;
        // gap: 5px;
        grid-auto-flow: row;
        grid-template-areas:
            "header header header"
            "left-nav content-area right-nav"
            "footer footer footer";

        background-image: url(/wp-8.jpeg);
        background-repeat: no-repeat;
        background-size: cover;

    }
    .header {
        grid-area: header;
    }
    .left-nav {
        grid-area: left-nav;
    }
    .content-area {
        grid-area: content-area;
    }

    .window > iframe {
        border: 0;
        width: -webkit-fill-available;
        height: -webkit-fill-available;
    }

    .right-nav {
        grid-area: right-nav;
    }
    .footer {
        grid-area: footer;
    }



    .window {
        position: absolute;
        z-index: 9;
        background-color: #f1f1f1;
        text-align: center;
        display: flex;
        flex-direction: column;
        // border: 1px solid #d3d3d3;

        width: 50rem;
        height: 30rem;
        top: 0;

        resize: both;
        overflow: hidden;
        border-radius: 6px;
    }
    .window.hidden {
        display: none;
    }

    .window.top {
        z-index: 10;
    }

    .window::-webkit-resizer {
        background-color: transparent;
    }

    .window.dragging {
        outline: 1px solid #d3d3d3;
        z-index: 200;
        box-shadow: rgb(255 255 255) 0px 0px 4px;
    }

    .window.on-top {
        z-index: 100;
    }

    .window-header {
        padding: 7px;
        cursor: move;
        z-index: 9;
        background-color: rgb(0 0 0);
        color: #fff;
        
        // position: absolute;
        // bottom: 100%;
        // width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .window-header > .title {
        display: inline-flex;
        align-items: center;
        gap: .5rem;
    }

    iframe.dragging {
        pointer-events: none;
    }

    .contextmenu {
        position: absolute;
        // background: white;
        display: none;
        z-index: 300;
    }



    .toolbar {
        background: aliceblue;
        position: absolute;
        bottom: 1rem;
        left: 50%;
        transform: translateX(-50%);

        padding: 0 2rem;
        border-radius: 2rem;
    }

    .overlay {
        // display: none;
        background: rgba(255, 255, 255, 0.30);
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 100;
        pointer-events: none;
    }

    .overlay>div {
        width: 10rem;
        height: 10rem;
        outline: 1px solid #00BCD4;
    }

    // .overlay {
    //     position:absolute;
    //     top:0;
    //     height: 100vh;
    //     -webkit-mask: radial-gradient(50px, #0000 100%, #000);
    //             mask: radial-gradient(50px, #0000 100%, #000);
    //     width: 100%;
    //     backdrop-filter: blur(10px);
    //     background:rgba(255, 0, 0, 0.1);
    //   }

`)

export const render = (container: HTMLElement) => {
    platform.host.addCSSStyleSheet(styles)

    const contentRef = React.createRef<HTMLDivElement>();

    const windowManager = new WindowManager(contentRef)

    const onCommandClick = (command: Command, ...args: unknown[]) => {
        windowManager.createWindow(command.name, ...args)
    }




    platform.register('open-window', onCommandClick)

    const root = createRoot(container)
    const contextMenuRef = React.createRef<HTMLDivElement>()
    // registerContextMenu(container, contextMenuRef)
    container.addEventListener('click', ev => {
        const clickTarget = ev.target as HTMLDivElement;
        const contextTarget = contextMenuRef.current as HTMLDivElement;
        if(!contextTarget) return;


        if(!contextTarget.contains(clickTarget)) {
            contextTarget.style.display = 'none';
        }
    })

    const openFile = (file: FileType) => {
        platform.host.exec(file.path)
    }

    const contextMenuItems: Array<ContextMenuItem> = [
        // {id: 'edit_file', type:'action', title: 'Edit'},
        // {id: 'open_file', type:'action', title: 'Open'},
        // {id: 'delete_file', type:'action', title: 'Delete'},
    ]

    const contextMenuComponentRef = ({
        current: {
            setItems: (items: Array<ContextMenuItem>) => {},
            setOnClick: (callback: (item: ContextMenuItem) => void) => {}
        }
    })

    const showFileActionsHandler = (file: FileType, event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        showContextMenuHandler(event.clientX, event.clientY, [
            {id: 'edit_file', type:'action', title: 'Edit', cmd: `service('001-core.layout', 'open-window') (command('ui.notepad'), '${file.path}')`},
            {id: 'open_file', type:'action', title: 'Open', cmd: `service('001-core.layout', 'open-window') (command('ui.iframe'), '${file.path}')`},
            {id: 'delete_file', type:'action', title: 'Delete', cmd: `service('root', 'fs')('rm', '${file.path}')`},
        ]);
    }


    const showContextMenuHandler = (x: number, y: number, items: Array<ContextMenuItem>) => {
        if(!contextMenuRef.current)return;

        contextMenuComponentRef.current.setItems(items);
        contextMenuComponentRef.current.setOnClick(item => {
            contextMenuRef.current!.style.display = 'none';
            if(item.cmd) {
                platform.host.execCommand(item.cmd)
            }
        });

        contextMenuRef.current.style.display = 'block';
        contextMenuRef.current.style.top = `${y}px`
        contextMenuRef.current.style.left = `${x}px`

    }

    platform.register('show-context-menu', showContextMenuHandler)


    const onCommandClickHandler = (command: Command, ...args: string[]) => {
        platform.host.execCommand(`service('001-core.layout', 'open-window') (command('${command.name}')${args.length?',':''} ${args.map(x => "'"+x+"'").join(', ')})`)

    }
    root.render(
        <>
            <div className="header">
                {/* <Header /> */}
                {/* <Commands onCommandClick={onCommandClick} align='end'/> */}
            </div>
            <div className="left-nav">
                {/* <Commands onCommandClick={onCommandClick} vertical/> */}
            </div>
            <div className="content-area" ref={contentRef}>
                <div className={DESKTOP_CONTAINER_CLASS}>
                    <ListDirConponent openFile={openFile} showFileActions={showFileActionsHandler} />
                </div>
                <div className={WINDOWS_CONTAINER_CLASS}></div>
            </div>
            <div className="right-nav">
                {/* <Commands onCommandClick={onCommandClick} vertical align='start'/> */}
            </div>
            <div className="footer">
                <Commands onCommandClick={onCommandClickHandler} align='center'/>
            </div>
            {/* <div className='toolbar'>
                <Commands onCommandClick={onCommandClick}/>
            </div> */}
            <div className='contextmenu' ref={contextMenuRef}>
                <ContextMenu componentRef={obj => contextMenuComponentRef.current = obj}/>
            </div>
            {/* <div className='overlay'>
                <div style={{position: 'absolute', top: '10rem', left: '9rem'}}></div>
            </div> */}
        </>
    )
    
}


// TODO: convert registerContextMenu to ReactHook, to prevent multiple addEventListener
const registerContextMenu = (container: HTMLElement, ref: React.RefObject<HTMLDivElement>) =>{
    container.addEventListener('contextmenu', event => {
        event.preventDefault();
        // console.log(event)
        if(ref.current) {
            ref.current.style.display = 'block'
            ref.current.style.top = `${event.clientY}px`
            ref.current.style.left = `${event.clientX}px`
        }
    })
}


platform.events$.pipe(filter(x => x.type === 'loaded')).subscribe(
    event => {
        const container = platform.window.document.createElement('div')
        container.classList.add('layout-default')
        platform.host.appendDomElement(container)
        render(container)
    }
)

platform.events$.pipe(filter(x => x.type === 'exit')).subscribe(
    event => {
        console.log(event)
    }
)
