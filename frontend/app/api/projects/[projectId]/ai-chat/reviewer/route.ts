import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { requireEngagementMember, isExternalEngagementRole } from '@/lib/engagement-access'
import { isAiConfigured, AI_EFFORT, AI_MODEL } from '@/lib/ai/client'
import { getGuardedAnthropic, meterAiCall, aiFailureResponse } from '@/lib/ai/guarded-client'
import { BRIO_ANSWER_FAILED } from '@/lib/ai/brio-failure'
import { sanitizeHistory, MAX_QUESTION_LENGTH } from '@/lib/ai/engagement-chat'
import {
    REVIEWER_CHAT_SYSTEM_PROMPT,
    buildReviewerContext,
    loadReviewerView,
    type ExternalRole,
} from '@/lib/ai/reviewer-context'
import { reviewerBrioEnabled, REVIEWER_DAILY_ANSWERS, reviewerAnswersToday } from '@/lib/ai/reviewer-brio'

/**
 * POST /api/projects/[projectId]/ai-chat/reviewer   { question, history }
 *
 * Brio for Reviewers and Limited Access contributors (.claude/plans/brio-features-round-2.md, §3.6):
 * read-only answers built ONLY from what the asker can see (lib/ai/reviewer-context.ts). Firm roles
 * use the engagement chat instead and are refused here, so this route can never be the wider one.
 *
 * Off until a firm admin turns it on (firm Settings), charged to the firm's credits, and capped at
 * REVIEWER_DAILY_ANSWERS answers per person per day. Streams plain text, like the engagement chat.
 * Asking is reading, so a completed engagement stays open here.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> },
) {
    try {
        const { projectId } = await params

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const ctx = await resolveProjectContext(projectId)
        if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        const member = await requireEngagementMember(projectId, user.id)
        if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        if (!isExternalEngagementRole(member.role)) {
            return NextResponse.json({ error: 'Use the engagement assistant on the Overview.' }, { status: 403 })
        }
        if (!(await reviewerBrioEnabled(ctx.firmId))) {
            return NextResponse.json({ error: 'Brio is not turned on for this portal.' }, { status: 403 })
        }
        if (!isAiConfigured()) return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })

        const body = await request.json().catch(() => null)
        if (!body || typeof body.question !== 'string' || !body.question.trim()) {
            return NextResponse.json({ error: 'A question is required' }, { status: 400 })
        }
        const question = body.question.trim().slice(0, MAX_QUESTION_LENGTH)
        const history = sanitizeHistory(body.history)

        if ((await reviewerAnswersToday(user.id)) >= REVIEWER_DAILY_ANSWERS) {
            return NextResponse.json(
                { error: `You've asked Brio ${REVIEWER_DAILY_ANSWERS} questions today. Ask again tomorrow, or ask the firm in a comment.` },
                { status: 429 },
            )
        }

        const view = await loadReviewerView(projectId, member.role as ExternalRole)
        if (!view) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

        const scope = { firmId: ctx.firmId, userId: user.id, feature: 'reviewerChat' as const }
        const client = await getGuardedAnthropic(scope)
        if (!client) return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })

        const stream = await client.messages.create({
            model: AI_MODEL,
            max_tokens: 2000,
            output_config: { effort: AI_EFFORT.chat },
            // Byte-stable across a conversation (day-granular dates), so later turns read it from cache.
            system: [{
                type: 'text' as const,
                text: `${REVIEWER_CHAT_SYSTEM_PROMPT}\n\n--- FACTS ---\n${buildReviewerContext(view)}`,
                cache_control: { type: 'ephemeral' as const },
            }],
            messages: [...history, { role: 'user' as const, content: question }],
            stream: true,
        })

        const encoder = new TextEncoder()
        const out = new ReadableStream<Uint8Array>({
            async start(controller) {
                let inputTokens = 0
                let outputTokens = 0
                let stopReason: string | null = null
                try {
                    for await (const event of stream) {
                        if (event.type === 'message_start') {
                            const u = event.message.usage
                            inputTokens = (u?.input_tokens ?? 0)
                                + (u?.cache_creation_input_tokens ?? 0)
                                + (u?.cache_read_input_tokens ?? 0)
                        } else if (event.type === 'message_delta') {
                            outputTokens = event.usage?.output_tokens ?? 0
                            stopReason = event.delta?.stop_reason ?? stopReason
                        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                            controller.enqueue(encoder.encode(event.delta.text))
                        }
                    }
                    await meterAiCall(scope, { inputTokens, outputTokens })
                    // A declined answer ends as a broken stream, never as a complete-looking one.
                    if (stopReason === 'refusal') {
                        controller.error(new Error('Answer declined'))
                        return
                    }
                    controller.close()
                } catch (error) {
                    // Tokens spent before a disconnect are metered, as in the engagement chat: the
                    // daily cap counts this ledger, so ask-then-stop must count too.
                    await meterAiCall(scope, { inputTokens, outputTokens }).catch(() => {})
                    logger.error('Reviewer chat stream error:', error as Error)
                    try { controller.error(error) } catch { /* the reader already left */ }
                }
            },
        })

        return new Response(out, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
        })
    } catch (error) {
        return aiFailureResponse(error, BRIO_ANSWER_FAILED, 'Reviewer chat error:')
    }
}
