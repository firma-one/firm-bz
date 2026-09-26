import { createHash } from 'crypto'
import type { EngagementInsightsResponse } from '@/lib/insights/engagement-insights'
import { completeText } from './client'
import { buildEngagementContext } from './engagement-chat'

/**
 * Approval state of a generated summary draft.
 * - `pending_review`: generated, never seen by a human. MUST NOT reach exports or clients.
 * - `approved`: an Engagement Lead published it, verbatim or edited. Safe to export.
 * - `dismissed`: a lead rejected it. Not exported, not re-shown.
 */
export type InsightsSummaryStatus = 'pending_review' | 'approved' | 'dismissed'

/**
 * A pending revision. Only a draft whose status is `approved` has its text promoted to the
 * parent's `text`, which is the client-facing field included in PDF/email exports. Generation
 * only ever writes `pending_review` — it cannot publish.
 */
export interface InsightsSummaryDraft {
    text: string
    generatedAt: string
    status: InsightsSummaryStatus
    /** Fingerprint of the data this was generated from — lets a repeat Generate skip the model call. */
    fingerprint: string
    /** Set when a lead acts on the draft. */
    reviewedAt?: string | null
    reviewedByUserId?: string | null
    /** True when the lead changed the text before publishing. */
    editedByReviewer?: boolean
}

/**
 * `engagement.settings.insightsSummary` — the published summary plus its pending revision.
 *
 * `text` is the only client-facing part: shown to all members and captured into PDF/email
 * exports. It is written exclusively by a lead approving a draft or typing one by hand.
 * `draft` is internal until approved.
 */
export interface InsightsSummary {
    /** Published, client-facing text. Null when nothing has been published yet. */
    text: string | null
    publishedAt: string | null
    publishedByUserId?: string | null
    /**
     * Fingerprint of the data `text` described. Compared against the current fingerprint to
     * flag a stale summary. Null for hand-written text, which describes no snapshot.
     */
    fingerprint: string | null
    source: 'ai' | 'manual' | null
    draft?: InsightsSummaryDraft | null
}

/** Reads the nested summary object off an engagement's settings JSON. */
export function readInsightsSummary(
    settings: Record<string, unknown> | null | undefined,
): InsightsSummary {
    const raw = settings?.insightsSummary as Partial<InsightsSummary> | undefined
    return {
        text: raw?.text ?? null,
        publishedAt: raw?.publishedAt ?? null,
        publishedByUserId: raw?.publishedByUserId ?? null,
        fingerprint: raw?.fingerprint ?? null,
        source: raw?.source ?? null,
        draft: raw?.draft ?? null,
    }
}

/** The single gate: only approved text may be exported or shown to a client. */
export function isApprovedForExport(draft: InsightsSummaryDraft | null | undefined): boolean {
    return draft?.status === 'approved'
}

/**
 * Fingerprint of the delivery state a summary describes. Regenerating when this is unchanged
 * would produce the same text, so the Generate action skips the model call instead, and a
 * published summary is only flagged stale when this differs from the one captured at publish.
 *
 * THE RULE, when adding fields: hash what a PERSON changed, never what the CLOCK changed.
 * Anything derived from `Date.now()` drifts on its own and will flag every summary stale
 * overnight — that bug shipped once already.
 *
 * A field that mixes both is DECOMPOSED rather than dropped: hash its stable core, ignore its
 * derived wrapper. `pace` contributes `deliveredPct` (moves when work is approved) but not
 * `timePct` (moves daily). `documentsDueSoon` contributes each document's id and due date, but
 * not `daysUntil`. Still fully excluded, because nothing in them is stable: `sensitiveFiles` and
 * `pendingInvitations` (daysUntil), `storageHealth` (monthsStale), and any `isOverdue` flag.
 *
 * Only inputs a PERSON can change belong here. Anything derived from the current clock —
 * healthScore (which folds in a "behind pace" penalty computed from elapsed time), pace.timePct,
 * and isOverdue — drifts on its own, which would mark every summary stale simply because a day
 * passed. Those are deliberately excluded.
 *
 * Also excludes volatile fields the summary never mentions (file sizes, folder counts).
 */
