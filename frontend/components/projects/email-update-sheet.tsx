'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Mail, RefreshCw, Send } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Brio } from '@/components/ui/brio'
import { useToast } from '@/components/ui/toast'
import { failureReason } from '@/lib/files/action-failure'
import { hasRisks, missingLeadSections, splitSections } from '@/lib/ai/summary-sections'
import { updateSendText, type UpdateRecipientsInfo } from '@/lib/updates/update-send'
import { formatFullDate } from '@/lib/utils'
import { UpdateEmailFields, sendLine, sendPublishedUpdate, useUpdateEmail } from './update-email-fields'
import { MissingSectionsWarning, sectionInSentence } from './summary-draft-review'

/**
 * Email this update (.claude/plans/publish-and-send-update.md): the published update, as it is, to
 * everyone on the engagement and any address typed in, with your note and, if you like, the
 * Overview as a PDF. No Brio call and no credit. Before Send: whether the update is out of date, and
 * whether the lead's sections are missing, each with the way to fix it.
 *
 * Opened from the Latest update's mail icon, and from the Overview's Email with the PDF ticked.
 */
export function EmailUpdateSheet({
    open,
    onOpenChange,
    projectId,
    summary,
    publishedAt,
    stale,
    onRewrite,
    onAddSections,
    capturePdf,
    pdfByDefault = false,
    demo,
    onSent,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    projectId: string
    /** The published update. */
    summary: string
    publishedAt: string | null
    /** The engagement has changed since it was published. */
    stale: boolean
    /** Rewrite with Brio (the sheet closes first). */
    onRewrite?: () => void
    /** Open the editor with the lead's sections to fill in (the sheet closes first). */
    onAddSections?: () => void
    /** The Overview as a PDF, base64. Absent where it can't be captured (the /tour). */
    capturePdf?: () => Promise<string>
    pdfByDefault?: boolean
    /** The /tour: canned recipients, and nothing is sent. */
    demo?: UpdateRecipientsInfo
    onSent?: () => void
}) {
    const { addToast } = useToast()
    const state = useUpdateEmail({ projectId, active: open, demo, pdfByDefault })
    const [sending, setSending] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Each opening starts from everyone, no addresses, no note, and the PDF as the opener asked.
    useEffect(() => {
        if (!open) return
        state.reset()
        state.setWithPdf(!!capturePdf && pdfByDefault)
        setError(null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, pdfByDefault])

    const missing = missingLeadSections(summary)
    const sections = splitSections(summary)
    const first = sections[0]
    const rest = sections.slice(1).map((s) => s.heading).filter((h): h is string => !!h).map(sectionInSentence)
    const warned = stale || missing.length > 0
    const canSend = !sending && !!state.info && state.count > 0

    const send = async () => {
        if (!canSend) return
        setSending(true)
        setError(null)
        try {
            let pdf: string | null = null
            if (state.withPdf && capturePdf) {
                try {
                    pdf = await capturePdf()
                } catch {
                    setError("Couldn't create the PDF. Send it without one, or try again.")
                    return
                }
            }
            const outcome = demo
                ? { sent: state.count, total: state.count, failed: [] }
                : await sendPublishedUpdate(projectId, state, pdf)
            const said = updateSendText(outcome)
            addToast(said)
            if (said.type === 'error') {
                setError(said.message)
                return
            }
            onSent?.()
            onOpenChange(false)
        } catch (e) {
            setError(failureReason(e))
        } finally {
            setSending(false)
        }
    }

    const close = (then?: () => void) => {
        onOpenChange(false)
        then?.()
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]">
                <div className="flex items-center gap-2 border-b border-line px-4 pb-3 pt-4">
                    <Mail className="h-4 w-4 text-fg-muted" aria-hidden />
                    <SheetTitle className="text-h3 text-fg">Email this update</SheetTitle>
                </div>
                <SheetDescription className="sr-only">
                    Emails the published update to the people you choose. Nothing is sent until you press Send.
                </SheetDescription>

                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
                    <UpdateEmailFields state={state} pdf={!!capturePdf} />

                    <div className="flex flex-col gap-1.5">
                        <span className="text-caption text-fg-muted">What they get</span>
                        <div className="flex flex-col gap-2 rounded-card border border-line px-3.5 py-3">
                            {publishedAt && <span className="text-caption text-fg-subtle">The update published {formatFullDate(publishedAt)}, whole</span>}
                            {first && (
                                <div>
                                    {first.heading && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{first.heading}</p>}
                                    <p className="line-clamp-4 text-small leading-relaxed text-fg">{first.body}</p>
                                </div>
                            )}
                            {rest.length > 0 && (
                                <span className="text-caption text-fg-muted">
                                    Then {rest.length === 1 ? rest[0] : `${rest.slice(0, -1).join(', ')} and ${rest[rest.length - 1]}`}, in full.
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-2.5 border-t border-line px-4 py-3">
                    {stale && (
                        <div role="note" className="flex items-start gap-2 rounded-control bg-tag-yellow-bg px-3 py-2 text-caption text-tag-yellow-fg">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span className="flex-1">
                                <span className="font-semibold">Out of date.</span> The engagement has changed since this was published{publishedAt ? ` on ${formatFullDate(publishedAt)}` : ''}.
                            </span>
                            {onRewrite && (
                                <button type="button" onClick={() => close(onRewrite)} className="shrink-0 font-semibold underline underline-offset-2 hover:opacity-80">
                                    Rewrite with <Brio />
                                </button>
                            )}
                        </div>
                    )}
                    <MissingSectionsWarning
                        missing={missing}
                        risks={hasRisks(summary)}
                        action={onAddSections ? (
                            <button type="button" onClick={() => close(onAddSections)} className="shrink-0 font-semibold underline underline-offset-2 hover:opacity-80">
                                Add {missing.length === 1 ? 'it' : 'them'}
                            </button>
                        ) : undefined}
                    />
                    <p className="text-caption text-fg-muted">
                        {sendLine(state)}{state.count > 0 && <> No <Brio /> call, no credit.</>}
                    </p>
                    {error && <p className="text-small text-danger" role="alert">{error}</p>}
                    <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
                        <Button size="sm" onClick={send} disabled={!canSend}>
                            {sending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" aria-hidden />}
                            {sending
                                ? (state.withPdf ? 'Sending with the PDF…' : 'Sending…')
                                : `Send${warned ? ' anyway' : ''} to ${state.count}`}
                        </Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
