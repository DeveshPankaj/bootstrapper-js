import { Platform, UICallbackProps } from "@shared/index";
import React, { useRef } from "react";
import { createRoot } from "react-dom/client";


import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { javascript, typescriptLanguage } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";

import { placeholder } from "@codemirror/view";
import { FileType } from '@shared/types';
import { getFileExtension } from "@shared/utils";

// const Babel = require('./babel.js');

const platform = Platform.getInstance()

const cacheName = 'MyFancyCacheName_v1';
const cacheRef = { current: null as Cache | null }

// caches.open(cacheName).then((cache) => {cacheRef.current = cache})
const putCache = (key: string, value: string) => {
    const extContentTypeMap = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.png': 'image/png'
    } as const
    const ext = getFileExtension(key)
    cacheRef.current?.put(key,
        new Response(value, { headers: { 'Content-Type': (extContentTypeMap[ext as keyof typeof extContentTypeMap] || 'text/html') } })
    )
}


const fullScreenCallbackRef = {
    current: (...args: any[]) => { }
}
const resizeCallbackRef = {
    current: (...args: any[]) => { }
}
platform.register('fullscreen', (...args: any[]) => fullScreenCallbackRef.current(...args))
platform.register('resize', (...args: any[]) => resizeCallbackRef.current(...args))