export function fingerprintInsights(data: EngagementInsightsResponse): string {
    const parts = [
        data.engagementDueDate ?? '',
        data.kickoffDate ?? '',
        data.deliveryHealth?.approvedCount ?? '',
        data.deliveryHealth?.totalCount ?? '',
        data.sharesProgress?.toDo ?? '',
        data.sharesProgress?.inProgress ?? '',
        data.sharesProgress?.approved ?? '',
        data.sharesProgress?.finalized ?? '',
        data.commentThreads?.unanswered ?? '',
        data.commentThreads?.total ?? '',
        data.planningHygiene?.deliverableWithDueDate ?? '',
        data.planningHygiene?.docWithDueDate ?? '',
        data.planningHygiene?.docWithAssignee ?? '',
        data.firstTimeRight?.firstTime ?? '',
        data.firstTimeRight?.reworked ?? '',
        data.memberCount ?? '',
        data.healthScore?.score ?? '',
        data.approvalCycle?.approvedCount ?? '',
        data.approvalCycle?.deliverableCount ?? '',
        data.folderHealth?.score ?? '',
        data.folderHealth?.totalFiles ?? '',
        data.sharedDocsCount ?? '',
        data.pendingApprovalSharesCount ?? '',
        // Team composition, not just headcount — a member changing role is a real change.
        ...Object.entries(data.membersByRole ?? {}).sort().map(([r, n]) => `${r}:${n}`),
        // Which documents have unanswered client comments, not just how many.
        ...(data.unansweredThreads ?? []).map((t: { documentId?: string }) => `u:${t.documentId ?? ''}`).sort(),
        // Every threaded document and its message count, so a reply — or a thread opened on a new
        // document — marks the summary stale. Hashing only the unanswered ids missed both.
        ...((data.commentThreads?.documents ?? []) as Array<{ documentId: string; messageCount: number; followUpReasons?: string[] }>)
            .map((d) => `t:${d.documentId}:${d.messageCount}:${(d.followUpReasons ?? []).slice().sort().join(',')}`)
            .sort(),
        // Rework per deliverable — a summary that mentions revisions should notice a new round.
        ...(data.revisionMetrics ?? []).map((r: { documentId: string; revisions: number }) => `r:${r.documentId}:${r.revisions}`).sort(),
        // Stage and due date per deliverable — what a lead actually changes. isOverdue is omitted
        // because it flips on its own when a due date passes.
        ...(data.deliverables ?? []).map((d) => `${d.id}:${d.stage}:${d.dueDate ?? ''}`),
        // pace and documentsDueSoon are strong signals, so rather than excluding them wholesale
        // they are DECOMPOSED: the part a person sets is hashed, the part the clock computes is
        // not. deliveredPct moves only when work is approved; timePct moves every day, so it is
        // dropped. Same for the due-date list — the dates are hashed, `daysUntil` is not.
        `delivered:${data.pace?.deliveredPct ?? ''}`,
        ...(data.documentsDueSoon ?? [])
            .map((d: { documentId: string; dueDate: string }) => `due:${d.documentId}:${d.dueDate}`)
            .sort(),
    ]
    return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32)
}

export function isDraftFromToday(draft: InsightsSummaryDraft | null | undefined): boolean {
    if (!draft?.generatedAt) return false
    return draft.generatedAt.slice(0, 10) === new Date().toISOString().slice(0, 10)
}

export { SUMMARY_SECTIONS, LEAD_PLACEHOLDER, findUnfilledSections } from './summary-sections'
import { LEAD_PLACEHOLDER } from './summary-sections'

export const SUMMARY_SYSTEM_PROMPT = `You are writing the standing status summary for one engagement at a professional services firm.

This text is reviewed by the engagement lead and, once approved, is shown to everyone on the engagement including the client, and appears in exported PDF reports. Write accordingly.

Produce EXACTLY these seven sections, each on its own line as a markdown heading, in this order:

## Summary
## Progress
## Collaboration
## Risks
## Mitigation & Contingency
## Needs Attention
## Next Steps

Rules for the sections you write — Summary, Progress, Collaboration, Risks, Needs Attention:
- 1-3 sentences each, plain prose. No bullet points, no nested headings.
- Summary: where the engagement stands overall.
- Progress: what is complete and what is in flight, with counts.
- Collaboration: how the two sides are communicating. Give the overall counts, then NAME only the
  threads that need something — those awaiting a reply from the firm, or marked urgent. Lead with
  the reference the snapshot gives ("QSR-17 — Sales Playbooks"): it points at the deliverable, so
  the reader can find the document beneath it. A thread also needs attention when a reaction leaves
  it open — marked urgent, someone looking into it, or a yes/no/ok/+1 decision that still has to be
  acted on. Do NOT list threads that are answered and unflagged;
  the counts already cover them. If nothing needs a reply, say so in one sentence and name nothing.
  You are given counts, references and document names ONLY, never the text of a comment, so
  describe the state of the conversation and never characterise what anyone said or what they want.
- Risks: only risks visible in the data (overdue work, unassigned deliverables, unanswered client
  comments, missing dates, pace gaps). State the risk. Do NOT propose how to address it. Do not
  repeat Collaboration verbatim — mention threads here only where the delay itself is the risk.
- Needs Attention: what the reader must act on now. If nothing does, write "Nothing requires
  immediate attention." — never leave it blank.
- Whenever you name a deliverable or document, lead with the reference the snapshot gives it
  ("QSR-9 — Market & Competitive Intelligence Report"). The reference is how a reader finds the
  artefact; a name alone makes them hunt for it. If an item has no reference, use its name alone —
  never invent one.
- Be specific with counts and dates. Never invent a number, name, or date not in the snapshot.
- Professional and neutral. Not a pitch, not a warning.
- Never comment on an individual's performance, and never name a team member.
- Do not speculate about causes you cannot see. Report the state, not the reason.
- Do not address the reader as "you" and do not open with a greeting.

Rules for Mitigation & Contingency and Next Steps:
- These are reserved for the engagement lead. They commit the firm to a course of action, and that
  decision belongs to the person accountable for it — not to you, and not to a plausible guess.
- Write EXACTLY this line under each of those two headings, and nothing else:
${LEAD_PLACEHOLDER}

If a section genuinely has nothing to report, say so in one short sentence rather than leaving it
empty — an empty section reads as an oversight.`



export async function generateEngagementSummary(
    data: EngagementInsightsResponse,
    meta: { clientName?: string; engagementName?: string },
): Promise<string | null> {
    return completeText({
        system: SUMMARY_SYSTEM_PROMPT,
        userMessage: `Engagement snapshot:\n${buildEngagementContext(data, meta)}`,
        maxTokens: 700,
        temperature: 0.3,
        label: 'engagement-summary',
    })
}
