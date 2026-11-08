import type { BillingCurrentPlanState } from '@/components/billing/polar-plans-picker'
import { failureFrom, failureReason } from '@/lib/files/action-failure'

export type BillingCurrentPlanLoad =
    | { ok: true; current: BillingCurrentPlanState | null }
    | { ok: false; error: string }

/**
 * Load the plan for a firm's billing group, telling a failed load apart from "no plan": Billing must
 * not read a failure as "not paid" and offer Checkout to someone already paying.
 */
export async function loadBillingCurrentPlan(firmId: string): Promise<BillingCurrentPlanLoad> {
    try {
        const res = await fetch(`/api/billing/current-plan?firmId=${encodeURIComponent(firmId)}`, {
            cache: 'no-store',
        })
        if (!res.ok) return { ok: false, error: failureReason(await failureFrom(res)) }
        const body = (await res.json().catch(() => ({}))) as { current?: BillingCurrentPlanState }
        return { ok: true, current: body.current ?? null }
    } catch (e) {
        return { ok: false, error: failureReason(e) }
    }
}

/** @deprecated Reads a failed load as "no plan". Use {@link loadBillingCurrentPlan}. Kept for the onboarding sidebar. */
export async function fetchBillingCurrentPlan(firmId: string): Promise<BillingCurrentPlanState | null> {
    const r = await loadBillingCurrentPlan(firmId)
    return r.ok ? r.current : null
}
