import { Platform, UICallbackProps, PlatformEvent } from "@shared/index";
import React from "react";
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

// ── What the Browser (ui.iframe) may show, and how (TODO 1B.4; audit WIN-4,
// NET-2, WIN-3; decisions.md D10/D13) ────────────────────────────────────────
//   first-party — an .html page under /opt/apps: same-origin through the service
//                 worker, with window.platform injected (terminal, settings, …)
//   external    — a cross-origin http(s) page: its own origin, restricted by
//                 `sandbox` (no popups, no top navigation) and no referrer
//   static      — any other same-origin URL (the deploy's own files): opaque sandbox
//   vfs         — any other vfs file: shown by the app the open policy picks for
//                 it (opaque ui.sandboxed-app for .html, the editor for scripts,
//                 the image viewer for .svg/.ico, …), never as a same-origin page
//   rejected    — javascript:, data:, blob: and every other scheme
type BrowserTarget =
    | { kind: 'first-party', src: string, path: string }
    | { kind: 'external', src: string, host: string }
    | { kind: 'static', src: string }
    | { kind: 'vfs', path: string }
    | { kind: 'blank' }
    | { kind: 'rejected', reason: string }
type FramedTarget = Extract<BrowserTarget, { src: string }>

const SW_PREFIX = '/(sw)';
const FIRST_PARTY_PAGES_DIR = '/opt/apps';
const EXTERNAL_SANDBOX = 'allow-scripts allow-same-origin allow-forms';
const STATIC_SANDBOX = 'allow-scripts allow-forms allow-modals';

const isFirstPartyPage = (path: string) =>
    /\.html$/i.test(path) && platform.host.pathPolicy.isInside(FIRST_PARTY_PAGES_DIR, path);

const resolveBrowserTarget = (url: unknown): BrowserTarget => {
    if (url === undefined || url === null || url === '') return { kind: 'blank' };
    if (typeof url !== 'string') return { kind: 'rejected', reason: 'not a URL' };
    const vfsTarget = (rawPath: string, src?: string): BrowserTarget => {
        let path: string;
        try { path = platform.host.pathPolicy.normalizePath(rawPath); }
        catch (_) { return { kind: 'rejected', reason: 'invalid path' }; }
        if (isFirstPartyPage(path)) return { kind: 'first-party', path, src: src ?? `${SW_PREFIX}${path}` };
        return { kind: 'vfs', path };
    };
    // A "/"-prefixed string is a vfs path (with or without the /(sw) prefix).
    if (url.startsWith('/') && !url.startsWith('//')) {
        return vfsTarget(url.startsWith(SW_PREFIX + '/') ? url.slice(SW_PREFIX.length) : url);
    }
    const here = platform.window.location;
    let parsed: URL;
    try { parsed = new URL(url, here.href); }
    catch (_) { return { kind: 'rejected', reason: 'invalid URL' }; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { kind: 'rejected', reason: `${parsed.protocol} URLs can't be opened` };
    }
    if (parsed.origin !== here.origin) return { kind: 'external', src: parsed.href, host: parsed.host };
    // Same origin: absolute /(sw)/ URLs (used to carry ?query params) are vfs paths too.
    if (parsed.pathname.startsWith(SW_PREFIX + '/')) {
        let path: string;
        try { path = decodeURIComponent(parsed.pathname.slice(SW_PREFIX.length)); }
        catch (_) { return { kind: 'rejected', reason: 'invalid URL' }; }
        return vfsTarget(path, parsed.href);
    }
    return { kind: 'static', src: parsed.href };
};

const IPC_SDK_PATH = '/usr/lib/ipc.js';

// Reads a VFS text file and returns it as a string, or '' on failure.
const readVfsText = (path: string): string => {
    try {
        return platform.host.getFS().readFileSync(path, 'utf-8') as string;
    } catch (_) { return ''; }
};

// Builds srcdoc HTML for a sandboxed iframe:
// inlines the IPC SDK then the app HTML, no same-origin so no direct storage access.
const buildSrcdoc = (appPath: string): string => {
    const ipcSdk = readVfsText(IPC_SDK_PATH);
    const appHtml = readVfsText(appPath);
    // Inject the SDK before </head> or at the start of the body.
    const safeIpcSdk = ipcSdk.replace(/<\/script>/gi, '<\\/script>');
    const sdkTag = `<script>\n${safeIpcSdk}\n</script>`;
    if (appHtml.includes('</head>')) {
        return appHtml.replace('</head>', `${sdkTag}\n</head>`);
    }
    return `${sdkTag}\n${appHtml}`;
};

