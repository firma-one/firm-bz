import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProjectSettings, canViewProject } from '@/lib/permission-helpers'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendEmail } from '@/lib/email'
import { safeInngestSend } from '@/lib/inngest/client'
import { parseSettingsFromDb } from '@/lib/sharing-settings'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId } = await params
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const canView = await canViewProject(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canView) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const canManage = await canViewProjectSettings(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canManage) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const dueDateRaw = body?.dueDate as string | null | undefined
    const dueDate = dueDateRaw ? new Date(dueDateRaw) : null

    const doc = await prisma.engagementDocument.findFirst({
      where: { id: documentId, engagementId: projectId },
      select: { id: true, fileName: true, dueDate: true, isFolder: true, settings: true, firmId: true, clientId: true, engagementId: true },
    })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.engagementDocument.update({
      where: { id: doc.id },
      data: { dueDate },
    })

    const isDeliverableFolder = doc.isFolder && (() => {
      try { return !!(parseSettingsFromDb(doc.settings as any).share?.createdAt) } catch { return false }
    })()

    const members = await prisma.engagementMember.findMany({
      where: { engagementId: projectId },
      select: { userId: true },
    })
    const memberUserIds = members.map((m) => m.userId)

    // Always cancel any existing scheduled reminder for this document
    await safeInngestSend('deliverable.due_date.cancelled', { documentId })

    if (dueDate) {
      // In-app notifications for all members
      const rows = memberUserIds.map((userId) => ({
        firmId: doc.firmId,
        clientId: doc.clientId ?? ctx.clientId,
        engagementId: projectId,
        documentId: doc.id,
        userId,
        type: 'DOCUMENT_DUE_DATE_SET',
        title: 'Document due date updated',
        body: `${doc.fileName} due on ${dueDate.toISOString().slice(0, 10)}`,
        ctaUrl: null,
        metadata: { dueDate: dueDate.toISOString() },
        channels: { inApp: true, email: false },
        dedupeKey: `doc:${doc.id}:due:${dueDate.toISOString().slice(0, 10)}`,
      }))
      if (rows.length) {
        await (prisma as any).notification.createMany({ data: rows, skipDuplicates: true })
      }

      if (isDeliverableFolder) {
        // Schedule 24h + 1h reminders via Inngest for deliverable folders
        await safeInngestSend('deliverable.due_date.set', {
          documentId: doc.id,
          documentName: doc.fileName,
          dueDate: dueDate.toISOString(),
          memberUserIds,
          // boardUrl is resolved client-side and deep-linked via the notification CTA; leave null here
          boardUrl: null,
        })
      } else {
        // Non-deliverable: immediate email if within 24h (existing behaviour)
        const hours = (dueDate.getTime() - Date.now()) / (1000 * 60 * 60)
        if (hours <= 24) {
          const admin = createAdminClient()
          await Promise.all(memberUserIds.map(async (userId) => {
            try {
              const { data } = await admin.auth.admin.getUserById(userId)
              const email = data?.user?.email
              if (!email) return
              await sendEmail(
                email,
                'Document due soon',
                `<p><strong>Document due soon</strong></p><p><strong>${doc.fileName}</strong> is due on <strong>${dueDate.toISOString().slice(0, 10)}</strong>.</p>`
              )
            } catch { /* ignore */ }
          }))
        }
      }
    }

    return NextResponse.json({ success: true, dueDate: dueDate ? dueDate.toISOString() : null })
  } catch (e) {
    console.error('due-date PATCH error', e)
    return NextResponse.json({ error: 'Failed to update due date' }, { status: 500 })
  }
}
