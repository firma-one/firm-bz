import type { DeliverableProposal, DueDateProposal, NotesProposal, ReminderProposal, SkippedLine } from '@/lib/ai/notes-proposals'

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

// No memo text is kept in the database, not even a preview (decided 2026-11-12), with one exception:
// an applied action keeps the line it came from, normalized, as its citation (Deepak, 2026-11-15:
// useful, so the copy says so rather than claiming no copy). Waiting action items keep anchors only (§13).
// A row holds who, when, what kind and what was applied; the words stay in the file in the firm's storage.

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
    /** Brio's action items waiting on the memo (§13), identified when it was added or by hand; null when none. */
    review: MemoReview | null
    /** The last edit here (§14.3): when, and the name of who made it. Null for a memo never edited. */
    edited: MemoEdit | null
    /** ISO, when its notes last changed here. What Brio found in them before then no longer waits. */
    notesChangedAt: string | null
}

/** An edit made to a memo here: a new title, day or notes. */
export interface MemoEdit {
    at: string
    byName: string
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
    /** Action items and RAID suggestions from this memo still waiting for someone (§13). */
    toReview: number
    /** ISO, when Brio last identified its action items; null before it has. */
    reviewedAt: string | null
    createdAt: string
    /** The last edit here, or null. */
    edited: MemoEdit | null
    /** Its notes changed here after Brio last read them, and Brio hasn't read them since. */
    changedSinceRead: boolean
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

/** A stored review, read leniently: anything malformed is left out rather than shown wrong. */
function reviewOf(raw: unknown): MemoReview | null {
    const r = recordOf(raw)
    if (typeof r.at !== 'string' || !Array.isArray(r.proposals)) return null
    const proposals = r.proposals.flatMap((item): StoredProposal[] => {
        const p = recordOf(item)
        const quoteAt = anchorOf(p.quoteAt)
        if (typeof p.id !== 'string') return []
        if (p.kind === 'reminder' && typeof p.title === 'string' && isMemoDay(p.date)) {
            return [{ kind: 'reminder', id: p.id, title: p.title, date: p.date, quoteAt }]
        }
        if (p.kind === 'dueDate' && typeof p.deliverableId === 'string' && typeof p.deliverableName === 'string' && isMemoDay(p.newDate)) {
            return [{
                kind: 'dueDate', id: p.id, deliverableId: p.deliverableId, docId: typeof p.docId === 'string' ? p.docId : null,
                deliverableName: p.deliverableName, currentDate: isMemoDay(p.currentDate) ? p.currentDate : null, newDate: p.newDate, quoteAt,
            }]
        }
        if (p.kind === 'deliverable' && typeof p.name === 'string') {
            return [{ kind: 'deliverable', id: p.id, name: p.name, dueDate: isMemoDay(p.dueDate) ? p.dueDate : null, quoteAt }]
        }
        return []
    })
    const skipped = Array.isArray(r.skipped)
        ? r.skipped.flatMap((item): StoredSkipped[] => {
            const k = recordOf(item)
            return typeof k.reason === 'string' ? [{ reason: k.reason, quoteAt: anchorOf(k.quoteAt) }] : []
        })
        : []
    return {
        at: r.at,
        by: r.by === 'person' ? 'person' : 'auto',
        proposals,
        skipped,
        dropped: countOf(r.dropped) ?? 0,
        dismissed: r.dismissed === true,
        ...(typeof r.bodyHash === 'string' ? { bodyHash: r.bodyHash } : {}),
    }
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
        review: reviewOf(m.review),
        edited: editOf(m.edited),
        notesChangedAt: typeof m.notesChangedAt === 'string' ? m.notesChangedAt : null,
    }
}

function editOf(raw: unknown): MemoEdit | null {
    const e = recordOf(raw)
    return typeof e.at === 'string' ? { at: e.at, byName: stringOf(e.byName) } : null
}

