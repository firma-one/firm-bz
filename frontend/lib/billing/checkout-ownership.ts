import { prisma } from '@/lib/prisma'

/** The Polar checkout fields that say whose it is. */
export type CheckoutOwnerFields = {
    customerEmail?: string | null
    externalCustomerId?: string | null
    metadata?: Record<string, unknown> | null
}

/** The billing group a checkout was for: our checkout route sets it as the external id and in metadata. */
export function checkoutGroupId(checkout: CheckoutOwnerFields): string | null {
    const ext = checkout.externalCustomerId?.trim()
    if (ext) return ext
    const meta = checkout.metadata?.groupId
    return typeof meta === 'string' && meta.trim() ? meta.trim() : null
}

/**
 * Server-only: may this person see this checkout? The email they paid with, or membership of a firm in
 * the checkout's billing group. (The external id is the group's id; reading it as a firm id, as the
 * invoice route used to, never matched.)
 */
export async function userOwnsCheckout(
    user: { id: string; email?: string | null },
    checkout: CheckoutOwnerFields
): Promise<boolean> {
    const userEmail = (user.email ?? '').trim().toLowerCase()
    const checkoutEmail = (checkout.customerEmail ?? '').trim().toLowerCase()
    if (userEmail && checkoutEmail && checkoutEmail === userEmail) return true

    const groupId = checkoutGroupId(checkout)
    if (!groupId) return false
    const member = await prisma.firmMember.findFirst({
        where: {
            userId: user.id,
            firm: { deletedAt: null, OR: [{ groupId }, { id: groupId }] },
        },
        select: { id: true },
    })
    return Boolean(member)
}
