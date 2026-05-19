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

    const shares = await prisma.engagementDocument.findMany({
      where: { engagementId: projectId, slug: { not: null } },
      orderBy: { createdAt: 'desc' },
    })

    const sharesWithDetails = shares.map((share) => {
      const parsed = parseSettingsFromDb(share.settings)
      const flat = flattenForLegacyUI(parsed)

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
        documentMimeType: share.mimeType || null,
        thumbnailLink,
        webViewLink,
        slug: share.slug ?? null,
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
      }
    })

    const uniqueCreatedBy = Array.from(new Set(sharesWithDetails.map((s) => s.createdBy).filter(Boolean))) as string[]
    const uniqueUpdatedBy = Array.from(new Set(sharesWithDetails.map((s) => s.updatedBy).filter(Boolean))) as string[]
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
    const parentIds = Array.from(new Set(sharesWithDetails.map((s) => s.parentId).filter(Boolean))) as string[]
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

    const enriched = sharesWithDetails.map((s) => ({
      ...s,
      parentName: (s.parentId && parentNames[s.parentId]) || null,
      createdByEmail: s.createdBy ? (userMap[s.createdBy]?.email ?? null) : null,
      createdByName: s.createdBy ? (userMap[s.createdBy]?.name ?? null) : null,
      createdByAvatarUrl: s.createdBy ? (userMap[s.createdBy]?.avatarUrl ?? null) : null,
      updatedByEmail: s.updatedBy ? (userMap[s.updatedBy]?.email ?? null) : null,
      updatedByName: s.updatedBy ? (userMap[s.updatedBy]?.name ?? null) : null,
      updatedByAvatarUrl: s.updatedBy ? (userMap[s.updatedBy]?.avatarUrl ?? null) : null,
    }))

    const statusOrder: Record<string, number> = { to_do: 0, in_progress: 1, in_review: 2, done: 3 }
    enriched.sort((a, b) => {
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
