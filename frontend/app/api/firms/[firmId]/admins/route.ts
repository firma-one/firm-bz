import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { userSettingsPlus } from '@/lib/user-settings-plus'
import { findFirmInPermissions } from '@/lib/permission-helpers'
import { assertFirmSubscriptionAccess } from '@/lib/billing/subscription-gate'
import { SubscriptionRevokedError } from '@/lib/errors/api-error'

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/firms/[firmId]/admins
 * Returns all firm_admin members for the given firm, enriched with email/name/avatar.
 * Requires the caller to be a firm_admin of that firm.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ firmId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { firmId } = await params

    // Verify the caller is a firm_admin of this firm
    const settings = await userSettingsPlus.getUserSettingsPlus(user.id)
    const firm = findFirmInPermissions(settings.permissions, firmId)
    const isFirmAdmin =
      firm?.personas?.includes('firm_admin') ||
      firm?.personas?.includes('sys_admin') ||
      false

    if (!isFirmAdmin) {
      // Fallback: check DB directly (cache lag on new firms)
      const membership = await prisma.firmMember.findFirst({
        where: { userId: user.id, firmId, role: 'firm_admin' },
        select: { id: true },
      })
      if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await assertFirmSubscriptionAccess(firmId)

    const adminMembers = await prisma.firmMember.findMany({
      where: { firmId, role: 'firm_admin' },
      select: { userId: true },
    })

    const enriched = (
      await Promise.all(
        adminMembers.map(async (m) => {
          try {
            const { data } = await supabaseAdmin.auth.admin.getUserById(m.userId)
            const email = data?.user?.email
            if (!email) return null
            const meta = data?.user?.user_metadata ?? {}
            const name = (meta.full_name ?? meta.name ?? email.split('@')[0]) as string
            const avatarUrl = (meta.avatar_url ?? meta.picture ?? null) as string | null
            return { userId: m.userId, email, name, avatarUrl }
          } catch {
            return null
          }
        })
      )
    ).filter(Boolean) as { userId: string; email: string; name: string; avatarUrl: string | null }[]

    return NextResponse.json({ admins: enriched })
  } catch (e) {
    if (e instanceof SubscriptionRevokedError) return NextResponse.json({ error: e.message }, { status: 403 })
    console.error('GET firm admins error', e)
    return NextResponse.json({ error: 'Failed to fetch firm admins' }, { status: 500 })
  }
}
