'use client'

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { AtSign, Eye, Hash, Lock, MessagesSquare, Send, Smile, Sparkles, Square } from 'lucide-react'
import { PersonAvatar } from '@/components/ui/property-cells'
import { DocumentIcon } from '@/components/ui/document-icon'
import { Hint } from '@/components/ui/tooltip'
import { CommentText } from '@/components/comments/comment-text'
import { REACTIONS, ReactionMark, type ReactionKey } from '@/components/comments/reactions'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { FilterMenuLabel, FilterMenuRow, FilterPill, summarizePicks } from '@/components/ui/filter-pill'
import { cn } from '@/lib/utils'
import { caretOffset } from '@/lib/ui/caret-offset'
import { awaitsFirmReply } from '@/lib/comments/internal-notes'
import { ASSISTANT, BRIO_GREEN } from '@/lib/ai/assistant'
import { BrioDraftLabel } from '@/components/brio/brio-draft-label'
import { REPLY_DRAFT_NOTE, countDraftPlaceholders, withDraft } from '@/components/projects/document-doc-comments-pane'
import {
    ENGAGEMENT_ROLE_LABEL, findMentionQuery, findTagQuery, insertMention, insertTag, mentionedNames, splitDocTags, splitMentions,
} from '@/lib/comments/mentions'

/*
 * The tour's deliverable comments: the app's composer (document-doc-comments-pane.tsx) over sample
 * comments, with @ to mention a teammate and # to tag one of the deliverable's documents. As in the
 * app, the firm can post an internal note (only its team sees it), filter the thread by who sees
 * what, and, opened from one of the documents, see the comments about that file first. On a
 * discussion awaiting the firm's reply, "Draft reply" writes a sample Brio draft into the box, as the
 * app's does (no request is made). Posting adds to the thread on screen only; nothing is sent.
 */

export type DemoTaggableDocument = { id: string; docId: string; name: string; mimeType: string }

type Person = { name: string; role: string }
/** `reactions`: how many teammates reacted with each, before the visitor. */
export type DemoComment = { id: string; author: string; at: string; content: string; reactions?: Partial<Record<ReactionKey, number>>; internal?: boolean }
type Comment = DemoComment

const ME = 'Demo User'
const TEAM: Person[] = [
    { name: 'Alex Jordan', role: 'eng_admin' },
    { name: 'Sam Rivera', role: 'eng_member' },
    { name: 'Jordan Lee', role: 'eng_member' },
    { name: 'Taylor Kim', role: 'eng_ext_collaborator' },
]
const NAMES = TEAM.map((p) => p.name)

/** Two comments that use what the composer offers: a mention, and tags of this deliverable's documents. */
function sampleThread(docs: DemoTaggableDocument[], now: Date): Comment[] {
    const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
    const [first, second] = docs
    return [
        {
            id: 's1', author: 'Sam Rivera', at: ago(30), reactions: { looking: 1 },
            content: first
                ? `@Alex Jordan the figures are in #${first.docId}. Can you check them before this goes to review?`
                : '@Alex Jordan can you check the figures before this goes to review?',
        },
        {
            id: 's2', author: 'Alex Jordan', at: ago(6), reactions: { thumbs_up: 2, done: 1 },
            content: second
                ? `Checked, they hold up. #${second.docId} still needs the latest numbers; I'll move this to review once it does.`
                : 'Checked, they hold up. Moving this to review.',
        },
        {
            id: 's3', author: 'Jordan Lee', at: ago(2), internal: true,
            content: first
                ? `Between us: the pricing in #${first.docId} waits for partner sign-off before the client sees it.`
                : 'Between us: the pricing waits for partner sign-off before the client sees it.',
        },
    ]
}

/** Who sees a comment: everyone on the engagement, or the firm's team only (an internal note). */
type Visibility = 'reply' | 'internal'
const VISIBILITY_LABEL: Record<Visibility, string> = { reply: 'Replies', internal: 'Internal notes' }
const visibilityOf = (c: Comment): Visibility => (c.internal ? 'internal' : 'reply')
/** The client's roles: never offered for a mention in an internal note, which they can't see. */
const CLIENT_ROLES = new Set(['eng_ext_collaborator', 'eng_viewer'])
const roleOfName = (name: string) => TEAM.find((p) => p.name === name)?.role

