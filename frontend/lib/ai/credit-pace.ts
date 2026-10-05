import 'server-only'

/**
 * Is a group spending its AI credits faster than the billing period is elapsing?
 *
 * ## Pace, not position
 *
 * A plain "you have used 50%" threshold cannot tell a problem from a normal month. Half the
 * allowance on day 25 is fine; half on day 10 means running out with ten days dark. The signal is
 * how consumption compares to how much of the period has passed, not where it sits on its own.
 *
 * Both figures are shares of their own total — credits used over allowance, days elapsed over days
 * in the period — so each is 0-100 and the difference between them is in percentage points.
 *
 * ## Why points rather than a ratio
 *
 * A points gap is less sensitive early, when there is less room to be ahead, and that is the right
 * bias: an overspend discovered on day 28 is nearly over anyway, while one on day 8 is worth
 * interrupting someone about. A ratio (used% / elapsed%) reads the same throughout and was the
 * alternative considered.
 */

/**
 * How far ahead of schedule consumption must run before it is worth telling anyone, in percentage
 * points.
 *
 * Fifteen catches a steady 1.5x pace — 50% consumed on day 10 of 30, where the baseline is 33% —
 * while tolerating the lumpiness of a normal week. Twenty-five was considered and rejected: it
 * stays silent on exactly that case.
 */
export const PACE_GAP_POINTS = 15

/**
 * Nothing is reported before this much of the period has passed.
 *
 * Early on the ratio is unstable and meaningless — a single brief on day one is enormously "ahead
 * of pace" against a baseline of ~3%. Ten percent of a monthly period is about three days, by which
 * point a burn rate is a real trend rather than one busy morning.
 */
const MIN_ELAPSED_FRACTION = 0.1

/**
 * And not before this much has actually been spent.
 *
 * Guards small allowances, where a couple of credits can clear the points gap on their own: on the
 * 25-credit free tier, 5 used on day 3 is 20% against a 10% baseline, which is noise rather than a
 * trajectory.
 */
const MIN_CREDITS_FOR_PACE = 5

export interface CreditPace {
    /** Share of the allowance consumed, 0-100. */
    usedPct: number
    /** Share of the billing period elapsed, 0-100. */
    elapsedPct: number
    /** usedPct - elapsedPct, in percentage points. Positive means ahead of schedule. */
    gapPoints: number
    /** True when the gap clears the threshold and the guards above are satisfied. */
    aheadOfPace: boolean
    /**
     * When the allowance is projected to run out at the current rate, or null when the projection
     * is not meaningful (nothing spent, or the run-out falls beyond the period — which is the
     * normal, healthy case).
     */
    projectedExhaustion: Date | null
}

/**
 * Projects consumption against the billing period.
 *
 * Pure and side-effect free so it can be unit tested against fixed dates; callers supply `now`.
 */
export function creditPace(params: {
    allowance: number
    used: number
    periodStart: Date
    periodEnd: Date
    now?: Date
}): CreditPace {
    const { allowance, used, periodStart, periodEnd } = params
    const now = params.now ?? new Date()

    const periodMs = periodEnd.getTime() - periodStart.getTime()
    const elapsedMs = now.getTime() - periodStart.getTime()

    // A non-positive or inverted period means the subscription dates are not usable. Reporting
    // "on pace" is the safe reading: a malformed period must not manufacture a warning.
    if (periodMs <= 0 || !Number.isFinite(allowance) || allowance <= 0) {
        return { usedPct: 0, elapsedPct: 0, gapPoints: 0, aheadOfPace: false, projectedExhaustion: null }
    }

    const elapsedFraction = Math.min(1, Math.max(0, elapsedMs / periodMs))
    const usedFraction = used / allowance

    const usedPct = Math.round(usedFraction * 100)
    const elapsedPct = Math.round(elapsedFraction * 100)
    const gapPoints = usedPct - elapsedPct

    const aheadOfPace =
        elapsedFraction >= MIN_ELAPSED_FRACTION
        && used >= MIN_CREDITS_FOR_PACE
        && gapPoints >= PACE_GAP_POINTS
        && usedFraction < 1

    // Run-out is projected by extending the current rate: the allowance lasts
    // (elapsed / usedFraction) of the period. Null once it lands beyond the period end, since
    // "you will run out after the period resets" is not a warning, it is a healthy month.
    let projectedExhaustion: Date | null = null
    if (usedFraction > 0) {
        const fractionAtExhaustion = elapsedFraction / usedFraction
        if (fractionAtExhaustion < 1) {
            projectedExhaustion = new Date(periodStart.getTime() + fractionAtExhaustion * periodMs)
        }
    }

    return { usedPct, elapsedPct, gapPoints, aheadOfPace, projectedExhaustion }
}
