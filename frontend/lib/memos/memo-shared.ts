import type { NotesProposal } from '@/lib/ai/notes-proposals'

/**
 * Internal memos (.claude/plans/brio-features-round-2.md, §8): call and meeting notes kept as one
 * Markdown file each, in an "Internal Memos" folder of the engagement's own storage, internal only.
 *
 * What's here is pure and shared by the browser and the server: the file's name and contents, what
 * its EngagementDocument row carries (`settings.memo`), the folder's marker (`settings.memoFolder`),
 * and how an applied action is matched when Brio reads the memo again. Storage and the database are in
 * lib/memos/memo-store.ts.
 */

/** The folder's name as created. It is found again by its marker, never by this name. */
export const MEMO_FOLDER_NAME = 'Internal Memos'
export const MEMO_DEFAULT_TITLE = 'Call notes'
/** The longest memo saved, in characters: a long meeting's transcript fits. */
export const MEMO_MAX_CHARS = 200_000
export const MEMO_TITLE_MAX = 120
/** The longest title part of a file name; the rest of the title stays in the file's heading. */
const FILE_TITLE_MAX = 80
/** Provenance kept per memo: enough for any one call, bounded so a row can't grow without end. */
export const MEMO_APPLIED_MAX = 100

export type MemoSource = 'notes' | 'transcript'

// No memo text is kept in the database, not even a preview (decided 2026-11-12): the published
// promise is that Firma doesn't store file contents, and memos needn't be searchable. A row holds
// who, when, what kind and what was applied; the words stay in the file in the firm's storage.

/** An action applied from a memo's proposals: matched on kind, target and date when Brio reads it again. */
export interface MemoAppliedAction {
    kind: 'reminder' | 'dueDate'
    /** A reminder's title, normalized, or the deliverable's id for a due date. */
    target: string
    /** YYYY-MM-DD: the reminder's day, or the new due date. */
    date: string
    /** The line of the memo it came from, normalized. */
    quote: string
    /** What the card says it was, e.g. "Reminder · Chase the 1099-B". */
    label: string
    /** ISO time it was applied. */
    at: string
}

/** `settings.memo` on a memo file's row: what the card lists, without reading storage. */
export interface MemoSettings {
    /** YYYY-MM-DD: the day of the call. */
    date: string
    title: string
    authorUserId: string
    authorName: string
    authorFirstName: string
    source: MemoSource
    durationMinutes: number | null
    speakers: number | null
    createdAt: string
    applied: MemoAppliedAction[]
}

/** One row of the card, as the memos route answers it. */
export interface MemoListItem {
    /** The EngagementDocument id. */
    id: string
    docId: string | null
    fileName: string
    date: string
    title: string
    authorFirstName: string
    source: MemoSource
    durationMinutes: number | null
    appliedCount: number
    createdAt: string
}

// ── Days ──────────────────────────────────────────────────────────────────────────────────────

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/** A YYYY-MM-DD that names a real calendar day. */
export function isMemoDay(value: unknown): value is string {
    if (typeof value !== 'string') return false
    const m = DAY.exec(value)
    if (!m) return false
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    return d.toISOString().slice(0, 10) === value
}

/** "Thursday, November 12, 2026": the day as the memo's byline writes it. */
export function memoDayLine(date: string): string {
    return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    })
}

// ── The file ──────────────────────────────────────────────────────────────────────────────────

/** A title on one line, as the heading and the file name need it. */
export function cleanMemoTitle(title: string): string {
    return title.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MEMO_TITLE_MAX)
}

/**
 * The title's words, joined by hyphens, as both storages accept them: no \ / : * ? " < > | # %, no
 * control characters, no dot or hyphen at either end. Long titles are cut at a word.
 */
