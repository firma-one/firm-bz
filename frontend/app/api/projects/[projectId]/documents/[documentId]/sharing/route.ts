import { NextRequest, NextResponse } from 'next/server'
import { blockIfEngagementCompleted } from '@/lib/engagement-access'
import { withoutAgentIds } from '@/lib/ai/agent-email'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { assetSettingsOf, buildSettingsForDb, parseSettingsFromDb, type ShareBlock } from '@/lib/sharing-settings'
import { syncDocumentSharingUsers } from '@/lib/sync-document-sharing'
import { getFileInfo } from '@/lib/file-utils'
import { safeInngestSend } from '@/lib/inngest/client'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canManageProject, canViewProject, getProjectPersona } from '@/lib/permission-helpers'
import { withoutFirmOnlySettings } from '@/lib/files/blocked'
import { deliverableOf } from '@/lib/files/deliverable-of'
import { writeNativeDescription } from '@/lib/files/native-description'
import { SearchService } from '@/lib/services/search-service'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { StorageFailure } from '@/lib/connectors/storage-failure'
import { takeBackClientAccess } from '@/lib/files/take-back-client-access'
import { logger } from '@/lib/logger'
import { getPermissionAdapter, getContentAdapter } from '@/lib/connectors/registry'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { assertFirmSubscriptionAccess } from '@/lib/billing/subscription-gate'
import { assertWithinDeliverableCap, assertWithinDocumentCap } from '@/lib/billing/effective-billing-caps'
import { SubscriptionRevokedError } from '@/lib/errors/api-error'
import { assignDocId } from '@/lib/doc-id'
import { DocumentSharingPermissionStatus, EngagementRole } from '@prisma/client'
import { engagementPath } from '@/lib/navigation/firm-paths'

/** ProjectDocument can contain BigInt (fileSize); JSON.stringify cannot serialize it. */
function toJsonSafeSharing(doc: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!doc) return null
  // connectorId never leaves the server: no caller uses it, and it names the firm's storage.
  const { fileSize, connectorId: _connectorId, ...rest } = doc
  return {
    ...rest,
    fileSize: fileSize != null ? String(fileSize) : null,
  } as Record<string, unknown>
}

/**
 * Trashes Firma's own PDF copy of a document, which has no use once Reviewers no longer get it, through
 * the connector the document is on. A failure is logged (P2-18): it leaves a Firma-made file in storage,
 * which nobody has to act on now, so the change it follows still stands.
 */