// Read-only IPC a sandboxed app gets (decisions.md D4/D10, TODO 1B.8): fs reads
// of its own folder through the kernel's wos-ipc bus, nothing else.
// Read-only fs on the app's own folder, plus "open this (readable) file in the
// editor" — the kernel checks editor.open's path against the same read scope.
const SANDBOXED_APP_EVENTS = ['fs.read', 'fs.readText', 'fs.list', 'fs.exists', 'fs.stat', 'editor.open'];

// The folder a sandboxed app may read: the HTML file's own folder — unless that
// folder is the root, /tmp, /mnt or the user's home (or an ancestor of
// ~/.local/share, where other apps keep their data and secrets); then only the
// file itself.
const sandboxedAppReadScope = (appPath: string): string => {
    const { isInside } = platform.host.pathPolicy;
    const dir = appPath.slice(0, appPath.lastIndexOf('/')) || '/';
    const tooBroad = dir === '/' || dir === '/tmp' || dir === '/mnt' || isInside(dir, '/home/user1/.local/share');
    return tooBroad ? appPath : dir;
};

// ui.sandboxed-app — loads a VFS HTML file in a fully isolated sandbox:
//   • No allow-same-origin → opaque origin, no direct IndexedDB / localStorage access.
//   • IPC SDK injected inline so apps can use window.ipc.fs.* for file access.
//   • Apps must NOT rely on window.platform — use window.ipc instead.
//   • The frame is registered with the kernel IPC bus for read-only fs access to
//     its own folder, and unregistered when the window closes or the frame
//     navigates away from the srcdoc built here (D4: re-navigation is a restart).
platform.host.registerCommand('ui.sandboxed-app', (body: HTMLBodyElement, props: UICallbackProps, vfsPath: string) => {
    if (!body) {
        console.error('ui.sandboxed-app: first argument must be a DOM element');
        return;
    }
    let appPath: string;
    try { appPath = platform.host.pathPolicy.normalizePath(vfsPath); }
    catch (_) { appPath = ''; }
    if (!vfsPath || !appPath || appPath === '/') {
        console.error('ui.sandboxed-app: a vfs path to an HTML file is required');
        return;
    }

    const container = platform.window.document.createElement('div');
    container.style.cssText = 'display:flex;height:100%;width:100%;';
    body.appendChild(container);

    const iframe = platform.window.document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.style.cssText = 'border:0;width:100%;height:100%;flex:1;';

    iframe.srcdoc = buildSrcdoc(appPath);

    container.appendChild(iframe);

    // contentWindow exists from insertion on; the srcdoc document that loads
    // next lives in the same window, so it inherits this registration.
    const unregister = platform.host.registerIpcFrame(iframe.contentWindow, {
        id: `sandboxed-app:${appPath}`,
        events: SANDBOXED_APP_EVENTS,
        fs: { read: [sandboxedAppReadScope(appPath)] },
    });
    let loads = 0;
    iframe.addEventListener('load', () => {
        loads += 1;
        if (loads > 1) {
            console.warn(`[ui.sandboxed-app] ${appPath} navigated away from its page; its IPC access is revoked`);
            unregister();
            return;
        }
        let title = '';
        try { title = (iframe as any).contentDocument?.title || ''; } catch (_) { /* opaque origin */ }
        if (title) props.setTitle(title);
    });
    props.onDestroy(() => unregister());

    props.setWindowView(true);
}, { icon: 'security', title: 'Sandboxed App' })

let subscriptions: Array<{ unsubscribe: () => void }> = []

