import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject } from '@/lib/permission-helpers'
import { upsertFollowUpReminder } from '@/lib/actions/user-reminders'

/**
 * POST /api/projects/[projectId]/documents/[documentId]/reminder
 * Assign a reminder for a document to any engagement member.
 * Body: { recipientId: string }
 */
export async function POST(
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

    const canView = await canViewProject(ctx.firmId, ctx.clientId, ctx.projectId)
    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const recipientId = typeof body.recipientId === 'string' ? body.recipientId : null
    const dateValue = typeof body.dateValue === 'string' ? body.dateValue : null
    if (!recipientId) return NextResponse.json({ error: 'recipientId is required' }, { status: 400 })

    // Verify recipient is an engagement member
    const member = await prisma.engagementMember.findFirst({
      where: { engagementId: projectId, userId: recipientId },
    })
    if (!member) return NextResponse.json({ error: 'Recipient is not a member of this engagement' }, { status: 400 })

    const doc = await prisma.engagementDocument.findFirst({
      where: { id: documentId, engagementId: projectId },
      select: { id: true, fileName: true },
    })
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const engDetails = await prisma.engagement.findUnique({
      where: { id: projectId },
      select: { slug: true, client: { select: { slug: true, firm: { select: { slug: true } } } } },
    })
    const firmSlug = engDetails?.client?.firm?.slug ?? ''
    const clientSlug = engDetails?.client?.slug ?? ''
    const engSlug = engDetails?.slug ?? ''

    await upsertFollowUpReminder({
      userId: recipientId,
      entityKey: 'platform.documents.id',
      entityValue: doc.id,
      action: 'Review document',
      dateKey: null,
      dateValue: dateValue,
      entityName: doc.fileName ?? 'Document',
      firmId: ctx.firmId,
      ctaUrl: firmSlug && clientSlug && engSlug
        ? `/d/f/${firmSlug}/c/${clientSlug}/e/${engSlug}/files#doc-file:${doc.id}`
        : null,
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('POST document reminder error', e)
    return NextResponse.json({ error: 'Failed to set reminder' }, { status: 500 })
  }
}

/**
 * GET /api/projects/[projectId]/documents/[documentId]/reminder
 * Returns existing reminders for this document across all engagement members.
 * Response: { reminders: { userId: string; reminderId: string; dateValue: string | null }[] }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, documentId } = await params
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const canView = await canViewProject(ctx.firmId, ctx.clientId, ctx.projectId)
    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const doc = await prisma.engagementDocument.findFirst({
      where: { id: documentId, engagementId: projectId },
      select: { id: true },
    })
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    // Fetch all engagement members and check their UserPersonalization for matching reminders
    const members = await prisma.engagementMember.findMany({
      where: { engagementId: projectId },
      select: { userId: true },
    })

    const personalizations = await prisma.userPersonalization.findMany({
      where: { userId: { in: members.map((m) => m.userId) } },
      select: { userId: true, reminders: true },
    })

    const entityKey = 'platform.documents.id'
    const entityValue = doc.id

    const existing = personalizations.flatMap((p) => {
      const items = Array.isArray(p.reminders) ? (p.reminders as any[]) : []
      const match = items.find(
        (r) => r.entityKey === entityKey && r.entityValue === entityValue && !r.hiddenAt
      )
      return match ? [{ userId: p.userId, reminderId: match.id, dateValue: match.dateValue ?? null }] : []
    })

    return NextResponse.json({ reminders: existing })
  } catch (e) {
    console.error('GET document reminder error', e)
    return NextResponse.json({ error: 'Failed to fetch reminders' }, { status: 500 })
  }
}

/**
 * DELETE /api/projects/[projectId]/documents/[documentId]/reminder
 * Removes (marks done) a reminder for a specific user.
 * Body: { reminderId: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId } = await params
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const canView = await canViewProject(ctx.firmId, ctx.clientId, ctx.projectId)
    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const reminderId = typeof body.reminderId === 'string' ? body.reminderId : null
    const recipientId = typeof body.recipientId === 'string' ? body.recipientId : null
    if (!reminderId || !recipientId) return NextResponse.json({ error: 'reminderId and recipientId are required' }, { status: 400 })

    // Verify recipient is an engagement member
    const member = await prisma.engagementMember.findFirst({
      where: { engagementId: projectId, userId: recipientId },
    })
    if (!member) return NextResponse.json({ error: 'Recipient is not a member of this engagement' }, { status: 400 })

    // markReminderDone uses the session user — we need to act as the recipient.
    // Since reminders are per-user JSON blobs, remove directly from their store.
    const p = await prisma.userPersonalization.findUnique({
      where: { userId: recipientId },
      select: { reminders: true },
    })
    if (p) {
      const items = Array.isArray(p.reminders) ? (p.reminders as any[]) : []
      const item = items.find((r) => r.id === reminderId)
      if (item) {
        const { safeInngestSend } = await import('@/lib/inngest/client')
        await safeInngestSend('reminder.email.cancelled', { reminderId })
        await safeInngestSend('reminder.recurring.cancelled', { reminderId })
        await prisma.userPersonalization.update({
          where: { userId: recipientId },
          data: { reminders: items.filter((r) => r.id !== reminderId) as any },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('DELETE document reminder error', e)
    return NextResponse.json({ error: 'Failed to remove reminder' }, { status: 500 })
  }
}
