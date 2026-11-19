import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { logger } from '@/lib/logger'
import { recordAiUsage, type AiCallStatus } from './usage'
import { estimateTokens } from './pricing'
import type { AiFeature } from './features'

/**
 * The client every Brio call gets (lib/ai/guarded-client.ts) meters itself: each `messages.create`
 * writes exactly one usage row, however the call ends (.claude/plans/ai-metering-by-tokens.md).
 *
 * - Finished: the model's own token counts; a refusal or a cut-off at `max_tokens` is charged like
 *   any answer, with its stop reason on the row.
 * - Broken part-way, stopped by the reader, or timed out: what was spent so far. A stream that ends
 *   before its last event has no output count, so the output is estimated (from the text it wrote and
 *   the time it ran, whichever is more) and the row is marked `estimated`.
 * - Turned away by the API before it began (a 4xx or 5xx answer): a row with nothing spent, so the
 *   failure is visible, at no charge.
 *
 * Callers meter nothing themselves. A row that can't be written is logged, never thrown: metering
 * must not cost the person their answer.
 */

export interface MeterScope {
    groupId: string
    firmId?: string | null
    userId?: string | null
    feature: AiFeature
}

/**
 * Output tokens a second, for estimating a call we have no count for. On the high side for Haiku 5.5
 * thinking (about 200 a second when measured on 2026-11-19), so an estimate errs toward charging.
 */
const ESTIMATED_OUTPUT_TOKENS_PER_SECOND = 200

type Params = Record<string, unknown> & { model?: string; max_tokens?: number; stream?: boolean }

/** Input tokens for a request we never got counts for: its text, 4 characters a token. */
function estimateInput(params: Params): number {
    return estimateTokens(JSON.stringify([params.system ?? '', params.messages ?? [], params.tools ?? []]))
}

function estimateOutput(params: Params, startedAt: number, textChars: number): number {
    const byTime = Math.floor(((Date.now() - startedAt) / 1000) * ESTIMATED_OUTPUT_TOKENS_PER_SECOND)
    const byText = Math.ceil(textChars / 4)
    const cap = typeof params.max_tokens === 'number' ? params.max_tokens : Number.POSITIVE_INFINITY
    return Math.min(cap, Math.max(byTime, byText))
}

function statusOf(stopReason: string | null | undefined): AiCallStatus {
    if (stopReason === 'refusal') return 'refused'
    if (stopReason === 'max_tokens') return 'cut_off'
    return 'ok'
}

/** How a call that threw ended, and whether it spent anything. */
export function failureOf(error: unknown): { status: AiCallStatus; spent: boolean } {
    if (error instanceof Anthropic.APIUserAbortError) return { status: 'cancelled', spent: true }
    if (error instanceof Anthropic.APIConnectionTimeoutError) return { status: 'timeout', spent: true }
    if (error instanceof Anthropic.APIConnectionError) return { status: 'error', spent: true }
    // An HTTP error answer: the request was refused before the model ran.
    if (error instanceof Anthropic.APIError && typeof error.status === 'number') return { status: 'rejected', spent: false }
    return { status: 'error', spent: true }
}

interface Usage {
    inputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    outputTokens: number
}

function usageOfMessage(u: Record<string, unknown> | undefined | null): Usage {
    const n = (k: string) => (typeof u?.[k] === 'number' ? (u[k] as number) : 0)
    return {
        inputTokens: n('input_tokens'),
        cacheReadTokens: n('cache_read_input_tokens'),
        cacheWriteTokens: n('cache_creation_input_tokens'),
        outputTokens: n('output_tokens'),
    }
}

async function record(scope: MeterScope, model: string, usage: Usage, status: AiCallStatus, stopReason: string | null, estimated: boolean): Promise<void> {
    try {
        await recordAiUsage({ ...scope, model, ...usage, status, stopReason, estimated })
    } catch (error) {
        // recordAiUsage never throws; this is belt and braces for the person's answer.
        logger.error(`AI usage not recorded (${scope.feature}):`, error as Error)
    }
}

type StreamLike = AsyncIterable<unknown> & { controller?: AbortController }

/** The stream, metered once when it ends: finished, broken, or stopped. */
function meterStream(stream: StreamLike, scope: MeterScope, params: Params, startedAt: number): StreamLike {
    const model = String(params.model ?? '')
    async function* events(): AsyncGenerator<unknown> {
        let usage: Usage | null = null
        let finalOutput: number | null = null
        let stopReason: string | null = null
        let textChars = 0
        let ending: { status: AiCallStatus; spent: boolean } | null = null
        try {
            for await (const raw of stream) {
                const event = raw as { type?: string; message?: { usage?: Record<string, unknown> }; usage?: { output_tokens?: number }; delta?: { type?: string; text?: string; stop_reason?: string | null } }
                if (event.type === 'message_start') usage = usageOfMessage(event.message?.usage)
                else if (event.type === 'message_delta') {
                    if (typeof event.usage?.output_tokens === 'number') finalOutput = event.usage.output_tokens
                    stopReason = event.delta?.stop_reason ?? stopReason
                } else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                    textChars += String(event.delta.text ?? '').length
                }
                yield raw
            }
        } catch (error) {
            ending = failureOf(error)
            throw error
        } finally {
            // Reached on every ending: the last event, a throw, or the reader leaving (`return`).
            const done = ending === null && finalOutput !== null
            const status: AiCallStatus = ending?.status ?? (done ? statusOf(stopReason) : 'cancelled')
            const spent = ending ? ending.spent || usage !== null : true
            const base: Usage = usage ?? { inputTokens: spent ? estimateInput(params) : 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }
            const outputTokens = finalOutput ?? (spent ? estimateOutput(params, startedAt, textChars) : 0)
            await record(scope, model, { ...base, outputTokens }, status, stopReason, !done || usage === null)
        }
    }
    return { [Symbol.asyncIterator]: () => events(), controller: stream.controller } as StreamLike
}

/** `client` with every `messages.create` metered for `scope`; the same client in every other way. */
export function meteredClient(client: Anthropic, scope: MeterScope): Anthropic {
    const original = client.messages
    const messages = Object.create(original) as Anthropic['messages']
    const create = ((params: Params, options?: unknown) => {
        const startedAt = Date.now()
        const model = String(params.model ?? '')
        const sent = original.create(params as never, options as never) as Promise<unknown>
        return sent.then(
            async (result) => {
                if (params.stream) return meterStream(result as StreamLike, scope, params, startedAt)
                const message = result as Anthropic.Message
                await record(scope, model, usageOfMessage(message.usage as unknown as Record<string, unknown>), statusOf(message.stop_reason), message.stop_reason ?? null, false)
                return message
            },
            async (error: unknown) => {
                const { status, spent } = failureOf(error)
                const usage: Usage = spent
                    ? { inputTokens: estimateInput(params), cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: params.stream ? 0 : estimateOutput(params, startedAt, 0) }
                    : { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }
                await record(scope, model, usage, status, null, spent)
                throw error
            },
        )
    }) as unknown as Anthropic['messages']['create']
    Object.defineProperty(messages, 'create', { value: create })
    return new Proxy(client, {
        get(target, prop, receiver) {
            return prop === 'messages' ? messages : Reflect.get(target, prop, receiver)
        },
    })
}
