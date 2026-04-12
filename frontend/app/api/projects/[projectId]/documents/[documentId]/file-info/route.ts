import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject } from '@/lib/permission-helpers'
import { getFileInfo } from '@/lib/file-utils'
import { prisma } from '@/lib/prisma'
import { canAccessRbacAdmin } from '@/lib/permission-helpers'
import { getViewAsPersonaFromCookie } from '@/lib/view-as-server'
import { getSharedAndAncestorIdsForPersona } from '@/lib/project-sharing-ids'
import { requireEngagementMember, getEngagementStatus, isExternalEngagementRole } from '@/lib/engagement-access'

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId: documentIdParam } = await params

    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return notFound()
    const canView = await canViewProject(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canView) return notFound()

    const member = await requireEngagementMember(projectId, user.id)
    if (!member) return notFound()

    const fileInfo = await getFileInfo(projectId, documentIdParam)
    if (!fileInfo) return notFound()

    const actualRole = member.role
    const isActualExternal = isExternalEngagementRole(actualRole)

    const canUseViewAs = await canAccessRbacAdmin(user.id)
    const cookieViewAs = canUseViewAs ? await getViewAsPersonaFromCookie() : null
    const queryViewAs = canUseViewAs ? request.nextUrl.searchParams.get('viewAsPersonaSlug') : null
    const viewAsSlug =
      (queryViewAs === 'eng_ext_collaborator' || queryViewAs === 'eng_viewer' ? queryViewAs : null) ??
      (cookieViewAs === 'eng_ext_collaborator' || cookieViewAs === 'eng_viewer' ? cookieViewAs : null)

    const personaToEnforce =
      viewAsSlug ??
      (isActualExternal ? actualRole : null)

    if (personaToEnforce === 'eng_ext_collaborator' || personaToEnforce === 'eng_viewer') {
      const { sharedIds, descendantIds } = await getSharedAndAncestorIdsForPersona(projectId, personaToEnforce, { skipDescendants: false })
      const allow = sharedIds.includes(fileInfo.externalId) || descendantIds.includes(fileInfo.externalId)
      if (!allow) return notFound()
    }

    const engagementStatus = await getEngagementStatus(projectId)
    const docRow = await prisma.engagementDocument.findFirst({
      where: {
        engagementId: projectId,
        firmId: fileInfo.organizationId,
        externalId: fileInfo.externalId,
      },
      select: { settings: true },
    })
    const { isDocumentVersionLocked } = await import('@/lib/document-version-lock')

    return NextResponse.json({
      externalId: fileInfo.externalId,
      fileName: fileInfo.fileName ?? null,
      engagementStatus,
      versionLocked: docRow ? isDocumentVersionLocked(docRow.settings) : false,
    })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to resolve file info' }, { status: 500 })
  }
}
