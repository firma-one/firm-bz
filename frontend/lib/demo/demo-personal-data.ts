import type { ApiNotification } from '@/components/inbox/inbox-items'
import type { CalendarEvent } from '@/lib/calendar/calendar-data'
import type { HomeBookmark } from '@/lib/home/bookmarks'
import type { HomeFirm } from '@/lib/home/home-firms'
import type { MyWork } from '@/lib/home/my-work'
import type { RecentVisit } from '@/lib/recents'
import type { ReminderWithContext } from '@/lib/reminders/reminder-types'
import { DEMO_FIRM, type DemoClient, type DemoEngagement } from './static-demo-data'
import { deliverableName } from './demo-brio'
import { getDemoDeliverables } from './demo-deliverables'
import { buildDemoCalendarData } from './demo-calendar-data'
import { isNeedsYouReminder } from '@/lib/home/needs-you-rules'

/**
 * The demo user's own data — recents, reminders, notifications, bookmarks and work — in the shapes
 * the app's Home and Inbox render. Built from the sample firm, never written by hand, so every link
 * opens a page that exists. Everything is relative to `now`: build it per request or in the browser,
 * never at module load, or a long-lived server shows stale days.
 */

const pairs: { client: DemoClient; engagement: DemoEngagement }[] = DEMO_FIRM.clients.flatMap((client) =>
    client.engagements.map((engagement) => ({ client, engagement })),
)

const engagementHref = (client: DemoClient, engagement: DemoEngagement) => `/tour/${client.slug}/${engagement.slug}`

/** The one firm the demo user is in. */
export const DEMO_HOME_FIRM: HomeFirm = { id: 'demo', name: DEMO_FIRM.name, slug: 'demo', groupSlug: 'demo' }

const DAY = 86_400_000
const HOUR = 3_600_000

function startOfDay(d: Date): Date {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
}

/** Whole days from today to a YYYY-MM-DD date; negative is past. */
function daysFrom(now: Date, isoDate: string): number {
    return Math.round((new Date(`${isoDate}T00:00:00`).getTime() - startOfDay(now).getTime()) / DAY)
}

/** A YYYY-MM-DD date as a timestamp at noon UTC, so it lands on the same day in any viewer's timezone. */
const noonUtc = (isoDate: string) => `${isoDate}T12:00:00.000Z`

/** The reminder engine's wording (lib/reminders/reminder-service.ts computeLabel). */
function dueLabel(delta: number): Pick<ReminderWithContext, 'label' | 'labelStyle'> {
    switch (delta) {
        case 2: return { label: 'Due in 2 days', labelStyle: 'slate' }
        case 1: return { label: 'Due tomorrow', labelStyle: 'slate' }
        case 0: return { label: 'Due today', labelStyle: 'amber' }
        case -1: return { label: '1 day overdue', labelStyle: 'orange' }
        case -2: return { label: '2 days overdue', labelStyle: 'red' }
        default: return { label: delta > 0 ? `Due in ${delta} days` : `${Math.abs(delta)} days overdue`, labelStyle: delta > 0 ? 'slate' : 'red' }
    }
}

function reminder(
    fields: Pick<ReminderWithContext, 'id' | 'entityKey' | 'action' | 'entityName' | 'ctaUrl'> & { note?: string; clientName?: string; engagementName?: string; date?: string | null },
    now: Date,
): ReminderWithContext {
    const delta = fields.date ? daysFrom(now, fields.date) : null
    return {
        id: fields.id,
        // The keys the app's reminders use (lib/reminders/entity-registry.ts), so the Inbox shows what each is about.
        entityKey: fields.entityKey,
        entityValue: fields.id,
        action: fields.action,
        dateKey: fields.date ? 'dueDate' : null,
        dateValue: fields.date ? noonUtc(fields.date) : null,
        hiddenAt: null,
        note: fields.note ?? null,
        entityName: fields.entityName,
        entitySlug: null,
        firmSlug: DEMO_HOME_FIRM.slug,
        firmId: DEMO_HOME_FIRM.id,
        ctaUrl: fields.ctaUrl,
        clientName: fields.clientName ?? null,
        engagementName: fields.engagementName ?? null,
        delta,
        ...(delta === null ? { label: '', labelStyle: 'slate' as const } : dueLabel(delta)),
    }
}

