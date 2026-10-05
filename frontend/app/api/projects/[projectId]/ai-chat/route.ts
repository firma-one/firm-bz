import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject, canViewProjectInternalTabs } from '@/lib/permission-helpers'
import { logger } from '@/lib/logger'
import { getAnthropic, isAiConfigured, AI_MODEL } from '@/lib/ai/client'
import { recordAiUsage } from '@/lib/ai/usage'
import { getGuardedAnthropic, meterAiCall, aiLimitResponse } from '@/lib/ai/guarded-client'
import {
    CHAT_SYSTEM_PROMPT,
    buildEngagementContext,
    sanitizeHistory,
    MAX_QUESTION_LENGTH,
    isObviouslyOutOfScope,
    OUT_OF_SCOPE_REPLY,
} from '@/lib/ai/engagement-chat'
import { buildEngagementActivity } from '@/lib/ai/engagement-activity'
import type { EngagementInsightsResponse } from '../insights/route'

/**
 * Did the stream end because the reader went away, rather than because generation failed?
 *
 * A cancelled ReadableStream surfaces as a TypeError on `enqueue` ("Invalid state: Controller is
 * already closed") or as an AbortError, depending on runtime. Neither is an upstream failure, so
 * neither should be logged as one — but both still represent tokens that were spent.
 */
function isClientDisconnect(error: unknown): boolean {
    if (error instanceof DOMException && error.name === 'AbortError') return true
    const message = error instanceof Error ? error.message : ''
    return /invalid state|already closed|aborted|cancel/i.test(message)
}

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

        // The same gate the panel applies, repeated here because the panel's copy is bypassable —
        // anything can POST to this route. Returned as a normal text stream so the client renders
        // it like any other answer, and no credit is spent reaching the model.
        if (isObviouslyOutOfScope(question)) {
            return new Response(OUT_OF_SCOPE_REPLY, {
                headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
            })
        }

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

        // Audit-derived activity, appended to the snapshot. Event names and counts only — the
        // module deliberately drops audit `metadata`, which carries file names, descriptions and
        // emails written by users.
        const activity = await buildEngagementActivity(projectId)

        const context = buildEngagementContext(insights, {
            clientName: names?.client?.name,
            engagementName: names?.name,
        }) + (activity ? `\n${activity}` : '')

        // Gate and client in one call: over-budget throws before any tokens are spent.
        const scope = { firmId: ctx.firmId, userId: user.id, feature: 'chat' as const }
        const client = await getGuardedAnthropic(scope)
        if (!client) return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })

        const stream = await client.messages.create({
            model: AI_MODEL,
            max_tokens: 700,
            temperature: 0.2,
            // The system prompt and snapshot are identical on every turn of a conversation and run
            // to a few thousand tokens, so they are marked cacheable: a cache write costs 1.25x,
            // every later read 0.1x. A multi-turn conversation therefore pays full price once
            // instead of on each message.
            //
            // IMPORTANT: a cache hit requires a byte-identical prefix. `buildEngagementContext`
            // carries `Today:` and day-granularity elapsed counts, which are stable across a
            // session — do NOT add a timestamp of finer granularity to it, or every request will
            // miss. The 5-minute default TTL refreshes on each hit, so an active conversation
            // keeps the entry warm.
            system: [
                {
                    type: 'text' as const,
                    text: `${CHAT_SYSTEM_PROMPT}\n\n--- ENGAGEMENT SNAPSHOT ---\n${context}`,
                    cache_control: { type: 'ephemeral' as const },
                },
            ],
            messages: [...history, { role: 'user' as const, content: question }],
            stream: true,
        })

        const encoder = new TextEncoder()
        const body_ = new ReadableStream<Uint8Array>({
            async start(controller) {
                // Declared outside the try so the catch can meter whatever was generated before a
                // client disconnect cut the stream short.
                let inputTokens = 0
                let outputTokens = 0
                try {
                    // Streaming reports tokens across two events: the input count arrives with
                    // message_start, the output count with message_delta at the end.
                    //
                    // Cached tokens are reported SEPARATELY from `input_tokens`, so they are added
                    // back here. Without this, enabling prompt caching would have made recorded
                    // usage collapse — a cached turn reports only the handful of uncached tokens,
                    // and the ledger would show a fraction of the real context size.
                    for await (const event of stream) {
                        if (event.type === 'message_start') {
                            const u = event.message.usage
                            inputTokens = (u?.input_tokens ?? 0)
                                + (u?.cache_creation_input_tokens ?? 0)
                                + (u?.cache_read_input_tokens ?? 0)
                        } else if (event.type === 'message_delta') {
                            outputTokens = event.usage?.output_tokens ?? 0
                        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                            controller.enqueue(encoder.encode(event.delta.text))
                        }
                    }
                    await meterAiCall(scope, { inputTokens, outputTokens })
                } catch (error) {
                    // A client disconnect — the user pressed Stop, or closed the tab — surfaces
                    // here when enqueue throws on a cancelled response. Those tokens were really
                    // generated and really billed upstream, so they are metered rather than
                    // written off: skipping them would let repeated ask-then-stop consume
                    // inference indefinitely without ever touching the allowance, and nothing
                    // would notice because the burst cap counts this same ledger.
                    //
                    // Input is charged in full regardless, since the request was already
                    // processed; output is whatever had been generated when the stream ended.
                    if (isClientDisconnect(error)) {
                        await meterAiCall(scope, { inputTokens, outputTokens })
                        return
                    }
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
        const limited = aiLimitResponse(error)
        if (limited) return limited
        logger.error('AI chat error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
