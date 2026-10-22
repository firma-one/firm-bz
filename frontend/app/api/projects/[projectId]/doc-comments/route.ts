import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject } from '@/lib/permission-helpers'
import { requireEngagementMember, visibleDocumentIdsFor } from '@/lib/engagement-access'
import { taggedDocumentsIn } from '@/lib/comments/tagged-documents'
import { loadPeople } from '@/lib/files/file-creator'

/**
 * GET /api/projects/[projectId]/doc-comments
 * Project-level rollup of doc comments: list documents with counts + latest message preview.
 * Same access as a document's thread: engagement members only, and external personas see only
 * the documents shared with them. Each response also carries `taggedDocuments` (the documents
 * tagged with "#" in the previews that the viewer may access, by doc ID) for drawing tags as chips.
 *
 * ?filter=mentions  — returns only comments where the current user is an @mentioned recipient
 *                    (i.e. has a reminder with entityKey='platform.doc_comments' for that message).
 *                    Response shape: { mentions: MentionRow[] }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId } = await params
  const ctx = await resolveProjectContext(projectId)
  if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  const canView = await canViewProject(ctx.orgId, ctx.clientId, ctx.projectId)
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const member = await requireEngagementMember(projectId, user.id)
  if (!member) return NextResponse.json({ error: 'Only engagement members can see comments.' }, { status: 403 })
  const visible = await visibleDocumentIdsFor(projectId, member.role)

  // ── Mentions filter ───────────────────────────────────────────────────────
  if (request.nextUrl.searchParams.get('filter') === 'mentions') {
    const personalization = await prisma.userPersonalization.findUnique({
      where: { userId: user.id },
      select: { reminders: true },
    })
    const reminders = Array.isArray(personalization?.reminders) ? (personalization!.reminders as any[]) : []
    const mentionedMessageIds = reminders
      .filter((r) => r.entityKey === 'platform.doc_comments')
      .map((r) => r.entityValue as string)

    if (mentionedMessageIds.length === 0) return NextResponse.json({ mentions: [] })

    const messages = await prisma.docCommentMessage.findMany({
      where: { id: { in: mentionedMessageIds }, engagementId: projectId },
      select: { id: true, createdAt: true, content: true, authorUserId: true, projectDocumentId: true },
      orderBy: { createdAt: 'desc' },
    })

    const docIds = Array.from(new Set(messages.map((m) => m.projectDocumentId)))
    const docs = (await prisma.engagementDocument.findMany({
      where: { id: { in: docIds } },
      select: { id: true, fileName: true, externalId: true },
    })).filter((d) => !visible || visible.has(d.externalId))
    const docNameById = Object.fromEntries(docs.map((d) => [d.id, d.fileName]))

    const mentions = messages.filter((m) => m.projectDocumentId in docNameById).map((m) => ({
      messageId: m.id,
      createdAt: m.createdAt.toISOString(),
      preview: m.content.slice(0, 220),
      authorUserId: m.authorUserId ?? null,
      projectDocumentId: m.projectDocumentId,
      documentName: docNameById[m.projectDocumentId] ?? '',
    }))
    const taggedDocuments = await taggedDocumentsIn(projectId, mentions.map((m) => m.preview), visible)

    return NextResponse.json({ mentions, taggedDocuments })
  }

  // ── Default: document rollup ──────────────────────────────────────────────
  const q = request.nextUrl.searchParams.get('q')?.trim().toLowerCase() || ''

  // Build the external-user set so we can flag threads awaiting a firm reply.
  // Mirror the exact rule the insights route uses for `unansweredThreads` so
  // the Action Center count and per-thread pips agree byte-for-byte.
  const EXTERNAL_ROLES = new Set(['eng_ext_collaborator', 'eng_viewer'])
  const engagementMembers = await prisma.engagementMember.findMany({
    where: { engagementId: projectId },
    select: { userId: true, role: true },
  })
  const externalUserIds = new Set(
    engagementMembers.filter((m) => EXTERNAL_ROLES.has(m.role)).map((m) => m.userId)
  )

  // When searching, match either the document name/ID or the comment text itself,
  // so a query finds threads by what was actually said, not just by file name.
  let matchingDocIdsFromContent: string[] = []
  if (q) {
    const matches = await prisma.docCommentMessage.findMany({
      where: { engagementId: projectId, content: { contains: q, mode: 'insensitive' } },
      select: { projectDocumentId: true },
      distinct: ['projectDocumentId'],
      take: 200,
    })
    matchingDocIdsFromContent = matches.map((m) => m.projectDocumentId)
  }

  const docs = (await prisma.engagementDocument.findMany({
    where: {
      engagementId: projectId,
      ...(q
        ? {
            OR: [
              { fileName: { contains: q, mode: 'insensitive' } },
              { docId: { contains: q, mode: 'insensitive' } },
              { id: { in: matchingDocIdsFromContent } },
            ],
          }
        : {}),
    },
    select: { id: true, fileName: true, docId: true, externalId: true, isFolder: true, mimeType: true, settings: true },
    take: 200,
  })).filter((d) => !visible || visible.has(d.externalId))
  const docIds = docs.map((d) => d.id)
  if (docIds.length === 0) return NextResponse.json({ documents: [] })

  const counts = await prisma.docCommentMessage.groupBy({
    by: ['projectDocumentId'],
    where: { engagementId: projectId, projectDocumentId: { in: docIds } },
    _count: { _all: true },
  })

  // Latest message per document (small N; acceptable to do one query per doc for now)
  const latestByDocId: Record<string, { createdAt: string; preview: string; authorUserId: string | null; authorIsExternal: boolean }> = {}
  await Promise.all(
    docIds.map(async (docId) => {
      const latest = await prisma.docCommentMessage.findFirst({
        where: { engagementId: projectId, projectDocumentId: docId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, content: true, authorUserId: true },
      })
      if (!latest) return
      latestByDocId[docId] = {
        createdAt: latest.createdAt.toISOString(),
        preview: latest.content.slice(0, 220),
        authorUserId: latest.authorUserId ?? null,
        // True when the last message is from EC/EV — i.e. the firm hasn't replied yet.
        authorIsExternal: latest.authorUserId ? externalUserIds.has(latest.authorUserId) : false,
      }
    })
  )

  // Who wrote each latest comment, for a name on the row even if they've left the engagement.
  const people = await loadPeople(Object.values(latestByDocId).map((l) => l.authorUserId ?? ''))
  const countByDocId = Object.fromEntries(counts.map((c) => [c.projectDocumentId, c._count._all]))
  const documents = docs
    .map((d) => {
      const latest = latestByDocId[d.id]
      const author = latest?.authorUserId ? people.get(latest.authorUserId) : undefined
      return {
        projectDocumentId: d.id,
        documentName: d.fileName,
        docId: d.docId ?? null,
        // A folder is a deliverable once it's tagged as one (settings.share.createdAt), the same rule as the Board.
        kind: !d.isFolder ? 'file' : (d.settings as { share?: { createdAt?: unknown } } | null)?.share?.createdAt ? 'deliverable' : 'folder',
        mimeType: d.mimeType ?? null,
        count: countByDocId[d.id] ?? 0,
        latest: latest ? { ...latest, authorName: author?.name ?? null, authorEmail: author?.email ?? null } : null,
      }
    })
    .filter((d) => d.count > 0)
    .sort((a, b) => {
      const at = a.latest?.createdAt ?? ''
      const bt = b.latest?.createdAt ?? ''
      return bt.localeCompare(at)
    })

  const taggedDocuments = await taggedDocumentsIn(projectId, documents.flatMap((d) => (d.latest ? [d.latest.preview] : [])), visible)

  return NextResponse.json({ documents, taggedDocuments })
}