/** The next open deliverable of each engagement, soonest first. */
function nextDeliverables() {
    return pairs
        .map(({ client, engagement }) => {
            const next = getDemoDeliverables(engagement)
                .filter((d) => d.status !== 'approved' && d.dueDate)
                .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))[0]
            return next ? { client, engagement, deliverable: next } : null
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => (a.deliverable.dueDate! < b.deliverable.dueDate! ? -1 : 1))
}

/** Deliverables waiting on the client's review, with where they live. */
function inReview() {
    return pairs.flatMap(({ client, engagement }) =>
        getDemoDeliverables(engagement)
            .filter((d) => d.status === 'in_review')
            .map((deliverable) => ({ client, engagement, deliverable })),
    )
}

/** What the reminder engine would return: due deliverables, review requests, an @mention and a follow-up. */
export function demoReminders(now: Date): ReminderWithContext[] {
    const due = nextDeliverables().slice(0, 4).map(({ client, engagement, deliverable }) =>
        reminder({
            id: `rem-due-${engagement.slug}`,
            entityKey: 'platform.engagements.shares',
            action: 'Deliverable due',
            entityName: deliverableName(deliverable.folder.name),
            clientName: client.name,
            engagementName: engagement.name,
            ctaUrl: `${engagementHref(client, engagement)}?tab=board`,
            date: deliverable.dueDate,
        }, now),
    )

    const reviews = inReview().slice(0, 2).map(({ client, engagement, deliverable }) =>
        reminder({
            id: `rem-review-${deliverable.folder.id}`,
            entityKey: 'platform.documents.id',
            action: 'Review document',
            entityName: deliverableName(deliverable.folder.name),
            clientName: client.name,
            engagementName: engagement.name,
            ctaUrl: `${engagementHref(client, engagement)}?tab=board`,
        }, now),
    )

    const mentionFile = pairs[0]?.engagement.folders.flatMap((f) => f.files)[1]
    const mention = mentionFile && pairs[0]
        ? [reminder({
            id: 'rem-mention',
            entityKey: 'platform.doc_comments',
            action: 'Review comment',
            entityName: mentionFile.name,
            clientName: pairs[0].client.name,
            engagementName: pairs[0].engagement.name,
            note: 'Sam Rivera: “@you Can we tighten the summary? The main recommendation should come first.”',
            ctaUrl: `${engagementHref(pairs[0].client, pairs[0].engagement)}?tab=comments`,
        }, now)]
        : []

    const followUps = DEMO_FIRM.clients
        .filter((c) => c.followUpDate)
        .slice(0, 1)
        .map((client) =>
            reminder({
                id: `rem-follow-${client.slug}`,
                entityKey: 'platform.clients.followUpDate',
                action: 'Follow-up',
                entityName: client.name,
                note: 'Check in on the next phase of work.',
                ctaUrl: `/tour/${client.slug}`,
                date: client.followUpDate,
            }, now),
        )

    return [...due, ...reviews, ...mention, ...followUps]
}

/** The demo user's notifications, newest first; the two newest are unread. */
export function demoNotifications(now: Date): ApiNotification[] {
    const [first, second] = pairs
    const approved = first ? getDemoDeliverables(first.engagement).find((d) => d.status === 'approved') : undefined
    const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * HOUR).toISOString()
    const base = { firmId: DEMO_HOME_FIRM.id, scope: 'FIRM', priority: 'INFO', body: null as string | null }
    // Where each sits, as the app's notifications API adds it (lib/notification-links.ts).
    const place = (p: (typeof pairs)[number]) => ({ clientName: p.client.name, engagementName: p.engagement.name })

    return [
        ...(first ? [{
            ...base,
            id: 'n-intake',
            createdAt: at(2),
            type: 'DOCUMENT_STAGING_INTAKE',
            title: `New upload from ${first.client.name}`,
            body: `3 files added to ${first.engagement.name}. Approve them before they join the engagement.`,
            ctaUrl: `${engagementHref(first.client, first.engagement)}?tab=files`,
            readAt: null,
            ...place(first),
        }] : []),
        ...(first && approved ? [{
            ...base,
            id: 'n-accepted',
            createdAt: at(5),
            type: 'DOCUMENT_ACCEPTED_BY_CLIENT',
            title: `${deliverableName(approved.folder.name)} approved`,
            body: `${first.client.name} approved the deliverable. It is now locked.`,
            ctaUrl: `${engagementHref(first.client, first.engagement)}?tab=board`,
            readAt: null,
            ...place(first),
            subject: 'deliverable' as const,
            subjectName: deliverableName(approved.folder.name),
        }] : []),
        ...(second ? [{
            ...base,
            id: 'n-comment',
            createdAt: at(26),
            type: 'EXTERNAL_CLIENT_COMMENT',
            title: `${second.client.name} commented on ${second.engagement.name}`,
            body: 'A few numbers here look outdated. Should these reflect the latest figures?',
            ctaUrl: `${engagementHref(second.client, second.engagement)}?tab=comments`,
            readAt: at(20),
            ...place(second),
        }] : []),
        ...(second ? [{
            ...base,
            id: 'n-invite',
            createdAt: at(74),
            type: 'ENGAGEMENT_INVITE_ACCEPTED',
            title: `Morgan Ellis joined ${second.engagement.name}`,
            body: 'They accepted your invitation as a Reviewer.',
            ctaUrl: `${engagementHref(second.client, second.engagement)}?tab=members`,
            readAt: at(70),
            ...place(second),
        }] : []),
    ]
}

