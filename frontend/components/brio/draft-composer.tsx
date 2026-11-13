'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Loader2, Square, X } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ASSISTANT_POLICY } from '@/lib/ai/assistant'
import { failureReason } from '@/lib/files/action-failure'
import type { ActionResult } from '@/lib/actions/action-result'
import { useBrioDraft } from './use-brio-draft'
import { BrioDraftLabel } from './brio-draft-label'

/** Square-bracketed spots a draft leaves for the sender, like "[Add next steps]". */
export const DRAFT_PLACEHOLDER = /\[[^\]\n]{1,80}\]/g

export function countPlaceholders(text: string): number {
    return (text.match(DRAFT_PLACEHOLDER) ?? []).length
}

export interface ComposerRecipient {
    userId: string
    name: string
    role: string
}

/**
 * The side sheet for a message Brio drafts and a person sends: recipients, what the draft was
 * written from, the draft itself (editable from the first keystroke), and Send.
 *
 * Shared by the client status update and nudges so both read the same: who wrote it, that nothing
 * has gone anywhere yet, and how many [bracketed] spots are left to fill. Send stays disabled while
 * any are, since the server refuses them too.
 */
export function DraftComposer({
    open,
    onOpenChange,
    title,
    recipients,
    removableRecipients = true,
    context,
    draftUrl,
    draftBody,
    sendLabel,
    sentNote,
    footerNote = ASSISTANT_POLICY.reviewGate,
    onSend,
    onSent,
    staticDraft,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    recipients: ComposerRecipient[]
    /** Status updates let the Lead drop someone; a nudge goes to the one person it is about. */
    removableRecipients?: boolean
    /** What the draft was written from, shown above it. */
    context?: React.ReactNode
    /** POST route streaming the draft (lib/ai/stream-draft.ts). Started when the sheet opens. */
    draftUrl: string
    draftBody?: unknown
    sendLabel: string
    /** Under the draft: where it goes when sent ("Posts as a comment on QSR-9, which also emails Dana."). */
    sentNote?: React.ReactNode
    footerNote?: React.ReactNode
    onSend: (text: string, recipientIds: string[]) => Promise<ActionResult<unknown>>
    onSent?: () => void
    /**
     * The /tour's canned draft: shown as written, with no request and no credit. Rewrite shows it
     * again. The real app never passes it.
     */
    staticDraft?: string
}) {
    const textareaId = useId()
    const draft = useBrioDraft()
    const [chosen, setChosen] = useState<string[]>([])
    const [sending, setSending] = useState(false)
    const [sendError, setSendError] = useState<string | null>(null)
    const startedRef = useRef(false)

    // Everyone is chosen when the sheet opens; a draft is started once per opening.
    useEffect(() => {
        if (!open) {
            startedRef.current = false
            return
        }
        setChosen(recipients.map((r) => r.userId))
        setSendError(null)
        if (!startedRef.current) {
            startedRef.current = true
            if (staticDraft !== undefined) draft.setText(staticDraft)
            else void draft.start(draftUrl, draftBody)
        }
        // draft.start is stable; recipients are read on open only, on purpose.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, draftUrl])

    const placeholders = useMemo(() => countPlaceholders(draft.text), [draft.text])
    const streaming = draft.status === 'streaming'
    const canSend = !streaming && !sending && draft.text.trim().length > 0 && placeholders === 0 && chosen.length > 0

    const send = async () => {
        if (!canSend) return
        setSending(true)
        setSendError(null)
        try {
            const result = await onSend(draft.text.trim(), chosen)
            if (!result.ok) {
                setSendError(result.error)
                return
            }
            onSent?.()
            onOpenChange(false)
            draft.reset()
        } catch (e) {
            setSendError(failureReason(e))
        } finally {
            setSending(false)
        }
    }

    const visible = recipients.filter((r) => chosen.includes(r.userId))

    return (
        <Sheet open={open} onOpenChange={(next) => { if (!next) draft.stop(); onOpenChange(next) }}>
            <SheetContent side="right" className="flex w-full flex-col sm:max-w-[480px]">
                <div className="flex items-center gap-2 border-b border-line px-4 pb-3 pt-4">
                    <SheetTitle className="text-h3 text-fg">{title}</SheetTitle>
                </div>
                <SheetDescription className="sr-only">
                    A draft written by Brio for you to edit. Nothing is sent until you press {sendLabel}.
                </SheetDescription>

                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
                    <div>
                        <div className="mb-1.5 text-caption text-fg-muted">To</div>
                        {visible.length === 0 ? (
                            <p className="text-small text-fg-muted">
                                {recipients.length === 0
                                    ? 'No Reviewers or Limited Access contributors on this engagement yet.'
                                    : 'Choose at least one person.'}
                            </p>
                        ) : (
                            <ul className="flex flex-wrap gap-1.5" aria-label="Recipients">
                                {visible.map((r) => (
                                    <li key={r.userId} className="inline-flex h-6 items-center gap-1 rounded-control bg-surface-muted pl-2 pr-1 text-small text-fg">
                                        <span>{r.name} · {r.role}</span>
                                        {removableRecipients && (
                                            <button
                                                type="button"
                                                onClick={() => setChosen((c) => c.filter((id) => id !== r.userId))}
                                                className="inline-flex h-5 w-5 items-center justify-center rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg"
                                                aria-label={`Remove ${r.name}`}
                                            >
                                                <X className="h-3.5 w-3.5" aria-hidden />
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {removableRecipients && visible.length < recipients.length && (
                            <button
                                type="button"
                                className="mt-1.5 text-caption text-fg-muted underline-offset-2 hover:text-fg hover:underline"
                                onClick={() => setChosen(recipients.map((r) => r.userId))}
                            >
                                Add everyone back
                            </button>
                        )}
                    </div>

                    {context}

                    <div className="flex flex-col gap-1.5">
                        <BrioDraftLabel htmlFor={textareaId} />
                        <textarea
                            id={textareaId}
                            value={draft.text}
                            onChange={(e) => draft.setText(e.target.value)}
                            readOnly={streaming}
                            rows={10}
                            placeholder={streaming ? '' : 'Write the message'}
                            className="min-h-[220px] w-full resize-y rounded-control border border-line-strong bg-surface px-3 py-2.5 text-ui leading-[22px] text-fg outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                        />
                        <div className="flex min-h-[18px] items-center gap-2 text-small" aria-live="polite">
                            {streaming && (
                                <span className="inline-flex items-center gap-1.5 text-fg-muted">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Writing
                                </span>
                            )}
                            {!streaming && placeholders > 0 && (
                                <span className="text-fg-muted">
                                    {placeholders === 1 ? '1 spot to fill' : `${placeholders} spots to fill`} in [brackets] before sending
                                </span>
                            )}
                            {draft.error && <span className="text-danger">{draft.error}</span>}
                        </div>
                        {sentNote && <p className="text-small text-fg-muted">{sentNote}</p>}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
                    <span className="text-caption font-normal text-fg-muted">{footerNote}</span>
                    <span className="flex-1" />
                    {sendError && <span className="w-full text-small text-danger" role="alert">{sendError}</span>}
                    {streaming ? (
                        <Button variant="ghost" size="sm" onClick={draft.stop}>
                            <Square className="h-3 w-3 fill-current" aria-hidden /> Stop
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => (staticDraft !== undefined ? draft.setText(staticDraft) : void draft.start(draftUrl, draftBody))}
                            disabled={sending}
                        >
                            Rewrite
                        </Button>
                    )}
                    <Button size="sm" onClick={send} disabled={!canSend}>
                        {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                        {sendLabel}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
