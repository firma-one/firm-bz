import type { FirmInsightsResponse } from '@/app/api/firms/[firmId]/insights/route'
import { completeText } from './client'
import { meterAiCall } from './guarded-client'

export interface FirmBrief {
    content: string
    generatedAt: string
}

export const BRIEF_MAX_AGE_MS = 60 * 60 * 1000

export function isBriefFresh(brief: FirmBrief | null | undefined): boolean {
    if (!brief?.generatedAt) return false
    const age = Date.now() - new Date(brief.generatedAt).getTime()
    return age >= 0 && age < BRIEF_MAX_AGE_MS
}

/**
 * Sections the brief is written in. Mirrors the engagement summary's shape so both read as the
 * same product, minus the approval gate — the brief is internal, never published or exported,
 * so there is nothing to protect a client from and a review step would be friction for its own
 * sake. The judgment boundary still holds: Brio states what is true, not what to do about it.
 */
export const BRIEF_SECTIONS = ['Where things stand', 'Needs attention', 'Worth watching'] as const

const SYSTEM = `You are a concise advisor to a professional services firm, writing their daily briefing.

Produce EXACTLY these three sections, each as a markdown heading on its own line, in this order:

## Where things stand
## Needs attention
## Worth watching

Rules:
- 1-2 sentences per section. Plain prose, no bullet points or nested headings.
- Where things stand: the shape of the firm right now — active work, pipeline, recent movement.
- Needs attention: what is most urgent or most at risk today. If nothing is, say so plainly.
- Worth watching: what is not urgent yet but is trending the wrong way. If nothing is, say so.
- Be specific. Name clients and engagements, give counts and values, say how many days overdue.
- Never invent a number, name, or date that is not in the snapshot. If it is sparse, write less.
- Address the reader as "you". No greeting, and do not restate that this is a summary.

What you must NOT do:
- Do not tell the reader what to do. No "you should", no "consider", no "worth reaching out".
  State what is true and let them decide — deciding what the firm does is their call, not yours.
- Do not speculate about causes you cannot see in the data.
- Do not comment on any individual's performance.`

function money(val: number, symbol: string): string {
    if (!val) return `${symbol}0`
    if (val >= 1_000_000) return `${symbol}${(val / 1_000_000).toFixed(1)}M`
    if (val >= 1_000) return `${symbol}${(val / 1_000).toFixed(0)}K`
    return `${symbol}${val.toFixed(0)}`
}

/**
 * Flattens the insights response into a compact prose-ish snapshot. Sending the raw JSON
 * wastes tokens on keys the model does not need and buries the few fields that carry signal.
 * Empty categories are omitted entirely so the model does not narrate zeros.
 */
export function buildSnapshot(data: FirmInsightsResponse): string {
    const s = data.currencySymbol ?? ''
    const lines: string[] = []

    lines.push(
        `Clients: ${data.clientCounts.ACTIVE} active, ${data.clientCounts.PROSPECT} prospects, ` +
        `${data.clientCounts.ON_HOLD} on hold, ${data.clientCounts.PAST} past.`
    )
    lines.push(
        `Engagements: ${data.activeEngagements} active of ${data.totalEngagementCount} total ` +
        `(${data.engagementStatusBreakdown.PLANNED} planned, ${data.engagementStatusBreakdown.PAUSED} paused).`
    )
    lines.push(
        `Pipeline value ${money(data.pipelineValue, s)}; closing within 30 days ${money(data.closingSoonValue, s)}; ` +
        `revenue at risk ${money(data.revenueAtRisk, s)} (clients with history but no active engagement).`
    )

    if (data.overdueDueDates > 0 || data.nearingDueDates > 0) {
        lines.push(`Due dates: ${data.overdueDueDates} overdue, ${data.nearingDueDates} due within 7 days.`)
    }

    const overdue = (data.engagementsDueSoon ?? []).filter((e) => e.daysUntil < 0)
    if (overdue.length > 0) {
        lines.push(
            'Overdue engagements: ' +
            overdue.slice(0, 5)
                .map((e) => `${e.engagementName} (${e.clientName}) ${Math.abs(e.daysUntil)}d overdue`)
                .join('; ') + '.'
        )
    }

    const closingSoon = (data.engagementsDueSoon ?? []).filter((e) => e.daysUntil >= 0 && e.daysUntil <= 30)
    if (closingSoon.length > 0) {
        lines.push(
            'Closing soon: ' +
            closingSoon.slice(0, 5)
                .map((e) => `${e.engagementName} (${e.clientName}) in ${e.daysUntil}d`)
                .join('; ') + '.'
        )
    }

    if (data.unansweredThreads?.length) {
        lines.push(
            `${data.unansweredThreads.length} unanswered client comment thread(s), most recent: ` +
            data.unansweredThreads.slice(0, 3)
                .map((t) => `"${t.documentName}" in ${t.engagementName}`)
                .join('; ') + '.'
        )
    }

    if (data.urgentReminders?.length) {
        lines.push(
            `${data.urgentReminders.length} urgent reminder(s): ` +
            data.urgentReminders.slice(0, 3)
                .map((r) => `${r.action} on ${r.entityName}${r.note ? ` (${r.note})` : ''}`)
                .join('; ') + '.'
        )
    }

    if (data.pendingInvitations?.length) {
        lines.push(`${data.pendingInvitations.length} invitation(s) still pending acceptance.`)
    }

    if (data.clientPipelineBreakdown?.length) {
        lines.push(
            'Top clients by value: ' +
            data.clientPipelineBreakdown.slice(0, 5)
                .map((c) => `${c.clientName} ${money(c.value, s)}`)
                .join('; ') + '.'
        )
    }

    const w = data.weeklyActivity
    if (w && (w.newClients || w.newEngagements || w.invitationsSent || w.engagementsClosed)) {
        lines.push(
            `Past 7 days: ${w.newClients} new clients, ${w.newEngagements} new engagements, ` +
            `${w.invitationsSent} invitations sent, ${w.engagementsClosed} engagements closed.`
        )
    }

    return lines.join('\n')
}

export async function generateFirmBrief(
    data: FirmInsightsResponse,
    meta?: { firmId?: string; userId?: string },
): Promise<string | null> {
    return completeText({
        system: SYSTEM,
        userMessage: `Today is ${new Date().toISOString().slice(0, 10)}.\n\nFirm snapshot:\n${buildSnapshot(data)}`,
        maxTokens: 500,
        temperature: 0.4,
        label: 'firm-brief',
        onUsage: meta?.firmId
            ? (u) => meterAiCall(
                { firmId: meta.firmId, userId: meta.userId ?? null, feature: 'brief' },
                u,
            )
            : undefined,
    })
}
