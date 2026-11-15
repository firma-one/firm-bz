import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { logger } from '@/lib/logger'
import { maskingClient } from './masked-client'
import type { Vault } from './pseudonymize'

// Haiku is the default for every call in this codebase so far: the work is short-form
// summarization and grounded Q&A over a pre-computed payload, not deep reasoning.
//
// Haiku 5.5, moved from Haiku 4.5 on 2026-11-12: a tenth of the price per token. Two things changed
// with it, and every call site follows both:
// - No `temperature`, `top_p` or `top_k`. Haiku 5.5 refuses non-default values with a 400, and so
//   does every model once the SDK moves to API version 2026-10-21. Tone comes from the prompt.
// - It thinks before answering, and thinking counts toward `max_tokens`. Each surface sets an
//   effort level (AI_EFFORT) and a cap with room for the thinking as well as the answer; the old
//   caps were sized for the answer alone and would cut answers off.
export const AI_MODEL = 'claude-haiku-5-5'

/**
 * How much Brio thinks on each surface. Lower is faster and cheaper; the model may skip thinking
 * entirely on a simple request.
 *
 * `low` where the answer is short and grounded in a payload it is handed. `medium` where the output
 * must follow a strict shape (the summary's seven fixed headings and placeholder lines) or weigh
 * judgments (the Files agent's proposals).
 */
export const AI_EFFORT = {
    chat: 'low',
    brief: 'low',
    summary: 'medium',
    interpret: 'low',
    filesAgent: 'medium',
    draft: 'low',
    dayBrief: 'low',
    proposals: 'medium',
    raid: 'medium',
} as const satisfies Record<string, 'low' | 'medium' | 'high'>

let cached: Anthropic | null = null

export function isAiConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY)
}

/** Returns null rather than throwing when unconfigured, so callers degrade to a non-AI path. */
export function getAnthropic(): Anthropic | null {
    if (!isAiConfigured()) return null
    if (!cached) cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    return cached
}

export function extractText(message: Anthropic.Message): string {
    return message.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()
}

/**
 * Every AI feature here is an enhancement over a page that already works, so an API failure
 * must never surface as a broken page — callers render without the AI section instead.
 */
export async function completeText(params: {
    system: string
    userMessage: string
    /** Room for the thinking as well as the answer: thinking counts toward it. */
    maxTokens: number
    effort: 'low' | 'medium' | 'high'
    label: string
    /**
     * Called with the token counts when the call succeeds, so the caller can meter it.
     *
     * A hook rather than a changed return type: every existing caller wants the text and nothing
     * else, and metering must never be able to fail the completion — hence the catch below.
     */
    onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void | Promise<void>
    /** What the model may read, as for getGuardedAnthropic (§14 item 5): required, null only when the firm turned it off. */
    vault: Vault | null
}): Promise<string | null> {
    const raw = getAnthropic()
    if (!raw) return null
    const client = params.vault ? maskingClient(raw, params.vault) : raw

    try {
        const message = await client.messages.create({
            model: AI_MODEL,
            max_tokens: params.maxTokens,
            output_config: { effort: params.effort },
            system: params.system,
            messages: [{ role: 'user', content: params.userMessage }],
        })
        // A declined request is a normal 200 with no answer in it: treat it as no result, the same
        // as a failure, so the page renders without the AI section.
        if (message.stop_reason === 'refusal') {
            logger.warn(`AI completion declined (${params.label})`)
            return null
        }
        if (params.onUsage) {
            try {
                await params.onUsage({
                    inputTokens: message.usage.input_tokens,
                    outputTokens: message.usage.output_tokens,
                })
            } catch (error) {
                // Metering is bookkeeping; losing a row must not cost the user their result.
                logger.error(`AI usage hook failed (${params.label}):`, error as Error)
            }
        }
        return extractText(message) || null
    } catch (error) {
        logger.error(`AI completion failed (${params.label}):`, error as Error)
        return null
    }
}
