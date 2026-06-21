import { Platform, UICallbackProps } from "@shared/index";
import React from "react";
import { createRoot } from "react-dom/client";

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
}, { icon: 'description', title: 'Markdown', fullScreen: false, fileExtensions: ['.md'] })


function parseMarkdown(src: string): string {
    let html = src
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

    html = html.replace(/^```(\w*)\n([\s\S]*?)^```/gm, (_m, lang, code) =>
        `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`)

    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>')

    html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
    html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')

    html = html.replace(/^---$/gm, '<hr>')

    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>')
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
    html = html.replace(/_(.+?)_/g, '<em>$1</em>')
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>')

    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%">')
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')

    html = html.replace(/^(\s*)[-*]\s+(.+)$/gm, '$1<li>$2</li>')
    html = html.replace(/^(\s*)\d+\.\s+(.+)$/gm, '$1<li>$2</li>')
    html = html.replace(/((?:^<li>.*<\/li>\n?)+)/gm, '<ul>$1</ul>')

    html = html.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>')
    html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n')

    const lines = html.split('\n')
    const result: string[] = []
    let inParagraph = false
    for (const line of lines) {
        const trimmed = line.trim()
        const isBlock = /^<(h[1-6]|pre|ul|ol|li|hr|blockquote|div|table)/.test(trimmed)
        const isClosingBlock = /^<\/(ul|ol|pre|blockquote|div|table)/.test(trimmed)
        if (!trimmed) {
            if (inParagraph) { result.push('</p>'); inParagraph = false }
            result.push('')
        } else if (isBlock || isClosingBlock) {
            if (inParagraph) { result.push('</p>'); inParagraph = false }
            result.push(line)
        } else {
            if (!inParagraph) { result.push('<p>'); inParagraph = true }
            result.push(line)
        }
    }
    if (inParagraph) result.push('</p>')

    return result.join('\n')
}


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
                platform.host.execCommand(
                    `service('001-core.layout', 'open-window') (command('ui.notepad'), '${filePath}')`,
                    platform
                )
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
