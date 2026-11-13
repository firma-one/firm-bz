'use client'

import { useMemo, useState } from 'react'
import { Sparkles, Hourglass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { DraftComposer, type ComposerRecipient } from '@/components/brio/draft-composer'
import { BRIO_GREEN } from '@/lib/ai/assistant'
import { failureFrom, failureReason } from '@/lib/files/action-failure'
import { formatFullDate } from '@/lib/utils'
import type { DeliverableProgress } from '@/lib/insights/engagement-insights'
import { nudgeCandidates, type NudgeCandidate } from '@/lib/ai/nudge-draft'
import { getNudgeRecipients } from '@/lib/actions/status-update'
import type { ActionResult } from '@/lib/actions/action-result'

function refOf(c: Pick<NudgeCandidate, 'docId' | 'name'>): string {
    return c.docId ? `${c.docId} · ${c.name}` : c.name
}

/**
 * "Waiting on Reviewers" under the Action Center (.claude/plans/brio-features-round-2.md, §3.7):
 * deliverables in review for NUDGE_MIN_DAYS days or more, each with "Draft a
 * nudge". Brio drafts a short check-in to one Reviewer or Limited Access contributor; the Lead edits
 * it and sends it as a comment on the deliverable, which also reminds that person.
 *
 * Leads only; the caller decides. Renders nothing when nothing is waiting.
 */
export function WaitingOnClient({
    projectId,
    deliverables,
    engagementBase,
    demo,
}: {
    projectId: string
    deliverables: DeliverableProgress[]
    engagementBase: string
    /** The /tour: canned people and drafts; no requests, nothing sent. */
    demo?: { recipients: ComposerRecipient[]; draft: (c: NudgeCandidate, firstName: string) => string }
}) {
    const { addToast } = useToast()
    const candidates = useMemo(() => nudgeCandidates(deliverables), [deliverables])
    const [active, setActive] = useState<NudgeCandidate | null>(null)
    const [recipients, setRecipients] = useState<ComposerRecipient[] | null>(null)
    const [recipientId, setRecipientId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    if (candidates.length === 0) return null

    const open = async (c: NudgeCandidate) => {
        setError(null)
        let list = demo ? demo.recipients : recipients
        if (!list) {
            const r = await getNudgeRecipients(projectId).catch(() => null)
            if (!r || !r.ok) {
                setError(r && !r.ok ? r.error : "Couldn't open the nudge. Try again.")
                return
            }
            list = r.data
            setRecipients(list)
        }
        if (demo) setRecipients(list)
        if (list.length === 0) {
            setError('Add a Reviewer to this engagement before nudging anyone.')
            return
        }
        setRecipientId(list[0].userId)
        setActive(c)
    }

    const send = async (text: string, ids: string[]): Promise<ActionResult<unknown>> => {
        if (!active) return { ok: false, error: 'Choose a deliverable to nudge about.' }
        if (demo) return { ok: true, data: null }
        try {
            // A comment on the deliverable, with a reminder for the person nudged: it lands in the
            // thread the client already reads, and in their Inbox.
            const res = await fetch(`/api/projects/${projectId}/documents/${active.deliverableId}/doc-comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: text, isReminder: true, recipientId: ids[0] }),
            })
            if (!res.ok) throw await failureFrom(res)
            const out = await res.json().catch(() => ({})) as { warning?: string }
            return { ok: true, data: null, ...(out.warning ? { warning: out.warning } : {}) }
        } catch (e) {
            return { ok: false, error: failureReason(e) }
        }
    }

    const chosen = recipients?.find((r) => r.userId === recipientId) ?? null

    return (
        <section aria-labelledby="waiting-on-client-h" className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <Hourglass className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
                <h3 id="waiting-on-client-h" className="text-small font-medium text-fg-muted">Waiting on Reviewers</h3>
            </div>
            <ul className="overflow-hidden rounded-card border border-line">
                {candidates.map((c) => (
                    <li key={c.deliverableId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line px-3 py-2 first:border-t-0">
                        <span className="inline-flex h-5 shrink-0 items-center rounded-control bg-[var(--ui-status-waiting-bg)] px-1.5 text-caption text-[var(--ui-status-waiting-fg)]">
                            In review · {c.daysWaiting} days
                        </span>
                        <a
                            href={engagementBase ? `${engagementBase}/shares/board#doc-file:${c.deliverableId}` : undefined}
                            className="min-w-0 flex-1 truncate text-ui text-fg hover:underline"
                        >
                            {refOf(c)}
                        </a>
                        {c.dueDate && <span className="text-small text-fg-muted">due {formatFullDate(c.dueDate)}</span>}
                        <Button variant="outline" size="sm" onClick={() => void open(c)}>
                            <Sparkles className="h-3.5 w-3.5" style={{ color: BRIO_GREEN }} aria-hidden />
                            Draft a nudge
                        </Button>
                    </li>
                ))}
            </ul>
            {error && <p className="text-small text-danger" role="alert">{error}</p>}

            {active && chosen && (
                <DraftComposer
                    // A new person means a new draft: it greets them by name.
                    key={`${active.deliverableId}:${chosen.userId}`}
                    open={!!active}
                    onOpenChange={(o) => { if (!o) setActive(null) }}
                    title={`Nudge about ${active.docId ?? active.name}`}
                    recipients={[chosen]}
                    removableRecipients={false}
                    context={recipients && recipients.length > 1 ? (
                        <label className="flex items-center gap-2 text-small text-fg-muted">
                            <span>Nudge</span>
                            <select
                                value={chosen.userId}
                                onChange={(e) => setRecipientId(e.target.value)}
                                className="h-7 rounded-control border border-line-strong bg-surface px-2 text-small text-fg"
                            >
                                {recipients.map((r) => (
                                    <option key={r.userId} value={r.userId}>{r.name} · {r.role}</option>
                                ))}
                            </select>
                        </label>
                    ) : null}
                    draftUrl={`/api/projects/${projectId}/documents/${active.deliverableId}/ai-nudge-draft`}
                    draftBody={{ recipientUserId: chosen.userId }}
                    sendLabel="Send nudge"
                    staticDraft={demo ? demo.draft(active, chosen.name.split(/\s+/)[0]) : undefined}
                    sentNote={`Posts as a comment on ${active.docId ?? `"${active.name}"`} and reminds ${chosen.name.split(/\s+/)[0]}.`}
                    onSend={send}
                    onSent={() => addToast({ type: 'success', title: 'Nudge sent', message: `Posted on ${refOf(active)}.` })}
                />
            )}
        </section>
    )
}
