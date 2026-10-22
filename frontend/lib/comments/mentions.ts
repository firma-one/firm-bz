/**
 * @-mentions in comments: finding what is being typed after "@", inserting a picked name, and
 * reading mentions back out of a posted comment. Pure, so the comment composer and the thread
 * agree (components/projects/document-doc-comments-pane.tsx).
 *
 * A mention is the text "@" + the person's display name, where it was typed. Comments written
 * before mentions were inline had them prepended ("@Ana @Ben the rest…"); those still read.
 */

/** Characters a mention query can hold — a name typed without spaces ("@dee", "@ana.k"). */
// Letters (including accented Latin), digits and . _ ' - — the project targets ES5, so no \p{L}.
const WORD_CHAR = "A-Za-z0-9\u00C0-\u024F"
const QUERY_CHAR = new RegExp(`[${WORD_CHAR}._'-]`)
const MAX_QUERY = 40

/**
 * The mention being typed at the caret: the "@" that starts it and the text after it. Null when
 * the caret is not in one. The "@" must start the text or follow whitespace, so an email address
 * ("ana@firm.com") never opens the menu.
 */
export function findMentionQuery(text: string, caret: number): { start: number; query: string } | null {
    return findTriggerQuery(text, caret, '@')
}

/** The "@query" or "#query" at the caret, for whichever trigger character. */
function findTriggerQuery(text: string, caret: number, trigger: '@' | '#'): { start: number; query: string } | null {
    let i = caret - 1
    while (i >= 0 && caret - i <= MAX_QUERY + 1) {
        const ch = text[i]
        if (ch === trigger) {
            const before = i === 0 ? '' : text[i - 1]
            if (before && !/\s/.test(before)) return null
            return { start: i, query: text.slice(i + 1, caret) }
        }
        if (!QUERY_CHAR.test(ch)) return null
        i -= 1
    }
    return null
}

/** Replaces the "@query" at [start, caret) with "@Name " and says where the caret goes. */
export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
    const inserted = `@${name} `
    const after = text.slice(caret).replace(/^ /, '')
    return { text: text.slice(0, start) + inserted + after, caret: start + inserted.length }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A pattern for "@Name" for any of the names, longest first, ending at a word boundary. */
function mentionPattern(names: string[]): RegExp | null {
    const unique = Array.from(new Set(names.filter(Boolean))).sort((a, b) => b.length - a.length)
    if (unique.length === 0) return null
    return new RegExp(`@(${unique.map(escape).join('|')})(?![${WORD_CHAR}])`, 'g')
}

/** Which of the names are mentioned in the text (each once, in the order given). */
export function mentionedNames(text: string, names: string[]): string[] {
    const re = mentionPattern(names)
    if (!re) return []
    const found = new Set<string>()
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) found.add(m[1])
    return names.filter((n) => found.has(n))
}

export type MentionToken = { type: 'mention' | 'text'; value: string }

/** The old prepended form: "@Ana @Ben Smith the rest…". */
const LEGACY_LEADING = /^(@[A-Za-z][^\s]*(?:\s+[A-Z][^\s]*)?)(\s+|$)/

/**
 * A comment split into text and mentions, for drawing mentions as pills. Known names are found
 * anywhere; an unknown leading "@Token" (a comment from before mentions were inline, or by
 * someone no longer on the engagement) is still read as a mention.
 */
export function splitMentions(content: string, names: string[]): MentionToken[] {
    const tokens: MentionToken[] = []
    const re = mentionPattern(names)
    let last = 0
    if (re) {
        let m: RegExpExecArray | null
        while ((m = re.exec(content))) {
            const at = m.index
            if (at > last) tokens.push({ type: 'text', value: content.slice(last, at) })
            tokens.push({ type: 'mention', value: m[0] })
            last = at + m[0].length
        }
    }
    if (last < content.length) tokens.push({ type: 'text', value: content.slice(last) })

    // Legacy: mentions prepended to the text, for names not in the list.
    if (tokens[0]?.type === 'text' && tokens[0].value.startsWith('@')) {
        const lead: MentionToken[] = []
        let rest = tokens[0].value
        let m: RegExpMatchArray | null
        while (rest.startsWith('@') && (m = rest.match(LEGACY_LEADING))) {
            lead.push({ type: 'mention', value: m[1] }, ...(m[2] ? [{ type: 'text' as const, value: m[2] }] : []))
            rest = rest.slice(m[0].length)
        }
        if (lead.length) tokens.splice(0, 1, ...lead, ...(rest ? [{ type: 'text' as const, value: rest }] : []))
    }
    return tokens
}

/** A person's role on the engagement, as the mention menu labels it. */
export const ENGAGEMENT_ROLE_LABEL: Record<string, string> = {
    eng_admin: 'Lead',
    eng_member: 'Member',
    eng_ext_collaborator: 'Collaborator',
    eng_viewer: 'Reviewer',
}

/*
 * #-tags: a document in the deliverable, written as "#" + its document ID ("#QSR-12") where it was
 * typed. The ID, not the name: it is short, unique in the engagement and survives a rename. A tag is
 * drawn as a chip with the document's name when the thread knows it, and as its ID otherwise.
 */

/** The document tag being typed at the caret: the "#" that starts it and the text after it. */
export function findTagQuery(text: string, caret: number): { start: number; query: string } | null {
    return findTriggerQuery(text, caret, '#')
}

/** Replaces the "#query" at [start, caret) with "#DOC-ID " and says where the caret goes. */
export function insertTag(text: string, start: number, caret: number, docId: string): { text: string; caret: number } {
    const inserted = `#${docId} `
    const after = text.slice(caret).replace(/^ /, '')
    return { text: text.slice(0, start) + inserted + after, caret: start + inserted.length }
}

/** "#QSR-12", "#QSR2-7": a document ID after "#", at the start or after whitespace or "(". */
const DOC_TAG = /(^|[\s(])#([A-Z][A-Z0-9]{1,7}-\d{1,6})(?![A-Za-z0-9-])/g

export type DocTagToken = { type: 'text'; value: string } | { type: 'doc'; value: string; docId: string }

/** Text split into plain text and document tags. */
export function splitDocTags(text: string): DocTagToken[] {
    const tokens: DocTagToken[] = []
    let last = 0
    let m: RegExpExecArray | null
    DOC_TAG.lastIndex = 0
    while ((m = DOC_TAG.exec(text))) {
        const at = m.index + m[1].length
        if (at > last) tokens.push({ type: 'text', value: text.slice(last, at) })
        tokens.push({ type: 'doc', value: `#${m[2]}`, docId: m[2] })
        last = at + 1 + m[2].length
    }
    if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) })
    return tokens
}

/** The document IDs tagged in a comment, each once, in order. */
export function taggedDocIds(text: string): string[] {
    return Array.from(new Set(splitDocTags(text).flatMap((t) => (t.type === 'doc' ? [t.docId] : []))))
}
