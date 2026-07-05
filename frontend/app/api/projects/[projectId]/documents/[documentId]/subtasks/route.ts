import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { prisma } from '@/lib/prisma'
import { getFileInfo } from '@/lib/file-utils'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject } from '@/lib/permission-helpers'
import { parseSettingsFromDb } from '@/lib/sharing-settings'

/**
 * GET /api/projects/[projectId]/documents/[documentId]/subtasks
 * Returns all descendant files of a Deliverable folder that have INHERITED sharing rows.
 * Uses recursive CTE to walk the full folder tree (not just direct children).
 *
 * Query params:
 *   persona=ec  — only return files that have an INHERITED sharing row for an EC member (eng_ext_collaborator)
 *   persona=ev  — only return files that have an INHERITED sharing row for an EV member (eng_viewer)
 *   persona=all (default) — return all descendant files regardless of sharing rows
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
    const persona = request.nextUrl.searchParams.get('persona') ?? 'all'

    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const canView = await canViewProject(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const fileInfo = await getFileInfo(projectId, documentIdParam)
    if (!fileInfo) return NextResponse.json({ error: 'File not found' }, { status: 404 })

    const folder = await prisma.engagementDocument.findUnique({
      where: {
        engagementId_firmId_externalId: {
          engagementId: projectId,
          firmId: fileInfo.organizationId,
          externalId: fileInfo.externalId,
        },
      },
      select: { id: true, externalId: true, isFolder: true, fileName: true },
    })
    if (!folder || !folder.isFolder) return NextResponse.json({ subtasks: [] })

    // Walk the full descendant tree and collect non-folder file IDs.
    // When persona=ec or persona=ev, additionally filter to files that have an INHERITED
    // sharing row for a member with the corresponding engagement role.
    const roleFilter =
      persona === 'ec' ? 'eng_ext_collaborator' :
      persona === 'ev' ? 'eng_viewer' :
      null

    let descendantIds: Array<{ id: string }>
    if (roleFilter) {
      descendantIds = (await (prisma as any).$queryRawUnsafe(
        `WITH RECURSIVE descendants AS (
           SELECT id, "externalId", "isFolder" FROM platform.engagement_documents
           WHERE "parentId" = $1 AND "engagementId" = $2::uuid
           UNION ALL
           SELECT ed.id, ed."externalId", ed."isFolder" FROM platform.engagement_documents ed
           INNER JOIN descendants d ON ed."parentId" = d."externalId"
           WHERE ed."engagementId" = $2::uuid
         )
         SELECT DISTINCT d.id FROM descendants d
         INNER JOIN platform.engagement_document_sharing_users su ON su."projectDocumentId" = d.id
         INNER JOIN platform.engagement_members em ON em."userId" = su."userId" AND em."engagementId" = su."engagementId"
         WHERE d."isFolder" = false
           AND su."sharingPermissionStatus" = 'INHERITED'
           AND em.role = $3::platform."EngagementRole"`,
        folder.externalId,
        projectId,
        roleFilter
      )) as Array<{ id: string }>
    } else {
      descendantIds = (await (prisma as any).$queryRawUnsafe(
        `WITH RECURSIVE descendants AS (
           SELECT id, "externalId", "isFolder" FROM platform.engagement_documents
           WHERE "parentId" = $1 AND "engagementId" = $2::uuid
           UNION ALL
           SELECT ed.id, ed."externalId", ed."isFolder" FROM platform.engagement_documents ed
           INNER JOIN descendants d ON ed."parentId" = d."externalId"
           WHERE ed."engagementId" = $2::uuid
         )
         SELECT id FROM descendants
         WHERE "isFolder" = false`,
        folder.externalId,
        projectId
      )) as Array<{ id: string }>
    }

    if (descendantIds.length === 0) return NextResponse.json({ subtasks: [] })

    const children = await prisma.engagementDocument.findMany({
      where: { id: { in: descendantIds.map((r) => r.id) } },
      select: {
        id: true,
        fileName: true,
        docId: true,
        dueDate: true,
        settings: true,
        parentId: true,
        mimeType: true,
      },
      orderBy: { fileName: 'asc' },
    })

    // Build a lookup of all folders in this engagement (externalId → fileName) so we can
    // walk each file's ancestry up to (but not including) the deliverable folder root.
    const allFolders = await prisma.engagementDocument.findMany({
      where: { engagementId: projectId, isFolder: true },
      select: { externalId: true, fileName: true, parentId: true },
    })
    const folderByExternalId = Object.fromEntries(allFolders.map((f) => [f.externalId, f]))

    const buildBreadcrumb = (parentExternalId: string | null): string[] => {
      const crumbs: string[] = []
      let current = parentExternalId
      // Walk all the way up the full folder tree (including General and above)
      while (current) {
        const node = folderByExternalId[current]
        if (!node) break
        crumbs.unshift(node.fileName)
        current = node.parentId ?? null
      }
      return crumbs
    }

    const subtasksRaw = children.map((c) => {
      const parsed = parseSettingsFromDb(c.settings)
      const assigneeUserId = (parsed as any).assigneeUserId ?? null
      const breadcrumb = buildBreadcrumb(c.parentId ?? null)
      return {
        id: c.id,
        documentId: c.id,
        fileName: c.fileName,
        mimeType: c.mimeType ?? null,
        docId: c.docId ?? null,
        dueDate: c.dueDate?.toISOString() ?? null,
        assigneeUserId,
        status: parsed.activity?.status ?? null,
        breadcrumb,
      }
    })

    // Resolve assignee display names for all unique assigneeUserIds
    const uniqueAssigneeIds = Array.from(new Set(subtasksRaw.map((s) => s.assigneeUserId).filter(Boolean) as string[]))
    const assigneeMap: Record<string, { name: string | null; email: string | null; avatarUrl: string | null }> = {}
    if (uniqueAssigneeIds.length > 0) {
      const admin = createAdminClient()
      await Promise.allSettled(uniqueAssigneeIds.map(async (userId) => {
        try {
          const { data } = await admin.auth.admin.getUserById(userId)
          const meta = data?.user?.user_metadata ?? {}
          assigneeMap[userId] = {
            name: (meta.full_name ?? meta.name ?? data?.user?.email?.split('@')[0] ?? null) as string | null,
            email: data?.user?.email ?? null,
            avatarUrl: (meta.avatar_url ?? meta.picture ?? null) as string | null,
          }
        } catch {
          assigneeMap[userId] = { name: null, email: null, avatarUrl: null }
        }
      }))
    }

    const subtasks = subtasksRaw.map((s) => ({
      ...s,
      assigneeName: s.assigneeUserId ? (assigneeMap[s.assigneeUserId]?.name ?? null) : null,
      assigneeEmail: s.assigneeUserId ? (assigneeMap[s.assigneeUserId]?.email ?? null) : null,
      assigneeAvatarUrl: s.assigneeUserId ? (assigneeMap[s.assigneeUserId]?.avatarUrl ?? null) : null,
    }))

    return NextResponse.json({ subtasks })
  } catch (e) {
    console.error('GET subtasks error', e)
    return NextResponse.json({ error: 'Failed to fetch subtasks' }, { status: 500 })
  }
}
