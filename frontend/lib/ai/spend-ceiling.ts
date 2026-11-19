import { PRICING_PLANS } from '@/config/pricing'
import { CREDIT_UNIT_MICROS } from './pricing'

/**
 * The dollar backstop (.claude/plans/ai-metering-by-tokens.md, decision 5): a billing group's model
 * spend in a monthly credit window may not pass a share of what its plan costs. Credits already keep a
 * group far below this; the ceiling is for what credits can't see coming: a pricing bug, a model price
 * change, a run of estimated calls.
 */

/** Share of the plan's monthly price that model spend may reach (Deepak, 2026-11-19: 30%). */
export const SPEND_CEILING_SHARE = 0.3

/** The Free plan's ceiling: 50¢ a month (Deepak, 2026-11-19). */
export const FREE_SPEND_CEILING_MICROS = 500_000

/**
 * A plan's monthly price in dollars, from its name as Polar sends it ("Standard", "Standard (annual)").
 * The annual rate when there is one, the lower of the two, so the ceiling is never set from the dearer.
 */
export function monthlyPlanPrice(planName: string | null | undefined): number | null {
    if (!planName) return null
    const name = planName.trim().toLowerCase()
    const plan = PRICING_PLANS.find((p) => name === p.id.toLowerCase() || name.startsWith(`${p.id.toLowerCase()} `) || name.startsWith(`${p.id.toLowerCase()}(`))
    if (!plan) return null
    if (typeof plan.priceBilledAnnually === 'number') return plan.priceBilledAnnually
    const listed = parseInt(plan.price.replace(/[^0-9]/g, ''), 10)
    return Number.isFinite(listed) && listed > 0 ? listed : null
}

/**
 * The group's ceiling in micro-dollars for one monthly window.
 *
 * - A priced plan: 30% of its monthly price.
 * - Free, or no subscription: 50¢.
 * - A plan with no price we can read (Enterprise is quoted): twice what its full credit allowance costs
 *   at the credit unit, so the ceiling sits above honest use of every credit; with no allowance either,
 *   none (credits already uncapped by the allowance; nothing to measure against).
 */
export function spendCeilingMicros(params: { planName: string | null | undefined; hasSubscription: boolean; allowance: number }): number | null {
    if (!params.hasSubscription || /\bfree\b/i.test(params.planName ?? '')) return FREE_SPEND_CEILING_MICROS
    const price = monthlyPlanPrice(params.planName)
    if (price !== null) return Math.round(price * 1_000_000 * SPEND_CEILING_SHARE)
    if (Number.isFinite(params.allowance)) return params.allowance * CREDIT_UNIT_MICROS * 2
    return null
}