/** The Inbox badge, by the app's rule (lib/actions/inbox.ts): unread notifications plus reminders due today, overdue or undated. */
/** The Inbox badge, by the app's rule (lib/actions/inbox.ts): Home's Needs you, never notifications. */
export function demoInboxCount(now: Date): number {
    return demoWork(now).needsYou.length
}

/** Home's "Continue where you left off": the last few pages the demo user opened. */
export function demoRecents(now: Date): RecentVisit[] {
    const visits: RecentVisit[] = []
    const add = (v: Omit<RecentVisit, 'firmId' | 'visitedAt'>, minutesAgo: number) =>
        visits.push({ ...v, firmId: DEMO_HOME_FIRM.id, visitedAt: new Date(now.getTime() - minutesAgo * 60_000).toISOString() })

    const [first, second, third] = pairs
    if (first) add({ id: 'rv-1', entityType: 'engagement', entityId: first.engagement.slug, path: engagementHref(first.client, first.engagement), title: first.engagement.name, context: first.client.name }, 4)
    const otherClient = DEMO_FIRM.clients[1]
    if (otherClient) add({ id: 'rv-2', entityType: 'client', entityId: otherClient.slug, path: `/tour/${otherClient.slug}`, title: otherClient.name, context: null }, 22)
    if (second) add({ id: 'rv-3', entityType: 'engagement', entityId: second.engagement.slug, path: `${engagementHref(second.client, second.engagement)}?tab=files`, title: second.engagement.name, context: second.client.name }, 55)
    if (third) add({ id: 'rv-4', entityType: 'engagement', entityId: third.engagement.slug, path: `${engagementHref(third.client, third.engagement)}?tab=board`, title: third.engagement.name, context: third.client.name }, 180)
    return visits
}

/** The first file of the first two engagements' lead deliverable. */
export function demoBookmarks(): HomeBookmark[] {
    return pairs.slice(0, 2).flatMap(({ client, engagement }) => {
        const file = getDemoDeliverables(engagement)[0]?.folder.files[0]
        return file
            ? [{ id: `bm-${engagement.slug}`, kind: 'document' as const, label: file.name, href: `${engagementHref(client, engagement)}?tab=files`, context: engagement.name, firmId: DEMO_HOME_FIRM.id }]
            : []
    })
}

/** The demo calendar's events in the shape Home's agenda reads. */
export function demoCalendarEvents(): CalendarEvent[] {
    const { engagements, events } = buildDemoCalendarData(DEMO_FIRM)
    const byId = new Map(engagements.map((e) => [e.id, e]))
    return events.map((e) => {
        const eng = byId.get(e.engagementId)
        return {
            id: e.id,
            engagementId: e.engagementId,
            firmId: DEMO_HOME_FIRM.id,
            type: e.type,
            title: e.title,
            date: noonUtc(e.date),
            ctaUrl: eng ? `/tour/${eng.clientSlug}/${eng.slug}` : null,
            clientName: e.clientName,
            engagementName: e.engagementName,
            engagementStatus: 'ACTIVE',
            engagementDueDate: null,
            documentName: null,
            docId: null,
            status: null,
            assignee: null,
            documentId: null,
            deliverableId: null,
            hasReminder: false,
        }
    })
}

