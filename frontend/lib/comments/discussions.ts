import { NextResponse } from 'next/server'
import type { EngagementRole } from '@prisma/client'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject } from '@/lib/permission-helpers'
import { getProjectDocumentContext } from '@/lib/file-utils'
import { isExternalEngagementRole, requireEngagementMember, visibleDocumentIdsFor } from '@/lib/engagement-access'

/*
 * A document's discussion — its comments — as the engagement's Discussions page lists it: whether
 * it's resolved, and when each member last read it (.claude/plans/board-pane-comments-redesign.md,
 * "Next"). Server only.
 */

/**
 * Who may act on a document's discussion (resolve it, mark it read): the same people who may read
 * and post in it — engagement members, and an external member only on a document shared with them.
 */
export async function discussionAccess(
    projectId: string,
    documentIdParam: string,
): Promise<{ userId: string; documentId: string } | NextResponse> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const ctx = await resolveProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (!(await canViewProject(ctx.orgId, ctx.clientId, ctx.projectId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const member = await requireEngagementMember(projectId, user.id)
    if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const doc = await getProjectDocumentContext(projectId, documentIdParam)
    if (!doc) return NextResponse.json({ error: 'Document not found in this project' }, { status: 404 })
    const visible = await visibleDocumentIdsFor(projectId, member.role)
    if (visible && !visible.has(doc.externalId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return { userId: user.id, documentId: doc.id }
}

/** Marks a discussion read for a member, as of now. */
export async function markDiscussionRead(userId: string, projectDocumentId: string, engagementId: string): Promise<void> {
    const lastReadAt = new Date()
    await prisma.docCommentRead.upsert({
        where: { userId_projectDocumentId: { userId, projectDocumentId } },
        create: { userId, projectDocumentId, engagementId, lastReadAt },
        update: { lastReadAt },
    })
}

/** Resolves a discussion (`by` who), or reopens it (`by` null). */
export async function setDiscussionResolved(projectDocumentId: string, engagementId: string, by: string | null): Promise<void> {
    const state = { resolvedAt: by ? new Date() : null, resolvedBy: by }
    await prisma.docCommentThread.upsert({
        where: { projectDocumentId },
        create: { projectDocumentId, engagementId, ...state },
        update: state,
    })
}

/** A new comment reopens a resolved discussion. */
export async function reopenDiscussion(projectDocumentId: string): Promise<void> {
    await prisma.docCommentThread.updateMany({
        where: { projectDocumentId, resolvedAt: { not: null } },
        data: { resolvedAt: null, resolvedBy: null },
    })
}

/**
 * How many discussions the engagement's tab counts for this viewer: documents with comments that
 * they may open, not resolved. `persona` is their engagement role; an external one sees only what's
 * shared with them.
 */
export async function countOpenDiscussions(engagementId: string, persona: string | null | undefined): Promise<number> {
    const threads = await prisma.docCommentMessage.groupBy({ by: ['projectDocumentId'], where: { engagementId } })
    if (threads.length === 0) return 0
    const ids = threads.map((t) => t.projectDocumentId)
    const [visible, resolved, docs] = await Promise.all([
        isExternalEngagementRole(persona as EngagementRole) ? visibleDocumentIdsFor(engagementId, persona as EngagementRole) : null,
        prisma.docCommentThread.findMany({ where: { projectDocumentId: { in: ids }, resolvedAt: { not: null } }, select: { projectDocumentId: true } }),
        prisma.engagementDocument.findMany({ where: { id: { in: ids } }, select: { id: true, externalId: true } }),
    ])
    const resolvedIds = new Set(resolved.map((r) => r.projectDocumentId))
    return docs.filter((d) => !resolvedIds.has(d.id) && (!visible || visible.has(d.externalId))).length
}
