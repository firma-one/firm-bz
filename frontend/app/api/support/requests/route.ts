import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { isSystemAdminEmail } from '@/lib/system/admin-check'
import { enrichSupportRequests } from '@/lib/support/enrich-requests'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const firmSlug = request.nextUrl.searchParams.get('firmSlug')
    // ?all=1: every firm's requests, for the Firma team only (SYSTEM_ADMIN_EMAILS, as /system).
    const all = request.nextUrl.searchParams.get('all') === '1'

    let where: any = {}

    if (all) {
      if (!isSystemAdminEmail(user.email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (firmSlug) {
      // A firm's tickets are for its firm admins (same rule as canAccessSupportTicket). This had no
      // membership check, and an unknown slug left `where` empty — every ticket on the platform.
      // (.claude/plans/access-gates.md, P0 #10)
      const firm = await prisma.firm.findUnique({
        where: { slug: firmSlug },
        select: { id: true }
      })
      if (!firm) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      const admin = await prisma.firmMember.findFirst({
        where: { firmId: firm.id, userId: user.id, role: 'firm_admin' },
        select: { id: true },
      })
      // Non-admins still see the tickets they filed themselves in that firm.
      where = admin ? { firmId: firm.id } : { firmId: firm.id, userId: user.id }
    } else {
      // If no firm specified, show only user's own requests
      where.userId = user.id
    }

    const requests = await (prisma as any).customerRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    // Firm, client and engagement names, who raised each one, and which replies are Firma's.
    return NextResponse.json(await enrichSupportRequests(requests))
  } catch (error) {
    console.error('Failed to fetch support requests:', error)
    return NextResponse.json(
      { error: 'Failed to fetch support requests' },
      { status: 500 }
    )
  }
}
