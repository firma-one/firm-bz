import 'server-only'

import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseSettingsFromDb, type ActivityStatus } from '@/lib/sharing-settings'
import { getReminderKeysForUser } from '@/lib/reminders/reminder-service'
import { engagementPath } from '@/lib/navigation/firm-paths'
import { isExternalEngagementRole } from '@/lib/engagement-access'
import {
  getSharedAndAncestorIdsForPersona,
  isFolderUnderSharedFolderDB,
  type SharedOnlyPersonaSlug,
} from '@/lib/engagement-sharing-ids'
import { externalCanSeeDocumentDueDate } from '@/lib/calendar-visibility'

/*
 * Calendar events for the caller's engagements in one or more firms. The firm calendar page
 * (getFirmCalendarData) passes its one firm and no window; the cross-firm Home's agenda passes
 * every firm it shows and the week it draws (.claude/plans/cross-firm-home-inbox.md).
 *
 * Callers authenticate the user and pass only firms that user is a member of. Within them, the
 * permission check is embedded in the query: only engagements with the caller's own
 * EngagementMember row (mirrors getClients()/getFirmHierarchy() in lib/actions/hierarchy.ts). In
 * engagements where the user is an external member (EC/EV), document events are further limited
 * to what that persona can open — see externalCanSeeDocumentDueDate.
 */

export type CalendarEngagement = {
  id: string
  name: string
  slug: string
  clientId: string
  clientName: string
  clientSlug: string
  status: string
}

export type CalendarEventType = 'kickoff' | 'due' | 'followUp' | 'deliverable' | 'document'

export type CalendarEventAssignee = {
  name: string | null
  email: string | null
}

export type CalendarEvent = {
  id: string
  engagementId: string
  /** The engagement's firm — the cross-firm Home labels and filters by it. */
  firmId: string
  type: CalendarEventType
  title: string
  date: string
  ctaUrl: string | null
  clientName: string
  engagementName: string
  /** Engagement.status — shown on the modal's Engagement row regardless of which event type was clicked. */
  engagementStatus: string
  /** Engagement.dueDate — shown on the modal's Engagement row regardless of which event type was clicked. */
  engagementDueDate: string | null
  /** Document/deliverable name — same as title's subject, kept separate for structured display. */
  documentName: string | null
  /** Human-readable short id (e.g. "NVQ-7") for deliverable/document events. */
  docId: string | null
  status: ActivityStatus | null
  assignee: CalendarEventAssignee | null
  /** Prisma id of this event's underlying EngagementDocument row (deliverable/document events only). */
  documentId: string | null
  /**
   * Prisma id of the nearest ancestor Deliverable folder, if this is a
   * 'document' event nested inside one. Null for 'deliverable' events
   * themselves (they ARE the deliverable) and for engagement-level events.
   */
  deliverableId: string | null
  /** True when the current logged-in user has an active reminder tied to this event's entity. */
  hasReminder: boolean
}

export type CalendarData = {
  engagements: CalendarEngagement[]
  events: CalendarEvent[]
}

export type CalendarFirm = { id: string; slug: string; groupSlug: string }

