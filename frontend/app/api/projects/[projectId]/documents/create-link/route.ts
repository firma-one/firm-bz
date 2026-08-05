import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { requireEngagementMember, isExternalEngagementRole, blockIfEngagementFileMutationForbidden } from '@/lib/engagement-access'
import { assignDocId } from '@/lib/doc-id'
import { assertWithinDocumentCap } from '@/lib/billing/effective-billing-caps'
import { buildSettingsForDb } from '@/lib/sharing-settings'

const LINK_MIME_TYPE = 'application/vnd.pockett.link'

/** Normalizes a user-provided URL string, auto-prepending https:// when no scheme is given. Only http/https allowed. */
function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

/**
 * POST /api/projects/[projectId]/documents/create-link
 * Creates a connector-agnostic "link" EngagementDocument — no connector item is created, no
 * Inngest indexing is triggered. Mirrors the EC/EV PENDING intake-queue behavior used for
 * file/folder creation so links created by External Collaborators/Viewers surface for EL review.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params

    let body: Record<string, unknown> = {}
    try {
      const text = await request.text()
      body = text ? JSON.parse(text) : {}
    } catch {
      return NextResponse.json({ error: 'Invalid or empty JSON body' }, { status: 400 })
    }
    const { folderId, name, url } = body as { folderId?: string; name?: string; url?: string }

    if (typeof folderId !== 'string' || !folderId) {
      return NextResponse.json({ error: 'Missing folderId' }, { status: 400 })
    }
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 })
    }
    const normalizedUrl = typeof url === 'string' ? normalizeUrl(url) : null
    if (!normalizedUrl) {
      return NextResponse.json({ error: 'Missing or invalid URL' }, { status: 400 })
    }

    const member = await requireEngagementMember(projectId, user.id)
    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const mutationDenied = await blockIfEngagementFileMutationForbidden(user.id, projectId)
    if (mutationDenied) return mutationDenied

    const engagement = await prisma.engagement.findFirst({
      where: { id: projectId, isDeleted: false },
      select: { id: true, name: true, clientId: true, client: { select: { firmId: true } } },
    })
    if (!engagement) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const orgId = engagement.client.firmId

    await assertWithinDocumentCap(orgId, 1)

    const isExternal = isExternalEngagementRole(member.role)
    const shareKey = member.role === 'eng_ext_collaborator' ? 'externalCollaborator' : 'guest'
    const pendingSettings = isExternal
      ? buildSettingsForDb(null, { share: { [shareKey]: { enabled: true } }, actorId: user.id })
      : undefined

    const doc = await prisma.engagementDocument.create({
      data: {
        engagementId: projectId,
        firmId: orgId,
        clientId: engagement.clientId,
        externalId: `link_${crypto.randomUUID()}`,
        connectorId: null,
        parentId: folderId,
        fileName: name.trim(),
        isFolder: false,
        mimeType: LINK_MIME_TYPE,
        documentType: 'LINK',
        externalUrl: normalizedUrl,
        status: 'PROCESSED',
        createdBy: user.id,
        updatedBy: user.id,
        ...(pendingSettings ? { settings: pendingSettings as object } : {}),
        metadata: { modifiedTime: new Date().toISOString() },
      },
    })
    Promise.resolve().then(() => assignDocId(doc.id, projectId, engagement.name).catch(() => {}))

    if (isExternal) {
      const existingPendingRow = await (prisma.engagementDocumentSharingUser as any).findFirst({
        where: { engagementId: projectId, userId: user.id, sharingPermissionStatus: 'PENDING' },
        select: { id: true },
      })

      if (!existingPendingRow) {
        await (prisma.engagementDocumentSharingUser as any).upsert({
          where: { projectDocumentId_userId: { projectDocumentId: doc.id, userId: user.id } },
          create: {
            projectDocumentId: doc.id,
            engagementId: projectId,
            userId: user.id,
            sharingPermissionStatus: 'PENDING',
          },
          update: { sharingPermissionStatus: 'PENDING' },
        })

        const reminderId = `intake-${projectId}-${doc.externalId}`
        const leads = await prisma.engagementMember.findMany({
          where: { engagementId: projectId, role: { in: ['eng_admin', 'eng_member'] } },
          select: { userId: true },
        })
        const reminderItem = {
          id: reminderId,
          entityKey: 'platform.engagements.shares',
          entityValue: projectId,
          action: `Review link: "${doc.fileName}"`,
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
    }

    return NextResponse.json({
      document: {
        id: doc.id,
        externalId: doc.externalId,
        fileName: doc.fileName,
        externalUrl: doc.externalUrl,
        documentType: doc.documentType,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('Your plan allows')) {
      return NextResponse.json({ error: error.message }, { status: 402 })
    }
    console.error('create-link API error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
