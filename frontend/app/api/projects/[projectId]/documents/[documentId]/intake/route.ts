import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { requireEngagementMember, isExternalEngagementRole, isEngagementLeadRole, blockIfEngagementCompleted } from '@/lib/engagement-access'
import { getFileInfo } from '@/lib/file-utils'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { StorageFailure } from '@/lib/connectors/storage-failure'
import { safeInngestSend } from '@/lib/inngest/client'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { buildSettingsForDb } from '@/lib/sharing-settings'

type TrashAnswer = { ok: true } | { ok: false; response: NextResponse }

/**
 * Reject or withdraw (decision 6, AP-3): the file goes to the storage's trash first, through the
 * engagement's connector. Only then does its row go. When storage refuses, the row stays, so the file
 * isn't left in storage with nothing in Firma to act on it again, and the answer says why. No connector
 * at all is a refusal too, never a silent skip. Already gone from storage counts as done.
 */
async function trashFirst(
  projectId: string,
  documentConnectorId: string | null,
  externalId: string,
  what: { verb: 'reject' | 'withdraw'; name: string },
): Promise<TrashAnswer> {
  const refuse = (error: string, code: string, status: number): TrashAnswer => ({ ok: false, response: NextResponse.json({ error, code }, { status }) })
  const connectorId = await resolveEngagementConnectorId(projectId, documentConnectorId)
  const adapter = connectorId ? await getPermissionAdapter(connectorId) : null
  if (!connectorId || !adapter) {
    return refuse(`Couldn't ${what.verb} "${what.name}" · no storage is connected to remove it from. Reconnect the storage, then try again.`, 'no_connector', 409)
  }
  try {
    await adapter.trashFile(connectorId, externalId)
    return { ok: true }
  } catch (e) {
    if (e instanceof StorageFailure && e.reason === 'not_found') return { ok: true }
    console.error('[intake] trashFile error', { connectorId, externalId, error: String(e) })
    if (e instanceof StorageFailure) return refuse(`Couldn't ${what.verb} "${what.name}" · ${e.message}`, e.reason, e.status)
    return refuse(`Couldn't ${what.verb} "${what.name}" · the storage couldn't be reached to remove it. Try again in a moment.`, 'unreachable', 502)
  }
}

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/intake
 * Body: { action: 'approve' | 'reject' | 'withdraw' | 'approve-folder' | 'reject-folder' | 'withdraw-folder' }
 *
 * approve        — EL only: flip sharing row PENDING→GRANTED, set share flag, fire Inngest index
 * reject         — EL only: trash the Drive file, then delete EngagementDocument (cascades sharing row)
 * withdraw       — EC/EV only (own uploads): same trash + delete flow
 * approve-folder — EL only: approve all children + the folder itself
 * reject-folder  — EL only: trash the Drive folder (and so what it holds), then delete it and its children
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

    const completed = await blockIfEngagementCompleted(projectId)
    if (completed) return completed

    const isExternal = isExternalEngagementRole(member.role)
    const isLead = isEngagementLeadRole(member.role)

    if ((action === 'approve' || action === 'reject') && !isLead) {
      return NextResponse.json({ error: 'Only a Lead can approve or reject' }, { status: 403 })
    }
    if (action === 'withdraw' && !isExternal) {
      return NextResponse.json({ error: 'Only EC/EV can withdraw their own uploads' }, { status: 403 })
    }
    if ((action === 'approve-folder' || action === 'reject-folder') && !isLead) {
      return NextResponse.json({ error: 'Only a Lead can approve or reject' }, { status: 403 })
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
          id: true, externalId: true, connectorId: true, firmId: true, clientId: true, fileName: true, settings: true,
          sharingUsers: { where: { sharingPermissionStatus: 'PENDING' }, select: { userId: true } },
        },
      }) as { id: string; externalId: string; connectorId: string | null; firmId: string; clientId: string | null; fileName: string; settings: Record<string, unknown> | null; sharingUsers: { userId: string }[] } | null
      if (!folderDoc) return NextResponse.json({ error: 'Folder not found' }, { status: 404 })

      // For withdraw, verify this user owns the PENDING row
      if (action === 'withdraw-folder') {
        const pendingRow = folderDoc.sharingUsers[0]
        if (!pendingRow || pendingRow.userId !== user.id) {
          return NextResponse.json({ error: 'You can only withdraw your own uploads' }, { status: 403 })
        }
      }

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
        const docSettings = shareKey
          ? buildSettingsForDb(folderDoc.settings, {
              share: { [shareKey]: { enabled: true } },
              actorId: user.id,
            })
          : folderDoc.settings ?? {}

        // Approve the root folder: flip PENDING→GRANTED, set share flag
        await Promise.all([
          (prisma.engagementDocumentSharingUser as any).updateMany({
            where: { projectDocumentId: folderDoc.id, sharingPermissionStatus: 'PENDING' },
            data: { sharingPermissionStatus: 'GRANTED' },
          }),
          prisma.engagementDocument.update({
            where: { id: folderDoc.id },
            data: { settings: docSettings as object, updatedAt: new Date() },
          }),
        ])
        await safeInngestSend('file.index.requested', {
          projectId, externalId: folderDoc.externalId, organizationId: folderDoc.firmId, fileName: folderDoc.fileName, actorId: user.id,
        })
        await (prisma as any).notification.deleteMany({ where: { dedupeKey: `intake-pending:${projectId}:${folderDoc.externalId}` } })

        // Approve all descendants: trigger indexing only (no settings/slug — access is via ancestor lookup)
        await Promise.all(subtreeDocs.map(async (doc) => {
          await prisma.engagementDocument.update({
            where: { id: doc.id },
            data: { updatedAt: new Date() },
          })
          await safeInngestSend('file.index.requested', {
            projectId, externalId: doc.externalId, organizationId: doc.firmId, fileName: doc.fileName, actorId: user.id,
          })
          await (prisma as any).notification.deleteMany({ where: { dedupeKey: `intake-pending:${projectId}:${doc.externalId}` } })
        }))

        await clearIntakeReminders([folderDoc.externalId, ...subtreeDocs.map((d) => d.externalId)])
      } else {
        // reject-folder or withdraw-folder: the folder goes to the storage's trash first, taking what
        // it holds with it; only then do its rows go. Refused, nothing in Firma changes.
        const trashed = await trashFirst(projectId, folderDoc.connectorId, folderDoc.externalId, {
          verb: action === 'reject-folder' ? 'reject' : 'withdraw',
          name: folderDoc.fileName,
        })
        if (!trashed.ok) return trashed.response

        // Leaves first so FK constraints don't block parent deletes
        const allDocs = [
          ...subtreeDocs.reverse(),
          { id: folderDoc.id, externalId: folderDoc.externalId, firmId: folderDoc.firmId },
        ]
        for (const doc of allDocs) {
          await prisma.engagementDocument.deleteMany({ where: { id: doc.id } })
          await (prisma as any).notification.deleteMany({ where: { dedupeKey: `intake-pending:${projectId}:${doc.externalId}` } })
        }
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
        id: true, fileName: true, firmId: true, connectorId: true, clientId: true, settings: true,
        sharingUsers: { where: { sharingPermissionStatus: 'PENDING' }, select: { id: true, userId: true } },
      },
    }) as { id: string; fileName: string; firmId: string; connectorId: string | null; clientId: string | null; settings: Record<string, unknown> | null; sharingUsers: { id: string; userId: string }[] } | null
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
        ? buildSettingsForDb(doc.settings, {
            share: { [shareKey]: { enabled: true } },
            actorId: user.id,
          })
        : doc.settings ?? {}
      await Promise.all([
        prisma.engagementDocument.update({
          where: { id: doc.id },
          data: { settings: updatedSettings as object, updatedAt: new Date() },
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
        actorId: user.id,
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

    // reject or withdraw: the file goes to the storage's trash first, then its record (which cascades
    // the sharing row). Refused, the record stays, and the answer says why.
    const trashed = await trashFirst(projectId, doc.connectorId, fileInfo.externalId, {
      verb: action === 'reject' ? 'reject' : 'withdraw',
      name: doc.fileName,
    })
    if (!trashed.ok) return trashed.response

    await prisma.engagementDocument.delete({ where: { id: doc.id } })
    await Promise.all([
      (prisma as any).notification.deleteMany({ where: { dedupeKey } }),
      clearIntakeReminders([fileInfo.externalId]),
    ])

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
    return NextResponse.json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 })
  }
}
