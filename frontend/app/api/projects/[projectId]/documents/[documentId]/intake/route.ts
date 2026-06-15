import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { requireEngagementMember, isExternalEngagementRole, isEngagementLeadRole } from '@/lib/engagement-access'
import { getFileInfo } from '@/lib/file-utils'
import { generateShareSlug } from '@/lib/slug-utils'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { safeInngestSend } from '@/lib/inngest/client'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/intake
 * Body: { action: 'approve' | 'reject' | 'withdraw' | 'approve-folder' | 'reject-folder' | 'withdraw-folder' }
 *
 * approve        — EL only: flip sharing row PENDING→GRANTED, set share flag + slug, fire Inngest index
 * reject         — EL only: delete EngagementDocument (cascades sharing row) + trash Drive file
 * withdraw       — EC/EV only (own uploads): same delete + trash flow
 * approve-folder — EL only: approve all children + the folder itself
 * reject-folder  — EL only: delete folder + children + trash Drive files
 * withdraw-folder— EC/EV only: same as reject-folder but scoped to own uploads
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId: documentIdParam } = await params

    let body: { action?: string } = {}
    try { body = await request.json() } catch { /* empty body ok */ }
    const { action } = body

    if (!['approve', 'reject', 'withdraw', 'approve-folder', 'reject-folder', 'withdraw-folder'].includes(action ?? '')) {
      return NextResponse.json({ error: 'action must be approve | reject | withdraw | approve-folder | reject-folder | withdraw-folder' }, { status: 400 })
    }

    const member = await requireEngagementMember(projectId, user.id)
    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isExternal = isExternalEngagementRole(member.role)
    const isLead = isEngagementLeadRole(member.role)

    if ((action === 'approve' || action === 'reject') && !isLead) {
      return NextResponse.json({ error: 'Only Engagement Lead can approve or reject' }, { status: 403 })
    }
    if (action === 'withdraw' && !isExternal) {
      return NextResponse.json({ error: 'Only EC/EV can withdraw their own uploads' }, { status: 403 })
    }
    if ((action === 'approve-folder' || action === 'reject-folder') && !isLead) {
      return NextResponse.json({ error: 'Only Engagement Lead can approve or reject' }, { status: 403 })
    }
    if (action === 'withdraw-folder' && !isExternal) {
      return NextResponse.json({ error: 'Only EC/EV can withdraw their own uploads' }, { status: 403 })
    }

    // Helper: remove intake reminders from all EL members' personalization
    const clearIntakeReminders = async (externalIds: string[]) => {
      const reminderIds = new Set(externalIds.map((id) => `intake-${projectId}-${id}`))
      const leads = await prisma.engagementMember.findMany({
        where: { engagementId: projectId, role: { in: ['eng_admin', 'eng_member'] } },
        select: { userId: true },
      })
      await Promise.all(leads.map(async (lead) => {
        const p = await prisma.userPersonalization.findUnique({
          where: { userId: lead.userId },
          select: { reminders: true },
        })
        if (!p) return
        const items: any[] = Array.isArray(p.reminders) ? p.reminders as any[] : []
        const next = items.filter((r: any) => !reminderIds.has(r.id))
        if (next.length !== items.length) {
          await prisma.userPersonalization.update({
            where: { userId: lead.userId },
            data: { reminders: next as any },
          })
        }
      }))
    }

    // ── Folder-level actions ────────────────────────────────────────────────────
    if (action === 'approve-folder' || action === 'reject-folder' || action === 'withdraw-folder') {
      // Accept both internal UUID and Drive externalId
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const folderWhere = UUID_RE.test(documentIdParam)
        ? { id: documentIdParam, engagementId: projectId }
        : { engagementId: projectId, externalId: documentIdParam }

      const folderDoc = await (prisma.engagementDocument as any).findFirst({
        where: folderWhere,
        select: {
          id: true, externalId: true, connectorId: true, firmId: true, clientId: true, fileName: true,
          sharingUsers: { where: { sharingPermissionStatus: 'PENDING' }, select: { userId: true } },
        },
      }) as { id: string; externalId: string; connectorId: string | null; firmId: string; clientId: string | null; fileName: string; sharingUsers: { userId: string }[] } | null
      if (!folderDoc) return NextResponse.json({ error: 'Folder not found' }, { status: 404 })

      // For withdraw, verify this user owns the PENDING row
      if (action === 'withdraw-folder') {
        const pendingRow = folderDoc.sharingUsers[0]
        if (!pendingRow || pendingRow.userId !== user.id) {
          return NextResponse.json({ error: 'You can only withdraw your own uploads' }, { status: 403 })
        }
      }

      const connectorId = folderDoc.connectorId ?? (await prisma.firm.findUnique({
        where: { id: folderDoc.firmId },
        select: { connectorId: true },
      }))?.connectorId

      // Fetch full subtree (BFS) — handles nested subfolders created by EC/EV
      const fetchSubtree = async (rootExternalId: string) => {
        const all: { id: string; externalId: string; fileName: string; firmId: string; connectorId: string | null }[] = []
        let queue = [rootExternalId]
        while (queue.length) {
          const batch = queue.splice(0)
          const children = await prisma.engagementDocument.findMany({
            where: { engagementId: projectId, parentId: { in: batch } },
            select: { id: true, externalId: true, fileName: true, firmId: true, connectorId: true },
          })
          all.push(...children)
          queue = children.map((c) => c.externalId)
        }
        return all
      }
      const subtreeDocs = await fetchSubtree(folderDoc.externalId)

      if (action === 'approve-folder') {
        // Determine uploader role from the PENDING sharing row to set share flag
        const uploaderId = folderDoc.sharingUsers[0]?.userId
        const uploaderRole = uploaderId
          ? (await prisma.engagementMember.findFirst({
              where: { engagementId: projectId, userId: uploaderId },
              select: { role: true },
            }))?.role
          : null
        const shareKey = uploaderRole === 'eng_ext_collaborator'
          ? 'externalCollaborator'
          : uploaderRole === 'eng_viewer'
            ? 'guest'
            : null
        const docSettings = shareKey ? { share: { [shareKey]: { enabled: true } } } : {}

        const folderSlug = generateShareSlug(folderDoc.fileName ?? folderDoc.externalId, folderDoc.id.slice(0, 8))

        // Approve the root folder: flip PENDING→GRANTED, set share flag + slug
        await Promise.all([
          (prisma.engagementDocumentSharingUser as any).updateMany({
            where: { projectDocumentId: folderDoc.id, sharingPermissionStatus: 'PENDING' },
            data: { sharingPermissionStatus: 'GRANTED' },
          }),
          prisma.engagementDocument.update({
            where: { id: folderDoc.id },
            data: { settings: docSettings as object, slug: folderSlug, updatedAt: new Date() },
          }),
        ])
        await safeInngestSend('file.index.requested', {
          projectId, externalId: folderDoc.externalId, organizationId: folderDoc.firmId, fileName: folderDoc.fileName,
        })
        await (prisma as any).notification.deleteMany({ where: { dedupeKey: `intake-pending:${projectId}:${folderDoc.externalId}` } })

        // Approve all descendants: slugs + Inngest
        await Promise.all(subtreeDocs.map(async (doc) => {
          const slug = generateShareSlug(doc.fileName ?? doc.externalId, doc.id.slice(0, 8))
          await prisma.engagementDocument.update({
            where: { id: doc.id },
            data: { settings: docSettings as object, slug, updatedAt: new Date() },
          })
          await safeInngestSend('file.index.requested', {
            projectId, externalId: doc.externalId, organizationId: doc.firmId, fileName: doc.fileName,
          })
          await (prisma as any).notification.deleteMany({ where: { dedupeKey: `intake-pending:${projectId}:${doc.externalId}` } })
        }))

        await clearIntakeReminders([folderDoc.externalId, ...subtreeDocs.map((d) => d.externalId)])
      } else {
        // reject-folder or withdraw-folder: delete full subtree (bottom-up) + trash Drive files
        // Delete leaves first so FK constraints don't block parent deletes
        const allDocs = [
          ...subtreeDocs.reverse(),
          { id: folderDoc.id, externalId: folderDoc.externalId, firmId: folderDoc.firmId },
        ]
        await Promise.all(allDocs.map(async (doc) => {
          await prisma.engagementDocument.delete({ where: { id: doc.id } }).catch(() => {})
          await (prisma as any).notification.deleteMany({ where: { dedupeKey: `intake-pending:${projectId}:${doc.externalId}` } })
          if (connectorId) {
            const trashResult = await googleDriveConnector.trashFile(connectorId, doc.externalId).catch((e) => {
              console.error('[intake] trashFile error', { connectorId, externalId: doc.externalId, error: String(e), message: e?.message, status: e?.status })
              return false
            })
            if (trashResult === false) console.warn('[intake] trashFile returned false/failed', { connectorId, externalId: doc.externalId })
          }
        }))
        await clearIntakeReminders(allDocs.map((d) => d.externalId))
      }

      return NextResponse.json({ ok: true, action })
    }

    // ── Single-file actions ─────────────────────────────────────────────────────
    const fileInfo = await getFileInfo(projectId, documentIdParam)
    if (!fileInfo) return NextResponse.json({ error: 'File not found' }, { status: 404 })

    const doc = await (prisma.engagementDocument as any).findFirst({
      where: { engagementId: projectId, externalId: fileInfo.externalId },
      select: {
        id: true, fileName: true, firmId: true, connectorId: true, clientId: true,
        sharingUsers: { where: { sharingPermissionStatus: 'PENDING' }, select: { id: true, userId: true } },
      },
    }) as { id: string; fileName: string; firmId: string; connectorId: string | null; clientId: string | null; sharingUsers: { id: string; userId: string }[] } | null
    if (!doc) return NextResponse.json({ error: 'Document record not found' }, { status: 404 })

    const pendingRow = doc.sharingUsers[0]
    if (!pendingRow) {
      return NextResponse.json({ error: 'Document is not pending intake' }, { status: 409 })
    }

    if (action === 'withdraw' && pendingRow.userId !== user.id) {
      return NextResponse.json({ error: 'You can only withdraw your own uploads' }, { status: 403 })
    }

    const dedupeKey = `intake-pending:${projectId}:${fileInfo.externalId}`

    if (action === 'approve') {
      const uploaderRole = pendingRow.userId
        ? (await prisma.engagementMember.findFirst({
            where: { engagementId: projectId, userId: pendingRow.userId },
            select: { role: true },
          }))?.role
        : null
      const shareKey = uploaderRole === 'eng_ext_collaborator'
        ? 'externalCollaborator'
        : uploaderRole === 'eng_viewer'
          ? 'guest'
          : null

      const updatedSettings = shareKey
        ? { share: { [shareKey]: { enabled: true } } }
        : {}
      const newSlug = generateShareSlug(doc.fileName, doc.id.slice(0, 8))

      await Promise.all([
        prisma.engagementDocument.update({
          where: { id: doc.id },
          data: { settings: updatedSettings as object, slug: newSlug, updatedAt: new Date() },
        }),
        (prisma.engagementDocumentSharingUser as any).update({
          where: { id: pendingRow.id },
          data: { sharingPermissionStatus: 'GRANTED' },
        }),
        (prisma as any).notification.deleteMany({ where: { dedupeKey } }),
        clearIntakeReminders([fileInfo.externalId]),
      ])

      // Fire Inngest indexing now that EL has approved
      await safeInngestSend('file.index.requested', {
        projectId,
        externalId: fileInfo.externalId,
        organizationId: doc.firmId,
        fileName: doc.fileName,
      })

      audit(AUDIT_EVENT.DOCUMENT_CHANGED)
        .scope(AUDIT_SCOPE.DOCUMENT)
        .firm(doc.firmId)
        .client(doc.clientId ?? undefined)
        .engagement(projectId)
        .document(doc.id)
        .actor(user.id)
        .meta({ action: 'intake-approved', fileName: doc.fileName })
        .fireAndForget()

      return NextResponse.json({ ok: true, action: 'approved' })
    }

    // reject or withdraw — delete DB record (cascades sharing row) + trash Drive file
    await prisma.engagementDocument.delete({ where: { id: doc.id } })
    await Promise.all([
      (prisma as any).notification.deleteMany({ where: { dedupeKey } }),
      clearIntakeReminders([fileInfo.externalId]),
    ])

    const connectorId = doc.connectorId ?? (await prisma.firm.findUnique({
      where: { id: doc.firmId },
      select: { connectorId: true },
    }))?.connectorId
    if (connectorId) {
      const trashResult = await googleDriveConnector.trashFile(connectorId, fileInfo.externalId).catch((e) => {
        console.error('[intake] trashFile error', { connectorId, externalId: fileInfo.externalId, error: String(e), message: e?.message, status: e?.status })
        return false
      })
      if (trashResult === false) console.warn('[intake] trashFile returned false/failed', { connectorId, externalId: fileInfo.externalId })
    }

    audit(AUDIT_EVENT.DOCUMENT_DELETED)
      .scope(AUDIT_SCOPE.DOCUMENT)
      .firm(doc.firmId)
      .client(doc.clientId ?? undefined)
      .engagement(projectId)
      .document(doc.id)
      .actor(user.id)
      .meta({ action, fileName: doc.fileName })
      .fireAndForget()

    return NextResponse.json({ ok: true, action })
  } catch (e) {
    console.error('intake PATCH error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
