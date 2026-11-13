import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { AI_MODEL } from './client'
import { meterAiCall, type AiScope } from './guarded-client'
import { logger } from '@/lib/logger'

/**
 * Streams one short piece of writing (a status update, a reply, a nudge) as newline-delimited JSON:
 * `{type:'meta'}`, then `{type:'delta', text}` as it is written, then `{type:'done', text}` or
 * `{type:'error', message}`. `components/brio/use-brio-draft.ts` reads it.
 *
 * Drafts are never sent or saved here: a person edits and sends them through the surface's own
 * action. So a broken stream costs only the draft.
 *
 * The model call starts BEFORE the response is built, so a refusal to start (credit limit already
 * checked by `getGuardedAnthropic`, an overloaded model) throws to the caller's catch, which answers
 * it with `aiFailureResponse`. Failures part-way arrive as an `error` event in `failure`'s words.
 *
 * Metering follows the chat route: a complete draft is metered, and so is one the reader stopped
 * part-way, since those tokens were spent; repeated start-then-stop must not be free.
 */
export async function streamDraft(params: {
    client: Anthropic
    scope: AiScope
    system: string
    user: string
    effort: 'low' | 'medium' | 'high'
    /** Room for thinking as well as the draft: thinking counts toward it. */
    maxTokens: number
    /** Brio's words for this surface's failure (lib/ai/brio-failure.ts). */
    failure: string
    label: string
}): Promise<Response> {
    const modelStream = await params.client.messages.create({
        model: AI_MODEL,
        max_tokens: params.maxTokens,
        output_config: { effort: params.effort },
        system: params.system,
        messages: [{ role: 'user', content: params.user }],
        stream: true,
    })

    const encoder = new TextEncoder()
    const line = (o: unknown) => encoder.encode(JSON.stringify(o) + '\n')
    let inputTokens = 0
    let outputTokens = 0
    let metered = false
    let cancelled = false
    const meter = async () => {
        if (metered) return
        metered = true
        try {
            await meterAiCall(params.scope, { inputTokens, outputTokens })
        } catch (error) {
            // Metering is bookkeeping; losing a row must not cost the user their draft.
            logger.error(`AI usage metering failed (${params.label}):`, error as Error)
        }
    }

    const body = new ReadableStream<Uint8Array>({
        async start(controller) {
            let full = ''
            let stopReason: string | null = null
            try {
                controller.enqueue(line({ type: 'meta' }))
                for await (const event of modelStream) {
                    if (event.type === 'message_start') {
                        const u = event.message.usage
                        inputTokens = (u?.input_tokens ?? 0)
                            + (u?.cache_creation_input_tokens ?? 0)
                            + (u?.cache_read_input_tokens ?? 0)
                    } else if (event.type === 'message_delta') {
                        outputTokens = event.usage?.output_tokens ?? 0
                        stopReason = event.delta?.stop_reason ?? stopReason
                    } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                        full += event.delta.text
                        controller.enqueue(line({ type: 'delta', text: event.delta.text }))
                    }
                }
                if (cancelled) return
                await meter()

                const text = full.trim()
                // Declined, cut off at the cap, or empty: not a draft anyone should send.
                if (!text || stopReason === 'refusal' || stopReason === 'max_tokens') {
                    controller.enqueue(line({ type: 'error', message: params.failure }))
                    return
                }
                controller.enqueue(line({ type: 'done', text }))
            } catch (error) {
                if (cancelled) return
                logger.error(`AI draft stream error (${params.label}):`, error as Error)
                await meter()
                controller.enqueue(line({ type: 'error', message: params.failure }))
            } finally {
                try { controller.close() } catch { /* already closed by the reader leaving */ }
            }
        },
        async cancel() {
            cancelled = true
            modelStream.controller.abort()
            await meter()
        },
    })

    return new Response(body, {
        headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
    })
}
