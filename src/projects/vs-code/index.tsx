import { Platform, UICallbackProps } from "@shared/index";
import React from "react";
import mime from 'mime'
import { createRoot } from "react-dom/client";

const platform = Platform.getInstance()


const fullScreenCallbackRef = {
    current: (...args: any[]) => {}
}
platform.register('fullscreen', (...args: any[]) => fullScreenCallbackRef.current(...args))


const getLocalFilePath = (path: string): string => {
    // return '/cache' + path
    const fs = platform.host.getFS();
    const stringContent = fs.readFileSync(path)

    // Step 2: Create a Blob from the string content
    const blob = new Blob([stringContent], { type: mime.getType(path)||undefined });

    // Step 3: Generate a Blob URL
    const blobURL = URL.createObjectURL(blob);

    return blobURL
}

let subscriptions: Array<{unsubscribe: () => void}> = []

platform.host.registerCommand('ui.vs-code', (body: HTMLBodyElement, props: UICallbackProps) => {
    
    if(!body) {
        console.error(`Invalid command call. first item must be a dom element`)
        return
    }

    const url = 'https://code-public.pankajdevesh.com/?folder=/config/workspace/react-app';
    

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
}, {icon: 'data_object', title: 'VS Code', fullScreen: false})

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




const App = (props: UICallbackProps & {url: string}) => {
    // const popup = window.open(props.url, '_blank','height=300,width=600,location=no,toolbar=no');

    const iframeRef = React.useRef<HTMLIFrameElement>(null)

    React.useEffect(() => {
        if(!iframeRef.current) return;
        iframeRef.current.contentWindow?.addEventListener('load', () => {
            props.setTitle(iframeRef.current?.contentWindow?.document?.title || '');
        })

    }, [iframeRef.current])

    React.useEffect(() => {
        const {remove} = props.appendActionButton({
            icon: 'refresh',
            title: 'refresh',
            onClick: () => {
                if(!iframeRef.current)return;
                iframeRef.current?.contentWindow?.location.reload();
            }
        })

        return () => remove()
    }, [])

    return (
        <div style={{display: 'flex', height: '100%'}}>
            <iframe src={props.url} ref={iframeRef} style={{border: 0,width: '-webkit-fill-available', height: '-webkit-fill-available'}} />
        </div>
    )
}

