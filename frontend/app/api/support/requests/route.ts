import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const firmSlug = request.nextUrl.searchParams.get('firmSlug')

    let where: any = {}

    if (firmSlug) {
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

    // Fetch related context (firm, client, engagement) data
    const enrichedRequests = await Promise.all(
      requests.map(async (req: any) => {
        let firm, client, engagement

        if (req.firmId) {
          firm = await prisma.firm.findUnique({
            where: { id: req.firmId },
            select: { name: true, slug: true }
          })
        }

        if (req.clientId) {
          client = await prisma.client.findUnique({
            where: { id: req.clientId },
            select: { name: true, slug: true }
          })
        }

        if (req.engagementId) {
          engagement = await (prisma as any).engagement.findUnique({
            where: { id: req.engagementId },
            select: { name: true, slug: true }
          })
        }

        return {
          ...req,
          firm: firm || null,
          client: client || null,
          engagement: engagement || null,
        }
      })
    )

    return NextResponse.json(enrichedRequests)
  } catch (error) {
    console.error('Failed to fetch support requests:', error)
    return NextResponse.json(
      { error: 'Failed to fetch support requests' },
      { status: 500 }
    )
  }
}
