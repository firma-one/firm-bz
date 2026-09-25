import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { logger } from '@/lib/logger'

// Haiku is the default for every call in this codebase so far: the work is short-form
// summarization and grounded Q&A over a pre-computed payload, not deep reasoning.
export const AI_MODEL = 'claude-haiku-4-5-20251001'

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
    maxTokens: number
    temperature?: number
    label: string
    /**
     * Called with the token counts when the call succeeds, so the caller can meter it.
     *
     * A hook rather than a changed return type: every existing caller wants the text and nothing
     * else, and metering must never be able to fail the completion — hence the catch below.
     */
    onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void | Promise<void>
}): Promise<string | null> {
    const client = getAnthropic()
    if (!client) return null

    try {
        const message = await client.messages.create({
            model: AI_MODEL,
            max_tokens: params.maxTokens,
            temperature: params.temperature ?? 0.3,
            system: params.system,
            messages: [{ role: 'user', content: params.userMessage }],
        })
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