/** Home's work lists: every sample engagement, the reviews waiting on you, and what is due. */
export function demoWork(now: Date): MyWork {
    const engagements = pairs.map(({ client, engagement }, i) => ({
        id: engagement.slug,
        name: engagement.name,
        href: engagementHref(client, engagement),
        firmId: DEMO_HOME_FIRM.id,
        clientName: client.name,
        status: 'ACTIVE',
        dueDate: engagement.dueDate ? noonUtc(engagement.dueDate) : null,
        updatedAt: new Date(now.getTime() - (i + 1) * 5 * HOUR).toISOString(),
        role: 'eng_admin' as const,
    }))

    const needsYou: MyWork['needsYou'] = [
        ...inReview().slice(0, 2).map(({ client, engagement, deliverable }, i) => ({
            id: `ny-review-${deliverable.folder.id}`,
            kind: 'deliverable_review' as const,
            firmId: DEMO_HOME_FIRM.id,
            title: deliverableName(deliverable.folder.name),
            context: `${client.name} · ${engagement.name}`,
            clientName: client.name,
            engagementName: engagement.name,
            href: `${engagementHref(client, engagement)}?tab=board`,
            actionLabel: 'Review',
            at: new Date(now.getTime() - (i + 1) * 7 * HOUR).toISOString(),
        })),
        ...(pairs[0] ? [{
            id: 'ny-intake',
            kind: 'intake' as const,
            firmId: DEMO_HOME_FIRM.id,
            title: `3 files from ${pairs[0].client.name}`,
            context: `${pairs[0].client.name} · ${pairs[0].engagement.name}`,
            clientName: pairs[0].client.name,
            engagementName: pairs[0].engagement.name,
            href: `${engagementHref(pairs[0].client, pairs[0].engagement)}?tab=files`,
            actionLabel: 'Approve upload',
            at: new Date(now.getTime() - 2 * HOUR).toISOString(),
        }] : []),
        // As in the app: a client comment no one has answered yet, and a deliverable sent back for changes.
        ...nextDeliverables().slice(0, 1).map(({ client, engagement, deliverable }) => ({
            id: `ny-comment-${deliverable.folder.id}`,
            kind: 'client_comment' as const,
            firmId: DEMO_HOME_FIRM.id,
            title: deliverableName(deliverable.folder.name),
            context: `${client.name} · ${engagement.name}`,
            clientName: client.name,
            engagementName: engagement.name,
            href: `${engagementHref(client, engagement)}?tab=files`,
            actionLabel: 'Reply',
            at: new Date(now.getTime() - 3 * HOUR).toISOString(),
        })),
        ...pairs
            .flatMap(({ client, engagement }) =>
                getDemoDeliverables(engagement).filter((d) => d.status === 'in_progress').map((deliverable) => ({ client, engagement, deliverable })))
            .slice(0, 1)
            .map(({ client, engagement, deliverable }) => ({
                id: `ny-changes-${deliverable.folder.id}`,
                kind: 'changes_requested' as const,
                firmId: DEMO_HOME_FIRM.id,
                title: deliverableName(deliverable.folder.name),
                context: `${client.name} · ${engagement.name}`,
                clientName: client.name,
                engagementName: engagement.name,
                href: `${engagementHref(client, engagement)}?tab=board`,
                actionLabel: 'See changes',
                at: new Date(now.getTime() - 26 * HOUR).toISOString(),
            })),
        // The demo user's reminders that need them now, by Home's rule: review requests and undated ones.
        ...demoReminders(now).filter(isNeedsYouReminder).map((r) => ({
            id: `reminder:${r.id}`,
            kind: 'reminder' as const,
            firmId: r.firmId,
            title: r.entityName,
            context: r.action,
            href: r.ctaUrl ?? '/tour',
            actionLabel: 'Open',
            at: r.dateValue,
        })),
    ]

    // A due deliverable carries its stage, so Home's chip leads with the status icon as in the app.
    const dueStatus = new Map(nextDeliverables().map(({ engagement, deliverable }) => [`rem-due-${engagement.slug}`, deliverable.status]))
    const dueSoon: MyWork['dueSoon'] = demoReminders(now)
        .filter((r) => r.dateValue && !isNeedsYouReminder(r))
        .map((r) => ({
            id: r.id,
            kind: r.action === 'Deliverable due' ? ('deliverable' as const) : ('reminder' as const),
            firmId: r.firmId,
            title: r.entityName,
            context: (r.clientName && r.engagementName ? `${r.clientName} · ${r.engagementName}` : null) ?? r.note ?? r.action,
            href: r.ctaUrl ?? '/tour',
            dueDate: r.dateValue!,
            overdue: (r.delta ?? 0) < 0,
            status: dueStatus.get(r.id) ?? null,
        }))

    return { engagements, needsYou, dueSoon }
}
