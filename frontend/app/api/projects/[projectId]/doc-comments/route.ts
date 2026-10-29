import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject } from '@/lib/permission-helpers'
import { requireEngagementMember, visibleDocumentIdsFor } from '@/lib/engagement-access'
import { taggedDocumentsIn } from '@/lib/comments/tagged-documents'
import { loadPeople } from '@/lib/files/file-creator'
import { parseSettingsFromDb } from '@/lib/sharing-settings'
import { formatDisplayName, mentionedNames } from '@/lib/comments/mentions'
import { SHARED_COMMENTS, visibleCommentsWhere } from '@/lib/comments/internal-notes'

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
  // A client never sees the firm's internal notes: not their text, counts, previews or unread dots.
  const seeable = visibleCommentsWhere(member.role)

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
      where: { id: { in: mentionedMessageIds }, engagementId: projectId, ...seeable },
      select: { id: true, createdAt: true, content: true, authorUserId: true, projectDocumentId: true },
      orderBy: { createdAt: 'desc' },
    })

    const docIds = Array.from(new Set(messages.map((m) => m.projectDocumentId)))
    const docs = (await prisma.engagementDocument.findMany({
      where: { id: { in: docIds } },
      select: { id: true, fileName: true, docId: true, externalId: true },
    })).filter((d) => !visible || visible.has(d.externalId))
    const docNameById = Object.fromEntries(docs.map((d) => [d.id, d.fileName]))
    const docIdById = Object.fromEntries(docs.map((d) => [d.id, d.docId ?? null]))

    const mentions = messages.filter((m) => m.projectDocumentId in docNameById).map((m) => ({
      messageId: m.id,
      createdAt: m.createdAt.toISOString(),
      preview: m.content.slice(0, 220),
      authorUserId: m.authorUserId ?? null,
      projectDocumentId: m.projectDocumentId,
      documentName: docNameById[m.projectDocumentId] ?? '',
      docId: docIdById[m.projectDocumentId] ?? null,
    }))
    const taggedDocuments = await taggedDocumentsIn(projectId, mentions.map((m) => m.preview), visible)

    return NextResponse.json({ mentions, taggedDocuments })
  }

  // ── Default: document rollup ──────────────────────────────────────────────
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

  // Every document with comments, as far as this viewer may see.
  const counts = await prisma.docCommentMessage.groupBy({
    by: ['projectDocumentId'],
    where: { engagementId: projectId, ...seeable },
    _count: { _all: true },
  })
  const countByDocId = Object.fromEntries(counts.map((c) => [c.projectDocumentId, c._count._all]))
  const threadDocs = (await prisma.engagementDocument.findMany({
    where: { engagementId: projectId, id: { in: Object.keys(countByDocId) } },
    select: { id: true, fileName: true, docId: true, externalId: true, parentId: true, isFolder: true, mimeType: true, settings: true },
  })).filter((d) => !visible || visible.has(d.externalId))
  if (threadDocs.length === 0) return NextResponse.json({ documents: [] })

  // The deliverable a document is in: the nearest folder above it tagged as one (parentId holds
  // the parent's Drive externalId, as in calendar-data.ts). A document's row shows it, and search finds it by it.
  const isDeliverable = (settings: unknown) => {
    try { return !!parseSettingsFromDb(settings).share?.createdAt } catch { return false }
  }
  const folders = await prisma.engagementDocument.findMany({
    where: { engagementId: projectId, isFolder: true },
    select: { id: true, externalId: true, parentId: true, docId: true, fileName: true, settings: true },
  })
  const folderByExternalId = new Map(folders.map((f) => [f.externalId, f]))
  const deliverableAbove = (parentId: string | null): { id: string; docId: string | null; name: string } | null => {
    for (let current = parentId, hops = 0; current && hops < 50; hops++) {
      const folder = folderByExternalId.get(current)
      if (!folder) return null
      if (isDeliverable(folder.settings)) return { id: folder.id, docId: folder.docId ?? null, name: folder.fileName }
      current = folder.parentId
    }
    return null
  }
  const deliverableByDocId = new Map(threadDocs.map((d) => [d.id, deliverableAbove(d.parentId)]))

  // Search looks a thread up by ID (its document's, or its deliverable's) or by a member who
  // wrote in it or was @mentioned in it. A leading "#", as a tag is written, is ignored. Comment
  // text is encrypted at rest, so mentions are read after loading, not matched in the query.
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().replace(/^#/, '').toLowerCase()
  let docs = threadDocs
  if (q) {
    const has = (text: string | null | undefined) => !!text && text.toLowerCase().includes(q)
    const messages = await prisma.docCommentMessage.findMany({
      where: { engagementId: projectId, projectDocumentId: { in: threadDocs.map((d) => d.id) }, ...seeable },
      select: { projectDocumentId: true, authorUserId: true, content: true },
    })
    const members = await loadPeople([...engagementMembers.map((m) => m.userId), ...messages.map((m) => m.authorUserId ?? '')])
    const namesOf = (p: { name: string; email: string }) => [p.name, formatDisplayName(p.name, p.email)]
    const allNames = Array.from(members.values()).flatMap(namesOf)
    const byMember = new Set<string>()
    for (const m of messages) {
      const author = m.authorUserId ? members.get(m.authorUserId) : undefined
      if ((author && namesOf(author).some(has)) || mentionedNames(m.content, allNames).some(has)) byMember.add(m.projectDocumentId)
    }
    docs = threadDocs.filter((d) => has(d.docId) || has(deliverableByDocId.get(d.id)?.docId) || byMember.has(d.id))
  }
  const docIds = docs.map((d) => d.id)
  if (docIds.length === 0) return NextResponse.json({ documents: [] })

  // Latest message per document (small N; acceptable to do one query per doc for now)
  const latestByDocId: Record<string, { createdAt: string; preview: string; authorUserId: string | null; authorIsExternal: boolean; isInternal: boolean }> = {}
  await Promise.all(
    docIds.map(async (docId) => {
      const [latest, latestShared] = await Promise.all([
        prisma.docCommentMessage.findFirst({
          where: { engagementId: projectId, projectDocumentId: docId, ...seeable },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, content: true, authorUserId: true, isInternal: true },
        }),
        prisma.docCommentMessage.findFirst({
          where: { engagementId: projectId, projectDocumentId: docId, ...SHARED_COMMENTS },
          orderBy: { createdAt: 'desc' },
          select: { authorUserId: true },
        }),
      ])
      if (!latest) return
      latestByDocId[docId] = {
        createdAt: latest.createdAt.toISOString(),
        preview: latest.content.slice(0, 220),
        authorUserId: latest.authorUserId ?? null,
        // True when the last shared message is from EC/EV — the firm hasn't replied yet. An internal
        // note after it is the firm talking among itself, not a reply.
        authorIsExternal: latestShared?.authorUserId ? externalUserIds.has(latestShared.authorUserId) : false,
        isInternal: latest.isInternal,
      }
    })
  )
  // Each discussion's state for this viewer: resolved (and by whom), and unread — a comment by
  // someone else since they last read it (no read marker: never read).
  const [resolvedThreads, reads, othersLatest] = await Promise.all([
    prisma.docCommentThread.findMany({
      where: { projectDocumentId: { in: docIds }, resolvedAt: { not: null } },
      select: { projectDocumentId: true, resolvedAt: true, resolvedBy: true },
    }),
    prisma.docCommentRead.findMany({
      where: { userId: user.id, projectDocumentId: { in: docIds } },
      select: { projectDocumentId: true, lastReadAt: true },
    }),
    prisma.docCommentMessage.groupBy({
      by: ['projectDocumentId'],
      where: { engagementId: projectId, projectDocumentId: { in: docIds }, ...seeable, OR: [{ authorUserId: null }, { authorUserId: { not: user.id } }] },
      _max: { createdAt: true },
    }),
  ])
  const resolvedByDocId = new Map(resolvedThreads.map((t) => [t.projectDocumentId, t]))
  const lastReadByDocId = new Map(reads.map((r) => [r.projectDocumentId, r.lastReadAt]))
  const unread = (docId: string) => {
    const latestOther = othersLatest.find((o) => o.projectDocumentId === docId)?._max.createdAt
    const lastRead = lastReadByDocId.get(docId)
    return !!latestOther && (!lastRead || latestOther > lastRead)
  }

  // Who wrote each latest comment, and who resolved each discussion, by name even if they've left the engagement.
  const people = await loadPeople([
    ...Object.values(latestByDocId).map((l) => l.authorUserId ?? ''),
    ...resolvedThreads.map((t) => t.resolvedBy ?? ''),
  ])
  const documents = docs
    .map((d) => {
      const latest = latestByDocId[d.id]
      const author = latest?.authorUserId ? people.get(latest.authorUserId) : undefined
      const kind = !d.isFolder ? 'file' : isDeliverable(d.settings) ? 'deliverable' : 'folder'
      const resolved = resolvedByDocId.get(d.id)
      return {
        projectDocumentId: d.id,
        documentName: d.fileName,
        docId: d.docId ?? null,
        kind,
        mimeType: d.mimeType ?? null,
        // The deliverable this document is in; none for a deliverable itself.
        deliverable: kind === 'deliverable' ? null : deliverableByDocId.get(d.id) ?? null,
        count: countByDocId[d.id] ?? 0,
        latest: latest
          ? {
              createdAt: latest.createdAt,
              preview: latest.preview,
              authorUserId: latest.authorUserId,
              authorIsExternal: latest.authorIsExternal,
              isInternal: latest.isInternal,
              authorName: author?.name ?? null,
              authorEmail: author?.email ?? null,
            }
          : null,
        resolved: resolved?.resolvedAt
          ? { at: resolved.resolvedAt.toISOString(), byName: (resolved.resolvedBy && people.get(resolved.resolvedBy)?.name) || null }
          : null,
        unread: unread(d.id),
      }
    })
    .filter((d) => d.count > 0)
    // Unread first, then the most recent.
    .sort((a, b) => {
      if (a.unread !== b.unread) return a.unread ? -1 : 1
      const at = a.latest?.createdAt ?? ''
      const bt = b.latest?.createdAt ?? ''
      return bt.localeCompare(at)
    })

  const taggedDocuments = await taggedDocumentsIn(projectId, documents.flatMap((d) => (d.latest ? [d.latest.preview] : [])), visible)

  return NextResponse.json({ documents, taggedDocuments })
}