platform.host.registerCommand('ui.iframe', (body: HTMLBodyElement, props: UICallbackProps, url: string, ...args: any) => {

    if (!body) {
        console.error(`Invalid command call. first item must be a dom element`)
        return
    }

    const target = resolveBrowserTarget(url)

    // Other vfs content goes through the open policy: the app that views that
    // file renders into this window instead of a same-origin page (D10).
    if (target.kind === 'vfs') {
        let viewer = platform.host.getViewerCommand(target.path)
        if (viewer === 'ui.iframe') viewer = 'ui.notepad' // only first-party pages are framed here
        const viewerCommand = platform.host.getCommand(viewer)
        if (viewerCommand) return viewerCommand.exec(body, props, target.path, ...args)
        console.error(`ui.iframe: no app to show ${target.path} (${viewer})`)
        return
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

    if (target.kind === 'blank' || target.kind === 'rejected') {
        if (target.kind === 'rejected') console.warn(`ui.iframe: refused ${JSON.stringify(String(url)).slice(0, 120)}: ${target.reason}`)
        container.style.cssText = 'padding:1rem;font-family:sans-serif;color:#555'
        container.textContent = target.kind === 'blank' ? 'Nothing to show.' : `This address can't be opened here (${target.reason}).`
        return
    }

    render(container, props, target, ...args)
    fullScreenCallbackRef.current = (...args: any[]) => {
        setTimeout(() => props.toggleFullScreen(), 0);
    }


    subscriptions.push({
        unsubscribe: () => {
            // props.close()
        }
    })
}, { icon: 'box', title: 'Browser', fullScreen: false, fileExtensions: ['.html'] })

const render = (container: HTMLElement, props: UICallbackProps, target: FramedTarget, ...args: any) => {
    const root = createRoot(container)
    root.render(<App {...props} $args={args} target={target} />)
    subscriptions.push({
        unsubscribe: () => {
            root.unmount()
            container.remove()
        }
    })
}




const App = (props: UICallbackProps & { target: FramedTarget }) => {
    // const popup = window.open(props.url, '_blank','height=300,width=600,location=no,toolbar=no');
    const { target } = props

    const iframeRef = React.useRef<HTMLIFrameElement>(null)
    const [key, setKey] = React.useState(1)

    React.useEffect(() => {
        if (!iframeRef.current) return;

        // Only first-party pages (/opt/apps) get the platform, the parent's
        // fetch and the kernel's window.open hardening; external and static
        // pages are sandboxed and get nothing from us (audit WIN-3/WIN-4).
        if (target.kind === 'first-party' && iframeRef.current.contentWindow) {
            // Add Platform
            const platformEventEmitter = new Subject<PlatformEvent>();
            // const newPlatform = new Platform(platformEventEmitter, props.url, props.url);
            // Named by its vfs path (stable, without origin or ?query), so the
            // commands the page registers are owned by that page (KRN-10).
            //@ts-ignore
            const newPlatform = new platform.constructor(platformEventEmitter, `${SW_PREFIX}${target.path}`, target.src);
            newPlatform.setHost(platform.host.forPlatform(newPlatform));
            newPlatform.register('props', props);
            newPlatform.register('$args', props.$args);
            newPlatform.register('React', React)
            newPlatform.register('ReactDOM', { createRoot })

            iframeRef.current!.contentWindow!.platform = newPlatform

            // Patch fetch and import
            // @ts-ignore
            // iframeRef.current.contentWindow.import = (module_path: string) => {
            //     return import(module_path)
            // }
            iframeRef.current.contentWindow.fetch = (...args: any[]) => {
                // console.log(args)
                // @ts-ignore
                return fetch(...args)
            }
            // The initial about:blank window is reused by the same-origin page
            // that loads next, so this carries over to it.
            platform.host.hardenWindow(iframeRef.current.contentWindow)
        }

        if (target.kind === 'external') props.setTitle(target.host)
        if (target.kind === 'static') props.setTitle(new URL(target.src).pathname)

        const onLoad = () => {
            if (target.kind !== 'first-party') return
            let title = ''
            try { title = iframeRef.current?.contentWindow?.document?.title || '' } catch (_) { /* navigated cross-origin */ }
            props.setTitle(title);
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

    // External pages keep their own origin (so allow-same-origin is safe) but
    // can't open popups or navigate the OS; static same-origin files are opaque.
    const sandbox = target.kind === 'external' ? EXTERNAL_SANDBOX : target.kind === 'static' ? STATIC_SANDBOX : undefined
    return (
        <div style={{ display: 'flex', height: '100%' }}>
            <iframe key={key} src={target.src} ref={iframeRef} sandbox={sandbox} referrerPolicy={sandbox ? 'no-referrer' : undefined} style={{ border: 0, width: '100%', height: '-webkit-fill-available' }} />
        </div>
    )
}

