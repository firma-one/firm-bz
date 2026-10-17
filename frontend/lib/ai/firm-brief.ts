import type { FirmInsightsResponse } from '@/app/api/firms/[firmId]/insights/route'
import { logger } from '@/lib/logger'
import { AI_MODEL, completeText } from './client'
import { getGuardedAnthropic, meterAiCall } from './guarded-client'
import { assertWithinAiCreditCap } from './credit-cap'

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
- Be specific. Name clients and engagements, give counts, say how many days overdue.
- You are NOT given monetary amounts, and must never state or estimate one. Pipeline is described
  as a share of the total; report it that way or not at all.
- Never invent a number, name, or date that is not in the snapshot. If it is sparse, write less.
- Address the reader as "you". No greeting, and do not restate that this is a summary.

What you must NOT do:
- Do not tell the reader what to do. No "you should", no "consider", no "worth reaching out".
  State what is true and let them decide — deciding what the firm does is their call, not yours.
- Do not speculate about causes you cannot see in the data.
- Do not comment on any individual's performance.`

/**
 * Flattens the insights response into a compact prose-ish snapshot. Sending the raw JSON
 * wastes tokens on keys the model does not need and buries the few fields that carry signal.
 * Empty categories are omitted entirely so the model does not narrate zeros.
 */
