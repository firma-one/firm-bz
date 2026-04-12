import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject } from '@/lib/permission-helpers'
import { getProjectDocumentContext } from '@/lib/file-utils'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { requireEngagementMember, externalMemberCanAccessDocument } from '@/lib/engagement-access'

/**
 * GET /api/projects/[projectId]/documents/[documentId]/doc-comments
 * List append-only doc comments for a document. Visible to all personas with project access.
 * Messages are immutable (no UPDATE at DB or API level).
 */
export async function GET(
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
    const canView = await canViewProject(ctx.orgId, ctx.clientId, ctx.projectId)
    if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const member = await requireEngagementMember(projectId, user.id)
    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const docCtx = await getProjectDocumentContext(projectId, documentIdParam)
    if (!docCtx) return NextResponse.json({ error: 'Document not found in this project' }, { status: 404 })

    const canDoc = await externalMemberCanAccessDocument(projectId, member.role, docCtx.externalId)
    if (!canDoc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const messages = await prisma.docCommentMessage.findMany({
      where: {
        projectDocumentId: docCtx.id,
        engagementId: projectId,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        authorUserId: true,
        content: true,
        reactions: true,
      },
    })

    const uniqueUserIds = Array.from(
      new Set(
        messages
          .flatMap((m) => {
            const reactions = (m.reactions ?? {}) as Record<string, unknown>
            const reactionIds = Object.values(reactions).flatMap((v) => (Array.isArray(v) ? v : []))
            return [m.authorUserId, ...reactionIds]
          })
          .filter(Boolean)
      )
    ) as string[]

    const emailByUserId: Record<string, string> = {}
    if (uniqueUserIds.length > 0) {
      const supabaseAdmin = createSupabaseAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      await Promise.all(
        uniqueUserIds.map(async (uid) => {
          try {
            const { data: { user: u } } = await supabaseAdmin.auth.admin.getUserById(uid)
            emailByUserId[uid] = u?.email ?? ''
          } catch {
            emailByUserId[uid] = ''
          }
        })
      )
    }

    const enriched = messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      authorEmail: m.authorUserId ? (emailByUserId[m.authorUserId] ?? null) : null,
      reactions: Object.fromEntries(
        Object.entries(((m.reactions ?? {}) as Record<string, unknown>)).map(([k, v]) => {
          const ids = Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string') : []
          const emails = ids.map((id) => emailByUserId[id]).filter(Boolean)
          return [k, { count: emails.length, users: emails }]
        })
      ),
    }))

    return NextResponse.json({ messages: enriched })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(typeof e === 'string' ? e : 'Unknown error')
    console.error('GET doc-comments error', { message: err.message, stack: err.stack })
    const isDev = process.env.NODE_ENV === 'development'
    return NextResponse.json(
      { error: isDev ? err.message : 'Failed to load comments' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/projects/[projectId]/documents/[documentId]/doc-comments
 * Append a new comment. Caller must have project view access. Messages are immutable after create.
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
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 })

    const message = await prisma.docCommentMessage.create({
      data: {
        firmId: ctx.orgId,
        clientId: docCtx.clientId,
        engagementId: projectId,
        projectDocumentId: docCtx.id,
        authorUserId: user.id,
        content,
        createdBy: user.id,
        updatedBy: user.id,
      },
      select: {
        id: true,
        createdAt: true,
        authorUserId: true,
        content: true,
        reactions: true,
      },
    })

    return NextResponse.json({
      message: {
        ...message,
        createdAt: message.createdAt.toISOString(),
        authorEmail: user.email ?? null,
      },
    })
  } catch (e) {
    console.error('POST doc-comments error', e)
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 })
  }
}
