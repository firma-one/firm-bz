'use client'

import { DocumentIcon } from '@/components/ui/document-icon'
import { PersonAvatar } from '@/components/ui/property-cells'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { splitDocTags, splitMentions } from '@/lib/comments/mentions'

/*
 * A comment's text as every comment list draws it: mentions as pills (name and email on hover)
 * and document tags as ID chips (name and where it lives on hover). Shared by the deliverable
 * pane's thread, the engagement Comments page and their tour copies.
 */

/** Someone a mention can name, as its hover card shows them. */
export type CommentPerson = { name: string; email?: string | null; avatarUrl?: string | null }

/** A document a tag can name, as its chip shows it. */
export type CommentDoc = { docId: string | null; fileName: string; mimeType?: string | null; breadcrumb?: string[] }

const POPOVER = 'z-[9999] max-w-xs border border-line bg-surface p-2 text-xs text-fg shadow-popover'

/**
 * A document tag: its ID and icon (its name on hover), opening it when `onOpen` is given. A tag
 * of a document the viewer can't see, or that is gone, stays a plain muted "#ID".
 */
export function DocTagChip({ docId, doc, onOpen }: { docId: string; doc?: CommentDoc; onOpen?: () => void }) {
    if (!doc) return <span className="rounded-[4px] bg-surface-muted px-1 py-px text-fg-muted">#{docId}</span>
    const chip = (
        <span className="inline-flex items-center gap-1 rounded-[4px] bg-surface-muted px-1 py-px align-bottom font-medium tabular-nums text-fg">
            <DocumentIcon mimeType={doc.mimeType ?? undefined} className="h-3.5 w-3.5 shrink-0" />
            {docId}
        </span>
    )
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                {onOpen ? (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation()
                            onOpen()
                        }}
                        className="rounded-[4px] align-bottom hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                    >
                        {chip}
                    </button>
                ) : chip}
            </TooltipTrigger>
            <TooltipContent side="top" className={POPOVER}>
                <div className="font-medium">{doc.fileName}</div>
                {(doc.breadcrumb ?? []).length > 0 && <div className="text-caption text-fg-subtle">{(doc.breadcrumb ?? []).slice(-2).join(' › ')}</div>}
            </TooltipContent>
        </Tooltip>
    )
}

/** A mention: "@Name" as a pill, with the person's face, name and email on hover when they're known. */
export function MentionPill({ text, person }: { text: string; person?: CommentPerson }) {
    const pill = <span className="rounded-[4px] bg-action/10 px-1 py-px font-medium text-action">{text}</span>
    if (!person) return pill
    return (
        <Tooltip>
            <TooltipTrigger asChild>{pill}</TooltipTrigger>
            <TooltipContent side="top" className={POPOVER}>
                <div className="flex items-center gap-2">
                    <PersonAvatar person={{ name: person.name, avatarUrl: person.avatarUrl ?? null }} size={28} />
                    <div>
                        <div className="font-semibold">{person.name}</div>
                        {person.email && <div className="text-caption text-fg-subtle">{person.email}</div>}
                    </div>
                </div>
            </TooltipContent>
        </Tooltip>
    )
}

export function CommentText<D extends CommentDoc>({
    content,
    names,
    personFor,
    docFor,
    onOpenDocument,
}: {
    content: string
    /** Every name a mention may be written with, to find mentions anywhere in the text. */
    names: string[]
    personFor?: (name: string) => CommentPerson | undefined
    docFor: (docId: string) => D | undefined
    onOpenDocument?: (doc: D) => void
}) {
    return (
        <>
            {splitMentions(content, names).map((t, i) => {
                if (t.type === 'mention') return <MentionPill key={i} text={t.value} person={personFor?.(t.value.replace(/^@/, ''))} />
                return (
                    <span key={i}>
                        {splitDocTags(t.value).map((d, j) => {
                            if (d.type !== 'doc') return <span key={j}>{d.value}</span>
                            const doc = docFor(d.docId)
                            return <DocTagChip key={j} docId={d.docId} doc={doc} onOpen={doc && onOpenDocument ? () => onOpenDocument(doc) : undefined} />
                        })}
                    </span>
                )
            })}
        </>
    )
}
