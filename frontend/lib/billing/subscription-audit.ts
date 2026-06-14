import { prisma } from '@/lib/prisma'

/**
 * Interactive-transaction client from this app's extended `prisma` (matches `$transaction` callback `tx`).
 */
type BillingTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Optional platform user id used for `platform.subscriptions.createdBy` / `updatedBy`
 * when the write is not attributable to a signed-in user (e.g. Polar webhooks).
 * Falls back to the GROUP_ADMIN of the group when unset.
 */
function billingSubscriptionActorFromEnv(): string | null {
    const v = process.env.PLATFORM_BILLING_SUBSCRIPTION_ACTOR_USER_ID?.trim()
    return v || null
}

/**
 * Resolves `createdBy` / `updatedBy` for `platform.subscriptions` rows.
 * Order: explicit user → `PLATFORM_BILLING_SUBSCRIPTION_ACTOR_USER_ID` → GROUP_ADMIN of the group.
 */
export async function resolveSubscriptionAuditUserId(
    tx: BillingTx,
    groupId: string,
    explicitUserId?: string | null
): Promise<string | null> {
    const u = explicitUserId?.trim()
    if (u) return u
    const fromEnv = billingSubscriptionActorFromEnv()
    if (fromEnv) return fromEnv
    const member = await tx.groupMember.findFirst({
        where: { groupId, role: 'GROUP_ADMIN' },
        orderBy: { createdAt: 'asc' },
        select: { userId: true },
    })
    return member?.userId ?? null
}