export function memoFileTitle(title: string): string {
    const words = cleanMemoTitle(title)
        .replace(/[\\/:*?"<>|#%]/g, ' ')
        .split(/[\s_-]+/)
        .filter(Boolean)
    let joined = words.join('-').replace(/^[.-]+|[.-]+$/g, '')
    if (joined.length > FILE_TITLE_MAX) {
        const cut = joined.slice(0, FILE_TITLE_MAX)
        joined = (cut.includes('-') ? cut.slice(0, cut.lastIndexOf('-')) : cut).replace(/[.-]+$/g, '')
    }
    return joined || 'Memo'
}

/**
 * "2026-11-12-Call-notes.md": the day, then the title's words. A name the folder already holds gets
 * the first free number ("…-2.md", "…-3.md"), compared without case as both storages do.
 */
export function memoFileName(date: string, title: string, taken: Iterable<string>): string {
    const base = `${date}-${memoFileTitle(title)}`
    const used = new Set(Array.from(taken, (n) => n.toLowerCase()))
    if (!used.has(`${base}.md`.toLowerCase())) return `${base}.md`
    for (let n = 2; ; n++) {
        const name = `${base}-${n}.md`
        if (!used.has(name.toLowerCase())) return name
    }
}

/** The file: a heading, the day and who wrote it, then the notes as pasted. */
export function memoMarkdown(params: { title: string; date: string; authorName: string; body: string }): string {
    const byline = params.authorName ? `${memoDayLine(params.date)} · ${params.authorName}` : memoDayLine(params.date)
    return `# ${cleanMemoTitle(params.title)}\n\n${byline}\n\n${params.body.trim()}\n`
}

// ── Reading the file ──────────────────────────────────────────────────────────────────────────

/** "Thursday, November 12, 2026 · Alex Jordan": the byline memoMarkdown writes under the heading. */
const BYLINE = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), [A-Z][a-z]+ \d{1,2}, \d{4}(?: · .+)?$/

/**
 * A memo's file as the Memos pane shows it: the heading and byline memoMarkdown wrote, apart, and
 * the notes under them. A file edited in storage into another shape keeps what's still there: no
 * heading means the whole file is the body.
 */
export function splitMemoMarkdown(text: string): { title: string | null; byline: string | null; body: string } {
    const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
    const heading = /^#[ \t]+([^\n]*?)[ \t#]*(?:\n|$)/.exec(src)
    if (!heading || !heading[1].trim()) return { title: null, byline: null, body: src }
    let rest = src.slice(heading[0].length).replace(/^\n+/, '')
    const firstLine = rest.split('\n', 1)[0]
    let byline: string | null = null
    if (BYLINE.test(firstLine.trim())) {
        byline = firstLine.trim()
        rest = rest.slice(firstLine.length).replace(/^\n+/, '')
    }
    return { title: heading[1].trim(), byline, body: rest }
}

// Letters (accented Latin too), digits and . ' ’ - in a name: the project targets ES5, so no \p{L}.
const SPEAKER = /^([A-Za-z0-9À-ɏ][A-Za-z0-9À-ɏ .'’-]{0,59}):[ \t]+(?=\S)/gm

/**
 * A transcript's "Dana Whitfield: words" lines with the speaker in bold, as the pane shows them
 * (lib/memos/vtt.ts writes each turn so). Markdown in, Markdown out; for transcripts only, since in
 * notes "Timeline agreed: three weeks" is a sentence, not a speaker.
 */
export function boldSpeakers(markdown: string): string {
    return markdown.replace(SPEAKER, (_line, name: string) => `**${name.trim()}:** `)
}


// ── The rows ──────────────────────────────────────────────────────────────────────────────────

const recordOf = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})
const stringOf = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const countOf = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null)

/** The folder's marker: how it is found again, whatever it has been renamed to. */
export function isMemoFolder(settings: unknown): boolean {
    return recordOf(settings).memoFolder === true
}

function appliedOf(raw: unknown): MemoAppliedAction[] {
    if (!Array.isArray(raw)) return []
    return raw.flatMap((item): MemoAppliedAction[] => {
        const a = recordOf(item)
        if ((a.kind !== 'reminder' && a.kind !== 'dueDate') || typeof a.target !== 'string' || !isMemoDay(a.date)) return []
        return [{ kind: a.kind, target: a.target, date: a.date, quote: stringOf(a.quote), label: stringOf(a.label), at: stringOf(a.at) }]
    })
}

/** A memo file's `settings.memo`, or null when the row isn't a memo. */
export function parseMemoSettings(settings: unknown): MemoSettings | null {
    const m = recordOf(recordOf(settings).memo)
    if (!isMemoDay(m.date) || typeof m.title !== 'string' || typeof m.authorUserId !== 'string') return null
    return {
        date: m.date,
        title: m.title,
        authorUserId: m.authorUserId,
        authorName: stringOf(m.authorName),
        authorFirstName: stringOf(m.authorFirstName),
        source: m.source === 'transcript' ? 'transcript' : 'notes',
        durationMinutes: countOf(m.durationMinutes),
        speakers: countOf(m.speakers),
        createdAt: stringOf(m.createdAt),
        applied: appliedOf(m.applied),
    }
}

