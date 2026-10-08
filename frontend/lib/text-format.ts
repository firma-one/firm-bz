/**
 * Reformatting for structured text shown in the preview pane.
 *
 * Minified JSON and XML arrive as a single enormous line, which is not a preview of
 * anything. These indent it. A file that already has line breaks is left exactly as its
 * author wrote it — their formatting usually carries meaning, and reflowing it would be an
 * unasked-for change.
 */

/** Structured text we know how to indent. Detected from the content, not the extension. */
export type Structured = 'json' | 'xml' | null

export function detectStructured(text: string): Structured {
    const head = text.trimStart()[0]
    if (head === '{' || head === '[') return 'json'
    if (head === '<') return 'xml'
    return null
}

/**
 * Worth offering to reformat? A file that already has line breaks is left alone — the
 * author's formatting is usually more meaningful than a reindent, and reflowing it would
 * be an unasked-for change.
 */
export function looksMinified(text: string): boolean {
    const firstBreak = text.indexOf('\n')
    if (firstBreak === -1) return text.length > 200
    // One enormous line followed by a trailing newline is still minified.
    const longest = text.split('\n').reduce((max, line) => Math.max(max, line.length), 0)
    return longest > 400
}

/**
 * Indent XML without a dependency.
 *
 * Parsed properly rather than reindented with regexes: an element whose content mixes text
 * and markup cannot be split across lines without changing what it means, so those are
 * emitted on one line. Attributes, comments and CDATA are preserved.
 */
export function formatXml(text: string): string | null {
    try {
        const doc = new DOMParser().parseFromString(text, 'application/xml')
        if (doc.getElementsByTagName('parsererror').length) return null

        const lines: string[] = []
        const walk = (node: Node, depth: number) => {
            const pad = '  '.repeat(depth)

            if (node.nodeType === Node.TEXT_NODE) {
                const value = node.nodeValue?.trim()
                if (value) lines.push(pad + value)
                return
            }
            if (node.nodeType === Node.COMMENT_NODE) {
                lines.push(`${pad}<!--${node.nodeValue ?? ''}-->`)
                return
            }
            if (node.nodeType === Node.CDATA_SECTION_NODE) {
                lines.push(`${pad}<![CDATA[${node.nodeValue ?? ''}]]>`)
                return
            }
            if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
                const pi = node as ProcessingInstruction
                lines.push(`${pad}<?${pi.target} ${pi.data}?>`)
                return
            }
            if (node.nodeType === Node.DOCUMENT_TYPE_NODE) {
                const dt = node as DocumentType
                const publicId = dt.publicId ? ` PUBLIC "${dt.publicId}"` : ''
                const systemId = dt.systemId
                    ? `${dt.publicId ? '' : ' SYSTEM'} "${dt.systemId}"`
                    : ''
                lines.push(`${pad}<!DOCTYPE ${dt.name}${publicId}${systemId}>`)
                return
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return

            const el = node as Element
            const attrs = Array.from(el.attributes)
                .map((a) => ` ${a.name}="${a.value}"`)
                .join('')
            const children = Array.from(el.childNodes).filter(
                (c) => c.nodeType !== Node.TEXT_NODE || (c.nodeValue ?? '').trim(),
            )

            if (!children.length) {
                lines.push(`${pad}<${el.nodeName}${attrs} />`)
                return
            }

            // A single text child, or any mixed content, stays on one line.
            const onlyText = children.every((c) => c.nodeType === Node.TEXT_NODE)
            const hasMixedContent = children.some((c) => c.nodeType === Node.TEXT_NODE) && !onlyText
            if (onlyText || hasMixedContent) {
                const inner = children
                    .map((c) => (c.nodeType === Node.TEXT_NODE ? (c.nodeValue ?? '').trim() : new XMLSerializer().serializeToString(c)))
                    .join('')
                lines.push(`${pad}<${el.nodeName}${attrs}>${inner}</${el.nodeName}>`)
                return
            }

            lines.push(`${pad}<${el.nodeName}${attrs}>`)
            for (const child of children) walk(child, depth + 1)
            lines.push(`${pad}</${el.nodeName}>`)
        }

        for (const child of Array.from(doc.childNodes)) walk(child, 0)

        // The XML declaration is not a DOM node — the parser consumes it and it never
        // reaches childNodes — so it has to be carried over from the source, or formatting
        // would silently drop the document's stated version and encoding.
        const declaration = text.match(/^\s*(<\?xml\b[^?]*\?>)/)
        const out = (declaration ? `${declaration[1]}\n` : '') + lines.join('\n')
        return out.trim() ? out : null
    } catch {
        return null
    }
}

export function formatStructured(text: string, kind: Structured): string | null {
    if (kind === 'json') {
        try {
            return JSON.stringify(JSON.parse(text), null, 2)
        } catch {
            // Invalid JSON is shown exactly as it is; guessing at a repair would be worse.
            return null
        }
    }
    if (kind === 'xml') return formatXml(text)
    return null
}
