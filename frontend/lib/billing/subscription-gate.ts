import { getFirmRowForBillingGate } from '@/lib/billing/billing-group'
import { logger } from '@/lib/logger'
import { SubscriptionRevokedError } from '@/lib/errors/api-error'

export type PlanTier = 'free' | 'pro' | 'enterprise'
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'none'

export const PLANS: Record<PlanTier, { name: string, features: string[] }> = {
    free: {
        name: 'Free',
        features: ['basic_analytics', '1_project', 'community_support']
    },
    pro: {
        name: 'Pro',
        features: ['advanced_analytics', 'unlimited_projects', 'priority_support', 'audit_logs']
    },
    enterprise: {
        name: 'Enterprise',
        features: ['all_pro_features', 'sso', 'sla', 'dedicated_account_manager']
    }
}

/**
 * Subscription states that still grant product access (Polar-aligned).
 * Keep in sync with `mapPolarSubscriptionStatusToDb` and profile UI
 * (`formatProfilePlanSubtitle` treats active + past_due as “has a plan”).
 */
export const ACCESS_GRANTED_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'] as const

const ACCESS_GRANTED_STATUSES = new Set<string>(ACCESS_GRANTED_SUBSCRIPTION_STATUSES)

/**
 * Checks if an organization has access to a specific feature based on their plan hierarchy.
 * Note: Real implementation would map specific features to minimum tier requirements.
 */
export async function checkFeatureAccess(organizationId: string, feature: string): Promise<boolean> {
    // Billing/paywall rollout is deferred. Keep gates permissive until provider wiring is enabled.
    const enforceBilling = process.env.ENFORCE_BILLING_GATES === 'true'
    if (!enforceBilling) {
        void organizationId
        void feature
        return true
    }

    const org = await getFirmRowForBillingGate(organizationId)

    if (!org) return false

    // Sandbox org is always allowed (product rule).
    if (org.sandboxOnly) return true

    const normalized = (org.subscriptionStatus ?? 'none').toLowerCase().trim()
    if (!ACCESS_GRANTED_STATUSES.has(normalized)) return false

    // Feature mapping placeholder (Polar wiring later)
    void feature
    return true
}

/**
 * DEBUG ONLY: Force upgrade an org
 * Only works in development mode
 */
export async function debugUpgradeOrg(organizationId: string) {
    if (process.env.NODE_ENV !== 'development') return

    // Debug upgrade removed as planTier is gone.
    return
}

export async function requireAccess(organizationId: string, feature: string) {
    const ok = await checkFeatureAccess(organizationId, feature)
    if (!ok) {
        throw new Error('Upgrade required')
    }
}

/**
 * Returns true if the firm (or its anchor) has an active subscription.
 * Sandbox firms always pass. Falls back to allowed on DB miss (fail-open)
 * to avoid false locks on transient errors.
 *
 * Returns false only when ENFORCE_BILLING_GATES is true AND the subscription
 * is definitively revoked/canceled.
 */
export async function checkFirmSubscriptionAccess(firmId: string): Promise<boolean> {
    const enforceBilling = process.env.ENFORCE_BILLING_GATES === 'true'
    if (!enforceBilling) return true

    let org: Awaited<ReturnType<typeof getFirmRowForBillingGate>>
    try {
        org = await getFirmRowForBillingGate(firmId)
    } catch (e) {
        // Fail-open on DB error — never false-lock due to transient failures.
        logger.error(
            '[subscription-gate] DB error in checkFirmSubscriptionAccess — failing open',
            e instanceof Error ? e : new Error(String(e)),
            undefined,
            { firmId }
        )
        return true
    }

    // Null = firm not found — fail-open, log for visibility.
    if (!org) {
        logger.warn('[subscription-gate] Firm not found in checkFirmSubscriptionAccess — failing open', { firmId })
        return true
    }

    // Sandbox firms are always accessible (free tier, no subscription required).
    if (org.sandboxOnly) return true

    const status = (org.subscriptionStatus ?? 'none').toLowerCase().trim()
    const allowed = ACCESS_GRANTED_STATUSES.has(status)

    if (!allowed) {
        logger.warn('[subscription-gate] Firm access denied — subscription not active', {
            firmId,
            resolvedAnchorId: org.id,
            subscriptionStatus: status,
        })
    }

    return allowed
}

/**
 * Throws SubscriptionRevokedError (403) if the firm does not have an active subscription.
 * Use in API routes after membership checks. Plays well with apiHandler / createErrorResponse.
 */
export async function assertFirmSubscriptionAccess(firmId: string): Promise<void> {
    const allowed = await checkFirmSubscriptionAccess(firmId)
    if (!allowed) throw new SubscriptionRevokedError()
}
