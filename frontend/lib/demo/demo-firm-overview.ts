import type { ClientPipelineItem } from '@/app/api/firms/[firmId]/insights/route'
import type { FirmEngagementRow } from '@/lib/insights/firm-engagement-pace'
import type { FirmOverviewData } from '@/components/dashboard/firm-overview-sections'
import { setupGapsFrom, type FirmActionsData } from '@/lib/insights/firm-actions'
import { getDemoDeliverables } from './demo-deliverables'
import { displayFolderName } from '@/lib/display-names'
import type { DemoFirm } from './static-demo-data'

const DAY_MS = 86400000
const value = (raw?: string) => Number(raw ?? 0) || 0

/** Whole days from today to an ISO date. */
function daysUntil(iso: string, nowMs: number): number {
    const d = new Date(iso); d.setHours(0, 0, 0, 0)
    const t = new Date(nowMs); t.setHours(0, 0, 0, 0)
    return Math.round((d.getTime() - t.getTime()) / DAY_MS)
}

/**
 * The tour's Firm Overview, from the sample firm: the same shape the app maps the insights route
 * onto. Engagements run 90 days to their due date, as on the tour's engagement Overview; their
 * deliverables are the board's (getDemoDeliverables), so the list and the board agree.
 */
export function buildDemoFirmOverview(firm: DemoFirm, nowMs: number): FirmOverviewData {
    const pairs = firm.clients.flatMap((client) => client.engagements.map((engagement) => ({ client, engagement })))
    const dueSoon = (due?: string) => Boolean(due && daysUntil(due, nowMs) >= 0 && daysUntil(due, nowMs) <= 30)

    const engagementRows: FirmEngagementRow[] = pairs.map(({ client, engagement }) => {
        const dueMs = engagement.dueDate ? new Date(engagement.dueDate).getTime() : null
        const deliverables = { total: 0, toDo: 0, inProgress: 0, inReview: 0, approved: 0, overdue: 0 }
        for (const d of getDemoDeliverables(engagement)) {
            deliverables.total++
            if (d.status === 'to_do') deliverables.toDo++
            else if (d.status === 'in_progress') deliverables.inProgress++
            else if (d.status === 'in_review') deliverables.inReview++
            else deliverables.approved++
            if (d.status !== 'approved' && d.dueDate && new Date(d.dueDate).getTime() < nowMs) deliverables.overdue++
        }
        return {
            engagementId: engagement.slug,
            name: engagement.name,
            slug: engagement.slug,
            clientName: client.name,
            clientSlug: client.slug,
            startDate: dueMs ? new Date(dueMs - 90 * DAY_MS).toISOString() : null,
            dueDate: engagement.dueDate ? new Date(engagement.dueDate).toISOString() : null,
            // The tour's engagements all have Alex Jordan as owner (demo-engagement-members.tsx).
            lead: { name: 'Alex Jordan', avatarUrl: null },
            deliverables,
        }
    })

    const items: ClientPipelineItem[] = firm.clients.map((c) => ({
        clientId: c.slug,
        clientName: c.name,
        clientSlug: c.slug,
        value: c.engagements.reduce((s, e) => s + value(e.rateOrValue), 0),
        closingSoonValue: c.engagements.filter((e) => dueSoon(e.dueDate)).reduce((s, e) => s + value(e.rateOrValue), 0),
        engagementCount: c.engagements.length,
        engagements: c.engagements.map((e) => ({
            engagementId: e.slug,
            engagementName: e.name,
            engagementSlug: e.slug,
            value: value(e.rateOrValue),
            closingSoon: dueSoon(e.dueDate),
            status: 'ACTIVE',
            contractType: e.contractType ?? null,
        })),
    }))

    const types = new Map<string, number>()
    for (const { engagement } of pairs) {
        const type = engagement.contractType ?? 'Unspecified'
        types.set(type, (types.get(type) ?? 0) + 1)
    }

    const status = (s: string) => firm.clients.filter((c) => (c.status ?? 'ACTIVE') === s).length
    return {
        nowMs,
        clients: { active: status('ACTIVE'), prospects: status('PROSPECT'), onHold: status('ON_HOLD'), past: status('PAST') },
        pendingInvitations: 2,
        week: { newClients: 0, newEngagements: 1, invitationsSent: 2, engagementsClosed: 0 },
        engagementRows,
        pipeline: {
            items,
            total: items.reduce((s, p) => s + p.value, 0),
            symbol: '$',
            dueSoonCount: pairs.filter(({ engagement }) => dueSoon(engagement.dueDate)).length,
            dueSoonValue: items.reduce((s, p) => s + p.closingSoonValue, 0),
            revenueAtRisk: 0,
        },
        contractTypes: Array.from(types.entries()).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    }
}

/**
 * The tour's Action Center, from the same sample firm. The firm has no overdue engagement, prospect
 * or idle client, so two sample items show what the list is for: a client comment waiting on a
 * reply (from the engagement members' client reviewer), and an invitation about to lapse.
 */
export function buildDemoFirmActions(firm: DemoFirm, nowMs: number): FirmActionsData {
    const overview = buildDemoFirmOverview(firm, nowMs)
    const pairs = firm.clients.flatMap((client) => client.engagements.map((engagement) => ({ client, engagement })))
    // The second client's first engagement, else the first there is.
    const sample = pairs.find(({ client }) => client === firm.clients[1]) ?? pairs[0]
    const expiry = new Date(nowMs + 2 * DAY_MS)

    return {
        overdueEngagements: overview.engagementRows
            .filter((r) => r.dueDate && daysUntil(r.dueDate, nowMs) < 0)
            .map((r) => ({ engagementId: r.engagementId, name: r.name, slug: r.slug, clientName: r.clientName, clientSlug: r.clientSlug, daysOverdue: -daysUntil(r.dueDate!, nowMs) })),
        threads: sample ? [{
            engagementId: sample.engagement.slug,
            engagementName: sample.engagement.name,
            engagementSlug: sample.engagement.slug,
            clientName: sample.client.name,
            clientSlug: sample.client.slug,
            documentName: displayFolderName(getDemoDeliverables(sample.engagement)[0]?.folder.name ?? sample.engagement.name),
            lastMessage: 'Morgan Ellis: Could we see the revised figures before Friday?',
            lastMessageAt: new Date(nowMs - 5 * 3600000).toISOString(),
            threadId: 'demo-thread-1',
        }] : [],
        setupGaps: setupGapsFrom(overview.engagementRows),
        prospects: [],
        idleClients: [],
        invitations: sample ? [{
            invitationId: 'demo-invite-1',
            email: 'jamie@client-example.com',
            engagementId: sample.engagement.slug,
            engagementName: sample.engagement.name,
            engagementSlug: sample.engagement.slug,
            clientSlug: sample.client.slug,
            expireAt: expiry.toISOString(),
            daysUntilExpiry: 2,
        }] : [],
        currencySymbol: '$',
    }
}
