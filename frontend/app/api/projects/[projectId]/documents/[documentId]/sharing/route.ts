import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { buildSettingsForDb, parseSettingsFromDb, type ShareBlock } from '@/lib/sharing-settings'
import { syncDocumentSharingUsers } from '@/lib/sync-document-sharing'
import { getFileInfo } from '@/lib/file-utils'
import { safeInngestSend } from '@/lib/inngest/client'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canManageProject } from '@/lib/permission-helpers'
import { resolveEngagementConnector } from '@/lib/connectors/resolve-client-connector'
import { GoogleDriveConnector } from '@/lib/google-drive-connector'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { assertFirmSubscriptionAccess } from '@/lib/billing/subscription-gate'
import { SubscriptionRevokedError } from '@/lib/errors/api-error'
import { assignDocId } from '@/lib/doc-id'
import { DocumentSharingPermissionStatus, EngagementRole } from '@prisma/client'

/** ProjectDocument can contain BigInt (fileSize); JSON.stringify cannot serialize it. */
function toJsonSafeSharing(doc: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!doc) return null
  const { fileSize, ...rest } = doc
  return {
    ...rest,
    fileSize: fileSize != null ? String(fileSize) : null,
  } as Record<string, unknown>
}

/** Ensure a document row exists in engagement_documents before sharing.
 *  1. Synchronous stub upsert — creates the minimal row (ON CONFLICT DO NOTHING).
 *  2. Background full index — SearchService.indexFile() fills metadata/embedding.
 */