/** The card's row for a memo file. `raidSuggested`: RAID suggestions from it still waiting (§13). */
export function memoListItem(
    row: { id: string; docId: string | null; fileName: string; createdAt: Date | string },
    memo: MemoSettings,
    raidSuggested = 0,
): MemoListItem {
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
        toReview: waitingActionItems(memo) + raidSuggested,
        reviewedAt: memo.review?.at ?? null,
        createdAt: memo.createdAt || new Date(row.createdAt).toISOString(),
        edited: memo.edited,
        changedSinceRead: !!memo.notesChangedAt && !!memo.review && memo.notesChangedAt > memo.review.at,
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

const titleWords = (s: string): Set<string> => new Set(normalize(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3))

/**
 * Two reminder titles for the same task: the same words, or most of them (Brio words a reminder a little
 * differently when it reads a memo again, after an edit for one). Compared only on the same day.
 */
export function closeTitles(a: string, b: string): boolean {
    if (normalize(a) === normalize(b)) return true
    const x = titleWords(a)
    const y = titleWords(b)
    if (x.size < 2 || y.size < 2) return false
    let shared = 0
    x.forEach((w) => { if (y.has(w)) shared += 1 })
    return shared / (x.size + y.size - shared) >= 0.6
}

/** The applied action a proposal matches: same kind and day, and the same deliverable or a close title. */
function appliedMatch(p: NotesProposal, applied: MemoAppliedAction[]): MemoAppliedAction | undefined {
    const t = appliedTargetOf(p)
    if (!t) return undefined
    return applied.find((a) => a.kind === t.kind && a.date === t.date
        && (a.target === t.target
            || (t.kind === 'reminder' && (closeTitles(a.target, t.target) || (!!a.quote && a.quote === t.quote)))))
}

/**
 * The proposals already applied from this memo: same kind, same day, and the same target. A reminder
 * Brio titles differently the second time still matches on a close title, or on the line of the memo
 * it came from.
 */
export function alreadyAppliedIds(proposals: NotesProposal[], applied: MemoAppliedAction[]): string[] {
    if (applied.length === 0) return []
    return proposals.flatMap((p) => (appliedMatch(p, applied) ? [p.id] : []))
}

/** When each proposal already applied from this memo was applied, by id (ISO). */
export function alreadyAppliedOn(proposals: NotesProposal[], applied: MemoAppliedAction[]): Record<string, string> {
    const on: Record<string, string> = {}
    for (const p of proposals) {
        const a = appliedMatch(p, applied)
        if (a?.at) on[p.id] = a.at
    }
    return on
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

// ── Action items waiting on a memo (§13) ──────────────────────────────────────────────────────

/*
 * When a memo is added, Brio identifies its action items and they wait on the memo until someone applies
 * or dismisses them. No memo text is stored for that: not a quote, not a skipped line. Each quote is kept
 * as where it sits in the memo (QuoteAnchor) and filled in from the memo itself, which the pane reads from
 * storage anyway, whenever the review is shown. A memo edited since then says so instead.
 */

/** Where a quote sits in a memo: offset and length in its match text (memoMatchText), and a short hash. */
export interface QuoteAnchor {
    at: number
    length: number
    hash: string
}

type WithoutQuote<T> = Omit<T, 'quote'> & { quoteAt: QuoteAnchor | null }
export type StoredProposal = WithoutQuote<ReminderProposal> | WithoutQuote<DueDateProposal> | WithoutQuote<DeliverableProposal>
export interface StoredSkipped {
    reason: string
    quoteAt: QuoteAnchor | null
}

/** `settings.memo.review`: the last identification of a memo's action items, quotes as anchors only. */
export interface MemoReview {
    /** ISO time it was identified. */
    at: string
    /** On its own when the memo was added, or by a person with the sparkle. */
    by: 'auto' | 'person'
    proposals: StoredProposal[]
    skipped: StoredSkipped[]
    dropped: number
    /** Someone dismissed them all: nothing waits. */
    dismissed: boolean
    /**
     * A hash of the notes Brio read (memoBodyHash), so a memo changed since, here or in storage, says
     * so. Absent on reviews from before it was kept.
     */
    bodyHash?: string
}

function anchorOf(raw: unknown): QuoteAnchor | null {
    const a = recordOf(raw)
    return typeof a.at === 'number' && typeof a.length === 'number' && typeof a.hash === 'string' && a.at >= 0 && a.length > 0
        ? { at: a.at, length: a.length, hash: a.hash }
        : null
}

/**
 * A memo's text as quotes are matched in it, the same rule as lib/ai/notes-proposals.ts: curly quotes,
 * dashes and runs of whitespace are not differences. Case is kept, so a quote reads as written.
 */
export function memoMatchText(s: string): string {
    return s
        .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
        .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
        .replace(/[\u2013\u2014\u2212]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
}

/** FNV-1a, 32 bits: tells a quote from whatever now sits at its place, without keeping the quote. */
export function quoteHash(s: string): string {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i)
        h = Math.imul(h, 0x01000193) >>> 0
    }
    return h.toString(16).padStart(8, '0')
}

/** Where `quote` sits in a memo's match text; null when it isn't there. */
export function anchorQuote(matchText: string, quote: string): QuoteAnchor | null {
    const q = memoMatchText(quote)
    if (!q) return null
    const at = matchText.indexOf(q)
    return at < 0 ? null : { at, length: q.length, hash: quoteHash(q) }
}

/** The quote back from the memo, or null when the memo no longer has it there. */
export function quoteFromAnchor(matchText: string, anchor: QuoteAnchor | null): string | null {
    if (!anchor) return null
    const q = matchText.slice(anchor.at, anchor.at + anchor.length)
    return q.length === anchor.length && quoteHash(q) === anchor.hash ? q : null
}

/** A proposal as it's stored: everything but its quote, which becomes an anchor. */
export function storedProposalOf(p: NotesProposal, matchText: string): StoredProposal {
    const { quote, ...rest } = p
    return { ...rest, quoteAt: anchorQuote(matchText, quote) } as StoredProposal
}

/** A review to store from what Brio found in a memo. */
export function memoReviewOf(
    found: { proposals: NotesProposal[]; skipped: SkippedLine[]; dropped: number },
    memoText: string,
    by: MemoReview['by'],
    at: Date = new Date(),
): MemoReview {
    const matchText = memoMatchText(memoText)
    return {
        at: at.toISOString(),
        by,
        proposals: found.proposals.map((p) => storedProposalOf(p, matchText)),
        skipped: found.skipped.map((k) => ({ reason: k.reason, quoteAt: anchorQuote(matchText, k.quote) })),
        dropped: found.dropped,
        dismissed: false,
        bodyHash: memoBodyHash(memoText),
    }
}

/** A hash of a memo's notes, without its heading and byline: a new title or day doesn't change it. */
export function memoBodyHash(text: string): string {
    return quoteHash(memoMatchText(splitMemoMarkdown(text).body))
}

/**
 * A review after the memo's heading changed but not its notes (a new title or day). An anchor is an
 * offset into the whole file, so the heading moved every one: each quote is found again, where the
 * heading's change puts it, or else wherever it now is. A quote that had already changed stays as it was.
 */
export function reanchorReview(review: MemoReview, oldText: string, newText: string): MemoReview {
    const before = memoMatchText(oldText)
    const after = memoMatchText(newText)
    const delta = after.length - before.length
    const move = (a: QuoteAnchor | null): QuoteAnchor | null => {
        const quote = quoteFromAnchor(before, a)
        if (!a || quote === null) return a
        const shifted = { ...a, at: a.at + delta }
        if (shifted.at >= 0 && quoteFromAnchor(after, shifted) !== null) return shifted
        return anchorQuote(after, quote) ?? a
    }
    return {
        ...review,
        proposals: review.proposals.map((p) => ({ ...p, quoteAt: move(p.quoteAt) })),
        skipped: review.skipped.map((k) => ({ ...k, quoteAt: move(k.quoteAt) })),
    }
}

/** What the memo now says where each quote was. */
export const MEMO_CHANGED_QUOTE = 'The memo has changed since, so this line isn’t shown.'

/** The review with its quotes filled in from the memo's text, as the panel shows proposals. */
export function resolveMemoReview(review: MemoReview, memoText: string): { proposals: NotesProposal[]; skipped: SkippedLine[]; dropped: number } {
    const matchText = memoMatchText(memoText)
    return {
        proposals: review.proposals.map(({ quoteAt, ...rest }) => ({ ...rest, quote: quoteFromAnchor(matchText, quoteAt) ?? MEMO_CHANGED_QUOTE }) as NotesProposal),
        skipped: review.skipped.flatMap((k) => {
            const quote = quoteFromAnchor(matchText, k.quoteAt)
            return quote ? [{ quote, reason: k.reason }] : []
        }),
        dropped: review.dropped,
    }
}

/** The applied action a stored proposal matches: the same kind and day, and the same deliverable or a close title. */
function storedAppliedMatch(p: StoredProposal, applied: MemoAppliedAction[]): MemoAppliedAction | undefined {
    if (p.kind === 'deliverable') return undefined
    const target = p.kind === 'reminder' ? normalize(p.title) : p.deliverableId
    const date = p.kind === 'reminder' ? p.date : p.newDate
    return applied.find((a) => a.kind === p.kind && a.date === date
        && (a.target === target || (p.kind === 'reminder' && closeTitles(a.target, target))))
}

function isStoredApplied(p: StoredProposal, applied: MemoAppliedAction[]): boolean {
    return !!storedAppliedMatch(p, applied)
}

/** The stored proposals already applied from the memo, by id. */
export function appliedStoredIds(review: MemoReview, applied: MemoAppliedAction[]): string[] {
    return review.proposals.filter((p) => isStoredApplied(p, applied)).map((p) => p.id)
}

/** When each stored proposal already applied from the memo was applied, by id (ISO). */
export function appliedStoredOn(review: MemoReview, applied: MemoAppliedAction[]): Record<string, string> {
    const on: Record<string, string> = {}
    for (const p of review.proposals) {
        const a = storedAppliedMatch(p, applied)
        if (a?.at) on[p.id] = a.at
    }
    return on
}

/** Action items still waiting on the memo: identified, not dismissed, not applied. A new deliverable counts until dismissed. */
export function waitingActionItems(memo: Pick<MemoSettings, 'review' | 'applied'>): number {
    const review = memo.review
    if (!review || review.dismissed) return 0
    return review.proposals.filter((p) => !isStoredApplied(p, memo.applied)).length
}

/** A RAID suggestion from a memo, as its Action items column shows it. */
export interface MemoRaidSuggestion {
    id: string
    type: 'RISK' | 'ASSUMPTION' | 'ISSUE' | 'DECISION'
    title: string
    /** Risks and Issues: Brio's priority, to keep or change before accepting. Null otherwise. */
    priority: 'HIGH' | 'MEDIUM' | 'LOW' | null
}

/** What GET …/memos/[documentId]/review answers: what waits on the memo, quotes still anchors. */
export interface MemoReviewPayload {
    /** Null when nothing waits: never identified, or dismissed. */
    review: MemoReview | null
    alreadyApplied: string[]
    /** When each of those was applied, by proposal id (ISO). */
    appliedOn: Record<string, string>
    /** Every action applied from the memo, as the card names it: what an edit keeps. */
    applied: { label: string; at: string }[]
    /** What a reminder needs to point back to its engagement. */
    engagement: { id: string; name: string; firmId: string; ctaUrl: string | null }
    raid: MemoRaidSuggestion[]
}

