'use client'

import { useCallback, useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { DraftComposer, type ComposerRecipient } from '@/components/brio/draft-composer'
import { BRIO_GREEN } from '@/lib/ai/assistant'
import { formatFullDate } from '@/lib/utils'
import {
    getLastStatusUpdate,
    getStatusUpdateComposer,
    sendStatusUpdate,
    type StatusUpdateComposer,
} from '@/lib/actions/status-update'

/**
 * "Draft an update" on the summary card (.claude/plans/brio-features-round-2.md, §3.1): Brio drafts
 * a status update to the engagement's Reviewers and Limited Access contributors from the approved summary and what changed since the last one;
 * the Lead edits it and sends it. Leads only; the caller decides whether to render it.
 */
export function StatusUpdateAction({ projectId, firmName, demo }: {
    projectId: string
    firmName?: string
    /** The /tour: canned recipients, changes and draft; no requests, nothing sent. */
    demo?: { composer: StatusUpdateComposer; draft: string }
}) {
    const { addToast } = useToast()
    const [open, setOpen] = useState(false)
    const [composer, setComposer] = useState<StatusUpdateComposer | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [lastSentAt, setLastSentAt] = useState<string | null>(null)

    useEffect(() => {
        if (demo) return
        let cancelled = false
        getLastStatusUpdate(projectId).then((r) => {
            if (!cancelled && r.ok) setLastSentAt(r.data?.sentAt ?? null)
        }).catch(() => { /* the "last sent" hint is a nicety; the button still works */ })
        return () => { cancelled = true }
    }, [projectId, demo])

    const openComposer = useCallback(async () => {
        setLoadError(null)
        if (demo) {
            setComposer(demo.composer)
            setOpen(true)
            return
        }
        const r = await getStatusUpdateComposer(projectId).catch(() => null)
        if (!r || !r.ok) {
            setLoadError(r && !r.ok ? r.error : "Couldn't open the update. Try again.")
            return
        }
        setComposer(r.data)
        setOpen(true)
    }, [projectId, demo])

    const recipients: ComposerRecipient[] = composer?.recipients ?? []
    const sinceLabel = composer
        ? `${composer.sinceIsLastUpdate ? 'Since your last update' : 'Since work started'} · ${formatFullDate(composer.since)}`
        : ''

    return (
        <>
            <div className="flex flex-col items-end gap-0.5">
                <Button variant="outline" size="sm" onClick={openComposer} title={lastSentAt ? `Last update sent ${formatFullDate(lastSentAt)}` : 'No update sent yet'}>
                    <Sparkles className="h-3.5 w-3.5" style={{ color: BRIO_GREEN }} aria-hidden />
                    Draft an update
                </Button>
                {loadError && <span className="text-caption font-normal text-danger" role="alert">{loadError}</span>}
            </div>
            {composer && (
                <DraftComposer
                    open={open}
                    onOpenChange={setOpen}
                    title={firmName ? `Update from ${firmName}` : 'Status update'}
                    recipients={recipients}
                    draftUrl={`/api/projects/${projectId}/ai-status-update`}
                    sendLabel="Send update"
                    context={(
                        <div>
                            <div className="mb-1.5 text-caption text-fg-muted">{sinceLabel}</div>
                            {composer.changes.length === 0 ? (
                                <p className="text-small text-fg-muted">Nothing new recorded. Brio writes from the published summary.</p>
                            ) : (
                                <ul className="flex flex-col gap-1 text-small text-fg">
                                    {composer.changes.map((c, i) => (
                                        <li key={i} className="flex gap-2">
                                            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ui-status-not-started-bar)]" aria-hidden />
                                            <span>{c.text}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                    sentNote="Sent by email and to their Inbox, from you."
                    staticDraft={demo?.draft}
                    onSend={(text, ids) => (demo ? Promise.resolve({ ok: true as const, data: null }) : sendStatusUpdate(projectId, text, ids))}
                    onSent={() => {
                        setLastSentAt(new Date().toISOString())
                        addToast({ type: 'success', title: 'Update sent', message: `Sent to ${recipients.length === 1 ? recipients[0].name : `${recipients.length} people`}.` })
                    }}
                />
            )}
        </>
    )
}
