/**
 * What a model call costs us, and how many credits that is (.claude/plans/ai-metering-by-tokens.md).
 *
 * Credits follow tokens (Deepak, 2026-11-19): a call's credits are its cost to us ÷ the credit unit,
 * rounded up, at least 1 when the model spent any tokens. A call the API turned away before it began
 * (a 4xx or 5xx answer) spent nothing and costs nothing; every other ending is charged, failed and
 * stopped calls included, because Anthropic bills them.
 *
 * Plain numbers, no imports: safe for client components and tests.
 */

/**
 * One credit, in millionths of a US dollar: 0.25¢. On Haiku 5.5 that is 25,000 input tokens or 5,000
 * output tokens (thinking is billed as output). Most Brio actions stay at 1 credit; a memo read or a
 * long summary takes 2 to 4.
 */
export const CREDIT_UNIT_MICROS = 2_500

/** US$ per million tokens, from Anthropic's price list. Cache reads are 0.1× input, cache writes 1.25×. */
export interface ModelPrice {
    input: number
    output: number
    /** Prompts longer than this many input tokens are billed at the `long` rates. */
    longContextFrom?: number
    long?: { input: number; output: number }
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
    'claude-haiku-5-5': { input: 0.10, output: 0.50, longContextFrom: 100_000, long: { input: 0.50, output: 2.50 } },
    'claude-haiku-4-5': { input: 1.00, output: 5.00 },
    'claude-sonnet-5-5': { input: 2.00, output: 10.00 },
    'claude-opus-5-5': { input: 4.00, output: 20.00 },
}

/**
 * A model missing from the table is priced as the dearest one we list, so a model change that forgets
 * this file can only overcharge, never give calls away. The cap-fit test fails on an unlisted AI_MODEL.
 */
const UNLISTED: ModelPrice = MODEL_PRICES['claude-opus-5-5']

export function priceOf(model: string): ModelPrice {
    return MODEL_PRICES[model] ?? UNLISTED
}

export interface CallTokens {
    /** Uncached input tokens. */
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
}

/** The call's cost in millionths of a dollar, rounded up. US$ per million tokens = micro-dollars per token. */
export function costMicrosOf(model: string, t: CallTokens): number {
    const price = priceOf(model)
    const promptTokens = t.inputTokens + (t.cacheReadTokens ?? 0) + (t.cacheWriteTokens ?? 0)
    const rates = price.long && price.longContextFrom !== undefined && promptTokens > price.longContextFrom
        ? price.long
        : { input: price.input, output: price.output }
    const micros = t.inputTokens * rates.input
        + (t.cacheReadTokens ?? 0) * rates.input * 0.1
        + (t.cacheWriteTokens ?? 0) * rates.input * 1.25
        + t.outputTokens * rates.output
    return Math.ceil(micros)
}

/** Credits for a call that cost `costMicros`: rounded up, at least 1 when it cost anything. */
export function creditsForCost(costMicros: number): number {
    if (costMicros <= 0) return 0
    return Math.max(1, Math.ceil(costMicros / CREDIT_UNIT_MICROS))
}

/** A rough token count for text we never got counts for (a stream stopped early): 4 characters a token. */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
}
