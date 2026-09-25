import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject, canViewProjectInternalTabs } from '@/lib/permission-helpers'
import { logger } from '@/lib/logger'
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/ai/client'
import {
    CHAT_SYSTEM_PROMPT,
    buildEngagementContext,
    sanitizeHistory,
    MAX_QUESTION_LENGTH,
} from '@/lib/ai/engagement-chat'
import type { EngagementInsightsResponse } from '../insights/route'

/**
 * POST /api/projects/[projectId]/ai-chat
 *
 * Read-only Q&A over one engagement's insights. Firm users only — external collaborators and
 * viewers are refused outright, since they see a deliberately stripped Overview and an
 * open-ended Q&A would route around that boundary.
 *
 * Streams plain text chunks (not SSE) — the client appends them as they arrive.
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

        const [canView, canViewInternal] = await Promise.all([
            canViewProject(ctx.firmId, ctx.clientId, ctx.projectId),
            canViewProjectInternalTabs(ctx.firmId, ctx.clientId, ctx.projectId),
        ])
        if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        if (!canViewInternal) {
            return NextResponse.json({ error: 'Not available for external roles' }, { status: 403 })
        }

        if (!isAiConfigured()) {
            return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })
        }

        const body = await request.json().catch(() => null)
        if (!body || typeof body.question !== 'string' || !body.question.trim()) {
            return NextResponse.json({ error: 'A question is required' }, { status: 400 })
        }
        const question = body.question.trim().slice(0, MAX_QUESTION_LENGTH)
        const history = sanitizeHistory(body.history)

        // Fetch insights server-side rather than trusting a client-supplied payload — otherwise a
        // caller could inject arbitrary "engagement data" for the model to treat as fact.
        const insightsRes = await fetch(new URL(`/api/projects/${projectId}/insights`, request.url), {
            headers: { cookie: request.headers.get('cookie') ?? '' },
        })
        if (!insightsRes.ok) {
            logger.error(`AI chat: insights fetch failed with ${insightsRes.status}`)
            return NextResponse.json({ error: 'Could not load engagement data' }, { status: 502 })
        }
        const insights = await insightsRes.json() as EngagementInsightsResponse

        const names = await prisma.engagement.findUnique({
            where: { id: projectId },
            select: { name: true, client: { select: { name: true } } },
        })

        const context = buildEngagementContext(insights, {
            clientName: names?.client?.name,
            engagementName: names?.name,
        })

        const client = getAnthropic()
        if (!client) return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })

        const stream = await client.messages.create({
            model: AI_MODEL,
            max_tokens: 700,
            temperature: 0.2,
            system: `${CHAT_SYSTEM_PROMPT}\n\n--- ENGAGEMENT SNAPSHOT ---\n${context}`,
            messages: [...history, { role: 'user' as const, content: question }],
            stream: true,
        })

        const encoder = new TextEncoder()
        const body_ = new ReadableStream<Uint8Array>({
            async start(controller) {
                try {
                    for await (const event of stream) {
                        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                            controller.enqueue(encoder.encode(event.delta.text))
                        }
                    }
                } catch (error) {
                    logger.error('AI chat stream error:', error as Error)
                    // Fail the stream rather than closing it cleanly. This response is raw text
                    // with no envelope to carry an error flag, so a clean close is byte-identical
                    // to a complete answer — the client would present a truncated answer about an
                    // engagement as an authoritative one. `error()` surfaces as a read failure the
                    // caller already catches, keeping whatever streamed but marking the turn failed.
                    controller.error(error)
                    return
                }
                controller.close()
            },
        })

        return new Response(body_, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-store',
            },
        })
    } catch (error) {
        logger.error('AI chat error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
