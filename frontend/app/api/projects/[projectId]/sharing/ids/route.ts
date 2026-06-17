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
      // Use sharing table as source of truth — slug: { not: null } was a fragile proxy
      (prisma as any).$queryRawUnsafe(
        `SELECT DISTINCT ed."externalId"
         FROM platform.engagement_document_sharing_users su
         JOIN platform.engagement_documents ed ON ed.id = su."projectDocumentId"
         WHERE su."engagementId" = $1::uuid
           AND su."createdBy" = $2::uuid
           AND su."sharingPermissionStatus" IN ('GRANTED', 'PENDING')
         UNION
         SELECT ed."externalId"
         FROM platform.engagement_documents ed
         WHERE ed."engagementId" = $1::uuid
           AND (ed.settings->'share'->>'createdBy') = $2`,
        projectId,
        user.id
      ) as Promise<{ externalId: string }[]>,
    ])

    const sharedByMeExternalIds = (sharedByMeRows as { externalId: string }[]).filter(r => r.externalId).map(r => r.externalId)

    return NextResponse.json({
      sharedExternalIds: result.sharedIdsUnion,
      ancestorFolderIds: result.ancestorIds,
      sharedExternalIdsForEC: result.sharedIdsForEC,
      ancestorFolderIdsForEC: result.ancestorIds,
      sharedExternalIdsForGuest: result.sharedIdsForGuest,
      ancestorFolderIdsForGuest: result.ancestorIds,
      descendantIds: result.descendantIds,
      descendantIdsForEC: result.descendantIdsForEC,
      descendantIdsForGuest: result.descendantIdsForGuest,
      sharedByMeExternalIds,
    })
  } catch (e) {
    console.error('GET sharing ids error', e)
    return NextResponse.json({ error: 'Failed to load shared ids' }, { status: 500 })
  }
}
