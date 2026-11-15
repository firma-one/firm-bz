'use client'

import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Hourglass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { DraftComposer, type ComposerRecipient } from '@/components/brio/draft-composer'
import { BRIO_GREEN } from '@/lib/ai/assistant'
import { failureFrom, failureReason } from '@/lib/files/action-failure'
import { formatFullDate } from '@/lib/utils'
import type { DeliverableProgress } from '@/lib/insights/engagement-insights'
import { daysAgoWords, nudgeCandidates, nudgeRowState, type NudgeCandidate, type NudgeRowState, type NudgeStatus } from '@/lib/ai/nudge-draft'
import { getNudgeRecipients, getNudgeStatuses } from '@/lib/actions/status-update'
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
 * After a nudge, the row says who was nudged and when instead of offering another, from the moment
 * it is sent. Another is offered NUDGE_AGAIN_DAYS later if they haven't responded; once they reply
 * on the deliverable or tick the nudge off in their Inbox, the row says so and offers none.
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
    // Each row's last nudge and what came of it (lib/ai/nudge-status.ts); a nudge sent here is added
    // as soon as it is sent.
    const [statuses, setStatuses] = useState<Map<string, NudgeStatus>>(() => new Map())
    const candidateIds = candidates.map((c) => c.deliverableId).join(',')
    useEffect(() => {
        if (demo || !candidateIds) return
        let cancelled = false
        getNudgeStatuses(projectId, candidateIds.split(','))
            .then((r) => {
                if (cancelled || !r.ok) return
                setStatuses((prev) => {
                    const next = new Map(r.data.map((s) => [s.deliverableId, s] as const))
                    // A nudge sent while this was loading wins over what was read before it.
                    prev.forEach((s, id) => { if (!next.has(id) || next.get(id)!.nudgedAt < s.nudgedAt) next.set(id, s) })
                    return next
                })
            })
            .catch(() => { /* the rows still offer a nudge; this only quiets them */ })
        return () => { cancelled = true }
    }, [projectId, candidateIds, demo])

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
                        <NudgeAction
                            state={nudgeRowState(statuses.get(c.deliverableId))}
                            discussionHref={engagementBase ? `${engagementBase}/comments#doc-comment:${c.deliverableId}` : undefined}
                            onNudge={() => void open(c)}
                        />
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
                    onSent={() => {
                        // The row says so at once: no second nudge while this one is fresh.
                        setStatuses((prev) => new Map(prev).set(active.deliverableId, {
                            deliverableId: active.deliverableId,
                            nudgedAt: new Date().toISOString(),
                            recipientId: chosen.userId,
                            recipientName: chosen.name,
                            repliedAt: null,
                            doneAt: null,
                        }))
                        addToast({ type: 'success', title: 'Nudge sent', message: `Posted on ${refOf(active)}.` })
                    }}
                />
            )}
        </section>
    )
}

/**
 * The row's right-hand side: Draft a nudge, or what the last nudge came to. Quiet text when there is
 * nothing to do; the button only when a nudge is due.
 */
function NudgeAction({ state, discussionHref, onNudge }: {
    state: NudgeRowState
    discussionHref?: string
    onNudge: () => void
}) {
    const button = (label: string) => (
        <Button variant="outline" size="sm" onClick={onNudge}>
            <Sparkles className="h-3.5 w-3.5" style={{ color: BRIO_GREEN }} aria-hidden />
            {label}
        </Button>
    )
    switch (state.kind) {
        case 'due':
            return button('Draft a nudge')
        case 'nudged':
            return <span className="text-small text-fg-muted">Nudged {state.name} {daysAgoWords(state.at)}</span>
        case 'again':
            return (
                <span className="inline-flex items-center gap-3">
                    <span className="text-small text-fg-muted">Nudged {state.name} {daysAgoWords(state.at)}</span>
                    {button('Nudge again')}
                </span>
            )
        case 'replied': {
            const words = `${state.name} replied ${daysAgoWords(state.at)}`
            return discussionHref
                ? <a href={discussionHref} className="text-small text-fg-muted underline-offset-2 hover:text-fg hover:underline">{words}</a>
                : <span className="text-small text-fg-muted">{words}</span>
        }
        case 'done':
            return <span className="text-small text-fg-muted">{state.name} marked the nudge done {daysAgoWords(state.at)}</span>
    }
}
