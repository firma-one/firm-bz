import { prisma } from '@/lib/prisma'
import type { Subscription } from '@prisma/client'

/** Active billing row for a firm (at most one; partial unique index + webhook maintain). */
export async function getActiveSubscriptionForFirm(firmId: string): Promise<Subscription | null> {
    return prisma.subscription.findFirst({
        where: { firmId, active: true, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
    })
}

/** Replaces removed `platform.subscriptions.status` for API/UI: access follows `active`. */
export function subscriptionAccessStatusLabel(sub: Pick<Subscription, 'active'> | null): string | null {
    if (!sub?.active) return null
    return 'active'
}

export async function findFirmIdByPolarCustomerId(customerId: string): Promise<string | null> {
    const row = await prisma.subscription.findFirst({
        where: { polarCustomerId: customerId, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        select: { firmId: true },
    })
    return row?.firmId ?? null
}

export async function findFirmIdByPolarSubscriptionId(subscriptionId: string): Promise<string | null> {
    const row = await prisma.subscription.findFirst({
        where: { polarSubscriptionId: subscriptionId, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        select: { firmId: true },
    })
    return row?.firmId ?? null
}