/** The card's row for a memo file. */
export function memoListItem(row: { id: string; docId: string | null; fileName: string; createdAt: Date | string }, memo: MemoSettings): MemoListItem {
    return {
        id: row.id,
        docId: row.docId,
        fileName: row.fileName,
        date: memo.date,
        title: memo.title,
        authorFirstName: memo.authorFirstName,
        source: memo.source,
        durationMinutes: memo.durationMinutes,
        appliedCount: memo.applied.length,
        createdAt: memo.createdAt || new Date(row.createdAt).toISOString(),
    }
}

/** Newest call first; two on one day, the one written last first. */
export function byNewestMemo(a: Pick<MemoListItem, 'date' | 'createdAt'>, b: Pick<MemoListItem, 'date' | 'createdAt'>): number {
    return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
}

/** "Alex · notes", "Alex · transcript, 42 min": a row's meta line. */
export function memoMetaLine(memo: Pick<MemoListItem, 'authorFirstName' | 'source' | 'durationMinutes'>): string {
    const what = memo.source === 'transcript'
        ? (memo.durationMinutes ? `transcript, ${memo.durationMinutes} min` : 'transcript')
        : 'notes'
    return memo.authorFirstName ? `${memo.authorFirstName} · ${what}` : what
}

// ── Applied actions ───────────────────────────────────────────────────────────────────────────

const normalize = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase()

/** What an applied proposal is matched on later. A new deliverable is never applied, so it has none. */
export function appliedTargetOf(p: NotesProposal): Pick<MemoAppliedAction, 'kind' | 'target' | 'date' | 'quote'> | null {
    if (p.kind === 'reminder') return { kind: 'reminder', target: normalize(p.title), date: p.date, quote: normalize(p.quote) }
    if (p.kind === 'dueDate') return { kind: 'dueDate', target: p.deliverableId, date: p.newDate, quote: normalize(p.quote) }
    return null
}

/** How the card names an applied action. */
export function appliedLabelOf(p: NotesProposal): string {
    if (p.kind === 'reminder') return `Reminder · ${p.title}`
    if (p.kind === 'dueDate') return `Due date · ${p.docId ?? p.deliverableName} to ${p.newDate}`
    return p.name
}

/**
 * The proposals already applied from this memo: same kind, same day, and the same target. A reminder
 * Brio titles differently the second time still matches on the line of the memo it came from.
 */
export function alreadyAppliedIds(proposals: NotesProposal[], applied: MemoAppliedAction[]): string[] {
    if (applied.length === 0) return []
    return proposals.flatMap((p) => {
        const t = appliedTargetOf(p)
        if (!t) return []
        const done = applied.some((a) => a.kind === t.kind && a.date === t.date
            && (a.target === t.target || (t.kind === 'reminder' && !!a.quote && a.quote === t.quote)))
        return done ? [p.id] : []
    })
}

// ── The tree ──────────────────────────────────────────────────────────────────────────────────

/**
 * The rows without the memos folder, what it holds, and any memo file wherever it sits. The Files
 * agent and the Folder Health score judge how a firm files its work; the memos folder is filed by
 * Firma, one Markdown file per call, so it's neither a finding nor something to move or rename.
 */
export function withoutMemoTree<T extends { externalId: string | null; parentId: string | null; settings?: unknown }>(rows: T[]): T[] {
    const childrenOf = new Map<string, string[]>()
    const pending: string[] = []
    for (const row of rows) {
        if (!row.externalId) continue
        if (row.parentId) childrenOf.set(row.parentId, [...(childrenOf.get(row.parentId) ?? []), row.externalId])
        if (isMemoFolder(row.settings)) pending.push(row.externalId)
    }
    if (pending.length === 0 && !rows.some((r) => parseMemoSettings(r.settings))) return rows
    const hidden = new Set<string>()
    while (pending.length > 0) {
        const id = pending.pop() as string
        if (hidden.has(id)) continue
        hidden.add(id)
        pending.push(...(childrenOf.get(id) ?? []))
    }
    return rows.filter((r) => !(r.externalId && hidden.has(r.externalId)) && !parseMemoSettings(r.settings))
}
