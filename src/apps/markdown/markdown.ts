// Markdown → HTML for the compiled viewer (src/apps/markdown/index.tsx).
//
// SECURITY (audit WIN-8, APP-4): the output goes into the window's document
// with dangerouslySetInnerHTML, so it must never carry markup from the file:
//   - all of & < > " ' are escaped before any rule runs, so raw HTML in the
//     file is shown as text and no captured value can leave its attribute;
//   - link URLs must be http(s), mailto, a #fragment or relative; image URLs
//     http(s), relative or a data:image — anything else (javascript:, data:
//     documents, vbscript:, …, also when split by tabs/newlines) is dropped;
//   - links open with rel="noopener noreferrer".
// Pure (no DOM, no platform) so markdown.test.ts can pin it down.

const escapeHtml = (s: string): string => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const unescapeHtml = (s: string): string => s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')

/**
 * True when an (unescaped) URL may be used. Browsers ignore tabs and newlines
 * inside URLs and leading/trailing controls and spaces, so the scheme is read
 * after removing those, exactly like the URL parser would.
 */
export const isSafeUrl = (raw: string, kind: 'link' | 'image'): boolean => {
    const cleaned = raw.replace(/[\t\n\r]/g, '').replace(/^[\u0000- ]+|[\u0000- ]+$/g, '')
    if (!cleaned) return false
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned)?.[1]?.toLowerCase()
    if (!scheme) return true // relative, #fragment, //host (network path)
    if (scheme === 'http' || scheme === 'https') return true
    if (kind === 'link') return scheme === 'mailto'
    return /^data:image\/[a-z0-9.+-]+[;,]/i.test(cleaned)
}

export function parseMarkdown(src: string): string {
    let html = escapeHtml(src)

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

    // Captured values are already escaped text, so they can't leave the quoted
    // attribute; the URL is checked on its unescaped form.
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt: string, url: string) =>
        isSafeUrl(unescapeHtml(url), 'image') ? `<img alt="${alt}" src="${url}" style="max-width:100%">` : alt)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, url: string) =>
        isSafeUrl(unescapeHtml(url), 'link') ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>` : text)

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
