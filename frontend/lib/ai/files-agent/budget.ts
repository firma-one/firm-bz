/**
 * Cost ceiling for an agent run.
 *
 * Every other AI feature in this codebase is one bounded call charged one flat credit, so its cost
 * is knowable before it runs. An agent loop is not: it decides how many turns it needs, and a
 * confused one can decide it needs many. Without a ceiling, a single run could consume a firm's
 * monthly allowance.
 *
 * Three guards, in order of how early they stop a problem:
 *
 * 1. {@link estimateRunCredits} is shown to the user BEFORE the run, so the spend is consented to.
 * 2. {@link canAffordRun} refuses to start a run the balance cannot finish — better to decline
 *    than to spend half the allowance and stop with nothing to show.
 * 3. {@link MAX_AGENT_TURNS} aborts a run that is not converging, returning partial findings.
 *
 * The existing burst window (10% of allowance over 4 hours) already catches a runaway loop across
 * requests; none of it bounds a single request, which is what this adds.
 *
 * Pure: no Prisma, no `server-only`, no clock. Callers pass the status they already read.
 */

/**
 * Hard ceiling on model turns in one run.
 *
 * Eight is enough for the analyse-then-propose shape this agent actually has — one call to phrase
 * findings, a few to refine proposals against a large tree — while being far below the point where
 * a loop could do real damage. A run that hits the cap returns what it has rather than failing, so
 * the user gets partial value for credits already spent.
 */
export const MAX_AGENT_TURNS = 8

/**
 * Credits charged per model turn.
 *
 * One, matching chat, so the user's mental model stays "a credit is an answer" rather than needing
 * a second pricing concept for agent work.
 */
export const CREDITS_PER_TURN = 1

/**
 * Turns the analysis is expected to need, before the model is called.
 *
 * Deliberately conservative — it is the number shown to the user and checked against their
 * balance, so under-estimating would let a run start that cannot finish. Scales with tree size
 * because a larger file list means more proposals to produce, not more thinking.
 */
export function estimateRunTurns(nodeCount: number): number {
    if (nodeCount <= 50) return 2
    if (nodeCount <= 200) return 3
    if (nodeCount <= 600) return 5
    return MAX_AGENT_TURNS
}

/** Credits a run is expected to cost, for the confirmation shown before it starts. */
export function estimateRunCredits(nodeCount: number): number {
    return estimateRunTurns(nodeCount) * CREDITS_PER_TURN
}

export interface AffordabilityVerdict {
    allowed: boolean
    estimate: number
    /** Credits left in the period. Null when no entitlement resolved. */
    remaining: number | null
    /** Shown to the user when `allowed` is false. */
    reason?: string
}

/**
 * Whether a run should be allowed to start.
 *
 * Checks the WHOLE estimated run against the balance, not just the next turn. The per-call cap
 * (`assertWithinAiCreditCap`) would let a run begin with two credits left and fail on turn three,
 * having spent them for nothing — the user pays and gets no findings.
 *
 * `remaining: null` means no entitlement resolved, which the credit cap deliberately treats as
 * fail-open; this follows that decision rather than inventing a stricter one.
 */
export function canAffordRun(
    nodeCount: number,
    status: { remaining: number | null; enforced: boolean },
): AffordabilityVerdict {
    const estimate = estimateRunCredits(nodeCount)

    if (!status.enforced || status.remaining === null) {
        return { allowed: true, estimate, remaining: status.remaining }
    }

    if (status.remaining < estimate) {
        return {
            allowed: false,
            estimate,
            remaining: status.remaining,
            reason: `This review needs about ${estimate} AI credits and you have ${status.remaining} left this period.`,
        }
    }

    return { allowed: true, estimate, remaining: status.remaining }
}

/** Tracks spend across a run so the loop can stop itself. */
export class RunBudget {
    private turnsUsed = 0

    constructor(private readonly maxTurns: number = MAX_AGENT_TURNS) {}

    /** True while another model turn is permitted. */
    canContinue(): boolean {
        return this.turnsUsed < this.maxTurns
    }

    /** Records a turn. Call after each model call, whatever its outcome. */
    recordTurn(): void {
        this.turnsUsed += 1
    }

    get turns(): number {
        return this.turnsUsed
    }

    get creditsSpent(): number {
        return this.turnsUsed * CREDITS_PER_TURN
    }

    /** True when the run stopped because it ran out of turns rather than because it finished. */
    get exhausted(): boolean {
        return this.turnsUsed >= this.maxTurns
    }
}