async function trashSystemPdf(projectId: string, documentConnectorId: string | null, pdfId: string): Promise<void> {
  const connectorId = await resolveEngagementConnectorId(projectId, documentConnectorId)
  if (!connectorId) {
    logger.warn('[sharing] no connector to trash the system PDF copy', { projectId, pdfId })
    return
  }
  try {
    const adapter = await getPermissionAdapter(connectorId)
    await adapter?.trashFile(connectorId, pdfId)
  } catch (e) {
    logger.error('[sharing] could not trash the system PDF copy', e instanceof Error ? e : new Error(String(e)), undefined, { projectId, pdfId, connectorId })
  }
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
    // This only checked sign-in, so anyone could read any engagement's document settings.
    // Firm and client come from the engagement row, never from the caller.
    const ctx = await resolveProjectContext(projectId)
    if (!ctx || !(await canViewProject(ctx.firmId, ctx.clientId, projectId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
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
    // A client isn't sent what is the firm's own (a document's Blocked flag).
    const persona = await getProjectPersona(ctx.firmId, ctx.clientId, projectId)
    const forClient = persona === 'eng_ext_collaborator' || persona === 'eng_viewer'
    const visible = doc && forClient ? { ...doc, settings: withoutFirmOnlySettings(doc.settings) } : doc
    return NextResponse.json({ sharing: toJsonSafeSharing(visible as Record<string, unknown> | null) })
  } catch (e) {
    console.error('GET sharing error', e)
    return NextResponse.json({ error: 'Failed to load sharing' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  /** What this request was doing, for the words a failure answers with. */
  let failing = 'save sharing'
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId: documentIdParam } = await params
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const canManage = await canManageProject(ctx.firmId, ctx.clientId, ctx.projectId)
    if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const completed = await blockIfEngagementCompleted(projectId)
    if (completed) return completed

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
      // After the save, not before it answers: its vector, so search by meaning finds it by what it's
      // for, and the storage's own description field where there is one (lib/files/native-description.ts).
      const description = body.description as string
      Promise.resolve().then(async () => {
        await SearchService.refreshEmbedding(doc.id).catch((e) => console.error('[description] vector refresh failed', e))
        const connectorId = await resolveEngagementConnectorId(projectId, doc.connectorId)
        if (connectorId) await writeNativeDescription(connectorId, doc.externalId, description)
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
      failing = 'promote this folder'
      // Deliverables don't nest: a folder inside one, or one holding one, can't become one. The
      // menu says so too; a folder made a moment ago may not be known to it yet.
      const insideOf = await deliverableOf(projectId, doc.parentId)
      if (insideOf) {
        return NextResponse.json({ error: `It's inside ${insideOf.docId ? `${insideOf.docId} · ` : ''}${insideOf.name}, which is a deliverable already.` }, { status: 409 })
      }
      const nestedDeliverable = (await (prisma as any).$queryRawUnsafe(
        `WITH RECURSIVE descendants AS (
           SELECT id, "externalId", "isFolder", settings, 1 AS depth FROM platform.engagement_documents
           WHERE "parentId" = $1 AND "engagementId" = $2::uuid
           UNION ALL
           SELECT ed.id, ed."externalId", ed."isFolder", ed.settings, d.depth + 1 FROM platform.engagement_documents ed
           INNER JOIN descendants d ON ed."parentId" = d."externalId"
           WHERE ed."engagementId" = $2::uuid AND d.depth < 50
         )
         SELECT id FROM descendants WHERE "isFolder" = true AND settings->'share'->>'createdAt' IS NOT NULL LIMIT 1`,
        doc.externalId,
        projectId,
      )) as Array<{ id: string }>
      if (nestedDeliverable.length > 0) {
        return NextResponse.json({ error: 'A folder inside it is a deliverable already.' }, { status: 409 })
      }

      const engagement = await prisma.engagement.findUnique({
        where: { id: projectId },
        select: { name: true, firmId: true },
      })
      if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })

      await assertWithinDeliverableCap(engagement.firmId)

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
      const dueDate = typeof body.dueDate === 'string' && body.dueDate ? new Date(body.dueDate) : null

      // The rows come first and the settings last (P1-59): the settings are what put it on the Board,
      // so a failure partway leaves a folder with a few rows for the firm's own members, which grant
      // nothing new and are written again on a retry, not a deliverable only some of them can reach.

      // Insert GRANTED rows for EL (eng_admin) and EM (eng_member) on the folder.
      //
      // Agents excluded: these rows exist to record who a document is shared WITH, and Brio
      // reaches files through the firm-level grant rather than per-document sharing. Including it
      // would write a row for every deliverable and every descendant — unbounded growth for an
      // entry that grants nothing, since connectorPermissionId stays null and the revocation
      // paths filter those out anyway.
      const internalMembersRaw = await prisma.engagementMember.findMany({
        where: {
          engagementId: projectId,
          role: { in: [EngagementRole.eng_admin, EngagementRole.eng_member] },
        },
      })
      const humanIds = new Set(await withoutAgentIds(internalMembersRaw.map((m) => m.userId)))
      const internalMembers = internalMembersRaw.filter((m) => humanIds.has(m.userId))
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

      await prisma.engagementDocument.update({
        where: { id: doc.id },
        data: { settings, dueDate, updatedAt: new Date(), updatedBy: user.id },
      })

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
      if (!doc.isFolder) return NextResponse.json({ error: 'Only a folder can be demoted from a deliverable' }, { status: 400 })
      failing = 'demote this deliverable'

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
      const descendantIds = allDescendants.map((c: { id: string }) => c.id)

      // Decision 5 (AC-8): what clients were granted inside it is taken back first, in storage, before
      // any row holding a permission id goes. A row whose permission storage wouldn't give up stays
      // (revoked in Firma, its id kept) so a later revoke can retry it.
      const takenBack = await takeBackClientAccess(projectId, { projectDocumentId: { in: [doc.id, ...descendantIds] } })

      // The folder's own rows, and the rows its documents inherited from it
      await prisma.engagementDocumentSharingUser.deleteMany({
        where: { projectDocumentId: doc.id, id: { notIn: takenBack.kept } },
      })
      if (descendantIds.length > 0) {
        await prisma.engagementDocumentSharingUser.deleteMany({
          where: {
            projectDocumentId: { in: descendantIds },
            sharingPermissionStatus: DocumentSharingPermissionStatus.INHERITED,
            id: { notIn: takenBack.kept },
          },
        })
      }

      // Last (P1-59): the settings are what put it on the Board, so a failure above leaves a
      // deliverable to demote again. The document's own description and assignee are kept.
      await prisma.engagementDocument.update({
        where: { id: doc.id },
        data: { settings: assetSettingsOf(doc.settings) as object, updatedAt: new Date(), updatedBy: user.id },
      })

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
        .meta({ fileName: doc.fileName, action: 'untagAsDeliverable', ...(takenBack.peopleStillHolding ? { stillHoldingAccess: takenBack.peopleStillHolding } : {}) })
        .fireAndForget()

      const updated = await prisma.engagementDocument.findUnique({ where: { id: doc.id } })
      return NextResponse.json({
        sharing: toJsonSafeSharing(updated as Record<string, unknown> | null),
        ...(takenBack.stillHolding ? { warning: `Demoted, but ${takenBack.stillHolding}` } : {}),
      })
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
        // A plain sentence (P2-19): this used to answer the raw database message, labeled 404.
        console.error('ensureDocument error', err)
        if (err instanceof Error && err.message === 'Project not found') {
          return NextResponse.json({ error: 'This engagement no longer exists.' }, { status: 404 })
        }
        return NextResponse.json({ error: "Couldn't set up sharing for this file. Try again." }, { status: 500 })
      }
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

    // A key left out means "unchanged" (AC-11). The deliverable pane's Delivery settings send only the
    // options, and reading a missing `guest` as off took the deliverable away from its Reviewers (and a
    // missing `externalCollaborator` as on opened it to Limited Access contributors). The options sent
    // are merged over the stored ones, so one toggle changes only its own option.
    const stored = parseSettingsFromDb((existing?.settings as Record<string, unknown>) || {}).share
    const given = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined)
    const askedEc = given(body.externalCollaborator)
    const askedGuest = given(body.guest)
    const externalCollaborator = askedEc ?? stored?.externalCollaborator?.enabled ?? false
    const guest = askedGuest ?? stored?.guest?.enabled ?? false
    const storedGuestOptions = stored?.guest?.options ?? {}
    const ecOptions = {
      allowDownload: given(body.ecOptions?.allowDownload) ?? stored?.externalCollaborator?.options?.allowDownload ?? false,
    }
    const guestOptions = {
      sharePdfOnly: given(body.guestOptions?.sharePdfOnly) ?? storedGuestOptions.sharePdfOnly ?? false,
      allowDownload: given(body.guestOptions?.allowDownload) ?? storedGuestOptions.allowDownload ?? false,
      addWatermark: given(body.guestOptions?.addWatermark) ?? storedGuestOptions.addWatermark ?? false,
      publish: given(body.guestOptions?.publish) ?? storedGuestOptions.publish ?? false,
      // Firma's own PDF copy is Firma's to set (regrant makes it), never the browser's: a save
      // without it used to clear it, and a made-up id would have been trashed or restricted.
      sharedPdfDriveId: storedGuestOptions.sharedPdfDriveId ?? null,
    }

    // Both roles off, when asked for: the document is no longer shared. Options alone never get here.
    if (!externalCollaborator && !guest && (askedEc === false || askedGuest === false)) {
      if (existing) {
        const oldSettings = parseSettingsFromDb((existing.settings as Record<string, unknown>) || {})
        const disabledPersonas: Array<'guest' | 'externalCollaborator'> = []
        if (oldSettings?.share?.guest?.enabled) disabledPersonas.push('guest')
        if (oldSettings?.share?.externalCollaborator?.enabled) disabledPersonas.push('externalCollaborator')

        // Trash the system PDF copy if guest sharing was active
        const sharedPdfDriveId = oldSettings?.share?.guest?.options?.sharedPdfDriveId
        if (sharedPdfDriveId) await trashSystemPdf(projectId, existing.connectorId, sharedPdfDriveId)

        await prisma.engagementDocument.update({
          where: { id: existing.id },
          data: { settings: assetSettingsOf(existing.settings) as object, slug: null, updatedAt: new Date() },
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
      // Creating a document, not just sharing an existing one. The deliverable cap checked earlier
      // guards a different branch (marking a folder as a deliverable), so without this the free
      // tier's 10-document limit is bypassed on this path.
      await assertWithinDocumentCap(fileInfo.organizationId, 1)

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

    let settingsWarning: string | null = null
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
        if (pdfDriveId) await trashSystemPdf(projectId, updated.connectorId, pdfDriveId)
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

      // Enforce allowDownload on storage files whenever guest sharing is active. Uses
      // setCopyRestricted (IConnectorContentAdapter) so this works for any connector type —
      // it's a documented no-op for providers without an equivalent concept (currently OneDrive;
      // see onedrive-content-adapter.ts).
      // The connector it was shared on (the document's, else its client's), not the legacy firm one.
      if (guest) {
        const connectorId = await resolveEngagementConnectorId(projectId, updated.connectorId)
        const contentAdapter = connectorId ? await getContentAdapter(connectorId) : null
        // Always block native download — Firma controls download via its own action menu: on the PDF
        // copy when Reviewers get only that, else on the file itself (which Limited Access
        // contributors open too).
        const restrictId = guestOptions.sharePdfOnly ? guestOptions.sharedPdfDriveId : fileInfo.externalId
        if (connectorId && contentAdapter && restrictId) {
          try {
            await contentAdapter.setCopyRestricted(connectorId, restrictId, true)
          } catch (e) {
            // Each secure open sets it again, and refuses the open when it can't (regrant), so this
            // is saved, with a word that storage didn't take it yet.
            console.error('Failed to set copy-restriction:', e)
            settingsWarning = `Saved, but storage didn't block downloading of this file yet · ${e instanceof StorageFailure ? e.message : 'It is blocked again the next time a client opens it.'}`
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
          const { upsertFollowUpReminder } = await import('@/lib/reminders/reminder-service')
          const ecEvRoles: string[] = []
          if (ecJustEnabled) ecEvRoles.push('eng_ext_collaborator')
          if (guestJustEnabled) ecEvRoles.push('eng_viewer')

          const ecEvMembers = await (prisma as any).engagementMember.findMany({
            where: { engagementId: projectId, role: { in: ecEvRoles } },
            select: { userId: true },
          })

          const engDetails = await prisma.engagement.findUnique({
            where: { id: projectId },
            select: { slug: true, client: { select: { slug: true, firm: { select: { slug: true, group: { select: { slug: true } } } } } } },
          })
          const groupSlug = engDetails?.client?.firm?.group?.slug ?? ''
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
              ctaUrl: groupSlug && firmSlug && clientSlug && engSlug
                ? engagementPath(groupSlug, firmSlug, clientSlug, engSlug, { tab: 'files' })
                : null,
            }).catch(() => {})
          }
        } catch {
          // Never break sharing if reminder creation fails
        }
      }
    }

    return NextResponse.json({
      sharing: toJsonSafeSharing(updated as Record<string, unknown> | null),
      ...(settingsWarning ? { warning: settingsWarning } : {}),
    })
  } catch (e) {
    if (e instanceof SubscriptionRevokedError) return NextResponse.json({ error: e.message }, { status: 403 })
    if (e instanceof Error && e.message.startsWith('Your plan allows')) {
      return NextResponse.json({ error: e.message }, { status: 402 })
    }
    if (e instanceof StorageFailure) return NextResponse.json({ error: e.message, code: e.reason }, { status: e.status })
    console.error('PUT sharing error', e)
    return NextResponse.json({ error: `Couldn't ${failing}. Something went wrong on our side. Try again.` }, { status: 500 })
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

    const completed = await blockIfEngagementCompleted(projectId)
    if (completed) return completed

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
    if (sharedPdfDriveId) await trashSystemPdf(projectId, existing.connectorId, sharedPdfDriveId)

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
      data: { settings: assetSettingsOf(existing.settings) as object, slug: null, updatedAt: new Date() },
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
