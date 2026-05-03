import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { buildSettingsForDb, parseSettingsFromDb, type ShareBlock } from '@/lib/sharing-settings'
import { generateShareSlug } from '@/lib/slug-utils'
import { syncDocumentSharingUsers } from '@/lib/sync-document-sharing'
import { getFileInfo } from '@/lib/file-utils'
import { safeInngestSend } from '@/lib/inngest/client'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canManageProject } from '@/lib/permission-helpers'
import { GoogleDriveConnector } from '@/lib/google-drive-connector'

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
  title: string
): Promise<{ organizationId: string, externalId: string }> {
  const project = await prisma.engagement.findFirst({
    where: { id: projectId, isDeleted: false },
    select: { firmId: true, clientId: true },
  })
  if (!project) throw new Error('Project not found')

  const { firmId, clientId } = project

  await (prisma as any).$executeRawUnsafe(
    `INSERT INTO platform.engagement_documents
       ("firmId", "clientId", "engagementId", "externalId", "fileName", "updatedAt")
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, NOW())
     ON CONFLICT ("engagementId", "firmId", "externalId") DO NOTHING`,
    firmId,
    clientId || null,
    projectId,
    externalId,
    title || externalId
  )

  const { SearchService } = await import('@/lib/services/search-service')
  Promise.resolve().then(() =>
    SearchService.indexFile({
      organizationId: firmId,
      clientId: clientId || undefined,
      projectId,
      externalId,
      fileName: title || externalId,
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
    const canManage = await canManageProject(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const title = typeof body.title === 'string' ? body.title : ''

    let fileInfo: { organizationId: string; externalId: string } | null = null

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentIdParam)) {
      // UUID = must already exist in the search index (no implicit creation)
      fileInfo = await getFileInfo(projectId, documentIdParam)
      if (!fileInfo) return NextResponse.json({ error: 'File not found in this project' }, { status: 404 })
    } else {
      // Drive file ID — ensure document row exists, then update its sharing fields.
      try {
        fileInfo = await ensureDocument(projectId, documentIdParam, title)
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
        await prisma.engagementDocument.update({
          where: { id: existing.id },
          data: { settings: {}, slug: null, updatedAt: new Date() },
        })
      }
      return NextResponse.json({ sharing: null })
    }

    const now = new Date().toISOString()
    const existingSettings = (existing?.settings as Record<string, unknown>) || null
    const shareUpdate: Partial<ShareBlock> = {
      guest: { enabled: guest, options: guestOptions },
      externalCollaborator: { enabled: externalCollaborator },
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
    })

    if (existing) {
      const updateData: { settings: typeof settings; updatedAt: Date; updatedBy: string; slug?: string } = { settings, updatedAt: new Date(), updatedBy: user.id }
      if (existing.slug == null) {
        const docTitle = existing.fileName || title || documentIdParam
        updateData.slug = generateShareSlug(docTitle, existing.id.slice(0, 8))
      }
      await prisma.engagementDocument.update({
        where: { id: existing.id },
        data: updateData,
      })
    } else {
      let slug = generateShareSlug(title || documentIdParam, Math.random().toString(36).slice(2, 10))
      for (let attempts = 0; attempts < 5; attempts++) {
        const taken = await prisma.engagementDocument.findFirst({
          where: { engagementId: projectId, slug },
          select: { id: true },
        })
        if (!taken) break
        slug = generateShareSlug(title || documentIdParam, Math.random().toString(36).slice(2, 10))
      }
      const proj = await prisma.engagement.findUnique({ where: { id: projectId }, select: { clientId: true } })
      await prisma.engagementDocument.create({
        data: {
          engagementId: projectId,
          firmId: fileInfo.organizationId,
          clientId: proj?.clientId ?? null,
          externalId: fileInfo.externalId,
          fileName: title || fileInfo.externalId,
          createdBy: user.id,
          settings,
          slug,
        },
      })
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
      Promise.resolve().then(() => syncDocumentSharingUsers(updated.id))

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

      // Enforce allowDownload and sharePdfOnly settings on Drive files
      if (guest) {
        const connectorId = updated.connectorId
        if (!connectorId) {
          const org = await prisma.firm.findUnique({
            where: { id: fileInfo.organizationId },
            include: { connector: true },
          })
          const activeConnector = org?.connector
          if (activeConnector?.type === 'GOOGLE_DRIVE' && activeConnector?.status === 'ACTIVE') {
            const drive = GoogleDriveConnector.getInstance()
            const allowDownload = guestOptions.allowDownload ?? false
            const sharePdfOnly = guestOptions.sharePdfOnly ?? false

            // If sharePdfOnly and sharedPdfDriveId exists: enforce on PDF file
            if (sharePdfOnly) {
              const sharedPdfDriveId = guestOptions.sharedPdfDriveId
              if (sharedPdfDriveId) {
                try {
                  await drive.patchFileProperties(activeConnector.id, sharedPdfDriveId, {
                    copyRequiresWriterPermission: !allowDownload
                  })
                } catch (e) {
                  console.error('Failed to patch PDF file properties:', e)
                }
              }
            } else {
              // If not sharePdfOnly: enforce on original file
              try {
                await drive.patchFileProperties(activeConnector.id, fileInfo.externalId, {
                  copyRequiresWriterPermission: !allowDownload
                })
              } catch (e) {
                console.error('Failed to patch file properties:', e)
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ sharing: toJsonSafeSharing(updated as Record<string, unknown> | null) })
  } catch (e) {
    console.error('PUT sharing error', e)
    return NextResponse.json({ error: 'Failed to save sharing' }, { status: 500 })
  }
}

export async function DELETE(
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
    const canManage = await canManageProject(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
        }),
      },
    })

    await syncDocumentSharingUsers(existing.id)

    // Clean up PDF file if sharePdfOnly was enabled
    const existingSettings = parseSettingsFromDb((existing.settings as Record<string, unknown>) || {})
    const sharedPdfDriveId = existingSettings.share?.guest?.options?.sharedPdfDriveId
    if (sharedPdfDriveId) {
      const connector = existing.connectorId
        ? await prisma.connector.findUnique({ where: { id: existing.connectorId } })
        : await prisma.firm.findUnique({
            where: { id: fileInfo.organizationId },
            include: { connector: true },
          }).then(org => org?.connector || null)

      if (connector?.type === 'GOOGLE_DRIVE' && connector?.status === 'ACTIVE') {
        try {
          const drive = GoogleDriveConnector.getInstance()
          // Delete all permissions from the PDF file (which will revoke access)
          const permissions = await drive.listFilePermissions(connector.id, sharedPdfDriveId)
          for (const perm of permissions.filter((p: any) => p.role !== 'owner')) {
            await drive.revokePermission(connector.id, sharedPdfDriveId, perm.id)
          }
        } catch (e) {
          console.error('Failed to clean up PDF file permissions:', e)
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

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('DELETE sharing error', e)
    return NextResponse.json({ error: 'Failed to delete sharing' }, { status: 500 })
  }
}
