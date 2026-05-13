import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { requireEngagementMember, isEngagementLeadRole } from '@/lib/engagement-access'

/**
 * GET /api/projects/[projectId]/engagements
 * Returns other active engagements the calling user is an EL of (same firm),
 * used for the cross-engagement copy/move picker.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params

    const member = await requireEngagementMember(projectId, user.id)
    if (!member || !isEngagementLeadRole(member.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const source = await prisma.engagement.findUnique({
      where: { id: projectId },
      select: { firmId: true },
    })
    if (!source) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })

    // All engagements the user is an EL of within the same firm, excluding the source
    const memberships = await prisma.engagementMember.findMany({
      where: { userId: user.id, role: 'eng_admin' },
      select: {
        engagement: {
          select: { id: true, name: true, firmId: true, status: true, isDeleted: true },
        },
      },
    })

    const engagements = memberships
      .map((m) => m.engagement)
      .filter((e) => e.firmId === source.firmId && e.id !== projectId && !e.isDeleted && e.status !== 'COMPLETED')
      .map((e) => ({ id: e.id, name: e.name }))

    return NextResponse.json({ engagements })
  } catch (e) {
    console.error('GET /engagements error', e)
    return NextResponse.json({ error: 'Failed to fetch engagements' }, { status: 500 })
  }
}