async function ensureDocument(
  projectId: string,
  externalId: string,
  title: string,
  actorId?: string | null,
  mimeType?: string | null
): Promise<{ organizationId: string, externalId: string }> {
  const project = await prisma.engagement.findFirst({
    where: { id: projectId, isDeleted: false },
    select: { firmId: true, clientId: true },
  })
  if (!project) throw new Error('Project not found')

  const { firmId, clientId } = project

  if (mimeType) {
    await (prisma as any).$executeRawUnsafe(
      `INSERT INTO platform.engagement_documents
         ("firmId", "clientId", "engagementId", "externalId", "fileName", "mimeType", "createdBy", "updatedAt")
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::uuid, NOW())
       ON CONFLICT ("engagementId", "firmId", "externalId") DO UPDATE SET "mimeType" = EXCLUDED."mimeType" WHERE platform.engagement_documents."mimeType" IS NULL`,
      firmId,
      clientId || null,
      projectId,
      externalId,
      title || externalId,
      mimeType,
      actorId || null
    )
  } else {
    await (prisma as any).$executeRawUnsafe(
      `INSERT INTO platform.engagement_documents
         ("firmId", "clientId", "engagementId", "externalId", "fileName", "createdBy", "updatedAt")
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::uuid, NOW())
       ON CONFLICT ("engagementId", "firmId", "externalId") DO NOTHING`,
      firmId,
      clientId || null,
      projectId,
      externalId,
      title || externalId,
      actorId || null
    )
  }

  const { SearchService } = await import('@/lib/services/search-service')
  Promise.resolve().then(() =>
    SearchService.indexFile({
      organizationId: firmId,
      clientId: clientId || undefined,
      projectId,
      externalId,
      fileName: title || externalId,
      actorId: actorId || null,
    }).catch((err) => console.error('Background indexFile error after share stub', err))
  )

  return { organizationId: firmId, externalId }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId: documentIdParam } = await params
    const fileInfo = await getFileInfo(projectId, documentIdParam)
    if (!fileInfo) return NextResponse.json({ sharing: null })

    const doc = await prisma.engagementDocument.findUnique({
      where: {
        engagementId_firmId_externalId: {
          engagementId: projectId,
          firmId: fileInfo.organizationId,
          externalId: fileInfo.externalId,
        },
      },
    })
    return NextResponse.json({ sharing: toJsonSafeSharing(doc as Record<string, unknown> | null) })
  } catch (e) {
    console.error('GET sharing error', e)
    return NextResponse.json({ error: 'Failed to load sharing' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId: documentIdParam } = await params
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const canManage = await canManageProject(ctx.firmId, ctx.clientId, ctx.projectId)
    if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await assertFirmSubscriptionAccess(ctx.firmId)

    const body = await request.json().catch(() => ({}))

    // --- Description update path ---
    if (typeof body.description === 'string') {
      const doc = await prisma.engagementDocument.findFirst({
        where: { id: documentIdParam, engagementId: projectId },
      })
      if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      const existingSettings = (doc.settings as Record<string, unknown>) || {}
      const updated = await prisma.engagementDocument.update({
        where: { id: doc.id },
        data: {
          settings: { ...existingSettings, description: body.description },
          updatedAt: new Date(),
          updatedBy: user.id,
        },
      })
      return NextResponse.json({ sharing: toJsonSafeSharing(updated as Record<string, unknown>) })
    }

    // --- Mark as Deliverable path ---
    if (body.markAsDeliverable === true) {
      const doc = await prisma.engagementDocument.findFirst({
        where: { id: documentIdParam, engagementId: projectId },
      })
      if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      if (!doc.isFolder) return NextResponse.json({ error: 'Cannot mark a file as a Deliverable' }, { status: 400 })

      const engagement = await prisma.engagement.findUnique({
        where: { id: projectId },
        select: { name: true, firmId: true },
      })
      if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })

      const now = new Date().toISOString()

      // Mark folder as Deliverable in settings.
      // Both EC and EV are enabled immediately so the folder appears in Files for all roles.
      // Children remain hidden until INHERITED sharing rows are written by lane transitions.
      const settings = buildSettingsForDb((doc.settings as Record<string, unknown>) || null, {
        share: {
          externalCollaborator: { enabled: true },
          guest: { enabled: true, options: {} },
        },
        activity: { status: 'to_do', updatedAt: now },
        actorId: user.id,
      })
      await prisma.engagementDocument.update({
        where: { id: doc.id },
        data: { settings, updatedAt: new Date(), updatedBy: user.id },
      })

      // Insert GRANTED rows for EL (eng_admin) and EM (eng_member) on the folder
      const internalMembers = await prisma.engagementMember.findMany({
        where: {
          engagementId: projectId,
          role: { in: [EngagementRole.eng_admin, EngagementRole.eng_member] },
        },
      })
      const internalUserIds = internalMembers.map((m) => m.userId)
      for (const member of internalMembers) {
        await prisma.engagementDocumentSharingUser.upsert({
          where: { projectDocumentId_userId: { projectDocumentId: doc.id, userId: member.userId } },
          update: { sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED, updatedBy: user.id },
          create: {
            projectDocumentId: doc.id,
            engagementId: projectId,
            userId: member.userId,
            sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
            createdBy: user.id,
            updatedBy: user.id,
          },
        })
      }

      // Insert INHERITED rows for EL/EM on all descendants (files and sub-folders) via recursive CTE
      const allDescendants = (await (prisma as any).$queryRawUnsafe(
        `WITH RECURSIVE descendants AS (
           SELECT id, "externalId" FROM platform.engagement_documents
           WHERE "parentId" = $1 AND "engagementId" = $2::uuid
           UNION ALL
           SELECT ed.id, ed."externalId" FROM platform.engagement_documents ed
           INNER JOIN descendants d ON ed."parentId" = d."externalId"
           WHERE ed."engagementId" = $2::uuid
         )
         SELECT id FROM descendants`,
        doc.externalId,
        projectId
      )) as Array<{ id: string }>
      for (const child of allDescendants) {
        for (const member of internalMembers) {
          await prisma.engagementDocumentSharingUser.upsert({
            where: { projectDocumentId_userId: { projectDocumentId: child.id, userId: member.userId } },
            update: { sharingPermissionStatus: DocumentSharingPermissionStatus.INHERITED, updatedBy: user.id },
            create: {
              projectDocumentId: child.id,
              engagementId: projectId,
              userId: member.userId,
              sharingPermissionStatus: DocumentSharingPermissionStatus.INHERITED,
              createdBy: user.id,
              updatedBy: user.id,
            },
          })
        }
      }

      audit(AUDIT_EVENT.DOCUMENT_SHARE_CREATED)
        .scope(AUDIT_SCOPE.DOCUMENT)
        .firm(engagement.firmId)
        .client(ctx.clientId)
        .engagement(projectId)
        .document(doc.id)
        .actor(user.id)
        .meta({ fileName: doc.fileName, action: 'markAsDeliverable' })
        .fireAndForget()

      const updated = await prisma.engagementDocument.findUnique({ where: { id: doc.id } })
      return NextResponse.json({ sharing: toJsonSafeSharing(updated as Record<string, unknown> | null) })
    }
    // --- End Mark as Deliverable ---

    // --- Untag as Deliverable path ---
    if (body.untagAsDeliverable === true) {
      const doc = await prisma.engagementDocument.findFirst({
        where: { id: documentIdParam, engagementId: projectId },
      })
      if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      if (!doc.isFolder) return NextResponse.json({ error: 'Cannot untag a file' }, { status: 400 })

      // Clear settings (removes share.createdAt, activity, etc.)
      await prisma.engagementDocument.update({
        where: { id: doc.id },
        data: { settings: {}, updatedAt: new Date(), updatedBy: user.id },
      })

      // Revoke all GRANTED and INHERITED sharing rows for this folder
      await prisma.engagementDocumentSharingUser.deleteMany({
        where: { projectDocumentId: doc.id },
      })

      // Revoke INHERITED rows for all descendants via recursive CTE
      const allDescendants = (await (prisma as any).$queryRawUnsafe(
        `WITH RECURSIVE descendants AS (
           SELECT id, "externalId" FROM platform.engagement_documents
           WHERE "parentId" = $1 AND "engagementId" = $2::uuid
           UNION ALL
           SELECT ed.id, ed."externalId" FROM platform.engagement_documents ed
           INNER JOIN descendants d ON ed."parentId" = d."externalId"
           WHERE ed."engagementId" = $2::uuid
         )
         SELECT id FROM descendants`,
        doc.externalId,
        projectId
      )) as Array<{ id: string }>
      if (allDescendants.length > 0) {
        await prisma.engagementDocumentSharingUser.deleteMany({
          where: {
            projectDocumentId: { in: allDescendants.map((c: { id: string }) => c.id) },
            sharingPermissionStatus: DocumentSharingPermissionStatus.INHERITED,
          },
        })
      }

      const engagement = await prisma.engagement.findUnique({
        where: { id: projectId },
        select: { firmId: true },
      })

      audit(AUDIT_EVENT.DOCUMENT_SHARE_DELETED)
        .scope(AUDIT_SCOPE.DOCUMENT)
        .firm(engagement?.firmId ?? ctx.firmId)
        .client(ctx.clientId)
        .engagement(projectId)
        .document(doc.id)
        .actor(user.id)
        .meta({ fileName: doc.fileName, action: 'untagAsDeliverable' })
        .fireAndForget()

      const updated = await prisma.engagementDocument.findUnique({ where: { id: doc.id } })
      return NextResponse.json({ sharing: toJsonSafeSharing(updated as Record<string, unknown> | null) })
    }
    // --- End Untag as Deliverable ---

    const title = typeof body.title === 'string' ? body.title : ''
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : null

    let fileInfo: { organizationId: string; externalId: string } | null = null

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentIdParam)) {
      // UUID = must already exist in the search index (no implicit creation)
      fileInfo = await getFileInfo(projectId, documentIdParam)
      if (!fileInfo) return NextResponse.json({ error: 'File not found in this project' }, { status: 404 })
    } else {
      // Drive file ID — ensure document row exists, then update its sharing fields.
      try {
        fileInfo = await ensureDocument(projectId, documentIdParam, title, user.id, mimeType)
      } catch (err) {
        console.error('ensureDocument error', err)
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'File not found in this project' },
          { status: 404 }
        )
      }
    }

    const externalCollaborator = body.externalCollaborator !== false
    const guest = body.guest === true
    const ecOptions = {
      allowDownload: body.ecOptions?.allowDownload === true,
    }
    const guestOptions = {
      sharePdfOnly: body.guestOptions?.sharePdfOnly !== false,
      allowDownload: body.guestOptions?.allowDownload === true,
      addWatermark: body.guestOptions?.addWatermark === true,
      publish: body.guestOptions?.publish === true,
      sharedPdfDriveId: body.guestOptions?.sharedPdfDriveId ?? null,
    }

    const existing = await prisma.engagementDocument.findUnique({
      where: {
        engagementId_firmId_externalId: {
          engagementId: projectId,
          firmId: fileInfo.organizationId,
          externalId: fileInfo.externalId,
        },
      },
    })

    if (!externalCollaborator && !guest) {
      if (existing) {
        const oldSettings = parseSettingsFromDb((existing.settings as Record<string, unknown>) || {})
        const disabledPersonas: Array<'guest' | 'externalCollaborator'> = []
        if (oldSettings?.share?.guest?.enabled) disabledPersonas.push('guest')
        if (oldSettings?.share?.externalCollaborator?.enabled) disabledPersonas.push('externalCollaborator')

        // Trash the system PDF copy if guest sharing was active
        const sharedPdfDriveId = oldSettings?.share?.guest?.options?.sharedPdfDriveId
        if (sharedPdfDriveId) {
          let resolvedConnectorId = existing.connectorId
          if (!resolvedConnectorId) {
            const engagementConnector = await resolveEngagementConnector(projectId)
            if (engagementConnector?.status === 'ACTIVE') resolvedConnectorId = engagementConnector.id
          }
          if (resolvedConnectorId) {
            try {
              const adapter = await getPermissionAdapter(resolvedConnectorId)
              await adapter?.trashFile(resolvedConnectorId, sharedPdfDriveId)
            } catch {}
          }
        }

        await prisma.engagementDocument.update({
          where: { id: existing.id },
          data: { settings: {}, slug: null, updatedAt: new Date() },
        })

        // Revoke Drive permissions granted via regrant for any previously enabled personas
        if (disabledPersonas.length > 0) {
          await safeInngestSend('sharing.settings.updated', {
            projectId,
            organizationId: fileInfo.organizationId,
            documentId: fileInfo.externalId,
            sharingId: existing.id,
            disabledPersonas,
            timestamp: new Date().toISOString(),
            userId: user.id,
          })
        }
      }
      return NextResponse.json({ sharing: null })
    }

    const now = new Date().toISOString()
    const existingSettings = (existing?.settings as Record<string, unknown>) || null
    const shareUpdate: Partial<ShareBlock> = {
      guest: { enabled: guest, options: guestOptions },
      externalCollaborator: { enabled: externalCollaborator, options: ecOptions },
      updatedAt: now,
      publishedVersionId: existingSettings?.publishedVersionId as string | undefined,
      publishedAt: existingSettings?.publishedAt as string | undefined,
    }
    if (!existing) shareUpdate.createdAt = now

    const appendComment =
      typeof body.assignerComment === 'string' && body.assignerComment.trim()
        ? { createdAt: now, commentor: user.id, comment: body.assignerComment.trim() }
        : undefined

    const settings = buildSettingsForDb(existingSettings, {
      share: shareUpdate,
      activity: existing ? undefined : { status: 'to_do', updatedAt: now },
      appendComment,
      actorId: user.id,
    })

    if (existing) {
      const updateData: { settings: typeof settings; updatedAt: Date; updatedBy: string; createdBy?: string; mimeType?: string } = { settings, updatedAt: new Date(), updatedBy: user.id }
      if (!existing.createdBy) updateData.createdBy = user.id
      if (mimeType && !existing.mimeType) updateData.mimeType = mimeType
      await prisma.engagementDocument.update({
        where: { id: existing.id },
        data: updateData,
      })
    } else {
      const proj = await prisma.engagement.findUnique({ where: { id: projectId }, select: { clientId: true, name: true } })
      const created = await prisma.engagementDocument.create({
        data: {
          engagementId: projectId,
          firmId: fileInfo.organizationId,
          clientId: proj?.clientId ?? null,
          externalId: fileInfo.externalId,
          fileName: title || fileInfo.externalId,
          createdBy: user.id,
          settings,
          ...(mimeType ? { mimeType } : {}),
        },
      })
      if (proj?.name) {
        Promise.resolve().then(() => assignDocId(created.id, projectId, proj.name).catch(() => {}))
      }
    }

    const updated = await prisma.engagementDocument.findUnique({
      where: {
        engagementId_firmId_externalId: {
          engagementId: projectId,
          firmId: fileInfo.organizationId,
          externalId: fileInfo.externalId,
        },
      },
    })

    if (updated) {
      Promise.resolve().then(() => syncDocumentSharingUsers(updated.id, user.id))

      const oldSettings = existing
        ? parseSettingsFromDb((existing.settings as Record<string, unknown>) || {})
        : null
      const disabledPersonas: Array<'guest' | 'externalCollaborator'> = []

      if (oldSettings?.share?.guest?.enabled && !guest) {
        disabledPersonas.push('guest')
      }
      if (oldSettings?.share?.externalCollaborator?.enabled && !externalCollaborator) {
        disabledPersonas.push('externalCollaborator')
      }

      // If guest was just disabled, trash the system PDF copy — it has no value without guest sharing
      if (disabledPersonas.includes('guest')) {
        const pdfDriveId = oldSettings?.share?.guest?.options?.sharedPdfDriveId
        if (pdfDriveId) {
          let resolvedConnectorId = updated.connectorId
          if (!resolvedConnectorId) {
            const engagementConnector = await resolveEngagementConnector(projectId)
            if (engagementConnector?.status === 'ACTIVE') resolvedConnectorId = engagementConnector.id
          }
          if (resolvedConnectorId) {
            try {
              const adapter = await getPermissionAdapter(resolvedConnectorId)
              await adapter?.trashFile(resolvedConnectorId, pdfDriveId)
            } catch (e) {
              console.error('Failed to trash system PDF on guest disable:', e)
            }
          }
        }
      }

      if (disabledPersonas.length > 0) {
        await safeInngestSend('sharing.settings.updated', {
          projectId,
          organizationId: fileInfo.organizationId,
          documentId: fileInfo.externalId,
          sharingId: updated.id,
          disabledPersonas,
          timestamp: new Date().toISOString(),
          userId: user.id,
        })
      }

      // Enforce allowDownload on Drive files whenever guest sharing is active.
      // patchFileProperties is Google Drive-specific — resolve a Drive connector only.
      if (guest) {
        let resolvedConnectorId: string | null = null
        if (updated.connectorId) {
          // Verify the document's own connector is an active Google Drive connector before using it
          const docConnector = await prisma.connector.findUnique({
            where: { id: updated.connectorId },
            select: { id: true, type: true, status: true },
          })
          if (docConnector?.type === 'GOOGLE_DRIVE' && docConnector.status === 'ACTIVE') {
            resolvedConnectorId = docConnector.id
          }
        }
        if (!resolvedConnectorId) {
          const org = await prisma.firm.findUnique({
            where: { id: fileInfo.organizationId },
            include: { connector: true, connectors: true },
          })
          const active = [...(org?.connectors ?? []), ...(org?.connector ? [org.connector] : [])].find(c => c.status === 'ACTIVE' && c.type === 'GOOGLE_DRIVE')
          if (active) resolvedConnectorId = active.id
        }

        if (resolvedConnectorId) {
          const drive = GoogleDriveConnector.getInstance()
          const sharePdfOnly = guestOptions.sharePdfOnly ?? false

          // Always block Drive's native download — Firma controls download via its own action menu
          if (sharePdfOnly) {
            const sharedPdfDriveId = guestOptions.sharedPdfDriveId
            if (sharedPdfDriveId) {
              try {
                await drive.patchFileProperties(resolvedConnectorId, sharedPdfDriveId, {
                  copyRequiresWriterPermission: true
                })
              } catch (e) {
                console.error('Failed to patch PDF file properties:', e)
              }
            }
          } else {
            try {
              await drive.patchFileProperties(resolvedConnectorId, fileInfo.externalId, {
                copyRequiresWriterPermission: true
              })
            } catch (e) {
              console.error('Failed to patch file properties:', e)
            }
          }

          // Always lock Drive download for EC persona too (download only via Firma action menu)
          if (externalCollaborator && !sharePdfOnly) {
            try {
              await drive.patchFileProperties(resolvedConnectorId, fileInfo.externalId, {
                copyRequiresWriterPermission: true
              })
            } catch (e) {
              console.error('Failed to patch EC file properties:', e)
            }
          }
        }
      }
    }

    if (updated) {
      audit(existing ? AUDIT_EVENT.DOCUMENT_SHARE_CHANGED : AUDIT_EVENT.DOCUMENT_SHARE_CREATED)
        .scope(AUDIT_SCOPE.DOCUMENT)
        .firm(fileInfo.organizationId)
        .client(ctx.clientId)
        .engagement(projectId)
        .document(updated.id)
        .actor(user.id)
        .meta({ fileName: updated.fileName })
        .fireAndForget()

      // A8: create date-less reminder for each EC/EV member when sharing is enabled
      const wasEcEnabled = (parseSettingsFromDb((existing?.settings as Record<string, unknown>) || {}))?.share?.externalCollaborator?.enabled
      const wasGuestEnabled = (parseSettingsFromDb((existing?.settings as Record<string, unknown>) || {}))?.share?.guest?.enabled
      const ecJustEnabled = externalCollaborator && !wasEcEnabled
      const guestJustEnabled = guest && !wasGuestEnabled

      if (ecJustEnabled || guestJustEnabled) {
        try {
          const { upsertFollowUpReminder } = await import('@/lib/actions/user-reminders')
          const ecEvRoles: string[] = []
          if (ecJustEnabled) ecEvRoles.push('eng_ext_collaborator')
          if (guestJustEnabled) ecEvRoles.push('eng_viewer')

          const ecEvMembers = await (prisma as any).engagementMember.findMany({
            where: { engagementId: projectId, role: { in: ecEvRoles } },
            select: { userId: true },
          })

          const engDetails = await prisma.engagement.findUnique({
            where: { id: projectId },
            select: { slug: true, client: { select: { slug: true, firm: { select: { slug: true } } } } },
          })
          const firmSlug = engDetails?.client?.firm?.slug ?? ''
          const clientSlug = engDetails?.client?.slug ?? ''
          const engSlug = engDetails?.slug ?? ''

          for (const member of ecEvMembers) {
            upsertFollowUpReminder({
              userId: member.userId,
              entityKey: 'platform.documents',
              entityValue: updated.id,
              action: 'Review shared document',
              dateKey: null,
              dateValue: null,
              entityName: updated.fileName ?? 'Shared document',
              firmId: fileInfo.organizationId,
              ctaUrl: firmSlug && clientSlug && engSlug
                ? `/d/f/${firmSlug}/c/${clientSlug}/e/${engSlug}/files`
                : null,
            }).catch(() => {})
          }
        } catch {
          // Never break sharing if reminder creation fails
        }
      }
    }

    return NextResponse.json({ sharing: toJsonSafeSharing(updated as Record<string, unknown> | null) })
  } catch (e) {
    if (e instanceof SubscriptionRevokedError) return NextResponse.json({ error: e.message }, { status: 403 })
    console.error('PUT sharing error', e)
    return NextResponse.json({ error: 'Failed to save sharing' }, { status: 500 })
  }
}