platform.host.registerCommand('ui.notepad', (body: HTMLBodyElement, props: UICallbackProps, file?: FileType) => {


    if (typeof file === 'string') {
        const fs = platform.host.getFS()
        file = {
            name: (file as string).split('/').at(-1)!,
            path: file,
            meta: { ext: getFileExtension(file) },
            type: fs.statSync(file).isDirectory() ? 'dir' : 'file'
        }
    }

    if (!file) {
        file = {
            name: '123.js',
            path: '/123.js',
            meta: { ext: '.html' },
            type: 'file'
        }
    }

    const container = platform.window.document.createElement('div')
    body.appendChild(container)
    const win = body.ownerDocument.defaultView!;

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

        textarea {
            width: 100%;
            padding: 0;
            margin: 0;
            border: none;
        }

        .cm-editor { height: 100% }
        .cm-scroller { overflow: auto }

    `)

    body.ownerDocument.adoptedStyleSheets.push(styles)

    const move = (diff: { [key in 'left' | 'right' | 'top' | 'bottom']?: number }) => {
        return () => {
            const rect = props.getBoundingClientRect()
            const dir = { left: 0, right: 0, top: 0, bottom: 0, ...diff }
            const newPosition = { ...rect, left: rect.left + dir.left, right: rect.right + dir.right, top: rect.top + dir.top, bottom: rect.bottom + dir.bottom }
            props.setBoundingClientRect(newPosition)
        }
    }

    move({ right: 100, left: 100, top: 100, bottom: 100 })();

    props.setTitle(file.path)
    props.setWindowView(true)
    render(container, { ...props, file })
    fullScreenCallbackRef.current = props.toggleFullScreen
    resizeCallbackRef.current = props.setBoundingClientRect

}, { icon: 'edit_note', title: 'Edit (about.html)', fullScreen: false })

const render = (container: HTMLElement, props: UICallbackProps & { file: FileType }) => {

    const root = createRoot(container)

    root.render(<App {...props} />)
}


const App = (props: UICallbackProps & { file: FileType }) => {
    const fs = platform.host.getFS();
    const scriptRef = useRef<string>(fs.readFileSync(props.file.path).toString() || '')
    const editorRef = useRef<EditorView | null>(null);
    const save = () => {
        if (editorRef.current) {
            scriptRef.current = editorRef.current.state.doc.toString()
        }

        fs.writeFileSync(props.file.path, scriptRef.current);

        // localStorage.setItem(props.file.path, scriptRef.current)
        // putCache(`/cache${props.file.path}`, scriptRef.current)

        // platform.host.getServiceWorker()?.postMessage({type: "OPEN_SOCKET", payload: {id: 1}});
    }


    const move = (diff: { [key in 'left' | 'right' | 'top' | 'bottom']?: number }) => {
        return () => {
            const rect = props.getBoundingClientRect()
            const dir = { left: 0, right: 0, top: 0, bottom: 0, ...diff }
            const newPosition = { ...rect, left: rect.left + dir.left, right: rect.right + dir.right, top: rect.top + dir.top, bottom: rect.bottom + dir.bottom }
            props.setBoundingClientRect(newPosition)
        }
    }

    const openIframe = () => {
        platform.host.execCommand(`service('001-core.layout', 'open-window') (command('ui.iframe'), '${props.file.path}')`)
    }

    const runSource = () => {
        const code = editorRef.current?.state.doc.toString() || '';
        platform.host.execCommand(code)
    }


    const runningInstencesRef = React.useRef<Array<() => void>>([])
    const runJS = () => {
        runningInstencesRef.current.forEach(ref => ref())

        const code = editorRef.current?.state.doc.toString() || '';

        // const ctx = { platform, React, ReactDOM: { createRoot } }
        // const program = Babel.transform(code, { presets: ['env', "react"] });
        // console.log(program);
        // const factory = new Function(...Object.keys(ctx), program.code);
        // factory.call(ctx, ...Object.values(ctx));

        const destroy = platform.host.execString(code)
        runningInstencesRef.current.push(destroy)
    }

    const ref = React.useRef<HTMLDivElement>(null)
    React.useEffect(() => {
        if (!ref.current) return;

        editorRef.current = new EditorView({
            parent: ref.current,
            state: EditorState.create({
                doc: scriptRef.current,
                extensions: [
                    basicSetup,
                    props.file.name.endsWith('.html') ? html() : javascript({ typescript: props.file.name.endsWith('.ts') || props.file.name.endsWith('.tsx') }),
                    placeholder("Type something here...")
                ]
            })
        });

    }, [ref.current])

    // const compileTs = () => {
    //     const modules = {
    //         react: React,
    //         platform: platform
    //     }
    //     const ctx = {
    //         require: (moduleName: string) => {
    //             return modules[moduleName as keyof typeof modules] || {};
    //         }
    //     };
    //     const code = scriptRef.current = editorRef.current!.state.doc.toString() || '';
    //     // const program = Babel.transform(code, {presets: ['env']});
    //     // console.log(program);

    //     // const factory = new Function(...Object.keys(ctx), program.code);
    //     // factory(...Object.values(ctx));

    //     // const jsBlob = new Blob([program.code], {type: 'application/javascript'});
    //     const jsBlob = new Blob([code], {type: 'application/javascript'});
    //     const url = URL.createObjectURL(jsBlob)



    //     const loadModule = () => {
    //         const configPlacegholder = `{
    //             "url": "${url}",
    //             "metedata": {
    //                 "version": "0.0.1"
    //             },
    //             "params": []
    //         }`
    //         const form = {
    //             namespace: 'new-app',
    //             config: configPlacegholder
    //         }
    //         const config = JSON.parse(form.config)
    //         console.log({...form, config})
    //         platform.host.callCommand('core.add-module', form.namespace, config)
    //     }

    //     loadModule();
    // }

    return (
        <div style={{ display: 'flex', height: '100%' }}>
            <div style={{ width: '3rem', height: '100%', background: 'black', color: 'white', flexShrink: '0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.5rem' }}>
                <span className="material-symbols-outlined" style={{ cursor: 'pointer' }} onClick={save} aria-label="save" title="save">save</span>

                {props.file.name.endsWith('.html') ? <span className="material-symbols-outlined" style={{ cursor: 'pointer' }} onClick={openIframe} aria-label="open_in_browser" title="open in iframe">open_in_browser</span> : null}
                {props.file.name.endsWith('.png') ? <span className="material-symbols-outlined" style={{ cursor: 'pointer' }} onClick={openIframe} aria-label="open_in_browser" title="open in iframe">open_in_browser</span> : null}
                {props.file.name.endsWith('.run') ? <span className="material-symbols-outlined" style={{ cursor: 'pointer' }} onClick={runSource} aria-label="terminal" title="open in terminal">terminal</span> : null}
                {props.file.name.endsWith('.js') ? <span className="material-symbols-outlined" style={{ cursor: 'pointer' }} onClick={runJS} aria-label="run" title="Run">terminal</span> : null}
                {/* {props.file.name.endsWith('.ts') ? <span className="material-symbols-outlined" style={{cursor: 'pointer'}} onClick={compileTs} aria-label="compile" title="compile">token</span> : null} */}


                {/* <button onClick={save} >save</button> */}
                {/* <button onClick={props.close} >close</button> */}
                {/* <button onClick={props.toggleFullScreen} >toggleFullScreen</button> */}
                {/* <button onClick={move({right:10, left:10})} >moveRight</button> */}
                {/* <button onClick={move({right:-10, left: -10})} >moveLeft</button> */}
                {/* <button onClick={move({top:-10, bottom: -10})} >moveTop</button> */}
                {/* <button onClick={move({top:10, bottom: 10})} >moveDown</button> */}

            </div>
            <div ref={ref} style={{ width: 'calc(100% - 3rem)', height: '100%' }}></div>
            {/* <textarea defaultValue={scriptRef.current} onChange={ev => scriptRef.current=ev.target.value}></textarea> */}
        </div>
    )
}

