import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject } from '@/lib/permission-helpers'
import { getFileInfo } from '@/lib/file-utils'
import { prisma } from '@/lib/prisma'
import { canAccessRbacAdmin } from '@/lib/permission-helpers'
import { getViewAsPersonaFromCookie } from '@/lib/view-as-server'
import { getSharedAndAncestorIdsForPersona } from '@/lib/engagement-sharing-ids'
import { requireEngagementMember, isExternalEngagementRole } from '@/lib/engagement-access'
import { SearchService } from '@/lib/services/search-service'

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

/**
 * Combined endpoint for deeplink navigation.
 * Returns externalId, fileName, path[], and projectRootFolderId in a single round-trip.
 * Replaces the two-step file-info + resolve-path calls used previously.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId: documentIdParam } = await params

    // Auth checks (once, shared by both file-info and resolve-path logic)
    const [ctx, member] = await Promise.all([
      resolveProjectContext(projectId),
      requireEngagementMember(projectId, user.id),
    ])
    if (!ctx) return notFound()
    if (!member) return notFound()

    const canView = await canViewProject(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canView) return notFound()

    // Fetch file info + engagement connector settings in parallel
    const [fileInfo, engagement] = await Promise.all([
      getFileInfo(projectId, documentIdParam),
      prisma.engagement.findUnique({
        where: { id: projectId },
        select: {
          slug: true,
          client: {
            select: {
              connector: { select: { settings: true } }
            }
          }
        },
      }),
    ])

    if (!fileInfo) return notFound()

    // External persona access check
    const actualRole = member.role
    const isActualExternal = isExternalEngagementRole(actualRole)
    const canUseViewAs = await canAccessRbacAdmin(user.id)
    const cookieViewAs = canUseViewAs ? await getViewAsPersonaFromCookie() : null
    const queryViewAs = canUseViewAs ? request.nextUrl.searchParams.get('viewAsPersonaSlug') : null
    const viewAsSlug =
      (queryViewAs === 'eng_ext_collaborator' || queryViewAs === 'eng_viewer' ? queryViewAs : null) ??
      (cookieViewAs === 'eng_ext_collaborator' || cookieViewAs === 'eng_viewer' ? cookieViewAs : null)
    const personaToEnforce = viewAsSlug ?? (isActualExternal ? actualRole : null)

    if (personaToEnforce === 'eng_ext_collaborator' || personaToEnforce === 'eng_viewer') {
      const { sharedIds, descendantIds } = await getSharedAndAncestorIdsForPersona(projectId, personaToEnforce, { skipDescendants: false })
      const allow = sharedIds.includes(fileInfo.externalId) || descendantIds.includes(fileInfo.externalId)
      if (!allow) return notFound()
    }

    // Resolve path + extract root folder IDs in parallel
    const settings = (engagement?.client?.connector?.settings as any) || {}
    const engagementSlug = engagement?.slug
    const ps = engagementSlug && settings.projectFolderSettings
      ? settings.projectFolderSettings[engagementSlug] || {}
      : {}
    const rootIds = [ps.generalFolderId, ps.confidentialFolderId, ps.stagingFolderId].filter(Boolean) as string[]

    let path = await SearchService.resolvePathToProjectRoot(ctx.orgId, fileInfo.externalId)

    let projectRootFolderId: string | null = null
    const rootInPath = path.find((p: { id: string }) => rootIds.includes(p.id))
    if (rootInPath) {
      projectRootFolderId = rootInPath.id
    } else if (path.length > 0 && rootIds.length > 0) {
      const topId = path[0].id
      const doc = await prisma.engagementDocument.findFirst({
        where: { firmId: ctx.orgId, engagementId: projectId, externalId: topId },
        select: { parentId: true }
      })
      const parentId = doc?.parentId ?? null
      if (parentId && rootIds.includes(parentId)) {
        projectRootFolderId = parentId
        const rootName = parentId === ps.generalFolderId ? 'General'
          : parentId === ps.confidentialFolderId ? 'Confidential'
          : 'Staging'
        path = [{ id: parentId, name: rootName }, ...path]
      }
    } else if (path.length === 0 && ps.generalFolderId) {
      // No indexed ancestors — item is directly under General (the Drive root for this engagement).
      projectRootFolderId = ps.generalFolderId
      path = [{ id: ps.generalFolderId, name: 'General' }]
    }

    return NextResponse.json({
      externalId: fileInfo.externalId,
      fileName: fileInfo.fileName ?? null,
      path,
      projectRootFolderId,
    })
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
