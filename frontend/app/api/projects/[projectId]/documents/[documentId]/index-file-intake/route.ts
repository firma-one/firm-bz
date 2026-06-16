import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { requireEngagementMember, isExternalEngagementRole } from '@/lib/engagement-access'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { assertWithinDocumentCap } from '@/lib/billing/effective-billing-caps'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'

/**
 * POST /api/projects/[projectId]/documents/[documentId]/index-file-intake
 * Called after EC/EV completes an upload. Creates an EngagementDocument record and writes a
 * PENDING sharing row so the file appears in the EL's intake queue on the Shares tab.
 * Does NOT fire Inngest — indexing happens only after EL approves.
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

    // Load project so we can upsert the record if Inngest hasn't run yet
    const project = await prisma.engagement.findFirst({
      where: { id: projectId, isDeleted: false },
      include: { client: { select: { firmId: true, slug: true, name: true } } },
    })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const connectorId = await resolveEngagementConnectorId(projectId)
    if (!connectorId) return NextResponse.json({ error: 'No active connector' }, { status: 500 })
    const connector = await prisma.connector.findUnique({ where: { id: connectorId } })
    if (!connector) return NextResponse.json({ error: 'No active connector' }, { status: 500 })

    // Gate before any DB writes — ensures cap is checked before record creation
    await assertWithinDocumentCap(project.client.firmId, 1)

    // Try to find an existing record first (happy path — Inngest already indexed it)
    const existing = await prisma.engagementDocument.findFirst({
      where: { engagementId: projectId, externalId },
      select: { id: true, fileName: true },
    })

    let docId: string
    let fileName: string

    if (existing) {
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
          settings: {} as object,
          metadata: {
            modifiedTime: (driveMeta as any).modifiedTime ?? new Date().toISOString(),
            webViewLink: (driveMeta as any).webViewLink ?? null,
          } as object,
        },
      })
      docId = created.id
    }

    // Only write a PENDING row + reminder if this user has no existing PENDING item in this
    // engagement. Files uploaded inside a pending folder are covered by the folder's PENDING row.
    const existingPendingRow = await (prisma.engagementDocumentSharingUser as any).findFirst({
      where: {
        engagementId: projectId,
        userId: user.id,
        sharingPermissionStatus: 'PENDING',
      },
      select: { id: true },
    })

    if (!existingPendingRow) {
      await (prisma.engagementDocumentSharingUser as any).upsert({
        where: { projectDocumentId_userId: { projectDocumentId: docId, userId: user.id } },
        create: {
          projectDocumentId: docId,
          engagementId: projectId,
          userId: user.id,
          email: user.email ?? '',
          sharingPermissionStatus: 'PENDING',
        },
        update: { sharingPermissionStatus: 'PENDING' },
      })
    }

    if (!existingPendingRow) {
      const reminderId = `intake-${projectId}-${externalId}`
      const leads = await prisma.engagementMember.findMany({
        where: { engagementId: projectId, role: { in: ['eng_admin', 'eng_member'] } },
        select: { userId: true },
      })
      const reminderItem = {
        id: reminderId,
        entityKey: 'platform.engagements.shares',
        entityValue: projectId,
        action: `Review: "${fileName}"`,
        dateKey: 'date',
        dateValue: new Date().toISOString().slice(0, 10),
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
    }

    return NextResponse.json({ ok: true, documentId: docId })
  } catch (e) {
    console.error('index-file-intake error', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
