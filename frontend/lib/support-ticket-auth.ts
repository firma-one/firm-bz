import { prisma } from '@/lib/prisma'
import { isSystemAdminEmail } from '@/lib/system/admin-check'

/**
 * Whether `user` may view/mutate a support ticket: either they created it, they're a firm_admin of
 * the ticket's firm — mirrors the access check the `/d/support` page itself uses
 * (`canManageOrganization`/`firm:can_manage`), reimplemented here as a direct DB check because these
 * API routes authenticate via a Bearer token, not the cookie-based Supabase client
 * `checkFirmPermission` reads from — or they're on the Firma team (SYSTEM_ADMIN_EMAILS, the same rule
 * as /system), who answer every firm's requests from /system/customer-success.
 */
export async function canAccessSupportTicket(
  user: { id: string; email?: string | null },
  ticket: { userId?: string | null; firmId?: string | null }
): Promise<boolean> {
  if (ticket.userId && ticket.userId === user.id) return true

  if (ticket.firmId) {
    const membership = await prisma.firmMember.findFirst({
      where: { firmId: ticket.firmId, userId: user.id, role: 'firm_admin' },
      select: { id: true },
    })
    if (membership) return true
  }

  return isSystemAdminEmail(user.email)
}