export async function loadCalendarData(params: {
  userId: string
  firms: CalendarFirm[]
  /** Only events dated inside this window (inclusive). Omit for everything. */
  window?: { from: Date; to: Date }
  /** Look up assignee names (one auth lookup per assignee). The agenda doesn't show them. */
  withAssignees?: boolean
}): Promise<CalendarData> {
  const { userId, firms, window, withAssignees = true } = params
  if (firms.length === 0) return { engagements: [], events: [] }
  const firmById = new Map(firms.map((f) => [f.id, f]))
  const inWindow = window ? { gte: window.from, lte: window.to } : undefined
  const within = (d: Date) => !window || (d >= window.from && d <= window.to)

  const engagements = await prisma.engagement.findMany({
    where: {
      firmId: { in: firms.map((f) => f.id) },
      isDeleted: false,
      members: { some: { userId } },
      // A window keeps only engagements with something dated inside it.
      ...(window
        ? {
            OR: [
              { kickoffDate: inWindow },
              { dueDate: inWindow },
              { followUpDate: inWindow },
              { documents: { some: { dueDate: inWindow } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      firmId: true,
      name: true,
      slug: true,
      clientId: true,
      status: true,
      kickoffDate: true,
      dueDate: true,
      followUpDate: true,
      client: { select: { name: true, slug: true } },
      // The caller's own membership row — its role decides whether the external filter applies.
      members: { where: { userId }, select: { role: true } },
      documents: {
        where: { dueDate: window ? inWindow : { not: null } },
        select: { id: true, externalId: true, fileName: true, dueDate: true, isFolder: true, settings: true, parentId: true, docId: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  // All folder rows per engagement, needed to walk a document's parentId chain
  // up to its nearest ancestor Deliverable folder (EngagementDocument.parentId
  // stores the Drive externalId of the parent, not the parent's own Prisma id —
  // same convention as lib/engagement-sharing-ids.ts / document-sharing-access.ts).
  const engagementIds = engagements.map((e) => e.id)
  const allFolders = engagementIds.length > 0
    ? await prisma.engagementDocument.findMany({
        where: { engagementId: { in: engagementIds }, isFolder: true },
        select: { id: true, engagementId: true, externalId: true, parentId: true, settings: true },
      })
    : []
  const folderByEngagementAndExternalId = new Map<string, typeof allFolders[number]>()
  for (const f of allFolders) folderByEngagementAndExternalId.set(`${f.engagementId}:${f.externalId}`, f)

  function isDeliverableSettings(settings: unknown): boolean {
    try { return !!(parseSettingsFromDb(settings as any).share?.createdAt) } catch { return false }
  }

  /** Walk parentId chain to find the nearest ancestor folder marked as a Deliverable. */
  function findAncestorDeliverableId(engagementId: string, parentExternalId: string | null): string | null {
    let current = parentExternalId
    let hops = 0
    while (current && hops < 50) {
      const folder = folderByEngagementAndExternalId.get(`${engagementId}:${current}`)
      if (!folder) return null
      if (isDeliverableSettings(folder.settings)) return folder.id
      current = folder.parentId
      hops++
    }
    return null
  }

  const folderById = new Map(allFolders.map((f) => [f.id, f]))

  /** A deliverable's board stage; unreadable settings count as the most restricted stage. */
  function deliverableStageOf(settings: unknown): ActivityStatus {
    try { return parseSettingsFromDb(settings as any).activity?.status ?? 'to_do' } catch { return 'to_do' }
  }

  // External members (EC/EV) only see due dates on documents they could open: inside their
  // persona's shared subtree and, for deliverables, at a stage their role may see. Without this
  // they saw every dated document in the engagement, internal work-in-progress included.
  // skipDescendants keeps this to DB reads; the subtree check walks the returned parentMap.
  const externalAccessByEngagement = new Map<string, { role: SharedOnlyPersonaSlug; sharedIds: string[]; parentMap: Map<string, string> }>()
  await Promise.all(engagements.map(async (e) => {
    const role = e.members[0]?.role
    if (!isExternalEngagementRole(role)) return
    const persona = role as SharedOnlyPersonaSlug
    const { sharedIds, parentMap } = await getSharedAndAncestorIdsForPersona(e.id, persona, { skipDescendants: true })
    externalAccessByEngagement.set(e.id, { role: persona, sharedIds, parentMap })
  }))

  const visibleDocumentsByEngagement = new Map<string, typeof engagements[number]['documents']>()
  for (const e of engagements) {
    const access = externalAccessByEngagement.get(e.id)
    visibleDocumentsByEngagement.set(e.id, e.documents.filter((doc) => {
      if (!doc.dueDate) return false
      if (!access) return true
      const deliverableId = doc.isFolder && isDeliverableSettings(doc.settings)
        ? doc.id
        : findAncestorDeliverableId(e.id, doc.parentId ?? null)
      const deliverableStage = deliverableId === null
        ? null
        : deliverableStageOf(deliverableId === doc.id ? doc.settings : folderById.get(deliverableId)?.settings)
      return externalCanSeeDocumentDueDate(access.role, {
        inSharedSubtree: isFolderUnderSharedFolderDB(doc.externalId, access.sharedIds, access.parentMap),
        deliverableStage,
      })
    }))
  }

  const calendarEngagements: CalendarEngagement[] = engagements.map((e) => ({
    id: e.id,
    name: e.name,
    slug: e.slug,
    clientId: e.clientId,
    clientName: e.client.name,
    clientSlug: e.client.slug,
    status: e.status,
  }))

  // Collect every document's assigneeUserId up front so we can resolve all
  // Supabase auth users in one batch rather than one lookup per event.
  const assigneeUserIdByDocId = new Map<string, string>()
  for (const e of engagements) {
    for (const doc of visibleDocumentsByEngagement.get(e.id) ?? []) {
      if (!doc.dueDate) continue
      const assigneeUserId = (() => {
        try { return (doc.settings as any)?.assigneeUserId ?? null } catch { return null }
      })()
      if (assigneeUserId) assigneeUserIdByDocId.set(doc.id, assigneeUserId)
    }
  }

  const uniqueAssigneeIds = withAssignees ? Array.from(new Set(assigneeUserIdByDocId.values())) : []
  const assigneeMap = new Map<string, CalendarEventAssignee>()
  if (uniqueAssigneeIds.length > 0) {
    const admin = createAdminClient()
    await Promise.allSettled(uniqueAssigneeIds.map(async (userId) => {
      try {
        const { data } = await admin.auth.admin.getUserById(userId)
        const meta = data?.user?.user_metadata ?? {}
        assigneeMap.set(userId, {
          name: (meta.full_name ?? meta.name ?? data?.user?.email?.split('@')[0] ?? null) as string | null,
          email: data?.user?.email ?? null,
        })
      } catch {
        assigneeMap.set(userId, { name: null, email: null })
      }
    }))
  }

  const reminderKeys = await getReminderKeysForUser(userId)

  const events: CalendarEvent[] = []
  const hasEngagementReminder = (engagementId: string) => reminderKeys.has(`platform.engagements:${engagementId}`)
  const hasDocumentReminder = (documentId: string) => reminderKeys.has(`platform.documents:${documentId}`)

  for (const e of engagements) {
    const firm = firmById.get(e.firmId)
    if (!firm) continue
    const engagementUrl = engagementPath(firm.groupSlug, firm.slug, e.client.slug, e.slug)
    const engagementDueDate = e.dueDate?.toISOString() ?? null
    const engagementHasReminder = hasEngagementReminder(e.id)

    if (e.kickoffDate && within(e.kickoffDate)) {
      events.push({
        id: `${e.id}:kickoff`,
        engagementId: e.id,
        firmId: e.firmId,
        type: 'kickoff',
        title: `${e.name} — Kickoff`,
        date: e.kickoffDate.toISOString(),
        ctaUrl: engagementUrl,
        clientName: e.client.name,
        engagementName: e.name,
        engagementStatus: e.status,
        engagementDueDate,
        documentName: null,
        docId: null,
        status: null,
        assignee: null,
        documentId: null,
        deliverableId: null,
        hasReminder: engagementHasReminder,
      })
    }
    if (e.dueDate && within(e.dueDate)) {
      events.push({
        id: `${e.id}:due`,
        engagementId: e.id,
        firmId: e.firmId,
        type: 'due',
        title: `${e.name} — Due`,
        date: e.dueDate.toISOString(),
        ctaUrl: engagementUrl,
        clientName: e.client.name,
        engagementName: e.name,
        engagementStatus: e.status,
        engagementDueDate,
        documentName: null,
        docId: null,
        status: null,
        assignee: null,
        documentId: null,
        deliverableId: null,
        hasReminder: engagementHasReminder,
      })
    }
    if (e.followUpDate && within(e.followUpDate)) {
      events.push({
        id: `${e.id}:followUp`,
        engagementId: e.id,
        firmId: e.firmId,
        type: 'followUp',
        title: `${e.name} — Follow-up`,
        date: e.followUpDate.toISOString(),
        ctaUrl: engagementUrl,
        clientName: e.client.name,
        engagementName: e.name,
        engagementStatus: e.status,
        engagementDueDate,
        documentName: null,
        docId: null,
        status: null,
        assignee: null,
        documentId: null,
        deliverableId: null,
        hasReminder: engagementHasReminder,
      })
    }

    // All documents with a due date, folder or nested file — not filtered to
    // deliverable folders only, so due dates on individual files inside a
    // deliverable are included too. isFolder only picks the label/CTA shape.
    for (const doc of visibleDocumentsByEngagement.get(e.id) ?? []) {
      if (!doc.dueDate) continue
      const parsedSettings = (() => {
        try { return parseSettingsFromDb(doc.settings as any) } catch { return null }
      })()
      const isDeliverableFolder = doc.isFolder && isDeliverableSettings(doc.settings)
      const assigneeUserId = assigneeUserIdByDocId.get(doc.id) ?? null
      events.push({
        id: `${doc.id}:deliverable`,
        engagementId: e.id,
        firmId: e.firmId,
        type: isDeliverableFolder ? 'deliverable' : 'document',
        title: `${doc.fileName} — Due`,
        date: doc.dueDate.toISOString(),
        ctaUrl: `${engagementUrl}/board#doc-file:${doc.id}`,
        clientName: e.client.name,
        engagementName: e.name,
        engagementStatus: e.status,
        engagementDueDate,
        documentName: doc.fileName,
        docId: doc.docId ?? null,
        status: parsedSettings?.activity?.status ?? null,
        assignee: assigneeUserId ? (assigneeMap.get(assigneeUserId) ?? null) : null,
        documentId: doc.id,
        deliverableId: isDeliverableFolder ? doc.id : findAncestorDeliverableId(e.id, doc.parentId ?? null),
        hasReminder: hasDocumentReminder(doc.id),
      })
    }
  }

  return { engagements: calendarEngagements, events }
}
