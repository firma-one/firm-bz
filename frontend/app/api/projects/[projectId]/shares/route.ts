import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { parseSettingsFromDb, flattenForLegacyUI } from '@/lib/sharing-settings'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject } from '@/lib/permission-helpers'

function getAvatarUrlFromUser(dbUser: { user_metadata?: Record<string, unknown>; identities?: Array<{ identity_data?: Record<string, unknown> }> } | null | undefined): string | null {
  if (!dbUser) return null
  const meta = dbUser.user_metadata
  const fromMeta = (meta?.avatar_url ?? meta?.picture) as string | undefined
  if (fromMeta) return fromMeta
  const firstIdentity = dbUser.identities?.[0]?.identity_data
  return (firstIdentity?.avatar_url ?? firstIdentity?.picture) as string | undefined ?? null
}

/**
 * GET /api/projects/[projectId]/shares
 * Returns list of share records for the project with document details, activity, comments, and access log.
 * RBAC: User must have project:can_view (all personas with project access, including External Collaborator and Guest).
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
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const canView = await canViewProject(ctx.firmId, ctx.clientId, ctx.projectId)
    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Resolve generalFolderId from connector settings for the "General" breadcrumb fallback
    let generalFolderId: string | null = null
    try {
      const project = await prisma.engagement.findUnique({
        where: { id: projectId },
        select: { slug: true, client: { select: { firm: { select: { connectorId: true } } } } },
      })
      const connectorId = project?.client?.firm?.connectorId
      const projectSlug = project?.slug
      if (connectorId && projectSlug) {
        const connector = await (prisma as any).connector.findUnique({ where: { id: connectorId }, select: { settings: true } })
        const ps = (connector?.settings as any)?.projectFolderSettings?.[projectSlug]
        generalFolderId = ps?.generalFolderId ?? null
      }
    } catch { /* non-critical */ }

    // Return documents that were explicitly shared via:
    // 1. The Share modal — settings.share.createdAt is always set by buildSettingsForDb (covers guest-only shares with no sharing row)
    // 2. Intake upload — root folder has a PENDING or GRANTED sharing row (no createdAt since intake doesn't use buildSettingsForDb)
    // Children of intake folders have settings.share.* but no createdAt and no sharing row — correctly excluded by both conditions.
    const explicitShareIds = await (prisma as any).$queryRawUnsafe(
      `SELECT DISTINCT ed.id FROM platform.engagement_documents ed
       LEFT JOIN platform.engagement_document_sharing_users su
         ON su."projectDocumentId" = ed.id AND su."sharingPermissionStatus" IN ('GRANTED', 'PENDING')
       WHERE ed."engagementId" = $1::uuid
         AND ed."isFolder" = true
         AND (
           (ed.settings->'share'->>'createdAt') IS NOT NULL
           OR su.id IS NOT NULL
         )`,
      projectId
    ) as { id: string }[]

    const shares = await (prisma.engagementDocument as any).findMany({
      where: { id: { in: explicitShareIds.map((r) => r.id) } },
      orderBy: { createdAt: 'desc' },
      include: {
        sharingUsers: {
          select: { sharingPermissionStatus: true, userId: true },
        },
      },
    })

    const sharesWithDetails = shares.map((share: any) => {
      const parsed = parseSettingsFromDb(share.settings)
      const flat = flattenForLegacyUI(parsed)
      const pendingApproval = share.sharingUsers?.some(
        (u: any) => u.sharingPermissionStatus === 'PENDING'
      ) ?? false
      const pendingUploaderId = share.sharingUsers?.find(
        (u: any) => u.sharingPermissionStatus === 'PENDING'
      )?.userId ?? null

      const indexMetadata = (share.metadata as any) || {}
      const thumbnailLink = indexMetadata.thumbnailLink || indexMetadata.thumbnail_link || null
      let webViewLink = indexMetadata.webViewLink || indexMetadata.web_view_link || null

      const externalId = share.externalId
      if (!webViewLink && externalId) {
        const mt = share.mimeType
        if (mt === 'application/vnd.google-apps.document') webViewLink = `https://docs.google.com/document/d/${externalId}/edit`
        else if (mt === 'application/vnd.google-apps.spreadsheet') webViewLink = `https://docs.google.com/spreadsheets/d/${externalId}/edit`
        else if (mt === 'application/vnd.google-apps.presentation') webViewLink = `https://docs.google.com/presentation/d/${externalId}/edit`
        else webViewLink = `https://drive.google.com/file/d/${externalId}/view`
      }

      const accessLog = (parsed.accessLog || []).map((entry: any) => ({
        at: entry.at || new Date().toISOString(),
        by: entry.by || 'unknown',
        userId: entry.userId ?? null,
        email: entry.email ?? null,
        sessionId: entry.sessionId ?? null,
      }))

      return {
        id: share.id,
        organizationId: ctx.firmId,
        projectId: share.engagementId,
        documentId: share.id,
        documentName: share.fileName || share.externalId || 'Unknown Document',
        documentExternalId: externalId || null,
        documentMimeType: share.mimeType || indexMetadata.mimeType || indexMetadata.mime_type || null,
        thumbnailLink,
        webViewLink,
parentId: share.parentId ?? (indexMetadata.parents?.[0] ?? indexMetadata.parentId ?? null) as string | null,
        createdBy: share.createdBy ?? parsed.share?.createdBy ?? null,
        createdAt: share.createdAt.toISOString(),
        updatedAt: share.updatedAt.toISOString(),
        updatedBy: share.updatedBy ?? parsed.share?.updatedBy ?? null,
        settings: {
          externalCollaborator: flat.externalCollaborator,
          guest: flat.guest,
          guestOptions: flat.guestOptions,
          ecOptions: flat.ecOptions,
          publishedVersionId: flat.publishedVersionId,
          publishedAt: flat.publishedAt,
        },
        activity: flat.activity,
        comments: flat.comments,
        finalizedAt: flat.finalizedAt,
        accessLog,
        pendingApproval,
        pendingUploaderId,
        docId: (share as any).docId ?? null,
      }
    })

    const uniqueCreatedBy = Array.from(new Set(sharesWithDetails.map((s: any) => s.createdBy).filter(Boolean))) as string[]
    const uniqueUpdatedBy = Array.from(new Set(sharesWithDetails.map((s: any) => s.updatedBy).filter(Boolean))) as string[]
    const uniqueUserIds = Array.from(new Set([...uniqueCreatedBy, ...uniqueUpdatedBy]))
    const supabaseAdmin = createSupabaseAdmin(
      (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const userMap: Record<string, { email: string | null; name: string | null; avatarUrl: string | null }> = {}
    await Promise.all(
      uniqueUserIds.map(async (userId) => {
        try {
          const { data: { user: dbUser } } = await supabaseAdmin.auth.admin.getUserById(userId)
          const meta = dbUser?.user_metadata ?? {}
          const name = (meta.full_name ?? meta.name ?? dbUser?.email?.split('@')[0] ?? null) as string | null
          userMap[userId] = {
            email: dbUser?.email ?? null,
            name,
            avatarUrl: getAvatarUrlFromUser(dbUser),
          }
        } catch {
          userMap[userId] = { email: null, name: null, avatarUrl: null }
        }
      })
    )
    // Resolve parent folder names from DB (same approach as search API)
    const parentIds = Array.from(new Set(sharesWithDetails.map((s: any) => s.parentId).filter(Boolean))) as string[]
    const parentNames: Record<string, string> = {}
    if (parentIds.length > 0) {
      try {
        const rows = await (prisma as any).$queryRawUnsafe(
          `SELECT "externalId" as id, "fileName" as name FROM platform.engagement_documents WHERE "firmId" = $1::uuid AND "externalId" = ANY($2::text[])`,
          ctx.firmId,
          parentIds
        ) as { id: string; name: string }[]
        rows.forEach((r) => { parentNames[r.id] = r.name })
      } catch { /* non-critical, skip */ }
    }

    // Subtask counts per deliverable — one recursive CTE per folder (mirrors subtasks route logic)
    const deliverableFolders = sharesWithDetails
      .map((s: any) => ({ shareId: s.id, externalId: s.documentExternalId }))
      .filter((f: any) => !!f.externalId)
    const subtaskCounts: Record<string, { total: number; approved: number }> = {}
    await Promise.all(deliverableFolders.map(async ({ shareId, externalId }: { shareId: string; externalId: string }) => {
      try {
        const rows = await (prisma as any).$queryRawUnsafe(
          `WITH RECURSIVE descendants AS (
             SELECT id, "externalId", "isFolder",
                    settings->'activity'->>'status' AS "activityStatus"
             FROM platform.engagement_documents
             WHERE "parentId" = $1 AND "engagementId" = $2::uuid
             UNION ALL
             SELECT ed.id, ed."externalId", ed."isFolder",
                    ed.settings->'activity'->>'status'
             FROM platform.engagement_documents ed
             INNER JOIN descendants d ON ed."parentId" = d."externalId"
             WHERE ed."engagementId" = $2::uuid
           )
           SELECT
             COUNT(*) FILTER (WHERE "isFolder" = false) AS total,
             COUNT(*) FILTER (WHERE "isFolder" = false AND "activityStatus" = 'approved') AS approved
           FROM descendants`,
          externalId,
          projectId
        ) as { total: bigint; approved: bigint }[]
        if (rows.length > 0) {
          subtaskCounts[shareId] = { total: Number(rows[0].total), approved: Number(rows[0].approved) }
        }
      } catch { /* non-critical */ }
    }))

    const enriched = sharesWithDetails.map((s: any) => ({
      ...s,
      parentName: (s.parentId && parentNames[s.parentId]) || null,
      subtaskCount: subtaskCounts[s.id]?.total ?? 0,
      approvedSubtaskCount: subtaskCounts[s.id]?.approved ?? 0,
      createdByEmail: s.createdBy ? (userMap[s.createdBy]?.email ?? null) : null,
      createdByName: s.createdBy ? (userMap[s.createdBy]?.name ?? null) : null,
      createdByAvatarUrl: s.createdBy ? (userMap[s.createdBy]?.avatarUrl ?? null) : null,
      updatedByEmail: s.updatedBy ? (userMap[s.updatedBy]?.email ?? null) : null,
      updatedByName: s.updatedBy ? (userMap[s.updatedBy]?.name ?? null) : null,
      updatedByAvatarUrl: s.updatedBy ? (userMap[s.updatedBy]?.avatarUrl ?? null) : null,
    }))

    const statusOrder: Record<string, number> = { to_do: 0, in_progress: 1, in_review: 2, approved: 3 }
    enriched.sort((a: any, b: any) => {
      const sa = a.activity?.status ?? 'to_do'
      const sb = b.activity?.status ?? 'to_do'
      if (sa !== sb) return statusOrder[sa] - statusOrder[sb]
      const oa = a.activity?.orderIndex ?? 0
      const ob = b.activity?.orderIndex ?? 0
      return oa - ob
    })

    return NextResponse.json({ shares: enriched, generalFolderId })
  } catch (e) {
    console.error('GET shares error', e)
    return NextResponse.json({ error: 'Failed to load shares' }, { status: 500 })
  }
}
