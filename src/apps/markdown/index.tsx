import { Platform, UICallbackProps } from "@shared/index";
import React from "react";
import { createRoot } from "react-dom/client";
import { parseMarkdown } from "./markdown";

const platform: Platform = window.platform;

const fullScreenCallbackRef = {
    current: (...args: any[]) => {}
}
platform.register('fullscreen', (...args: any[]) => fullScreenCallbackRef.current(...args))

let subscriptions: Array<{ unsubscribe: () => void }> = []

platform.host.registerCommand('ui.markdown', (body: HTMLBodyElement, props: UICallbackProps, filePath?: string) => {
    if (!body) {
        console.error('Invalid command call. first item must be a dom element')
        return
    }

    subscriptions = []

    const container = platform.window.document.createElement('div')
    body.appendChild(container)
    const win = body.ownerDocument.defaultView!

    const styles = new win.CSSStyleSheet()
    styles.replace(`
        html, body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            height: 100%;
            background: #fff;
            color: #24292f;
        }
        * { box-sizing: border-box; }
    `)
    body.ownerDocument.adoptedStyleSheets.push(styles)

    props.setWindowView(true)
    props.setTitle(filePath ? filePath.split('/').pop()! : 'Markdown')

    const root = createRoot(container)
    root.render(<MarkdownViewer filePath={filePath} props={props} />)

    fullScreenCallbackRef.current = () => {
        setTimeout(() => props.toggleFullScreen(), 0)
    }

    subscriptions.push({ unsubscribe: () => { root.unmount(); container.remove() } })
}, {
    icon: 'description', title: 'Markdown', fullScreen: false, fileExtensions: ['.md'],
    // The built-in viewer: the Markdown app from the registry (markdown-reader,
    // commandName ui.markdown) may replace it when the user installs it (KRN-10).
    fallback: true,
})


const MarkdownViewer = ({ filePath, props }: { filePath?: string, props: UICallbackProps }) => {
    const [html, setHtml] = React.useState('')
    const [error, setError] = React.useState('')

    React.useEffect(() => {
        if (!filePath) { setError('No file specified'); return }
        try {
            const fs = platform.host.getFS()
            const content = fs.readFileSync(filePath).toString()
            setHtml(parseMarkdown(content))
        } catch (e: any) {
            setError(e.message || 'Failed to read file')
        }
    }, [filePath])

    React.useEffect(() => {
        const { remove } = props.appendActionButton({
            icon: 'edit_note',
            title: 'Edit in Notepad',
            onClick: () => {
                if (filePath) platform.host.openWindow('ui.notepad', filePath)
            }
        })
        return () => remove()
    }, [])

    if (error) return <div style={{ padding: '2rem', color: '#d1242f' }}>{error}</div>

    return (
        <div style={{
            height: '100%',
            overflow: 'auto',
            padding: '2rem 3rem',
            lineHeight: 1.6,
            fontSize: '14px',
        }}>
            <style dangerouslySetInnerHTML={{ __html: `
                .md-body h1 { font-size: 2em; border-bottom: 1px solid #d0d7de; padding-bottom: .3em; margin: 1em 0 .5em; }
                .md-body h2 { font-size: 1.5em; border-bottom: 1px solid #d0d7de; padding-bottom: .3em; margin: 1em 0 .5em; }
                .md-body h3 { font-size: 1.25em; margin: 1em 0 .5em; }
                .md-body h4, .md-body h5, .md-body h6 { margin: 1em 0 .5em; }
                .md-body code { background: #f6f8fa; padding: .2em .4em; border-radius: 4px; font-size: 85%; font-family: monospace; }
                .md-body pre { background: #f6f8fa; padding: 1em; border-radius: 8px; overflow-x: auto; }
                .md-body pre code { background: none; padding: 0; font-size: 90%; }
                .md-body blockquote { border-left: 3px solid #d0d7de; margin: 1em 0; padding: .5em 1em; color: #57606a; }
                .md-body ul { padding-left: 2em; }
                .md-body a { color: #0969da; text-decoration: none; }
                .md-body a:hover { text-decoration: underline; }
                .md-body hr { border: none; border-top: 1px solid #d0d7de; margin: 1.5em 0; }
                .md-body img { border-radius: 4px; }
                .md-body p { margin: 0 0 1em; }
                .md-body del { color: #57606a; }
            `}} />
            <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
    )
}
