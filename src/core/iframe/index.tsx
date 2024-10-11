import { Platform, UICallbackProps, PlatformEvent } from "@shared/index";
import React from "react";
import mime from 'mime'
import { createRoot } from "react-dom/client";
// import * as utils from '@shared/utils'
// import { DESKTOP_CONTAINER_CLASS, WINDOWS_CONTAINER_CLASS } from '../window-manager'
import { Subject } from "rxjs";


// const platform = Platform.getInstance()
const platform: Platform = window.platform


const fullScreenCallbackRef = {
    current: (...args: any[]) => { }
}
platform.register('fullscreen', (...args: any[]) => fullScreenCallbackRef.current(...args))

// platform.register('utils', utils)
// platform.register('window-manager', { DESKTOP_CONTAINER_CLASS, WINDOWS_CONTAINER_CLASS })
platform.register('React', React)
platform.register('ReactDOM', { createRoot })

const getLocalFilePath = (path: string): string => {
    // return '/cache' + path
    const fs = platform.host.getFS();
    const stringContent = fs.readFileSync(path)

    // Step 2: Create a Blob from the string content
    const blob = new Blob([stringContent], { type: mime.getType(path) || undefined });

    // Step 3: Generate a Blob URL
    const blobURL = URL.createObjectURL(blob);

    return blobURL
}

let subscriptions: Array<{ unsubscribe: () => void }> = []

platform.host.registerCommand('ui.iframe', (body: HTMLBodyElement, props: UICallbackProps, url: string) => {

    if (!body) {
        console.error(`Invalid command call. first item must be a dom element`)
        return
    }

    if (!url) url = '/cache/404';
    if (url.startsWith('/')) {
        url = getLocalFilePath(url)
    }

    // subscriptions.forEach(subs => subs.unsubscribe())
    subscriptions = []

    const container = platform.window.document.createElement('div')
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
    
        * {
            box-sizing: border-box;
        }

        .token-name:hover, .token-attr:hover {
            background: green;
        }

    `)

    body.ownerDocument.adoptedStyleSheets.push(styles)
    props.setWindowView(true)
    
    render(container, props, url)
    fullScreenCallbackRef.current = (...args: any[]) => {
        setTimeout(() => props.toggleFullScreen(), 0);
    }


    subscriptions.push({
        unsubscribe: () => {
            // props.close()
        }
    })
}, { icon: 'box', title: 'About', fullScreen: false })

const render = (container: HTMLElement, props: UICallbackProps, url: string) => {
    const root = createRoot(container)
    root.render(<App {...props} url={url} />)
    subscriptions.push({
        unsubscribe: () => {
            root.unmount()
            container.remove()
        }
    })
}




const App = (props: UICallbackProps & { url: string }) => {
    // const popup = window.open(props.url, '_blank','height=300,width=600,location=no,toolbar=no');

    const iframeRef = React.useRef<HTMLIFrameElement>(null)
    const [key, setKey] = React.useState(1)

    React.useEffect(() => {
        if (!iframeRef.current) return;

        if (iframeRef.current.contentWindow) {
            // Add Platform
            const platformEventEmitter = new Subject<PlatformEvent>();
            // const newPlatform = new Platform(platformEventEmitter, props.url, props.url);
            //@ts-ignore
            const newPlatform = new platform.constructor(platformEventEmitter, props.url, props.url);
            newPlatform.setHost(platform.host);
            newPlatform.register('props', props);
            newPlatform.register('React', React)
            newPlatform.register('ReactDOM', { createRoot })

            iframeRef.current!.contentWindow!.platform = newPlatform

            // Patch fetch and import
            // @ts-ignore
            // iframeRef.current.contentWindow.import = (module_path: string) => {
            //     return import(module_path)
            // }
            iframeRef.current.contentWindow.fetch = (...args: any[]) => {
                console.log(args)
                // @ts-ignore
                return fetch(...args)
            }
        }

        const onLoad = () => {
            props.setTitle(iframeRef.current?.contentWindow?.document?.title || '');
        }

        iframeRef.current.addEventListener('load', onLoad)

        return () => {
            iframeRef.current?.removeEventListener('load', onLoad)
        }

    }, [iframeRef.current])
    
    React.useEffect(() => {
        const { remove } = props.appendActionButton({
            icon: 'refresh',
            title: 'refresh',
            onClick: () => {
                setKey(x => x+1)
            }
        })

        return () => remove()
    }, [])

    return (
        <div style={{ display: 'flex', height: '100%' }}>
            <iframe key={key} src={props.url} ref={iframeRef} style={{ border: 0, width: '100%', height: '-webkit-fill-available' }} />
        </div>
    )
}

