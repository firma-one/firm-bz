import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject, getProjectPersona } from '@/lib/permission-helpers'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { BLOCKED_NOTE_MAX, BLOCKED_REASONS, blockedOf, type BlockedFlag, type BlockedReason } from '@/lib/files/blocked'

/**
 * PATCH /api/projects/[projectId]/documents/[documentId]/blocked
 * Mark a document blocked, with what it waits on, or clear it (.claude/plans/deliverable-stages-blocked.md,
 * section 3). Body: { reason: 'client' | 'team' | 'on_hold', note?: string } to set, { blocked: null } to clear.
 *
 * The firm's own: only its roles set or clear it, and a client is never sent it. Documents only — a
 * deliverable shows how many of its documents are blocked. Written with one jsonb_set, so it never
 * races another settings write into losing it.
 */
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

    const role = await getProjectPersona(ctx.firmId, ctx.clientId, ctx.projectId)
    if (role !== 'eng_admin' && role !== 'eng_member')
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const clearing = body?.blocked === null
    const reason = body?.reason as BlockedReason | undefined
    if (!clearing && !BLOCKED_REASONS.includes(reason as BlockedReason))
      return NextResponse.json({ error: 'Give a reason: client, team or on_hold' }, { status: 400 })
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, BLOCKED_NOTE_MAX) : ''

    const doc = await prisma.engagementDocument.findFirst({
      where: { id: documentId, engagementId: projectId },
      select: { id: true, isFolder: true, fileName: true, settings: true },
    })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (doc.isFolder)
      return NextResponse.json({ error: 'Only a document can be blocked; a deliverable shows its blocked documents.' }, { status: 400 })

    const previous = blockedOf(doc.settings)
    if (clearing) {
      if (previous) {
        await prisma.$executeRawUnsafe(
          `UPDATE platform.engagement_documents
           SET settings = COALESCE(settings, '{}'::jsonb) - 'blocked', "updatedAt" = now()
           WHERE id = $1::uuid AND "engagementId" = $2::uuid`,
          doc.id,
          projectId,
        )
        audit(AUDIT_EVENT.DOCUMENT_UNBLOCKED)
          .scope(AUDIT_SCOPE.DOCUMENT)
          .firm(ctx.firmId)
          .client(ctx.clientId)
          .engagement(projectId)
          .document(doc.id)
          .actor(user.id)
          .meta({ fileName: doc.fileName, reason: previous.reason })
          .fireAndForget()
      }
      return NextResponse.json({ blocked: null })
    }

    const flag: BlockedFlag = { reason: reason as BlockedReason, ...(note ? { note } : {}), at: new Date().toISOString(), by: user.id }
    await prisma.$executeRawUnsafe(
      `UPDATE platform.engagement_documents
       SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{blocked}', $1::jsonb), "updatedAt" = now()
       WHERE id = $2::uuid AND "engagementId" = $3::uuid`,
      JSON.stringify(flag),
      doc.id,
      projectId,
    )
    // An event when it starts or what it waits on changes; saving it unchanged records nothing.
    if (!previous || previous.reason !== flag.reason || (previous.note ?? '') !== note) {
      audit(AUDIT_EVENT.DOCUMENT_BLOCKED)
        .scope(AUDIT_SCOPE.DOCUMENT)
        .firm(ctx.firmId)
        .client(ctx.clientId)
        .engagement(projectId)
        .document(doc.id)
        .actor(user.id)
        .meta({ fileName: doc.fileName, reason: flag.reason, ...(note ? { note } : {}) })
        .fireAndForget()
    }
    return NextResponse.json({ blocked: flag })
  } catch (e) {
    console.error('blocked PATCH error', e)
    return NextResponse.json({ error: 'Failed to update the block' }, { status: 500 })
  }
}
