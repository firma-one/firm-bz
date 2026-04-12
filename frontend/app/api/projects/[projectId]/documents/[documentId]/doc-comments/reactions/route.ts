import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject } from '@/lib/permission-helpers'
import { getProjectDocumentContext } from '@/lib/file-utils'
import { requireEngagementMember, externalMemberCanAccessDocument } from '@/lib/engagement-access'

const ALLOWED_KEYS = new Set([
  'urgent',
  'looking',
  'done',
  'thumbs_up',
  'yes',
  'no',
  'ok',
  'plus_one',
])

/**
 * POST /api/projects/[projectId]/documents/[documentId]/doc-comments/reactions
 * Toggle a reaction on a single comment message.
 * Body: { messageId: string, emojiKey: 'urgent'|'looking'|'done'|'thumbs_up', action: 'add'|'remove' }
 */
export async function POST(
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
    const canView = await canViewProject(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const member = await requireEngagementMember(projectId, user.id)
    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const docCtx = await getProjectDocumentContext(projectId, documentIdParam)
    if (!docCtx) return NextResponse.json({ error: 'Document not found in this project' }, { status: 404 })

    const canDoc = await externalMemberCanAccessDocument(projectId, member.role, docCtx.externalId)
    if (!canDoc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const messageId = typeof body.messageId === 'string' ? body.messageId : ''
    const emojiKey = typeof body.emojiKey === 'string' ? body.emojiKey : ''
    const action = typeof body.action === 'string' ? body.action : ''

    if (!messageId) return NextResponse.json({ error: 'messageId is required' }, { status: 400 })
    if (!ALLOWED_KEYS.has(emojiKey)) return NextResponse.json({ error: 'Invalid emojiKey' }, { status: 400 })
    if (action !== 'add' && action !== 'remove') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

    const msg = await prisma.docCommentMessage.findFirst({
      where: {
        id: messageId,
        engagementId: projectId,
        projectDocumentId: docCtx.id,
      },
      select: { id: true, reactions: true },
    })
    if (!msg) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })

    const current = (msg.reactions ?? {}) as Record<string, unknown>
    const arr = Array.isArray(current[emojiKey]) ? (current[emojiKey] as unknown[]) : []
    const ids = arr.filter((v): v is string => typeof v === 'string')

    let nextIds: string[]
    if (action === 'add') nextIds = ids.includes(user.id) ? ids : [...ids, user.id]
    else nextIds = ids.filter((id) => id !== user.id)

    const next = { ...current, [emojiKey]: nextIds }

    const updated = await prisma.docCommentMessage.update({
      where: { id: msg.id },
      data: { reactions: next as any, updatedBy: user.id },
      select: { id: true, reactions: true },
    })

    return NextResponse.json({ messageId: updated.id, reactions: updated.reactions })
  } catch (e) {
    console.error('POST doc-comment reactions error', e)
    return NextResponse.json({ error: 'Failed to update reactions' }, { status: 500 })
  }
}

