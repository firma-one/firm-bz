import { NextRequest, NextResponse } from 'next/server'
import { blockIfEngagementCompleted } from '@/lib/engagement-access'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canManageProject } from '@/lib/permission-helpers'
import { logger } from '@/lib/logger'
import { isAiConfigured, AI_EFFORT, AI_MODEL } from '@/lib/ai/client'
import { getGuardedAnthropic, aiFailureResponse } from '@/lib/ai/guarded-client'
import { BRIO_SUMMARY_FAILED, brioWritingFailure } from '@/lib/ai/brio-failure'
import { afterResponse } from '@/lib/server/after-response'
import { computeEngagementInsights } from '@/lib/insights/engagement-insights'
import { buildEngagementContext } from '@/lib/ai/engagement-chat'
import {
    SUMMARY_SYSTEM_PROMPT, fingerprintInsights, readInsightsSummary,
} from '@/lib/ai/engagement-summary'
import { vaultForEngagement } from '@/lib/ai/known-entities'
import { AI_MAX_TOKENS } from '@/lib/ai/features'

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
            max_tokens: AI_MAX_TOKENS.summary,
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
        // Set when the reader goes (the pane closed, the page left). The model is NOT stopped: its tokens
        // are paid for either way, so the draft is finished and saved for when they come back
        // (2026-11-19). The function is kept alive until then (`afterResponse`).
        let readerGone = false

        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                const send = (o: unknown) => {
                    if (readerGone) return
                    try { controller.enqueue(line(o)) } catch { readerGone = true }
                }
                const work = (async () => {
                    let full = ''
                    let stopReason: string | null = null
                    try {
                        send({ type: 'meta', generatedAt })
                        for await (const event of modelStream) {
                            if (event.type === 'message_delta') {
                                stopReason = event.delta?.stop_reason ?? stopReason
                            } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                                full += event.delta.text
                                send({ type: 'delta', text: event.delta.text })
                            }
                        }

                        const content = full.trim()
                        // A declined or cut-off summary is not saved as a draft: a Lead could approve
                        // half a summary without noticing its last sections are missing. The call is
                        // metered all the same, by the client (lib/ai/metered-client.ts).
                        if (!content || stopReason === 'refusal' || stopReason === 'max_tokens') {
                            logger.warn('AI summary not saved', 'AiSummary', { projectId, stopReason, textChars: content.length })
                            send({ type: 'error', message: brioWritingFailure({ stopReason, empty: !content }, 'the summary', BRIO_SUMMARY_FAILED) })
                            return
                        }

                        // Persist only after a complete stream, so a broken generation leaves no
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

                        send({ type: 'done', content, generatedAt })
                    } catch (error) {
                        // The model or the save failing part-way; nothing was saved.
                        logger.error('AI summary stream error:', error as Error)
                        send({ type: 'error', message: BRIO_SUMMARY_FAILED })
                    } finally {
                        if (!readerGone) try { controller.close() } catch { /* already closed */ }
                    }
                })()
                afterResponse(() => work)
            },
            cancel() {
                readerGone = true
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
