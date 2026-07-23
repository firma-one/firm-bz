import { prisma } from '@/lib/prisma'

/**
 * Whether `userId` may view/mutate a support ticket: either they created it,
 * or they're a firm_admin of the ticket's firm — mirrors the access check the
 * `/d/support` page itself uses (`canManageOrganization`/`firm:can_manage`),
 * reimplemented here as a direct DB check because these API routes authenticate
 * via a Bearer token, not the cookie-based Supabase client `checkFirmPermission` reads from.
 */
export async function canAccessSupportTicket(
  userId: string,
  ticket: { userId?: string | null; firmId?: string | null }
): Promise<boolean> {
  if (ticket.userId && ticket.userId === userId) return true

  if (ticket.firmId) {
    const membership = await prisma.firmMember.findFirst({
      where: { firmId: ticket.firmId, userId, role: 'firm_admin' },
      select: { id: true },
    })
    if (membership) return true
  }

  return false
}
