import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { getAnthropic } from './client'
import { assertWithinAiCreditCap, AiCreditLimitError } from './credit-cap'
import { recordAiUsage, type AiFeature } from './usage'

export { AiCreditLimitError }

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
 * Throws `AiCreditLimitError` when over budget — before any tokens are spent.
 */
export async function getGuardedAnthropic(scope: AiScope): Promise<Anthropic | null> {
    const client = getAnthropic()
    if (!client) return null
    await assertWithinAiCreditCap({ firmId: scope.firmId, groupId: scope.groupId, feature: scope.feature })
    return client
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