/** The tour's stand-in for Brio's reply draft: the shape the app's takes, placeholders and all. */
function sampleReplyDraft(to: string): string {
    const first = to.split(/\s+/)[0]
    return `Thanks, ${first}. Good to hear the figures match. We'll move this to review once [confirm the final check is done], and share it with you by [date].`
}

const DRAFT_BUTTON = 'inline-flex h-7 shrink-0 items-center gap-1 rounded-control px-2 text-small text-fg-muted hover:bg-surface-hover hover:text-fg'

// The text box and the chip layer behind it share this box exactly, so each chip sits under its text.
const COMPOSER_TEXT = 'max-h-48 w-full overflow-y-auto whitespace-pre-wrap break-words px-3 pb-1 pt-2.5 text-ui leading-relaxed [scrollbar-gutter:stable]'

/**
 * `thread` starts the pane on a given discussion (the tour's Discussions page passes the row's) instead
 * of the sample; `onPost` hears each comment posted, so that page's row can follow.
 */
export function DemoDeliverableComments({ documents, thread, onPost, focusDocId, initialDraft = '', resolved = false }: {
    documents: DemoTaggableDocument[]
    thread?: DemoComment[]
    onPost?: (comment: DemoComment) => void
    /** Opened from one of the deliverable's documents (its Discussions tab): its comments first. */
    focusDocId?: string
    /** What a new comment starts with: that document's tag. */
    initialDraft?: string
    /** The discussion is resolved: it awaits no reply, so no draft is offered. */
    resolved?: boolean
}) {
    const [comments, setComments] = useState<Comment[]>(() => thread ?? sampleThread(documents, new Date()))
    // The visitor is the firm's lead, so the Reply / Internal note choice is theirs, as in the app.
    const [internalMode, setInternalMode] = useState(false)
    const [visibility, setVisibility] = useState<Visibility[]>([])
    const [scope, setScope] = useState<'file' | 'all'>(focusDocId ? 'file' : 'all')
    const aboutFile = useMemo(() => (focusDocId ? comments.filter((c) => c.content.includes(`#${focusDocId}`)) : comments), [comments, focusDocId])
    const inScope = scope === 'file' ? aboutFile : comments
    const shown = visibility.length ? inScope.filter((c) => visibility.includes(visibilityOf(c))) : inScope
    /** The visitor's own reactions, by comment: shown as theirs, on top of the sample counts. */
    const [mine, setMine] = useState<Record<string, ReactionKey[]>>({})
    const react = (commentId: string, key: ReactionKey) =>
        setMine((prev) => {
            const keys = prev[commentId] ?? []
            return { ...prev, [commentId]: keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key] }
        })
    const [text, setText] = useState(initialDraft)
    const [picked, setPicked] = useState<string[]>([])
    const [mention, setMention] = useState<{ start: number; query: string; left: number } | null>(null)
    const [tag, setTag] = useState<{ start: number; query: string; left: number } | null>(null)
    const [index, setIndex] = useState(0)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const backdropRef = useRef<HTMLDivElement>(null)
    const composerRef = useRef<HTMLDivElement>(null)
    const endRef = useRef<HTMLDivElement>(null)

    const docByDocId = useMemo(() => new Map(documents.map((d) => [d.docId, d])), [documents])

    // ── The sample reply draft, as the app's composer offers Brio's ─────────────
    // The visitor is the firm's lead, so it's offered on a discussion the client side spoke last in.
    const awaiting = !resolved && awaitsFirmReply(comments.map((c) => ({ authorUserId: c.author, isInternal: c.internal })), roleOfName)
    const lastClient = [...comments].reverse().find((c) => !c.internal && CLIENT_ROLES.has(roleOfName(c.author) ?? ''))
    const [drafting, setDrafting] = useState<{ before: string } | null>(null)
    const [streaming, setStreaming] = useState(false)
    const timer = useRef<ReturnType<typeof setInterval> | null>(null)
    const stopStream = () => {
        if (timer.current) clearInterval(timer.current)
        timer.current = null
        setStreaming(false)
    }
    useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])
    /** Writes the sample draft in a few words at a time, as a draft streams in the app. */
    const startDraft = () => {
        stopStream()
        const before = drafting ? drafting.before : text
        setDrafting({ before })
        setInternalMode(false)
        setMention(null)
        setTag(null)
        const words = sampleReplyDraft(lastClient?.author ?? '').match(/\S+\s*/g) ?? []
        let shown = 0
        setText(withDraft(before, '', initialDraft))
        setStreaming(true)
        timer.current = setInterval(() => {
            shown = Math.min(words.length, shown + 3)
            setText(withDraft(before, words.slice(0, shown).join(''), initialDraft))
            if (shown >= words.length) stopStream()
        }, 60)
    }
    const discardDraft = () => {
        stopStream()
        if (drafting) setText(drafting.before)
        setDrafting(null)
    }
    const placeholders = drafting ? countDraftPlaceholders(text) : 0
    const draftBlocksSend = !!drafting && (streaming || placeholders > 0)

    // Grows with the text, up to about eight lines.
    useLayoutEffect(() => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 192)}px`
    }, [text])

    /** Opens, narrows or closes the @ and # menus from where the caret is. */
    const sync = (value: string, caret: number) => {
        const el = textareaRef.current
        const at = (start: number) => (el ? caretOffset(el, start).left : 0)
        const m = findMentionQuery(value, caret)
        const t = findTagQuery(value, caret)
        const moved = (prev: { start: number; query: string } | null, q: { start: number; query: string }) => !prev || prev.start !== q.start || prev.query !== q.query
        if ((m && moved(mention, m)) || (t && moved(tag, t))) setIndex(0)
        setMention(m ? { ...m, left: at(m.start) } : null)
        setTag(t ? { ...t, left: at(t.start) } : null)
    }

    const people = useMemo(() => {
        if (!mention) return []
        const q = mention.query.toLowerCase()
        return TEAM
            .filter((p) => !internalMode || !CLIENT_ROLES.has(p.role))
            .filter((p) => !q || p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || p.name.toLowerCase().startsWith(q)).slice(0, 8)
    }, [mention, internalMode])

    const docs = useMemo(() => {
        if (!tag) return []
        const q = tag.query.toLowerCase()
        return documents
            .filter((d) => !q || d.docId.toLowerCase().startsWith(q) || d.name.toLowerCase().split(/[\s._-]+/).some((w) => w.startsWith(q)) || d.name.toLowerCase().includes(q))
            .slice(0, 8)
    }, [tag, documents])

    const place = (next: { text: string; caret: number }) => {
        const el = textareaRef.current
        setText(next.text)
        setMention(null)
        setTag(null)
        requestAnimationFrame(() => {
            el?.focus()
            el?.setSelectionRange(next.caret, next.caret)
        })
    }
    const caret = () => textareaRef.current?.selectionStart ?? text.length
    const pickPerson = (p: Person) => {
        if (!mention) return
        setPicked((prev) => (prev.includes(p.name) ? prev : [...prev, p.name]))
        place(insertMention(text, mention.start, caret(), p.name))
    }
    const pickDoc = (d: DemoTaggableDocument) => tag && place(insertTag(text, tag.start, caret(), d.docId))

    /** The @ and # buttons type their character at the caret, which opens its menu. */
    const start = (ch: '@' | '#') => {
        const el = textareaRef.current
        if (!el) return
        const at = caret()
        const insert = `${at > 0 && !/\s/.test(text[at - 1]) ? ' ' : ''}${ch}`
        const value = text.slice(0, at) + insert + text.slice(at)
        setText(value)
        requestAnimationFrame(() => {
            el.focus()
            el.setSelectionRange(at + insert.length, at + insert.length)
            sync(value, at + insert.length)
        })
    }

    const send = () => {
        const content = text.trim()
        if (!content || draftBlocksSend) return
        const posted: Comment = { id: `c-${Date.now()}`, author: ME, at: new Date().toISOString(), content, ...(internalMode ? { internal: true } : {}) }
        setComments((prev) => [...prev, posted])
        onPost?.(posted)
        // About a file, the next comment starts with its tag again.
        setText(initialDraft)
        setDrafting(null)
        setPicked([])
        setMention(null)
        setTag(null)
        requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'nearest' }))
    }

    /** A comment's text: mentions as pills, document tags as chips with the document's ID (its name on hover). */
    const render = (content: string) => (
        <CommentText
            content={content}
            names={NAMES}
            personFor={(name) => (NAMES.includes(name) ? { name } : undefined)}
            docFor={(docId) => {
                const d = docByDocId.get(docId)
                return d && { docId: d.docId, fileName: d.name, mimeType: d.mimeType }
            }}
        />
    )

    // Chips behind the text: mentions picked from the menu, and tags of this deliverable's documents.
    const currentMentions = picked.filter((n) => mentionedNames(text, [n]).length > 0)
    const backdrop = splitMentions(text, currentMentions).map((t, i) =>
        t.type === 'mention' ? (
            <mark key={i} className="-mx-0.5 rounded-[4px] bg-action/15 px-0.5 text-transparent [box-decoration-break:clone]">{t.value}</mark>
        ) : (
            <span key={i}>
                {splitDocTags(t.value).map((d, j) =>
                    d.type === 'doc' && docByDocId.has(d.docId)
                        ? <mark key={j} className="-mx-0.5 rounded-[4px] bg-surface-muted px-0.5 text-transparent [box-decoration-break:clone]">{d.value}</mark>
                        : <span key={j}>{!drafting ? d.value : d.value.split(/(\[[^\]]+\])/g).map((part, k) => k % 2 === 1
                            ? <mark key={k} className="-mx-0.5 rounded-[3px] bg-status-waiting-bg px-0.5 text-transparent [box-decoration-break:clone]">{part}</mark>
                            : <Fragment key={k}>{part}</Fragment>)}</span>
                )}
            </span>
        )
    )

    const menuLeft = (left: number, width: number) => ({ left: Math.max(0, Math.min(left, (composerRef.current?.clientWidth ?? width) - width)) })
    const list = tag ? docs : mention ? people : []

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            {/* As in the app: the file's comments or the whole thread, and who sees what */}
            <div className="@container/filter-bar flex shrink-0 flex-nowrap items-center gap-2">
                {focusDocId && (
                    <div role="radiogroup" aria-label="Which comments" className="inline-flex shrink-0 rounded-control border border-line p-0.5 text-caption">
                        {([['file', `About this file · ${aboutFile.length}`], ['all', `Whole thread · ${comments.length}`]] as const).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={scope === value}
                                onClick={() => setScope(value)}
                                className={cn('rounded-[4px] px-2 py-0.5 transition-colors', scope === value ? 'bg-surface-muted text-fg' : 'text-fg-muted hover:text-fg')}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <FilterPill icon={<Eye />} label="Visibility" collapsible value={visibility.length ? summarizePicks(visibility.map((v) => VISIBILITY_LABEL[v])) : undefined} onClear={() => setVisibility([])} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[200px] p-1">
                        <FilterMenuLabel>Who sees it</FilterMenuLabel>
                        {(['reply', 'internal'] as const).map((v) => (
                            <FilterMenuRow
                                key={v}
                                multi
                                icon={v === 'internal' ? <Lock /> : <MessagesSquare />}
                                selected={visibility.includes(v)}
                                onSelect={() => setVisibility((l) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]))}
                            >
                                {VISIBILITY_LABEL[v]}
                                <span className="ml-1.5 text-caption tabular-nums text-fg-subtle">{inScope.filter((c) => visibilityOf(c) === v).length}</span>
                            </FilterMenuRow>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                {visibility.length > 0 && <span className="ml-auto shrink-0 text-caption tabular-nums text-fg-subtle">{shown.length} of {inScope.length} comments</span>}
            </div>
            <ol className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
                {shown.length === 0 && (
                    <p className="text-small text-fg-subtle">{scope === 'file' ? 'No comments about this file yet.' : 'No comments match.'}</p>
                )}
                {shown.map((c) => {
                    const myKeys = mine[c.id] ?? []
                    const count = (key: ReactionKey) => (c.reactions?.[key] ?? 0) + (myKeys.includes(key) ? 1 : 0)
                    const reacted = REACTIONS.filter((r) => count(r.key) > 0)
                    return (
                    <li key={c.id} className="group relative grid grid-cols-[24px_minmax(0,1fr)] gap-x-2.5">
                        <PersonAvatar person={{ name: c.author, avatarUrl: null }} size={24} />
                        {/* As in the app: an internal note in a dashed box, tagged and muted; the client side's people named with their role. */}
                        <div className={cn('min-w-0', c.internal && 'rounded-control border border-dashed border-line-strong bg-surface-subtle px-2.5 py-2')}>
                            <div className="flex items-baseline gap-1.5 pr-7 text-small">
                                <span className="font-medium text-fg">{c.author === ME ? 'You' : c.author}</span>
                                {c.internal && (
                                    <Hint label="Only Leads and Full Access contributors see this">
                                        <span className="inline-flex h-[18px] shrink-0 items-center self-center rounded-[4px] bg-tag-gray-bg px-1.5 text-[11px] font-semibold text-tag-gray-fg">Internal</span>
                                    </Hint>
                                )}
                                <span className="shrink-0 whitespace-nowrap text-caption text-fg-subtle" suppressHydrationWarning>
                                    {CLIENT_ROLES.has(roleOfName(c.author) ?? '') && <>· {ENGAGEMENT_ROLE_LABEL[roleOfName(c.author)!]} </>}
                                    · {Date.now() - Date.parse(c.at) < 60_000 ? 'just now' : formatDistanceToNowStrict(new Date(c.at), { addSuffix: true })}
                                </span>
                            </div>
                            <p className={cn('mt-0.5 whitespace-pre-wrap break-words text-ui leading-relaxed', c.internal ? 'text-fg-muted' : 'text-fg')}>{render(c.content)}</p>
                            {/* Reactions, as the app draws them (components/comments/reactions.tsx) */}
                            {reacted.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                    {reacted.map((r) => (
                                        <Hint key={r.key} label={r.label}>
                                            <button
                                                type="button"
                                                onClick={() => react(c.id, r.key)}
                                                className={cn('inline-flex h-6 items-center gap-1 rounded-full border px-2 text-caption tabular-nums transition-colors', myKeys.includes(r.key) ? 'border-action/30 bg-action/10 text-action' : 'border-line bg-surface text-fg-muted hover:bg-surface-hover')}
                                            >
                                                <ReactionMark reaction={r} size="pill" />{count(r.key)}
                                            </button>
                                        </Hint>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="absolute right-0 top-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                            <DropdownMenu>
                                <Hint label="React">
                                    <DropdownMenuTrigger asChild>
                                        <button type="button" aria-label="Add reaction" className="flex h-6 w-6 items-center justify-center rounded-[4px] border border-line bg-surface text-fg-subtle shadow-sm hover:bg-surface-hover hover:text-fg-muted">
                                            <Smile className="h-3.5 w-3.5" />
                                        </button>
                                    </DropdownMenuTrigger>
                                </Hint>
                                <DropdownMenuContent align="end" className="w-[156px] p-1.5">
                                    <div className="grid grid-cols-3 gap-1">
                                        {REACTIONS.map((r) => (
                                            <Hint key={r.key} label={r.label}>
                                                <button
                                                    type="button"
                                                    aria-label={r.label}
                                                    onClick={() => react(c.id, r.key)}
                                                    className={cn('flex h-9 w-9 items-center justify-center rounded-control hover:bg-surface-hover', myKeys.includes(r.key) && 'bg-action/10 ring-1 ring-inset ring-action/30')}
                                                >
                                                    <ReactionMark reaction={r} size="picker" />
                                                </button>
                                            </Hint>
                                        ))}
                                    </div>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </li>
                    )
                })}
                <div ref={endRef} />
            </ol>

            <form
                className="flex shrink-0 flex-col gap-2"
                onSubmit={(e) => {
                    e.preventDefault()
                    send()
                }}
            >
                {/* Who sees it: everyone on the engagement, or the firm's team only */}
                <div role="radiogroup" aria-label="Who sees this comment" className="inline-flex self-start rounded-control border border-line p-0.5 text-caption">
                    <button
                        type="button"
                        role="radio"
                        aria-checked={!internalMode}
                        onClick={() => setInternalMode(false)}
                        className={cn('rounded-[4px] px-2 py-0.5 transition-colors', !internalMode ? 'bg-surface-muted text-fg' : 'text-fg-muted hover:text-fg')}
                    >
                        Reply
                    </button>
                    <button
                        type="button"
                        role="radio"
                        aria-checked={internalMode}
                        onClick={() => setInternalMode(true)}
                        className={cn('inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 transition-colors', internalMode ? 'bg-surface-muted text-fg' : 'text-fg-muted hover:text-fg')}
                    >
                        <Lock className="h-3 w-3" /> Internal note
                    </button>
                </div>
                <div ref={composerRef} className={cn(
                    'relative rounded-control border border-line-strong bg-surface focus-within:border-action/60 focus-within:ring-2 focus-within:ring-action/20',
                    internalMode && 'border-dashed bg-surface-subtle',
                )}>
                    {drafting && (streaming || text !== drafting.before) && (
                        <div className="px-3 pt-2"><BrioDraftLabel>{REPLY_DRAFT_NOTE}</BrioDraftLabel></div>
                    )}
                    <div className="relative">
                    <div ref={backdropRef} aria-hidden className={cn(COMPOSER_TEXT, 'pointer-events-none absolute inset-x-0 top-0 overflow-hidden text-transparent')}>
                        {backdrop}
                        {text.endsWith('\n') && '​'}
                    </div>
                    <textarea
                        ref={textareaRef}
                        value={text}
                        rows={1}
                        aria-label={internalMode ? 'Internal note' : 'Comment'}
                        placeholder={internalMode ? 'Internal note · only Leads and Full Access contributors see this…' : 'Leave a comment… @ to mention, # to tag a document'}
                        onScroll={(e) => { if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop }}
                        onChange={(e) => {
                            // Theirs from the first keystroke: a draft still being written stops where it is.
                            if (streaming) stopStream()
                            setText(e.target.value)
                            sync(e.target.value, e.target.selectionStart ?? e.target.value.length)
                        }}
                        onClick={(e) => sync(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
                        onBlur={() => window.setTimeout(() => { setMention(null); setTag(null) }, 120)}
                        onKeyDown={(e) => {
                            if ((mention || tag) && list.length > 0) {
                                if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => (i + 1) % list.length); return }
                                if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => (i - 1 + list.length) % list.length); return }
                                if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
                                    e.preventDefault()
                                    const at = Math.min(index, list.length - 1)
                                    if (tag) pickDoc(docs[at])
                                    else pickPerson(people[at])
                                    return
                                }
                            }
                            if ((mention || tag) && e.key === 'Escape') {
                                e.preventDefault()
                                setMention(null)
                                setTag(null)
                                return
                            }
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault()
                                send()
                            }
                        }}
                        className={cn(COMPOSER_TEXT, 'relative block resize-none bg-transparent text-fg outline-none placeholder:text-fg-subtle')}
                    />
                    </div>
                    <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
                        <Hint label="Mention someone (@)">
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => start('@')} aria-label="Mention someone" className="flex h-7 w-7 items-center justify-center rounded-control text-fg-subtle hover:bg-surface-hover hover:text-fg-muted">
                                <AtSign className="h-3.5 w-3.5" />
                            </button>
                        </Hint>
                        <Hint label="Tag a document (#)">
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => start('#')} aria-label="Tag a document" className="flex h-7 w-7 items-center justify-center rounded-control text-fg-subtle hover:bg-surface-hover hover:text-fg-muted">
                                <Hash className="h-3.5 w-3.5" />
                            </button>
                        </Hint>
                        {awaiting && !drafting && (
                            <Hint label={`${ASSISTANT.name} drafts a reply from the thread for you to edit. Internal notes are never used.`}>
                                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={startDraft} className="ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-control px-1.5 text-small text-fg-muted hover:bg-surface-hover hover:text-fg">
                                    <Sparkles className="h-3.5 w-3.5" style={{ color: BRIO_GREEN }} aria-hidden />
                                    Draft reply
                                </button>
                            </Hint>
                        )}
                        {!drafting && (
                            <>
                                <span className={cn('hidden pr-1.5 text-caption text-fg-subtle sm:inline', !awaiting && 'ml-auto')}>⌘↵ to send</span>
                                <button
                                    type="submit"
                                    disabled={!text.trim()}
                                    aria-label="Send comment"
                                    className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-action text-action-fg transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40', awaiting && 'ml-1')}
                                >
                                    <Send className="h-3.5 w-3.5" />
                                </button>
                            </>
                        )}
                    </div>

                    {/* The draft's own row, as in the app: what's left to fill, Discard draft, Rewrite (Stop while it writes), Reply. */}
                    {drafting && (
                        <div className="flex items-center gap-1 border-t border-line py-1.5 pl-3 pr-1.5">
                            <span aria-live="polite" className="min-w-0 flex-1 truncate text-small text-fg-muted">
                                {streaming ? 'Writing…' : placeholders > 0 ? `${placeholders} ${placeholders === 1 ? 'placeholder' : 'placeholders'} to fill` : ''}
                            </span>
                            <button type="button" onClick={discardDraft} className={DRAFT_BUTTON}>Discard draft</button>
                            {streaming ? (
                                <button type="button" onClick={stopStream} className={DRAFT_BUTTON}><Square className="h-3 w-3" aria-hidden /> Stop</button>
                            ) : (
                                <button type="button" onClick={startDraft} className={DRAFT_BUTTON}>Rewrite</button>
                            )}
                            <button
                                type="submit"
                                disabled={!text.trim() || draftBlocksSend}
                                className="ml-0.5 inline-flex h-7 shrink-0 items-center rounded-control bg-action px-2.5 text-small font-medium text-action-fg transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {internalMode ? 'Post note' : 'Reply'}
                            </button>
                        </div>
                    )}

                    {tag && (
                        <div role="listbox" aria-label="Tag a document" className="absolute bottom-full z-[200] mb-1.5 w-80 overflow-hidden rounded-card border border-line bg-surface p-1 shadow-popover" style={menuLeft(tag.left, 320)}>
                            {docs.length === 0 ? (
                                <p className="px-2 py-1.5 text-small text-fg-subtle">{documents.length === 0 ? 'No documents in this deliverable yet' : `No document matches “${tag.query}”`}</p>
                            ) : docs.map((d, i) => (
                                <button key={d.id} type="button" role="option" aria-selected={i === index} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setIndex(i)} onClick={() => pickDoc(d)} className={cn('flex h-9 w-full items-center gap-2 rounded-control px-2 text-left', i === index && 'bg-surface-hover')}>
                                    <DocumentIcon mimeType={d.mimeType} className="h-4 w-4 shrink-0" />
                                    <span className="min-w-0 flex-1 truncate text-small text-fg">{d.name}</span>
                                    <span className="shrink-0 text-caption tabular-nums text-fg-subtle">{d.docId}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    {mention && !tag && (
                        <div role="listbox" aria-label="Mention someone" className="absolute bottom-full z-[200] mb-1.5 w-64 overflow-hidden rounded-card border border-line bg-surface p-1 shadow-popover" style={menuLeft(mention.left, 260)}>
                            {people.length === 0 ? (
                                <p className="px-2 py-1.5 text-small text-fg-subtle">No one matches “{mention.query}”</p>
                            ) : people.map((p, i) => (
                                <button key={p.name} type="button" role="option" aria-selected={i === index} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setIndex(i)} onClick={() => pickPerson(p)} className={cn('flex h-9 w-full items-center gap-2 rounded-control px-2 text-left', i === index && 'bg-surface-hover')}>
                                    <PersonAvatar person={{ name: p.name, avatarUrl: null }} size={22} />
                                    <span className="min-w-0 flex-1 truncate text-small text-fg">{p.name}</span>
                                    <span className="shrink-0 text-caption text-fg-subtle">{ENGAGEMENT_ROLE_LABEL[p.role]}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </form>
        </div>
    )
}
