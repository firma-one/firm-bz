import { NextRequest, NextResponse } from 'next/server'
import { blockIfEngagementCompleted } from '@/lib/engagement-access'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canManageProject } from '@/lib/permission-helpers'
import { logger } from '@/lib/logger'
import { isAiConfigured, AI_EFFORT, AI_MODEL } from '@/lib/ai/client'
import { getGuardedAnthropic, meterAiCall, aiFailureResponse } from '@/lib/ai/guarded-client'
import { BRIO_SUMMARY_FAILED } from '@/lib/ai/brio-failure'
import { computeEngagementInsights } from '@/lib/insights/engagement-insights'
import { buildEngagementContext } from '@/lib/ai/engagement-chat'
import {
    SUMMARY_MAX_TOKENS, SUMMARY_SYSTEM_PROMPT, fingerprintInsights, readInsightsSummary,
} from '@/lib/ai/engagement-summary'
import { vaultForEngagement } from '@/lib/ai/known-entities'

/**
 * POST /api/projects/[projectId]/ai-summary
 *
 * Streams a generated summary draft. A route rather than a server action because actions
 * cannot stream, and the draft is written into the summary slot token-by-token.
 *
 * The result is always persisted as `pending_review` — this endpoint cannot publish. Only
 * `approveEngagementAiSummary` writes the client-facing `settings.insightsSummary`.
 *
 * Emits newline-delimited JSON events: {type:'unchanged'|'meta'|'delta'|'done'|'error'}.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const ctx = await resolveProjectContext(projectId)
        if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

        if (!(await canManageProject(ctx.firmId, ctx.clientId, ctx.projectId))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const completed = await blockIfEngagementCompleted(projectId)
        if (completed) return completed

        if (!isAiConfigured()) {
            return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })
        }

        const engagement = await prisma.engagement.findFirst({
            where: { id: projectId, isDeleted: false },
            // `rateOrValue` is deliberately NOT selected — see buildEngagementContext.
            select: {
                settings: true, name: true, description: true, tags: true, contractType: true,
                client: { select: { name: true } },
            },
        })
        if (!engagement) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

        const settings = (engagement.settings as Record<string, unknown> | null) ?? {}
        const current = readInsightsSummary(settings)
        const existing = current.draft

        const insights = await computeEngagementInsights(projectId, ctx.firmId, false)
        const fingerprint = fingerprintInsights(insights)

        const encoder = new TextEncoder()
        const line = (o: unknown) => encoder.encode(JSON.stringify(o) + '\n')

        // Unchanged inputs would reproduce the same text — return the existing draft, no API call.
        if (existing?.status === 'pending_review' && existing.fingerprint === fingerprint) {
            return new Response(
                line({ type: 'unchanged', content: existing.text, generatedAt: existing.generatedAt }),
                { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } },
            )
        }

        const scope = { firmId: ctx.firmId, userId: user.id, feature: 'summary' as const }
        const client = await getGuardedAnthropic(scope, { vault: await vaultForEngagement(projectId, ctx.firmId) })
        if (!client) return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })

        const modelStream = await client.messages.create({
            model: AI_MODEL,
            max_tokens: SUMMARY_MAX_TOKENS,
            output_config: { effort: AI_EFFORT.summary },
            system: SUMMARY_SYSTEM_PROMPT,
            messages: [{
                role: 'user',
                content: `Engagement snapshot:\n${buildEngagementContext(insights, {
                    clientName: engagement.client.name,
                    engagementName: engagement.name,
                    // The brief is prose about what this engagement IS, which is exactly what
                    // the description says and no computed signal can.
                    description: engagement.description,
                    tags: Array.isArray(engagement.tags)
                        ? engagement.tags.filter((t): t is string => typeof t === 'string')
                        : undefined,
                    contractType: engagement.contractType,
                })}`,
            }],
            stream: true,
        })

        const generatedAt = new Date().toISOString()
        // Set when the client stops reading (Stop, or it left the page): the model is stopped too,
        // and nothing is metered or saved.
        let cancelled = false

        const body = new ReadableStream<Uint8Array>({
            async start(controller) {
                let full = ''
                try {
                    controller.enqueue(line({ type: 'meta', generatedAt }))

                    // Streaming reports tokens across two events: input with message_start,
                    // output with message_delta at the end.
                    let inputTokens = 0
                    let outputTokens = 0
                    let stopReason: string | null = null
                    for await (const event of modelStream) {
                        if (event.type === 'message_start') {
                            inputTokens = event.message.usage?.input_tokens ?? 0
                        } else if (event.type === 'message_delta') {
                            outputTokens = event.usage?.output_tokens ?? 0
                            stopReason = event.delta?.stop_reason ?? stopReason
                        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                            full += event.delta.text
                            controller.enqueue(line({ type: 'delta', text: event.delta.text }))
                        }
                    }

                    if (cancelled) return
                    const content = full.trim()
                    // A declined or cut-off summary is not saved as a draft: a Lead could approve
                    // half a summary without noticing its last sections are missing.
                    if (!content || stopReason === 'refusal' || stopReason === 'max_tokens') {
                        controller.enqueue(line({ type: 'error', message: BRIO_SUMMARY_FAILED }))
                        return
                    }

                    // Metered only on a complete stream, matching persistence: an aborted
                    // generation produces no draft and no charge.
                    await meterAiCall(scope, { inputTokens, outputTokens })

                    // Persist only after a complete stream, so an aborted generation leaves no
                    // half-written draft behind.
                    //
                    // Settings are read again here, not reused from before the stream: generation
                    // can take two minutes, and writing the old copy back would revert anything saved
                    // meanwhile, an internal memo or an approval of the previous draft.
                    const fresh = await prisma.engagement.findUnique({
                        where: { id: projectId },
                        select: { settings: true },
                    })
                    const latest = (fresh?.settings as Record<string, unknown> | null) ?? {}
                    await prisma.engagement.update({
                        where: { id: projectId },
                        data: {
                            settings: {
                                ...latest,
                                insightsSummary: {
                                    ...readInsightsSummary(latest),
                                    draft: {
                                        text: content,
                                        generatedAt,
                                        status: 'pending_review',
                                        fingerprint,
                                        reviewedAt: null,
                                        reviewedByUserId: null,
                                    },
                                },
                            },
                        },
                    })

                    controller.enqueue(line({ type: 'done', content, generatedAt }))
                } catch (error) {
                    // Stopped on purpose: the abort surfaces here as an error, but it is not one.
                    if (cancelled) return
                    // The credit gate runs before the stream (getGuardedAnthropic above), so a
                    // limit never lands here; the outer catch answers it. This is the model or the
                    // save failing part-way, and nothing was saved.
                    logger.error('AI summary stream error:', error as Error)
                    controller.enqueue(line({ type: 'error', message: BRIO_SUMMARY_FAILED }))
                } finally {
                    try { controller.close() } catch { /* already closed by the client leaving */ }
                }
            },
            cancel() {
                cancelled = true
                modelStream.controller.abort()
            },
        })

        return new Response(body, {
            headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
        })
    } catch (error) {
        // Out of credits: the gate throws before the stream, so this is where its words are
        // answered (429, the limit's own message), as chat does. Trying again can't help then.
        return aiFailureResponse(error, BRIO_SUMMARY_FAILED, 'AI summary error:')
    }
}
