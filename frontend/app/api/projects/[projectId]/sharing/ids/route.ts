import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getSharedAndAncestorIdsForAllPersonas } from '@/lib/engagement-sharing-ids'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/projects/[projectId]/sharing/ids
 * Returns persona-specific ids so EC only sees EC-shared items and Guest only sees Guest-shared items.
 * Used by the frontend for the Shared badge and for restrictToSharedOnly when no View As is set.
 * Computes union once (one Prisma + one set of Drive calls), then derives EC/Guest sharedIds in memory.
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

    const [result, sharedByMeRows] = await Promise.all([
      getSharedAndAncestorIdsForAllPersonas(projectId),
      prisma.engagementDocument.findMany({
        where: {
          engagementId: projectId,
          slug: { not: null },
          OR: [
            { createdBy: user.id },
            { settings: { path: ['share', 'createdBy'], equals: user.id } },
          ],
        },
        select: { externalId: true },
      }),
    ])

    const sharedByMeExternalIds = sharedByMeRows.filter(r => r.externalId).map(r => r.externalId!)

    return NextResponse.json({
      sharedExternalIds: result.sharedIdsUnion,
      ancestorFolderIds: result.ancestorIds,
      sharedExternalIdsForEC: result.sharedIdsForEC,
      ancestorFolderIdsForEC: result.ancestorIds,
      sharedExternalIdsForGuest: result.sharedIdsForGuest,
      ancestorFolderIdsForGuest: result.ancestorIds,
      sharedByMeExternalIds,
    })
  } catch (e) {
    console.error('GET sharing ids error', e)
    return NextResponse.json({ error: 'Failed to load shared ids' }, { status: 500 })
  }
}
