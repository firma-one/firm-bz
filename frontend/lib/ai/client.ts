import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { logger } from '@/lib/logger'

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
    /** A memo's minutes: a fixed shape, and judging what was said in the meeting from the writer's asides. */
    minutes: 'medium',
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
 *
 * `client` is the gated, metered, masked one from `getGuardedAnthropic` (lib/ai/guarded-client.ts):
 * the call is charged however it ends, a refusal and an error included (no free calls, 2026-11-19).
 */
export async function completeText(params: {
    client: Anthropic
    system: string
    userMessage: string
    /** Room for the thinking as well as the answer: thinking counts toward it. */
    maxTokens: number
    effort: 'low' | 'medium' | 'high'
    label: string
}): Promise<string | null> {
    try {
        const message = await params.client.messages.create({
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
        if (message.stop_reason === 'max_tokens') {
            // Cut off: half an answer is not an answer. Logged, so a cap too small for the work shows.
            logger.warn(`AI completion cut off at its cap (${params.label}, ${params.maxTokens} tokens)`)
            return null
        }
        return extractText(message) || null
    } catch (error) {
        logger.error(`AI completion failed (${params.label}):`, error as Error)
        return null
    }
}
