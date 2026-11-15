import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { getAnthropic } from './client'
import { assertWithinAiCreditCap, AiCreditLimitError } from './credit-cap'
import { assertWithinPersonLimits } from './person-limit'
import { recordAiUsage, type AiFeature } from './usage'
import { logger } from '@/lib/logger'
import { maskingClient } from './masked-client'
import type { Vault } from './pseudonymize'

export { AiCreditLimitError }

/**
 * What the model may read (§14 item 5): every call says. `vault` from lib/ai/known-entities.ts puts
 * placeholders in place of names, emails, links and ID numbers, and the real words back in the answer.
 * Null only when the firm turned masking off (Settings › Brio), which the loaders return.
 */
export interface AiMasking {
    vault: Vault | null
}

export interface AiScope {
    firmId?: string | null
    groupId?: string | null
    userId?: string | null
    feature: AiFeature
}

/**
 * The single entry point for a metered AI call.
 *
 * Gating and metering are attached to the CLIENT rather than to each route, so a new AI surface
 * gets both by asking for a client at all. The alternative — a route wrapper, the Next.js
 * equivalent of a Spring `@RateLimited` annotation — does not fit here: the billing scope is
 * resolved inside each handler (`resolveProjectContext`), so a wrapper would have to repeat that
 * lookup and would run the cap check before the permission check, which is the wrong order.
 *
 * This matters because metering was wired at three of four call sites for two days and nobody
 * noticed. Nothing enforced it. Now the only way to reach the model is through here.
 *
 * Throws `AiCreditLimitError` when over budget, or over the person's own limits (kind 'person',
 * lib/ai/person-limit.ts, every feature, free ones included) — before any tokens are spent.
 *
 * `masking` is required, so no call reaches the model without saying what it may read (§14 item 5).
 */
export async function getGuardedAnthropic(scope: AiScope, masking: AiMasking): Promise<Anthropic | null> {
    const client = getAnthropic()
    if (!client) return null
    await assertWithinAiCreditCap({ firmId: scope.firmId, groupId: scope.groupId, feature: scope.feature })
    // After the group's credits: a refusal there shouldn't count as a call the person started.
    await assertWithinPersonLimits({ userId: scope.userId, feature: scope.feature })
    return masking.vault ? maskingClient(client, masking.vault) : client
}

/**
 * Records a completed call. Separate from the gate because streaming routes only learn their
 * token counts when the stream ends, and a stream that dies mid-flight is not a billable call.
 */
export async function meterAiCall(
    scope: AiScope,
    usage: { inputTokens: number; outputTokens: number },
): Promise<void> {
    await recordAiUsage({
        firmId: scope.firmId,
        groupId: scope.groupId,
        userId: scope.userId,
        feature: scope.feature,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
    })
}

/** Reads token counts off a non-streaming message. */
export function usageOf(message: Anthropic.Message): { inputTokens: number; outputTokens: number } {
    return {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
    }
}

/**
 * Converts an `AiCreditLimitError` into a 429, or returns null for anything else so the caller's
 * own error handling runs unchanged.
 *
 * 429 rather than 402: the period limit resets on its own and a burst breach clears in hours, so
 * both are "too many requests" rather than "payment required". `kind` lets the client tell an
 * upgrade prompt from a transient wait.
 */
export function aiLimitResponse(error: unknown): Response | null {
    if (!(error instanceof AiCreditLimitError)) return null
    return Response.json(
        { error: error.message, kind: error.kind, limit: error.limit, used: error.used },
        { status: 429 },
    )
}

/**
 * The answer for a Brio route's outer catch: the limit's own words when credits ran out (429),
 * otherwise `words` (Brio's failure, lib/ai/brio-failure.ts) with a 500, logged under `logContext`.
 * Never the error's own text, which may be a provider's or a database's internals.
 */
export function aiFailureResponse(error: unknown, words: string, logContext: string): Response {
    const limited = aiLimitResponse(error)
    if (limited) return limited
    logger.error(logContext, error as Error)
    return Response.json({ error: words }, { status: 500 })
}
