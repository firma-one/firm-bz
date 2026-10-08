import { describe, it, expect } from 'vitest'
import { detectStructured, formatStructured, formatXml, looksMinified } from '@/lib/text-format'

describe('detectStructured', () => {
    it('reads the first meaningful character, not the extension', () => {
        expect(detectStructured('{"a":1}')).toBe('json')
        expect(detectStructured('  \n [1,2]')).toBe('json')
        expect(detectStructured('<root/>')).toBe('xml')
        expect(detectStructured('plain prose')).toBe(null)
        expect(detectStructured('')).toBe(null)
    })
})

describe('looksMinified', () => {
    it('treats one very long line as minified', () => {
        expect(looksMinified('x'.repeat(500))).toBe(true)
        expect(looksMinified('x'.repeat(500) + '\n')).toBe(true)
    })

    it('leaves a file that already has reasonable lines alone', () => {
        expect(looksMinified('{\n  "a": 1\n}')).toBe(false)
        expect(looksMinified('short')).toBe(false)
    })
})

describe('formatStructured — JSON', () => {
    it('indents and preserves the data exactly', () => {
        const source = JSON.stringify([{ id: 1, name: "O'Conner Group", nested: { a: [1, 2] } }])
        const out = formatStructured(source, 'json')!
        expect(out.split('\n').length).toBeGreaterThan(5)
        // Reformatting must not change what the document says.
        expect(JSON.parse(out)).toEqual(JSON.parse(source))
    })

    it('returns null for invalid JSON rather than guessing at a repair', () => {
        expect(formatStructured('{oops', 'json')).toBe(null)
    })
})

describe('formatXml', () => {
    it('indents nested elements and keeps attributes', () => {
        const out = formatXml('<root a="1"><child><leaf>text</leaf></child></root>')!
        expect(out).toBe(['<root a="1">', '  <child>', '    <leaf>text</leaf>', '  </child>', '</root>'].join('\n'))
    })

    it('collapses an empty element', () => {
        expect(formatXml('<root><empty></empty></root>')!).toContain('<empty />')
    })

    it('keeps mixed content on one line, because splitting it changes the meaning', () => {
        // Breaking <p>Hello <b>there</b></p> across lines would introduce whitespace that
        // is part of the document's text.
        const out = formatXml('<p>Hello <b>there</b> you</p>')!
        expect(out.split('\n')).toHaveLength(1)
        expect(out).toContain('<b>there</b>')
    })

    it('preserves comments and CDATA', () => {
        const out = formatXml('<root><!-- note --><data><![CDATA[a < b]]></data></root>')!
        expect(out).toContain('<!-- note -->')
        expect(out).toContain('<![CDATA[a < b]]>')
    })

    it('keeps the XML declaration, which is not a DOM node', () => {
        // DOMParser consumes `<?xml ... ?>` and never exposes it in childNodes, so it has
        // to be carried over from the source. A formatter that silently drops the stated
        // version and encoding is changing the document.
        const source = '<?xml version="1.0" encoding="UTF-8"?><catalog><book id="b1"><title>A</title></book></catalog>'
        const out = formatXml(source)!
        expect(out.split('\n')[0]).toBe('<?xml version="1.0" encoding="UTF-8"?>')
        expect(out).toContain('<catalog>')
    })

    it('keeps a DOCTYPE and processing instructions', () => {
        const out = formatXml('<?xml version="1.0"?><?xml-stylesheet href="s.xsl"?><root><a>1</a></root>')!
        expect(out).toContain('<?xml version="1.0"?>')
        expect(out).toContain('<?xml-stylesheet href="s.xsl"?>')
    })

    it('does not invent a declaration for a document without one', () => {
        const out = formatXml('<root><a>1</a></root>')!
        expect(out.startsWith('<root>')).toBe(true)
    })

    it('returns null for malformed XML', () => {
        expect(formatXml('<root><unclosed>')).toBe(null)
        expect(formatXml('not xml at all')).toBe(null)
    })
})
