import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { userSettingsPlus } from '@/lib/user-settings-plus'
import { findFirmInPermissions } from '@/lib/permission-helpers'
import { logger } from '@/lib/logger'
import { isAiConfigured, AI_EFFORT, AI_MODEL } from '@/lib/ai/client'
import { ASSISTANT } from '@/lib/ai/assistant'
import { getGuardedAnthropic, meterAiCall, aiFailureResponse } from '@/lib/ai/guarded-client'
import { BRIO_ANSWER_FAILED, BRIO_DATA_UNREADABLE } from '@/lib/ai/brio-failure'
import { isObviouslyOutOfScope, MAX_QUESTION_LENGTH, sanitizeHistory } from '@/lib/ai/engagement-chat'
import {
    FIRM_CHAT_SYSTEM_PROMPT,
    FIRM_OUT_OF_SCOPE_REPLY,
    buildFirmChatContext,
    engagementsDrawnOn,
    formatFirmSourcesLine,
    resolveEngagementLinks,
    type FirmChatEngagementRecord,
} from '@/lib/ai/firm-chat'
import type { FirmInsightsResponse } from '../insights/route'

/**
 * Firm admins only: the firm brief's gate (ai-brief/route.ts `authorize`), repeated here because a
 * route file can't export helpers. The firm must be in the caller's permissions with the firm-scope
 * `can_manage` privilege; anyone else gets nothing, since the answer reads across every engagement.
 */
async function authorize(firmId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    // Same statuses as the brief's gate, in words the panel can show as they are.
    if (!user) {
        return { error: NextResponse.json({ error: `Your session has ended. Sign in again to ask ${ASSISTANT.name}.` }, { status: 401 }), userId: undefined }
    }

    const settings = await userSettingsPlus.getUserSettingsPlus(user.id)
    const firm = findFirmInPermissions(settings.permissions, firmId)
    if (!firm) return { error: NextResponse.json({ error: "This firm isn't one you have access to." }, { status: 404 }), userId: undefined }
    if (!(firm.scopes?.firm ?? []).includes('can_manage')) {
        return { error: NextResponse.json({ error: `Only firm admins can ask ${ASSISTANT.name} about the firm.` }, { status: 403 }), userId: undefined }
    }
    return { error: null, userId: user.id }
}

/**
 * The firm's insights, as the brief reads them (ai-brief/route.ts `loadInsights`): fetched over HTTP
 * with the caller's cookies and bearer token, so the payload is built from the caller's own access,
 * never supplied by the client.
 */
async function loadInsights(request: NextRequest, firmId: string): Promise<FirmInsightsResponse | null> {
    const res = await fetch(new URL(`/api/firms/${firmId}/insights`, request.url), {
        headers: {
            cookie: request.headers.get('cookie') ?? '',
            ...(request.headers.get('authorization')
                ? { authorization: request.headers.get('authorization')! }
                : {}),
        },
    })
    if (!res.ok) {
        logger.error(`AI firm chat: insights fetch failed with ${res.status}`)
        return null
    }
    return await res.json() as FirmInsightsResponse
}

/** As in the engagement chat route: the reader went away, rather than generation failing. */
function isClientDisconnect(error: unknown): boolean {
    if (error instanceof DOMException && error.name === 'AbortError') return true
    const message = error instanceof Error ? error.message : ''
    return /invalid state|already closed|aborted|cancel/i.test(message)
}

/**
 * Room for thinking as well as the answer: thinking counts toward `max_tokens`. A little above the
 * engagement chat's 2500, since a firm answer is more often a table across several engagements.
 */
const FIRM_CHAT_MAX_TOKENS = 3000

