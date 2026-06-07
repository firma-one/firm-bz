import type { BillingCurrentPlanState } from '@/components/billing/polar-plans-picker'
import { upgradeCopy } from '@/lib/billing/upgrade-copy'

/** Aligns with status chips in `polar-plans-picker` (human-readable). */
export function formatSubscriptionStatus(status: string | null | undefined): string {
    if (!status || status === 'none') return 'Setup pending'
    return status
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
}

function isActiveLikeStatus(status: string): boolean {
    return ['active', 'trialing', 'past_due'].includes(status.toLowerCase())
}

/**
 * True when the workspace has an active paid recurring subscription (not sandbox/free tier marketing).
 */
export function isPaidSubscriptionActive(state: BillingCurrentPlanState): boolean {
    const st = (state.subscriptionStatus ?? '').toLowerCase()
    if (!isActiveLikeStatus(st)) return false
    return state.pricingModel === 'recurring_subscription'
}

/**
 * “Grow beyond the sandbox” / free-tier marketing — only for sandbox-style billing (not any Polar recurring product).
 */
export function shouldShowSandboxUpgradeMarketing(state: BillingCurrentPlanState): boolean {
    return state.pricingModel !== 'recurring_subscription'
}

/**
 * Primary label for the current subscription (summary strip + consistency with plan cards).
 */
export function currentPlanPrimaryLabel(state: BillingCurrentPlanState): string {
    const st = (state.subscriptionStatus ?? '').toLowerCase()
    const paidRecurring =
        state.pricingModel === 'recurring_subscription' &&
        isActiveLikeStatus(st) &&
        Boolean(state.subscriptionPlan?.trim())

    if (paidRecurring && state.subscriptionPlan) {
        return state.subscriptionPlan.trim()
    }

    if (state.pricingModel === 'one_time_purchase' || st === 'none' || st === '') {
        return upgradeCopy.billingIncludedLabel
    }

    if (!isActiveLikeStatus(st) && state.subscriptionPlan?.trim()) {
        return state.subscriptionPlan.trim()
    }

    if (state.subscriptionPlan?.trim()) {
        return state.subscriptionPlan.trim()
    }

    return upgradeCopy.billingIncludedLabel
}

/**
 * `Plan:` line for the billing summary — uses {@link BillingCurrentPlanState.subscriptionPlan}
 * from `/api/billing/current-plan` (firm row + Polar backfill). Fallback only if unset.
 */
export function planNameForSummary(state: BillingCurrentPlanState): string {
    const fromApi = state.subscriptionPlan?.trim()
    if (fromApi) return fromApi
    return upgradeCopy.currentPlanNameFallback
}

/**
 * `Valid until:` / `Access ends:` value — renewal/trial end date, or `Unlimited` when not tied to a period end.
 */
export function validUntilForSummary(state: BillingCurrentPlanState): string {
    const st = (state.subscriptionStatus ?? '').toLowerCase()

    // Prefer scheduledCancelAt when present — subscription is active but cancellation is scheduled.
    const accessEndsIso = state.scheduledCancelAtIso ?? state.periodEndIso
    if (accessEndsIso) {
        const d = new Date(accessEndsIso)
        if (!Number.isNaN(d.getTime())) {
            return d.toLocaleDateString(undefined, { dateStyle: 'medium' })
        }
    }

    if (state.pricingModel === 'one_time_purchase' || st === 'none' || st === '') {
        return upgradeCopy.currentPlanValidUntilUnlimited
    }

    if (isActiveLikeStatus(st) && state.pricingModel === 'recurring_subscription') {
        return upgradeCopy.currentPlanValidUntilUnlimited
    }

    return upgradeCopy.currentPlanValidUntilUnlimited
}

/** True when the subscription is active but scheduled to cancel at period end. */
export function isScheduledToCancel(state: BillingCurrentPlanState): boolean {
    return Boolean(state.scheduledCancelAtIso)
}

export function currentPlanPeriodCaption(
    state: BillingCurrentPlanState
): { kind: 'trial_end' | 'renews' | null; date: Date | null } {
    const st = (state.subscriptionStatus ?? '').toLowerCase()
    if (!state.periodEndIso) {
        return { kind: null, date: null }
    }
    const date = new Date(state.periodEndIso)
    if (Number.isNaN(date.getTime())) {
        return { kind: null, date: null }
    }
    if (st === 'trialing') {
        return { kind: 'trial_end', date }
    }
    if (st === 'active' || st === 'past_due') {
        return { kind: 'renews', date }
    }
    return { kind: null, date: null }
}
