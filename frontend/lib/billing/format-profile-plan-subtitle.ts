import type { BillingCurrentPlanState } from '@/components/billing/polar-plans-picker'
import { profileBillingCopy } from '@/lib/billing/profile-billing-copy'
import { BRAND_NAME } from '@/config/brand'

function withBrandName(text: string): string {
    return text.replace(/\bfirma\b/gi, BRAND_NAME)
}

/**
 * One-line label for the profile menu (under the user’s name): current plan / sandbox / status.
 */
export function formatProfilePlanSubtitle(
    state: BillingCurrentPlanState | null,
    options?: { sandboxOnly?: boolean }
): string {
    const plan = state?.subscriptionPlan?.trim()
    if (plan) return `${withBrandName(plan)} plan`

    const status = (state?.subscriptionStatus ?? '').toLowerCase()
    const pricing = state?.pricingModel

    if (options?.sandboxOnly && (!state || pricing === 'one_time_purchase')) {
        return 'Sandbox'
    }

    if (status === 'trialing') return 'Trialing'
    if (status === 'active' || status === 'past_due') return profileBillingCopy.freePlanFallbackName
    if (!status || status === 'none') return '—'

    return status
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
}