export function buildSnapshot(data: FirmInsightsResponse): string {
    const lines: string[] = []

    lines.push(
        `Clients: ${data.clientCounts.ACTIVE} active, ${data.clientCounts.PROSPECT} prospects, ` +
        `${data.clientCounts.ON_HOLD} on hold, ${data.clientCounts.PAST} past.`
    )
    lines.push(
        `Engagements: ${data.activeEngagements} active of ${data.totalEngagementCount} total ` +
        `(${data.engagementStatusBreakdown.PLANNED} planned, ${data.engagementStatusBreakdown.PAUSED} paused).`
    )
    // Pipeline is described by SHAPE, not by amount.
    //
    // The brief's job is "what needs attention today", and the advice is identical whether the
    // at-risk figure is £8k or £800k — what matters is that a share of the pipeline is sitting with
    // clients who have no active work. Sending the absolute sums put the firm's revenue into every
    // request for no gain in the output, so only the proportions go now. Counts stay, because
    // "4 clients dormant" is actionable in a way a percentage is not.
    const pipelineTotal = data.pipelineValue || 0
    const share = (part: number) =>
        pipelineTotal > 0 ? `${Math.round((part / pipelineTotal) * 100)}% of pipeline` : 'none of the pipeline'
    lines.push(
        `Pipeline: ${share(data.closingSoonValue ?? 0)} is closing within 30 days; ` +
        `${share(data.revenueAtRisk ?? 0)} sits with clients that have history but no active engagement.` +
        (data.clientPipelineBreakdown?.length
            ? ` ${data.clientPipelineBreakdown.length} client(s) carry pipeline value.`
            : '')
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

    // Deliberately omitted: urgentReminders / upcomingReminders.
    //
    // Reminders are personal — they come from the user who triggered generation, notes included —
    // but the brief is cached firm-wide in Firm.settings.aiBrief and served to every admin. Feeding
    // them in would show one admin's private reminders to the others for the next hour.

    if (data.pendingInvitations?.length) {
        lines.push(`${data.pendingInvitations.length} invitation(s) still pending acceptance.`)
    }

    // Deliberately removed: the per-client revenue breakdown.
    //
    // It paired each client's NAME with the money they are worth — the most sensitive pairing in
    // the whole payload — to support a line the brief is told not to write. The prompt forbids
    // telling the reader what to do, so "Acme is worth £120k" can only become an observation the
    // reader already knows from their own pipeline page. Concentration, which could change the
    // advice, is covered by the client count above without naming anyone or pricing them.

    const w = data.weeklyActivity
    if (w && (w.newClients || w.newEngagements || w.invitationsSent || w.engagementsClosed)) {
        lines.push(
            `Past 7 days: ${w.newClients} new clients, ${w.newEngagements} new engagements, ` +
            `${w.invitationsSent} invitations sent, ${w.engagementsClosed} engagements closed.`
        )
    }

    return lines.join('\n')
}

const BRIEF_MAX_TOKENS = 500
const BRIEF_TEMPERATURE = 0.4

/** What the model is asked: today's date and the firm's snapshot. */
function briefRequest(data: FirmInsightsResponse): string {
    return `Today is ${new Date().toISOString().slice(0, 10)}.\n\nFirm snapshot:\n${buildSnapshot(data)}`
}

/**
 * Generates a brief, refusing when the firm is over its AI credit allowance.
 *
 * The cap is asserted here as well as in the calling route. That is not redundancy for its own
 * sake: the route gates *before* fetching insights so a cached read costs nothing, while this
 * assertion makes the model unreachable without a check — the guarantee every other AI surface
 * gets from `getGuardedAnthropic`. A second caller added later cannot accidentally skip it.
 *
 * Throws `AiCreditLimitError`; the route already translates that into a skipped brief.
 */
export async function generateFirmBrief(
    data: FirmInsightsResponse,
    meta?: { firmId?: string; userId?: string },
): Promise<string | null> {
    if (meta?.firmId) {
        await assertWithinAiCreditCap({ firmId: meta.firmId, feature: 'brief' })
    }
    return completeText({
        system: SYSTEM,
        userMessage: briefRequest(data),
        maxTokens: BRIEF_MAX_TOKENS,
        temperature: BRIEF_TEMPERATURE,
        label: 'firm-brief',
        onUsage: meta?.firmId
            ? (u) => meterAiCall(
                { firmId: meta.firmId, userId: meta.userId ?? null, feature: 'brief' },
                u,
            )
            : undefined,
    })
}

/**
 * The same brief, streamed: `onDelta` gets each piece of text as the model writes it, so "Rewrite
 * with Brio" can show the brief being written rather than a long wait. Returns the whole text, or
 * null when the model returned nothing or `signal` stopped it.
 *
 * Gated by `getGuardedAnthropic` (throws `AiCreditLimitError` over the allowance). Metered only
 * when the stream completes: a stopped rewrite is not a billable call, and is not saved either.
 */
export async function streamFirmBrief(
    data: FirmInsightsResponse,
    meta: { firmId: string; userId?: string },
    onDelta: (text: string) => void,
    signal?: AbortSignal,
): Promise<string | null> {
    const scope = { firmId: meta.firmId, userId: meta.userId ?? null, feature: 'brief' as const }
    const client = await getGuardedAnthropic(scope)
    if (!client) return null

    const stream = await client.messages.create({
        model: AI_MODEL,
        max_tokens: BRIEF_MAX_TOKENS,
        temperature: BRIEF_TEMPERATURE,
        system: SYSTEM,
        messages: [{ role: 'user', content: briefRequest(data) }],
        stream: true,
    }, { signal })

    let full = ''
    let inputTokens = 0
    let outputTokens = 0
    try {
        // Streaming reports tokens across two events: input with message_start, output with
        // message_delta at the end.
        for await (const event of stream) {
            if (event.type === 'message_start') inputTokens = event.message.usage?.input_tokens ?? 0
            else if (event.type === 'message_delta') outputTokens = event.usage?.output_tokens ?? 0
            else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                full += event.delta.text
                onDelta(event.delta.text)
            }
        }
    } catch (error) {
        if (signal?.aborted) return null
        throw error
    }
    if (signal?.aborted) return null

    const content = full.trim()
    if (!content) return null
    try {
        await meterAiCall(scope, { inputTokens, outputTokens })
    } catch (error) {
        // Metering is bookkeeping; losing a row must not cost the user their brief.
        logger.error('AI usage metering failed (firm-brief stream):', error as Error)
    }
    return content
}
