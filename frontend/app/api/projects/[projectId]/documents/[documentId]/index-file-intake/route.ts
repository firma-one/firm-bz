import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { requireEngagementMember, isExternalEngagementRole } from '@/lib/engagement-access'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { safeInngestSend } from '@/lib/inngest/client'
import { assertWithinDocumentCap } from '@/lib/billing/effective-billing-caps'

/**
 * POST /api/projects/[projectId]/documents/[documentId]/index-file-intake
 * Called after EC/EV completes an upload. Sets settings.lock = { type: 'intake', ... }
 * Creates the EngagementDocument record if Inngest hasn't indexed it yet (race condition).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId: externalId } = await params

    const member = await requireEngagementMember(projectId, user.id)
    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!isExternalEngagementRole(member.role)) {
      return NextResponse.json({ error: 'Only EC/EV members can submit files for intake' }, { status: 403 })
    }

    // Load project with connector so we can upsert the record if Inngest hasn't run yet
    const project = await prisma.engagement.findFirst({
      where: { id: projectId, isDeleted: false },
      include: {
        client: {
          include: { connector: true },
        },
      },
    })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const connector = project.client.connector
    if (!connector) return NextResponse.json({ error: 'No active connector' }, { status: 500 })

    const now = new Date().toISOString()
    const intakeLock = { type: 'intake', uploadedBy: user.id, uploadedAt: now }

    // Gate before any DB writes — ensures cap is checked before record creation
    await assertWithinDocumentCap(project.client.firmId, 1)

    // Try to find an existing record first (happy path — Inngest already indexed it)
    const existing = await prisma.engagementDocument.findFirst({
      where: { engagementId: projectId, externalId },
      select: { id: true, settings: true, fileName: true, firmId: true },
    })

    let docId: string
    let fileName: string

    if (existing) {
      const prevSettings = (existing.settings as Record<string, unknown>) || {}
      await prisma.engagementDocument.update({
        where: { id: existing.id },
        data: {
          settings: { ...prevSettings, lock: intakeLock } as object,
          updatedAt: new Date(),
        },
      })
      docId = existing.id
      fileName = existing.fileName
    } else {
      // Record doesn't exist yet — fetch Drive metadata and create it now.
      const driveMeta = await googleDriveConnector.getFileMetadata(connector.id, externalId)
      if (!driveMeta) return NextResponse.json({ error: 'File not found in Drive' }, { status: 404 })

      const folderIds = await googleDriveConnector.getProjectFolderIds(connector.id, project.slug, {
        projectName: project.name,
        clientSlug: project.client.slug,
        clientName: project.client.name,
        projectFolderId: project.connectorRootFolderId ?? undefined,
      })

      fileName = driveMeta.name ?? externalId
      const created = await prisma.engagementDocument.create({
        data: {
          engagementId: projectId,
          firmId: project.client.firmId,
          clientId: project.clientId,
          externalId,
          connectorId: connector.id,
          parentId: (driveMeta as any).parents?.[0] ?? folderIds.generalFolderId ?? null,
          fileName,
          mimeType: driveMeta.mimeType ?? null,
          fileSize: driveMeta.size ? BigInt(driveMeta.size) : null,
          isFolder: false,
          settings: { lock: intakeLock } as object,
          metadata: {
            modifiedTime: (driveMeta as any).modifiedTime ?? new Date().toISOString(),
            webViewLink: (driveMeta as any).webViewLink ?? null,
          } as object,
        },
      })
      docId = created.id
    }

    await safeInngestSend('file.index.requested', {
      projectId,
      externalId,
      organizationId: project.client.firmId,
      fileName,
      uploadedBy: user.id,
      isIntakeUpload: true,
    })

    // Create intake reminders synchronously for all ELs
    const reminderId = `intake-${projectId}-${externalId}`
    const leads = await prisma.engagementMember.findMany({
      where: { engagementId: projectId, role: { in: ['eng_admin', 'eng_member'] } },
      select: { userId: true },
    })
    const reminderItem = {
      id: reminderId,
      entityKey: 'platform.engagements',
      entityValue: projectId,
      action: `Review: "${fileName}"`,
      dateKey: null,
      dateValue: null,
      hiddenAt: null,
      createdAt: new Date().toISOString(),
    }
    await Promise.all(leads.map(async (lead) => {
      const p = await prisma.userPersonalization.findUnique({
        where: { userId: lead.userId },
        select: { reminders: true },
      })
      const existing: any[] = Array.isArray(p?.reminders) ? p!.reminders as any[] : []
      if (existing.find((r: any) => r.id === reminderId)) return
      await prisma.userPersonalization.upsert({
        where: { userId: lead.userId },
        create: { userId: lead.userId, reminders: [reminderItem] as any },
        update: { reminders: [...existing, reminderItem] as any },
      })
    }))

    return NextResponse.json({ ok: true, documentId: docId })
  } catch (e) {
    console.error('index-file-intake error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
