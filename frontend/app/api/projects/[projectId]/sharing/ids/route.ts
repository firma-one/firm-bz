import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getSharedAndAncestorIdsForAllPersonas, internalOnlyTreeIds } from '@/lib/engagement-sharing-ids'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject, getProjectPersona } from '@/lib/permission-helpers'

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
    // This only checked sign-in and then listed the engagement's shared Drive ids (calling Drive
    // on the firm's connector). Engagement viewers only; firm and client from the engagement row.
    const ctx = await resolveProjectContext(projectId)
    if (!ctx || !(await canViewProject(ctx.firmId, ctx.clientId, projectId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Limited roles call this too, and what's hidden from them must not reach them as a list of ids.
    const role = await getProjectPersona(ctx.firmId, ctx.clientId, projectId)
    const isInternal = role === 'eng_admin' || role === 'eng_member'

    const [result, internalOnly, sharedByMeRows] = await Promise.all([
      getSharedAndAncestorIdsForAllPersonas(projectId),
      isInternal ? internalOnlyTreeIds(projectId) : { ids: [], ancestorIds: [] },
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
      internalOnlyIds: internalOnly.ids,
      internalOnlyAncestorIds: internalOnly.ancestorIds,
    })
  } catch (e) {
    console.error('GET sharing ids error', e)
    // Read by the Files list, which keeps the marks it had and says so (P1-45).
    return NextResponse.json({ error: "Couldn't load which files are shared. Something went wrong on our side. Try again." }, { status: 500 })
  }
}
