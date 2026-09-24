import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canManageProject } from '@/lib/permission-helpers'
import { logger } from '@/lib/logger'
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/ai/client'
import { computeEngagementInsights } from '@/lib/insights/engagement-insights'
import { buildEngagementContext } from '@/lib/ai/engagement-chat'
import { SUMMARY_SYSTEM_PROMPT, fingerprintInsights, readInsightsSummary } from '@/lib/ai/engagement-summary'

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

        if (!isAiConfigured()) {
            return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })
        }

        const engagement = await prisma.engagement.findFirst({
            where: { id: projectId, isDeleted: false },
            select: { settings: true, name: true, client: { select: { name: true } } },
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

        const client = getAnthropic()
        if (!client) return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })

        const modelStream = await client.messages.create({
            model: AI_MODEL,
            max_tokens: 700,
            temperature: 0.3,
            system: SUMMARY_SYSTEM_PROMPT,
            messages: [{
                role: 'user',
                content: `Engagement snapshot:\n${buildEngagementContext(insights, {
                    clientName: engagement.client.name,
                    engagementName: engagement.name,
                })}`,
            }],
            stream: true,
        })

        const generatedAt = new Date().toISOString()

        const body = new ReadableStream<Uint8Array>({
            async start(controller) {
                let full = ''
                try {
                    controller.enqueue(line({ type: 'meta', generatedAt }))

                    for await (const event of modelStream) {
                        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                            full += event.delta.text
                            controller.enqueue(line({ type: 'delta', text: event.delta.text }))
                        }
                    }

                    const content = full.trim()
                    if (!content) {
                        controller.enqueue(line({ type: 'error', message: 'Empty response' }))
                        return
                    }

                    // Persist only after a complete stream, so an aborted generation leaves no
                    // half-written draft behind.
                    await prisma.engagement.update({
                        where: { id: projectId },
                        data: {
                            settings: {
                                ...settings,
                                insightsSummary: {
                                    ...current,
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
                    logger.error('AI summary stream error:', error as Error)
                    controller.enqueue(line({ type: 'error', message: 'Generation failed' }))
                } finally {
                    controller.close()
                }
            },
        })

        return new Response(body, {
            headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
        })
    } catch (error) {
        logger.error('AI summary error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
