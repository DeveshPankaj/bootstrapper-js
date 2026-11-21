// Spec for the compiled Markdown viewer's renderer (TODO 1B.7, audit WIN-8/APP-4). Run: npx vitest run
import { describe, it, expect } from 'vitest'
import { parseMarkdown, isSafeUrl } from './markdown'

describe('parseMarkdown', () => {
    it('shows raw HTML as text', () => {
        const out = parseMarkdown('<img src=x onerror="top.pwned=1"><script>top.pwned=2</script>')
        expect(out).not.toMatch(/<img|<script/i)
        expect(out).toContain('&lt;script&gt;')
    })

    it("can't break out of image/link attributes", () => {
        for (const md of [
            '![x](x" onerror="top.pwned=1)',
            "![x](x' onerror='top.pwned=1)",
            '![a" onerror="top.pwned=1](pic.png)',
            '[t](https://a.example/" onmouseover="top.pwned=1)',
        ]) {
            const out = parseMarkdown(md)
            // no event-handler attribute outside quoted attribute values
            expect(out.replace(/"[^"]*"/g, '""')).not.toMatch(/\son\w+=/i)
            // every attribute value is a single quoted run without raw quotes
            for (const m of out.matchAll(/<(img|a)\s([^>]*)>/g)) {
                expect(m[2].replace(/\w+="[^"]*"/g, '').trim()).toBe('')
            }
        }
    })

    it('drops links and images with unsafe schemes', () => {
        for (const md of [
            '[x](javascript:top.pwned=1)', '[x](JaVaScRiPt:top.pwned=1)', '[x]( javascript:top.pwned=1)',
            '[x](java\tscript:top.pwned=1)', '[x](java\nscript:top.pwned=1)', '[x](vbscript:msgbox)',
            '[x](data:text/html,<script>top.pwned=1</script>)', '![x](javascript:top.pwned=1)',
            '![x](data:text/html;base64,PHNjcmlwdD4=)',
        ]) {
            const out = parseMarkdown(md)
            expect(out).not.toMatch(/<a\s|<img\s/)
            expect(out).not.toMatch(/javascript:|vbscript:|data:text/i)
        }
    })

    it('keeps safe links and images, opening links without an opener', () => {
        expect(parseMarkdown('[site](https://example.com/a?b=1&c=2)')).toContain('<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">site</a>')
        expect(parseMarkdown('[mail](mailto:a@example.com)')).toContain('href="mailto:a@example.com"')
        expect(parseMarkdown('[top](#intro)')).toContain('href="#intro"')
        expect(parseMarkdown('[doc](docs/readme.md)')).toContain('href="docs/readme.md"')
        expect(parseMarkdown('![p](http://example.com/p.png)')).toContain('<img alt="p" src="http://example.com/p.png"')
        expect(parseMarkdown('![p](data:image/png;base64,iVBORw0KGgo=)')).toContain('src="data:image/png;base64,iVBORw0KGgo="')
        expect(parseMarkdown('![p](mailto:a@example.com)')).not.toContain('<img')
    })

    it('still renders the basics', () => {
        const out = parseMarkdown('# Title\n\n**bold** and *it* and `code`\n\n- one\n- two\n\n> quote')
        expect(out).toContain('<h1>Title</h1>')
        expect(out).toContain('<strong>bold</strong>')
        expect(out).toContain('<em>it</em>')
        expect(out).toContain('<code>code</code>')
        expect(out).toMatch(/<ul><li>one<\/li>\n<li>two<\/li>\n<\/ul>/)
        expect(out).toContain('<blockquote>quote</blockquote>')
        expect(parseMarkdown("it's \"quoted\"")).toContain('it&#39;s &quot;quoted&quot;')
    })
})

describe('isSafeUrl', () => {
    it('reads the scheme the way the URL parser does', () => {
        expect(isSafeUrl('\u0001javascript:x', 'link')).toBe(false)
        expect(isSafeUrl('javascript\t:x', 'link')).toBe(false)
        expect(isSafeUrl('&#106;avascript:x', 'link')).toBe(true) // an odd relative path, not a scheme
        expect(isSafeUrl('//cdn.example.com/x.png', 'image')).toBe(true)
        expect(isSafeUrl('', 'link')).toBe(false)
    })
})
