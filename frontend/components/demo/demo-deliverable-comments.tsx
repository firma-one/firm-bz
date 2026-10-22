'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { AtSign, Hash, Send } from 'lucide-react'
import { DocumentIcon } from '@/components/ui/document-icon'
import { PersonAvatar } from '@/components/ui/property-cells'
import { Hint, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { caretOffset } from '@/lib/ui/caret-offset'
import {
    ENGAGEMENT_ROLE_LABEL, findMentionQuery, findTagQuery, insertMention, insertTag, mentionedNames, splitDocTags, splitMentions,
} from '@/lib/comments/mentions'

/*
 * The tour's deliverable comments: the app's composer (document-doc-comments-pane.tsx) over sample
 * comments, with @ to mention a teammate and # to tag one of the deliverable's documents. Posting adds
 * to the thread on screen only; nothing is sent.
 */

export type DemoTaggableDocument = { id: string; docId: string; name: string; mimeType: string }

type Person = { name: string; role: string }
type Comment = { id: string; author: string; at: string; content: string }

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
            id: 's1', author: 'Sam Rivera', at: ago(30),
            content: first
                ? `@Alex Jordan the figures are in #${first.docId}. Can you check them before this goes to review?`
                : '@Alex Jordan can you check the figures before this goes to review?',
        },
        {
            id: 's2', author: 'Alex Jordan', at: ago(6),
            content: second
                ? `Checked, they hold up. #${second.docId} still needs the latest numbers; I'll move this to review once it does.`
                : 'Checked, they hold up. Moving this to review.',
        },
    ]
}

// The text box and the chip layer behind it share this box exactly, so each chip sits under its text.
const COMPOSER_TEXT = 'max-h-48 w-full overflow-y-auto whitespace-pre-wrap break-words px-3 pb-1 pt-2.5 text-ui leading-relaxed [scrollbar-gutter:stable]'

export function DemoDeliverableComments({ documents }: { documents: DemoTaggableDocument[] }) {
    const [comments, setComments] = useState<Comment[]>(() => sampleThread(documents, new Date()))
    const [text, setText] = useState('')
    const [picked, setPicked] = useState<string[]>([])
    const [mention, setMention] = useState<{ start: number; query: string; left: number } | null>(null)
    const [tag, setTag] = useState<{ start: number; query: string; left: number } | null>(null)
    const [index, setIndex] = useState(0)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const backdropRef = useRef<HTMLDivElement>(null)
    const composerRef = useRef<HTMLDivElement>(null)
    const endRef = useRef<HTMLDivElement>(null)

    const docByDocId = useMemo(() => new Map(documents.map((d) => [d.docId, d])), [documents])

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
        return TEAM.filter((p) => !q || p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || p.name.toLowerCase().startsWith(q)).slice(0, 8)
    }, [mention])

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
        if (!content) return
        setComments((prev) => [...prev, { id: `c-${Date.now()}`, author: ME, at: new Date().toISOString(), content }])
        setText('')
        setPicked([])
        setMention(null)
        setTag(null)
        requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'nearest' }))
    }

    const docChip = (docId: string, key: string) => {
        const doc = docByDocId.get(docId)
        if (!doc) return <span key={key} className="rounded-[4px] bg-surface-muted px-1 py-px text-fg-muted">#{docId}</span>
        return (
            <Tooltip key={key}>
                <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 rounded-[4px] bg-surface-muted px-1 py-px align-bottom font-medium tabular-nums text-fg">
                        <DocumentIcon mimeType={doc.mimeType} className="h-3.5 w-3.5 shrink-0" />
                        {doc.docId}
                    </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{doc.name}</TooltipContent>
            </Tooltip>
        )
    }

    /** A comment's text: mentions as pills, document tags as chips with the document's ID (its name on hover). */
    const render = (content: string) =>
        splitMentions(content, NAMES).map((t, i) =>
            t.type === 'mention' ? (
                <span key={i} className="rounded-[4px] bg-action/10 px-1 py-px font-medium text-action">{t.value}</span>
            ) : (
                <span key={i}>{splitDocTags(t.value).map((d, j) => (d.type === 'doc' ? docChip(d.docId, `${i}-${j}`) : <span key={j}>{d.value}</span>))}</span>
            )
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
                        : <span key={j}>{d.value}</span>
                )}
            </span>
        )
    )

    const menuLeft = (left: number, width: number) => ({ left: Math.max(0, Math.min(left, (composerRef.current?.clientWidth ?? width) - width)) })
    const list = tag ? docs : mention ? people : []

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <ol className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
                {comments.map((c) => (
                    <li key={c.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-2.5">
                        <PersonAvatar person={{ name: c.author, avatarUrl: null }} size={24} />
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-small">
                                <span className="font-medium text-fg">{c.author === ME ? 'You' : c.author}</span>
                                <span className="text-fg-subtle" suppressHydrationWarning>{Date.now() - Date.parse(c.at) < 60_000 ? 'just now' : formatDistanceToNowStrict(new Date(c.at), { addSuffix: true })}</span>
                            </div>
                            <p className="mt-0.5 whitespace-pre-wrap break-words text-ui leading-relaxed text-fg">{render(c.content)}</p>
                        </div>
                    </li>
                ))}
                <div ref={endRef} />
            </ol>

            <form
                className="shrink-0"
                onSubmit={(e) => {
                    e.preventDefault()
                    send()
                }}
            >
                <div ref={composerRef} className="relative rounded-control border border-line-strong bg-surface focus-within:border-action/60 focus-within:ring-2 focus-within:ring-action/20">
                    <div ref={backdropRef} aria-hidden className={cn(COMPOSER_TEXT, 'pointer-events-none absolute inset-x-0 top-0 overflow-hidden text-transparent')}>
                        {backdrop}
                        {text.endsWith('\n') && '​'}
                    </div>
                    <textarea
                        ref={textareaRef}
                        value={text}
                        rows={1}
                        aria-label="Comment"
                        placeholder="Leave a comment… @ to mention, # to tag a document"
                        onScroll={(e) => { if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop }}
                        onChange={(e) => {
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
                        <span className="ml-auto hidden pr-1.5 text-caption text-fg-subtle sm:inline">⌘↵ to send</span>
                        <button
                            type="submit"
                            disabled={!text.trim()}
                            aria-label="Send comment"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-action text-action-fg transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Send className="h-3.5 w-3.5" />
                        </button>
                    </div>

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