/**
 * POST /api/firms/[firmId]/ai-chat
 *
 * Ask Brio about the firm (.claude/plans/brio-features-round-2.md §3.4). Read-only Q&A over the
 * firm's insights, widened to one row per engagement (lib/ai/firm-chat.ts). Multi-turn: the client
 * sends the conversation so far, sanitized and capped here.
 *
 * Streams plain text. After the answer, the server appends one `SOURCES_MARKER` line: the
 * engagements the answer named, resolved against the firm's real engagements, and how many it drew
 * on. The panel turns those names into links; a URL the model wrote is never used.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ firmId: string }> }) {
    try {
        const { firmId } = await params
        const auth = await authorize(firmId)
        if (auth.error) return auth.error

        if (!isAiConfigured()) {
            return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })
        }

        const body = await request.json().catch(() => null)
        if (!body || typeof body.question !== 'string' || !body.question.trim()) {
            return NextResponse.json({ error: 'A question is required' }, { status: 400 })
        }
        const question = body.question.trim().slice(0, MAX_QUESTION_LENGTH)
        const history = sanitizeHistory(body.history)

        // The panel's pre-filter, repeated because anything can POST here. Answered as a normal
        // text stream, without reaching the model or spending a credit.
        if (isObviouslyOutOfScope(question)) {
            return new Response(FIRM_OUT_OF_SCOPE_REPLY, {
                headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
            })
        }

        const insights = await loadInsights(request, firmId)
        if (!insights) return NextResponse.json({ error: BRIO_DATA_UNREADABLE }, { status: 502 })

        // Every engagement in the firm, for each row's status and, after the answer, for links.
        // `rateOrValue` deliberately not selected: nothing monetary goes near this chat.
        const engagements: FirmChatEngagementRecord[] = await prisma.engagement.findMany({
            where: { firmId, isDeleted: false },
            select: { id: true, name: true, slug: true, status: true, client: { select: { name: true, slug: true } } },
            orderBy: { createdAt: 'asc' },
        })

        const context = buildFirmChatContext(insights, { engagements })

        // Gate and client in one call: over the allowance throws before any tokens are spent.
        const meterScope = { firmId, userId: auth.userId, feature: 'firmChat' as const }
        const client = await getGuardedAnthropic(meterScope)
        if (!client) return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })

        const stream = await client.messages.create({
            model: AI_MODEL,
            max_tokens: FIRM_CHAT_MAX_TOKENS,
            output_config: { effort: AI_EFFORT.chat },
            // The prompt and the firm data are the same on every turn of a conversation, so they are
            // cached: a write costs 1.25x, each later read 0.1x. A hit needs a byte-identical prefix,
            // which is why buildFirmChatContext counts from local midnight and keeps every list in a
            // fixed order. Do NOT add a timestamp finer than a day to it.
            system: [
                {
                    type: 'text' as const,
                    text: `${FIRM_CHAT_SYSTEM_PROMPT}\n\n--- FIRM DATA ---\n${context}`,
                    cache_control: { type: 'ephemeral' as const },
                },
            ],
            messages: [...history, { role: 'user' as const, content: question }],
            stream: true,
        })

        const encoder = new TextEncoder()
        const responseBody = new ReadableStream<Uint8Array>({
            async start(controller) {
                let inputTokens = 0
                let outputTokens = 0
                let answerText = ''
                let stopReason: string | null = null
                try {
                    for await (const event of stream) {
                        if (event.type === 'message_start') {
                            // Cached tokens are reported apart from `input_tokens`; added back so
                            // the ledger records the real size of the request.
                            const u = event.message.usage
                            inputTokens = (u?.input_tokens ?? 0)
                                + (u?.cache_creation_input_tokens ?? 0)
                                + (u?.cache_read_input_tokens ?? 0)
                        } else if (event.type === 'message_delta') {
                            outputTokens = event.usage?.output_tokens ?? 0
                            stopReason = event.delta?.stop_reason ?? stopReason
                        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                            answerText += event.delta.text
                            controller.enqueue(encoder.encode(event.delta.text))
                        }
                    }
                    await meterAiCall(meterScope, { inputTokens, outputTokens })

                    // A declined answer, or one that ran out of room, ends like a broken stream: a
                    // clean close would present what came before as a complete answer. The panel
                    // marks it cut off, in Brio's words.
                    if (stopReason === 'refusal' || stopReason === 'max_tokens') {
                        controller.error(new Error(stopReason === 'refusal' ? 'Answer declined' : 'Answer ran out of room'))
                        return
                    }

                    // Links, written by the server once the model is done: only engagements that
                    // exist in this firm, by the exact name the model was given. A failure here
                    // costs the links, never the answer.
                    try {
                        controller.enqueue(encoder.encode(formatFirmSourcesLine({
                            engagements: resolveEngagementLinks(answerText, engagements),
                            drewOn: engagementsDrawnOn(insights),
                        })))
                    } catch (error) {
                        logger.error('AI firm chat: could not resolve links', error as Error)
                    }
                } catch (error) {
                    // Stop, or a closed tab: those tokens were spent, so they are metered (as in
                    // the engagement chat), or ask-then-stop would never touch the allowance.
                    if (isClientDisconnect(error)) {
                        try {
                            await meterAiCall(meterScope, { inputTokens, outputTokens })
                        } catch (meterError) {
                            logger.error('AI usage metering failed (firm chat):', meterError as Error)
                        }
                        return
                    }
                    logger.error('AI firm chat stream error:', error as Error)
                    // Failed, not closed: raw text has no envelope to carry an error, so a clean
                    // close would read as a complete answer. The panel marks it cut off.
                    controller.error(error)
                    return
                }
                controller.close()
            },
        })

        return new Response(responseBody, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
        })
    } catch (error) {
        // Before the stream: out of credits answers the limit's own words (429); anything else is
        // Brio's failure, never "Internal server error".
        return aiFailureResponse(error, BRIO_ANSWER_FAILED, 'AI firm chat error:')
    }
}
