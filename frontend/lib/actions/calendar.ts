'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import { parseSettingsFromDb, type ActivityStatus } from '@/lib/sharing-settings'
import { getReminderKeysForUser } from '@/lib/actions/user-reminders'

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

const EMPTY_CALENDAR_DATA: CalendarData = { engagements: [], events: [] }

/**
 * Fetch all Engagement/Deliverable calendar events for a firm, scoped to the
 * requesting user's engagement memberships (mirrors getClients()/getFirmHierarchy()
 * in lib/actions/hierarchy.ts — permission check embedded in the query WHERE clause).
 */
export async function getFirmCalendarData(firmSlug: string): Promise<CalendarData> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) redirect('/signin')
  const user = session.user

  const firm = await prisma.firm.findUnique({
    where: { slug: firmSlug },
    select: { id: true },
  })
  if (!firm) return EMPTY_CALENDAR_DATA

  const anyMembership = await prisma.firmMember.findFirst({
    where: { userId: user.id, firmId: firm.id },
  })
  if (!anyMembership) return EMPTY_CALENDAR_DATA

  const engagements = await prisma.engagement.findMany({
    where: {
      firmId: firm.id,
      isDeleted: false,
      members: { some: { userId: user.id } },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      clientId: true,
      status: true,
      kickoffDate: true,
      dueDate: true,
      followUpDate: true,
      client: { select: { name: true, slug: true } },
      documents: {
        where: { dueDate: { not: null } },
        select: { id: true, fileName: true, dueDate: true, isFolder: true, settings: true, parentId: true, docId: true },
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
    for (const doc of e.documents) {
      if (!doc.dueDate) continue
      const assigneeUserId = (() => {
        try { return (doc.settings as any)?.assigneeUserId ?? null } catch { return null }
      })()
      if (assigneeUserId) assigneeUserIdByDocId.set(doc.id, assigneeUserId)
    }
  }

  const uniqueAssigneeIds = Array.from(new Set(assigneeUserIdByDocId.values()))
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

  const reminderKeys = await getReminderKeysForUser(user.id)

  const events: CalendarEvent[] = []
  const hasEngagementReminder = (engagementId: string) => reminderKeys.has(`platform.engagements:${engagementId}`)
  const hasDocumentReminder = (documentId: string) => reminderKeys.has(`platform.documents:${documentId}`)

  for (const e of engagements) {
    const engagementUrl = `/d/f/${firmSlug}/c/${e.client.slug}/e/${e.slug}`
    const engagementDueDate = e.dueDate?.toISOString() ?? null
    const engagementHasReminder = hasEngagementReminder(e.id)

    if (e.kickoffDate) {
      events.push({
        id: `${e.id}:kickoff`,
        engagementId: e.id,
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
    if (e.dueDate) {
      events.push({
        id: `${e.id}:due`,
        engagementId: e.id,
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
    if (e.followUpDate) {
      events.push({
        id: `${e.id}:followUp`,
        engagementId: e.id,
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
    for (const doc of e.documents) {
      if (!doc.dueDate) continue
      const parsedSettings = (() => {
        try { return parseSettingsFromDb(doc.settings as any) } catch { return null }
      })()
      const isDeliverableFolder = doc.isFolder && isDeliverableSettings(doc.settings)
      const assigneeUserId = assigneeUserIdByDocId.get(doc.id) ?? null
      events.push({
        id: `${doc.id}:deliverable`,
        engagementId: e.id,
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
