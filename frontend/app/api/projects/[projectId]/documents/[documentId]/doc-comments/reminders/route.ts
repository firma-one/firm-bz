import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject } from '@/lib/permission-helpers'
import { getProjectDocumentContext } from '@/lib/file-utils'

/**
 * GET /api/projects/[projectId]/documents/[documentId]/doc-comments/reminders?messageId=...
 * Returns existing reminders for a specific comment across all engagement members.
 * Response: { reminders: { userId: string; reminderId: string; dateValue: string | null }[] }
 */
export async function GET(
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
    const canView = await canViewProject(ctx.firmId, ctx.clientId, ctx.projectId)
    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const messageId = request.nextUrl.searchParams.get('messageId')
    if (!messageId) return NextResponse.json({ error: 'messageId is required' }, { status: 400 })

    const docCtx = await getProjectDocumentContext(projectId, documentIdParam)
    if (!docCtx) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    // Verify the message belongs to this document
    const message = await prisma.docCommentMessage.findFirst({
      where: { id: messageId, projectDocumentId: docCtx.id, engagementId: projectId },
      select: { id: true },
    })
    if (!message) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })

    // Fetch all engagement members and check their UserPersonalization for matching reminders
    const members = await prisma.engagementMember.findMany({
      where: { engagementId: projectId },
      select: { userId: true },
    })

    const personalizations = await prisma.userPersonalization.findMany({
      where: { userId: { in: members.map((m) => m.userId) } },
      select: { userId: true, reminders: true },
    })

    const entityKey = 'platform.doc_comments'
    const entityValue = messageId

    const existing = personalizations.flatMap((p) => {
      const items = Array.isArray(p.reminders) ? (p.reminders as any[]) : []
      const match = items.find(
        (r) => r.entityKey === entityKey && r.entityValue === entityValue && !r.hiddenAt
      )
      return match ? [{ userId: p.userId, reminderId: match.id, dateValue: match.dateValue ?? null }] : []
    })

    return NextResponse.json({ reminders: existing })
  } catch (e) {
    console.error('GET doc-comment reminders error', e)
    return NextResponse.json({ error: 'Failed to fetch reminders' }, { status: 500 })
  }
}
