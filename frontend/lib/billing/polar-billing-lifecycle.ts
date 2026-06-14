import { Polar } from '@polar-sh/sdk'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { ensurePolarFreePlanForSandboxFirm } from '@/lib/billing/polar-free-plan'
import { upsertFollowUpReminder } from '@/lib/actions/user-reminders'
import { createAdminClient } from '@/utils/supabase/admin'

function polarServer(): 'production' | 'sandbox' {
    return process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox'
}

function polarClient(): Polar | null {
    const token = process.env.POLAR_ACCESS_TOKEN?.trim()
    if (!token) return null
    return new Polar({ accessToken: token, server: polarServer() })
}

/**
 * When a paid subscription becomes active/trialing, revoke all *other* active Polar subscriptions
 * on the same customer (both free and other paid duplicates) to prevent double-subscriptions.
 */
export async function revokeAllOtherPolarSubscriptions(params: {
    groupId: string
    keepSubscriptionId: string
}): Promise<void> {
    const polar = polarClient()
    if (!polar) {
        logger.warn('[polar-billing-lifecycle] Skipping subscription revoke: POLAR_ACCESS_TOKEN missing')
        return
    }

    let state: Awaited<ReturnType<Polar['customers']['getStateExternal']>>
    try {
        state = await polar.customers.getStateExternal({ externalId: params.groupId })
    } catch (e) {
        logger.warn('[polar-billing-lifecycle] getStateExternal failed; cannot revoke subscriptions', {
            groupId: params.groupId,
            message: e instanceof Error ? e.message : String(e),
        })
        return
    }

    const active = state.activeSubscriptions ?? []
    for (const sub of active) {
        if (sub.id === params.keepSubscriptionId) continue
        try {
            await polar.subscriptions.revoke({ id: sub.id })
            logger.warn('[polar-billing-lifecycle] Revoked duplicate Polar subscription', {
                groupId: params.groupId,
                revokedSubscriptionId: sub.id,
                revokedProductId: sub.productId,
                keptSubscriptionId: params.keepSubscriptionId,
            })
        } catch (e) {
            logger.error(
                '[polar-billing-lifecycle] Failed to revoke Polar subscription',
                e instanceof Error ? e : new Error(String(e)),
                undefined,
                { groupId: params.groupId, subscriptionId: sub.id }
            )
        }
    }
}

/**
 * When a paid subscription ends (canceled/revoked), re-provision the sandbox anchor’s free Polar
 * subscription so the firm row can show an active free tier again.
 */
export async function resyncSandboxFreePlanAfterPaidSubscriptionEnd(groupId: string): Promise<void> {
    const sandboxFirm = await prisma.firm.findFirst({
        where: { groupId, sandboxOnly: true, deletedAt: null },
        select: { id: true },
    })
    if (!sandboxFirm) return

    // Look up the group admin's email from GroupMember + Supabase.
    let userEmail = `billing-resync+${groupId.replace(/-/g, '').slice(0, 12)}@sandbox.invalid`
    try {
        const adminMember = await prisma.groupMember.findFirst({
            where: { groupId, role: 'GROUP_ADMIN' },
            select: { userId: true },
        })
        if (adminMember) {
            const supabase = createAdminClient()
            const { data } = await supabase.auth.admin.getUserById(adminMember.userId)
            if (data.user?.email) userEmail = data.user.email
        }
    } catch {
        // Fall back to synthetic email — Polar will find the existing customer by externalId.
    }

    try {
        await ensurePolarFreePlanForSandboxFirm({
            firmId: sandboxFirm.id,
            userEmail,
        })
        logger.warn('[polar-billing-lifecycle] Resynced sandbox free Polar plan after paid subscription ended', {
            groupId,
            sandboxFirmId: sandboxFirm.id,
        })
    } catch (e) {
        logger.error(
            '[polar-billing-lifecycle] Failed to resync sandbox free plan after paid subscription ended',
            e instanceof Error ? e : new Error(String(e)),
            undefined,
            { groupId }
        )
    }
}

export type PaidSubscriptionSyncContext = {
    groupId: string
    subscriptionId: string | null
    productId: string | null
    status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'none'
}

/**
 * Create a "Reactivate subscription" reminder for every firm_admin of the anchor billing group.
 * Called when subscription.canceled arrives with a future ends_at (scheduled cancellation).
 */
export async function createSubscriptionCancellationRemindersForAdmins(
    groupId: string,
    cancelAt: Date
): Promise<void> {
    const admins = await prisma.firmMember.findMany({
        where: {
            firm: { groupId, deletedAt: null },
            role: 'firm_admin',
        },
        select: { userId: true, firmId: true },
    })

    const dateValue = cancelAt.toISOString().split('T')[0]

    await Promise.all(
        admins.map(({ userId, firmId }) =>
            upsertFollowUpReminder({
                userId,
                entityKey: 'platform.groups',
                entityValue: groupId,
                action: 'Reactivate subscription before access ends',
                dateKey: null,
                dateValue,
                entityName: 'Billing',
                firmId,
                ctaUrl: '/d/billing',
                note: 'Subscription cancelled — non-sandbox firms lose access on this date.',
            }).catch((e) =>
                logger.error(
                    '[polar-billing-lifecycle] Failed to create cancellation reminder',
                    e instanceof Error ? e : new Error(String(e)),
                    undefined,
                    { groupId, userId }
                )
            )
        )
    )

    logger.info('[polar-billing-lifecycle] Created subscription cancellation reminders for admins', {
        groupId,
        adminCount: admins.length,
        cancelAt: cancelAt.toISOString(),
    })
}

/**
 * Remove subscription cancellation reminders for all firm admins.
 * Called on subscription.uncanceled or subscription.revoked (reminders no longer relevant).
 */
export async function clearSubscriptionCancellationRemindersForAdmins(
    groupId: string
): Promise<void> {
    const admins = await prisma.firmMember.findMany({
        where: {
            firm: { groupId, deletedAt: null },
            role: 'firm_admin',
        },
        select: { userId: true },
    })

    await Promise.all(
        admins.map(async ({ userId }) => {
            try {
                const p = await prisma.userPersonalization.findUnique({
                    where: { userId },
                    select: { reminders: true },
                })
                if (!p) return
                const items = Array.isArray(p.reminders) ? (p.reminders as any[]) : []
                const filtered = items.filter(
                    (r) => !(r.entityKey === 'platform.groups' && r.entityValue === groupId)
                )
                if (filtered.length === items.length) return
                await prisma.userPersonalization.update({
                    where: { userId },
                    data: { reminders: filtered },
                })
            } catch (e) {
                logger.error(
                    '[polar-billing-lifecycle] Failed to clear cancellation reminder',
                    e instanceof Error ? e : new Error(String(e)),
                    undefined,
                    { groupId, userId }
                )
            }
        })
    )

    logger.info('[polar-billing-lifecycle] Cleared subscription cancellation reminders for admins', {
        groupId,
        adminCount: admins.length,
    })
}

/** When a paid (non-free) subscription becomes active/trialing, revoke all other active Polar subscriptions. */
export async function maybeRevokeFreePolarAfterPaidSubscriptionSync(ctx: PaidSubscriptionSyncContext): Promise<void> {
    const freeProductId = process.env.POLAR_FREE_PRODUCT_ID?.trim()
    if (!freeProductId || !ctx.subscriptionId || !ctx.productId) return
    if (ctx.productId === freeProductId) return
    if (ctx.status !== 'active' && ctx.status !== 'trialing') return

    await revokeAllOtherPolarSubscriptions({
        groupId: ctx.groupId,
        keepSubscriptionId: ctx.subscriptionId,
    })
}
