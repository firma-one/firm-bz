import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getFileInfo } from '@/lib/file-utils'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject } from '@/lib/permission-helpers'
import { parseSettingsFromDb } from '@/lib/sharing-settings'

/**
 * GET /api/projects/[projectId]/documents/[documentId]/subtasks
 * Returns all descendant files of a Deliverable folder that have INHERITED sharing rows.
 * Uses recursive CTE to walk the full folder tree (not just direct children).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId: documentIdParam } = await params
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

    // Walk the full descendant tree (any depth) and collect all non-folder file IDs.
    // We don't filter by INHERITED status — new files added to the deliverable folder
    // after it was marked won't have sharing rows yet, but they still belong to the deliverable.
    const descendantIds = (await (prisma as any).$queryRawUnsafe(
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

    const subtasks = children.map((c) => {
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
        assigneeName: null,
        assigneeEmail: null,
        status: parsed.activity?.status ?? null,
        breadcrumb,
      }
    })

    return NextResponse.json({ subtasks })
  } catch (e) {
    console.error('GET subtasks error', e)
    return NextResponse.json({ error: 'Failed to fetch subtasks' }, { status: 500 })
  }
}
