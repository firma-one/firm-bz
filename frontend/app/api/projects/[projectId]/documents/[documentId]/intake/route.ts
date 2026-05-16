import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { requireEngagementMember, isExternalEngagementRole, isEngagementLeadRole } from '@/lib/engagement-access'
import { getFileInfo } from '@/lib/file-utils'
import { getLock } from '@/lib/sharing-settings'
import { generateShareSlug } from '@/lib/slug-utils'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { safeInngestSend } from '@/lib/inngest/client'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/intake
 * Body: { action: 'approve' | 'reject' | 'withdraw' }
 *
 * approve  — EL only: clears settings.lock, file becomes a normal document
 * reject   — EL only: deletes DB record + trashes Drive file
 * withdraw — EC/EV only (own uploads): deletes DB record + trashes Drive file
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

    if (action === 'approve' || action === 'reject') {
      if (!isLead) return NextResponse.json({ error: 'Only Engagement Lead can approve or reject' }, { status: 403 })
    }
    if (action === 'withdraw') {
      if (!isExternal) return NextResponse.json({ error: 'Only EC/EV can withdraw their own uploads' }, { status: 403 })
    }
    if (action === 'approve-folder' || action === 'reject-folder') {
      if (!isLead) return NextResponse.json({ error: 'Only Engagement Lead can approve or reject' }, { status: 403 })
    }
    if (action === 'withdraw-folder') {
      if (!isExternal) return NextResponse.json({ error: 'Only EC/EV can withdraw their own uploads' }, { status: 403 })
    }

    // Folder-level intake actions — documentIdParam is the folder's externalId (Google Drive ID)
    if (action === 'approve-folder' || action === 'reject-folder' || action === 'withdraw-folder') {
      const folderDoc = await prisma.engagementDocument.findFirst({
        where: { engagementId: projectId, externalId: documentIdParam },
        select: { id: true, connectorId: true, firmId: true, clientId: true, settings: true, fileName: true },
      })

      // Find all intake-locked children (fetch by type; filter uploadedBy in JS for withdraw)
      const allChildDocs = await prisma.engagementDocument.findMany({
        where: {
          engagementId: projectId,
          parentId: documentIdParam,
          settings: { path: ['lock', 'type'], equals: 'intake' } as any,
        },
        select: { id: true, externalId: true, fileName: true, settings: true, connectorId: true, firmId: true },
      })

      const childDocs = action === 'withdraw-folder'
        ? allChildDocs.filter((doc) => {
            const lock = (doc.settings as any)?.lock
            return lock?.uploadedBy === user.id
          })
        : allChildDocs

      const connectorId = folderDoc?.connectorId ?? childDocs[0]?.connectorId
      const firmId = folderDoc?.firmId ?? childDocs[0]?.firmId

      // Clear intake reminders for the folder + children from every EL's personalization
      const clearFolderIntakeReminders = async (externalIds: string[]) => {
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

      if (action === 'approve-folder') {
        // Clear intake lock on all child docs
        await Promise.all(childDocs.map(async (doc) => {
          const prevSettings = (doc.settings as Record<string, unknown>) || {}
          const { lock: _removed, ...restSettings } = prevSettings as any
          await prisma.engagementDocument.update({
            where: { id: doc.id },
            data: { settings: restSettings as object, updatedAt: new Date() },
          })
          const dedupeKey = `intake-pending:${projectId}:${doc.externalId}`
          await (prisma as any).notification.deleteMany({ where: { dedupeKey } })
        }))

        // Approve the folder itself: clear lock + share with the uploader's persona
        if (folderDoc) {
          const folderLock = (folderDoc.settings as any)?.lock
          const uploaderRole = folderLock?.uploadedBy
            ? (await prisma.engagementMember.findFirst({
                where: { engagementId: projectId, userId: folderLock.uploadedBy },
                select: { role: true },
              }))?.role
            : null

          const shareKey = uploaderRole === 'eng_ext_collaborator'
            ? 'externalCollaborator'
            : uploaderRole === 'eng_viewer'
              ? 'guest'
              : null

          const prevSettings = (folderDoc.settings as Record<string, unknown>) || {}
          const { lock: _removed, ...restSettings } = prevSettings as any
          const updatedSettings = shareKey
            ? { ...restSettings, share: { ...(restSettings.share || {}), [shareKey]: { enabled: true } } }
            : restSettings
          const folderSlug = generateShareSlug(folderDoc.fileName ?? documentIdParam, folderDoc.id.slice(0, 8))

          await prisma.engagementDocument.update({
            where: { id: folderDoc.id },
            data: { settings: updatedSettings as object, slug: folderSlug, updatedAt: new Date() },
          })
          const dedupeKey = `intake-pending:${projectId}:${documentIdParam}`
          await (prisma as any).notification.deleteMany({ where: { dedupeKey } })
        }

        // Clear reminders for folder + all its children
        const allExternalIds = [documentIdParam, ...childDocs.map((d) => d.externalId)]
        await clearFolderIntakeReminders(allExternalIds)
      } else {
        // reject-folder or withdraw-folder: delete records + trash Drive files
        const allDocs = folderDoc ? [...childDocs, { ...folderDoc, externalId: documentIdParam, fileName: '' }] : childDocs
        await Promise.all(allDocs.map(async (doc) => {
          await prisma.engagementDocument.delete({ where: { id: doc.id } }).catch(() => {})
          const dedupeKey = `intake-pending:${projectId}:${doc.externalId}`
          await (prisma as any).notification.deleteMany({ where: { dedupeKey } })
          if (connectorId) {
            await googleDriveConnector.trashFile(connectorId, doc.externalId).catch(() => {})
          }
          if (firmId) {
            await safeInngestSend('file.delete.requested', {
              organizationId: firmId,
              externalId: doc.externalId,
            })
          }
        }))

        // Clear reminders for folder + all affected children
        await clearFolderIntakeReminders(allDocs.map((d) => d.externalId))
      }

      return NextResponse.json({ ok: true, action })
    }

    const fileInfo = await getFileInfo(projectId, documentIdParam)
    if (!fileInfo) return NextResponse.json({ error: 'File not found' }, { status: 404 })

    const doc = await prisma.engagementDocument.findFirst({
      where: { engagementId: projectId, externalId: fileInfo.externalId },
      select: { id: true, settings: true, fileName: true, firmId: true, connectorId: true },
    })
    if (!doc) return NextResponse.json({ error: 'Document record not found' }, { status: 404 })

    const lock = getLock(doc.settings)
    if (!lock || lock.type !== 'intake') {
      return NextResponse.json({ error: 'Document is not pending intake' }, { status: 409 })
    }

    if (action === 'withdraw' && lock.uploadedBy !== user.id) {
      return NextResponse.json({ error: 'You can only withdraw your own uploads' }, { status: 403 })
    }

    const dedupeKey = `intake-pending:${projectId}:${fileInfo.externalId}`
    const reminderId = `intake-${projectId}-${fileInfo.externalId}`

    // Helper: remove intake reminder from all EL members' personalization
    const clearIntakeReminders = async () => {
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
        const next = items.filter((r: any) => r.id !== reminderId)
        if (next.length !== items.length) {
          await prisma.userPersonalization.update({
            where: { userId: lead.userId },
            data: { reminders: next as any },
          })
        }
      }))
    }

    if (action === 'approve') {
      // Determine share key from the uploader's role
      const uploaderRole = lock.uploadedBy
        ? (await prisma.engagementMember.findFirst({
            where: { engagementId: projectId, userId: lock.uploadedBy },
            select: { role: true },
          }))?.role
        : null
      const shareKey = uploaderRole === 'eng_ext_collaborator'
        ? 'externalCollaborator'
        : uploaderRole === 'eng_viewer'
          ? 'guest'
          : null

      // Clear lock, set share flag so EV/EC can see the file, generate slug for Shares tab
      const prevSettings = (doc.settings as Record<string, unknown>) || {}
      const { lock: _removed, ...restSettings } = prevSettings as any
      const updatedSettings = shareKey
        ? { ...restSettings, share: { ...(restSettings.share || {}), [shareKey]: { enabled: true } } }
        : restSettings
      const newSlug = generateShareSlug(doc.fileName, doc.id.slice(0, 8))
      await prisma.engagementDocument.update({
        where: { id: doc.id },
        data: { settings: updatedSettings as object, slug: newSlug, updatedAt: new Date() },
      })

      // Delete intake notification + reminders
      await Promise.all([
        (prisma as any).notification.deleteMany({ where: { dedupeKey } }),
        clearIntakeReminders(),
      ])

      audit(AUDIT_EVENT.DOCUMENT_CHANGED)
        .scope(AUDIT_SCOPE.DOCUMENT)
        .firm(doc.firmId)
        .engagement(projectId)
        .document(doc.id)
        .actor(user.id)
        .meta({ action: 'intake-approved', fileName: doc.fileName })
        .fireAndForget()

      return NextResponse.json({ ok: true, action: 'approved' })
    }

    // reject or withdraw — delete DB record + trash Drive file
    await prisma.engagementDocument.delete({ where: { id: doc.id } })
    await Promise.all([
      (prisma as any).notification.deleteMany({ where: { dedupeKey } }),
      clearIntakeReminders(),
    ])

    // Trash the Drive file — awaited so the file is gone before we respond
    const connectorId = doc.connectorId ?? (await prisma.firm.findUnique({
      where: { id: doc.firmId },
      select: { connectorId: true },
    }))?.connectorId
    if (connectorId) {
      await googleDriveConnector.trashFile(connectorId, fileInfo.externalId).catch(() => {})
    }

    // Remove from search index
    await safeInngestSend('file.delete.requested', {
      organizationId: doc.firmId,
      externalId: fileInfo.externalId,
    })

    audit(AUDIT_EVENT.DOCUMENT_DELETED)
      .scope(AUDIT_SCOPE.DOCUMENT)
      .firm(doc.firmId)
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