export async function DELETE(
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
    const canManage = await canManageProject(ctx.firmId, ctx.clientId, ctx.projectId)
    if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await assertFirmSubscriptionAccess(ctx.firmId)

    const fileInfo = await getFileInfo(projectId, documentIdParam)
    if (!fileInfo) return NextResponse.json({ error: 'File not found' }, { status: 404 })

    const existing = await prisma.engagementDocument.findUnique({
      where: {
        engagementId_firmId_externalId: {
          engagementId: projectId,
          firmId: fileInfo.organizationId,
          externalId: fileInfo.externalId,
        },
      },
      include: { sharingUsers: true },
    })

    if (!existing) return NextResponse.json({ success: true })

    await prisma.engagementDocument.update({
      where: { id: existing.id },
      data: {
        settings: buildSettingsForDb((existing.settings as Record<string, unknown>) || null, {
          share: {
            externalCollaborator: { enabled: false },
            guest: { enabled: false, options: {} },
          },
          actorId: user.id,
        }),
      },
    })

    await syncDocumentSharingUsers(existing.id, user.id)

    // Trash the system PDF copy in Drive — it's a Firma-managed artifact with no value once unshared
    const existingSettings = parseSettingsFromDb((existing.settings as Record<string, unknown>) || {})
    const sharedPdfDriveId = existingSettings.share?.guest?.options?.sharedPdfDriveId
    if (sharedPdfDriveId) {
      const connector = existing.connectorId
        ? await prisma.connector.findUnique({ where: { id: existing.connectorId } })
        : await prisma.firm.findUnique({
            where: { id: fileInfo.organizationId },
            include: { connector: true, connectors: true },
          }).then(org => {
            const all = [...(org?.connectors ?? []), ...(org?.connector ? [org.connector] : [])]
            return all.find(c => c.status === 'ACTIVE') ?? null
          })

      if (connector?.status === 'ACTIVE') {
        try {
          const adapter = await getPermissionAdapter(connector.id)
          await adapter?.trashFile(connector.id, sharedPdfDriveId)
        } catch (e) {
          console.error('Failed to trash system PDF file:', e)
        }
      }
    }

    await safeInngestSend('sharing.settings.updated', {
      projectId,
      organizationId: fileInfo.organizationId,
      documentId: fileInfo.externalId,
      sharingId: existing.id,
      disabledPersonas: ['guest', 'externalCollaborator'],
      timestamp: new Date().toISOString(),
      userId: user.id,
    })

    await prisma.engagementDocument.update({
      where: { id: existing.id },
      data: { settings: {}, slug: null, updatedAt: new Date() },
    })

    audit(AUDIT_EVENT.DOCUMENT_SHARE_DELETED)
      .scope(AUDIT_SCOPE.DOCUMENT)
      .firm(fileInfo.organizationId)
      .client(ctx.clientId)
      .engagement(projectId)
      .document(existing.id)
      .actor(user.id)
      .meta({ fileName: existing.fileName })
      .fireAndForget()

    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof SubscriptionRevokedError) return NextResponse.json({ error: e.message }, { status: 403 })
    console.error('DELETE sharing error', e)
    return NextResponse.json({ error: 'Failed to delete sharing' }, { status: 500 })
  }
}
